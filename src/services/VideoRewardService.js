/**
 * VideoRewardService — Phase 6 share-to-earn core. TASK-6.3.
 *
 * Separation of concerns:
 *
 *   evaluateEligibility()   PURE. No side effects. Reads the User, the
 *                           Video, prior rewards and the wallet balance,
 *                           and returns { eligible, reason?, amount_cents }.
 *                           The share endpoint calls this before anything
 *                           moves. Table-driven unit tests cover each rule.
 *
 *   requestReward()         SIDE EFFECTS. Creates the VideoReward row in
 *                           `pending_verification` state and reserves funds
 *                           on the PromoWallet in the same code path. The
 *                           unique index on (user_id, idempotency_key)
 *                           guarantees that two sibling races can't both
 *                           create a row — one wins, one errors with
 *                           DuplicateKeyError and is returned the first
 *                           row's response.
 *
 *   verifyReward() / rejectReward()
 *                           State transitions out of pending. Commit the
 *                           ledger (debit) or release the reserve.
 *
 * Rules (§12):
 *   - identity-verified user
 *   - share platform matches User.primary_social_platform
 *   - 12h cooldown per (video_id, user_id)
 *   - per-user daily cap (count)
 *   - platform-wide daily cap (count)
 *   - external post URL verifiable (contains the user's post + reaches
 *     the public web) — delegated to SocialDistributionService later
 *   - no active fraud flag on the user
 *
 * Config knobs (env, with safe defaults):
 *   VIDEO_REWARD_AMOUNT_CENTS           default 50     ($0.50)
 *   VIDEO_REWARD_PER_USER_DAILY_CAP     default 10
 *   VIDEO_REWARD_PLATFORM_DAILY_CAP     default 5000
 *   VIDEO_REWARD_COOLDOWN_HOURS         default 12
 */

const EventEmitter = require('events');
const User = require('../models/User');
const Video = require('../models/Video');
const VideoReward = require('../models/VideoReward');
const PromoWallet = require('../models/PromoWallet');
const PromoWalletLedger = require('../models/PromoWalletLedger');
const FeatureFlagService = require('./FeatureFlagService');
const winstonLogger = require('../utils/winstonLogger');

const events = new EventEmitter();

function cfg() {
  const n = (v, d) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : d;
  };
  return {
    amountCents: n(process.env.VIDEO_REWARD_AMOUNT_CENTS, 50),
    perUserDailyCap: n(process.env.VIDEO_REWARD_PER_USER_DAILY_CAP, 10),
    platformDailyCap: n(process.env.VIDEO_REWARD_PLATFORM_DAILY_CAP, 5000),
    cooldownMs: n(process.env.VIDEO_REWARD_COOLDOWN_HOURS, 12) * 60 * 60 * 1000,
  };
}

// Normalise the two X/Twitter aliases so a user whose profile says 'twitter'
// can still share on 'x' (and vice versa) without being told the platform
// doesn't match. All other platforms must match exactly.
function platformsMatch(a, b) {
  if (!a || !b) return false;
  const norm = (p) => (p === 'twitter' ? 'x' : p);
  return norm(a) === norm(b);
}

function dayStart(d = new Date()) {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

class VideoRewardService {
  static events = events;

  static getRewardAmountCents() {
    return cfg().amountCents;
  }

  /**
   * Pure eligibility check. Returns `{ eligible: boolean, reason?: string,
   * amount_cents }`. Must NEVER mutate state or call out — the share
   * endpoint relies on this to decide whether to reserve funds.
   */
  static async evaluateEligibility({ user, video, platform, now = new Date() }) {
    const C = cfg();
    const amount = C.amountCents;

    if (!(await FeatureFlagService.isEnabled('video_promo_rewards'))) {
      return { eligible: false, reason: 'FEATURE_DISABLED', amount_cents: amount };
    }
    if (!user) {
      return { eligible: false, reason: 'USER_NOT_FOUND', amount_cents: amount };
    }
    if (!video) {
      return { eligible: false, reason: 'VIDEO_NOT_FOUND', amount_cents: amount };
    }
    if (video.status !== 'published') {
      return { eligible: false, reason: 'VIDEO_NOT_PUBLISHED', amount_cents: amount };
    }
    if (user.blocked || user.fraud_flagged) {
      return { eligible: false, reason: 'FRAUD_FLAG', amount_cents: amount };
    }
    const isVerified =
      user.verification_badges?.identity_verified === true ||
      user.verification_tier === 'premium' ||
      user.identity_verified === true;
    if (!isVerified) {
      return { eligible: false, reason: 'IDENTITY_NOT_VERIFIED', amount_cents: amount };
    }
    if (!platformsMatch(user.primary_social_platform, platform)) {
      return {
        eligible: false,
        reason: 'PLATFORM_MISMATCH',
        amount_cents: amount,
        detail: {
          declared: user.primary_social_platform,
          attempted: platform,
        },
      };
    }

    // Cooldown — any prior reward for this (video, user) within window counts,
    // regardless of its final verification status. A rejected one still ate
    // the 12-hour slot.
    const cooldownCutoff = new Date(now.getTime() - C.cooldownMs);
    const recent = await VideoReward.findOne({
      user_id: user._id,
      video_id: video._id,
      createdAt: { $gte: cooldownCutoff },
    })
      .select('_id')
      .lean();
    if (recent) {
      return { eligible: false, reason: 'COOLDOWN_ACTIVE', amount_cents: amount };
    }

    // Per-user daily cap — pending + verified both count (we don't want a user
    // flooding the queue while a prior reward is still unverified).
    const dayFloor = dayStart(now);
    const userDay = await VideoReward.countDocuments({
      user_id: user._id,
      createdAt: { $gte: dayFloor },
      verification_status: { $in: ['pending_verification', 'verified'] },
    });
    if (userDay >= C.perUserDailyCap) {
      return { eligible: false, reason: 'USER_DAILY_CAP', amount_cents: amount };
    }

    // Platform-wide daily cap.
    const platformDay = await VideoReward.countDocuments({
      createdAt: { $gte: dayFloor },
      verification_status: { $in: ['pending_verification', 'verified'] },
    });
    if (platformDay >= C.platformDailyCap) {
      return { eligible: false, reason: 'PLATFORM_DAILY_CAP', amount_cents: amount };
    }

    // Enough available funds in the promo bank?
    const wallet = await PromoWallet.singleton();
    const available = (wallet.balance_cents || 0) - (wallet.reserved_cents || 0);
    if (available < amount) {
      return { eligible: false, reason: 'INSUFFICIENT_PROMO_FUNDS', amount_cents: amount };
    }

    return { eligible: true, amount_cents: amount };
  }

  /**
   * Create a pending reward and reserve the funds. Replays return the first
   * row untouched. Any failure after the row is created is swallowed by the
   * caller — the row stays in pending state and the funds stay reserved
   * until the verifier makes a decision.
   */
  static async requestReward({ user, video, platform, externalPostUrl, idempotencyKey }) {
    if (!idempotencyKey) {
      const err = new Error('idempotencyKey required');
      err.statusCode = 400;
      err.code = 'IDEMPOTENCY_KEY_REQUIRED';
      throw err;
    }

    // Replay? Return the prior row verbatim.
    const existing = await VideoReward.findOne({
      user_id: user._id,
      idempotency_key: idempotencyKey,
    });
    if (existing) return { reward: existing, replayed: true };

    const verdict = await VideoRewardService.evaluateEligibility({
      user,
      video,
      platform,
    });
    if (!verdict.eligible) {
      const err = new Error(`Not eligible: ${verdict.reason}`);
      err.statusCode = verdict.reason === 'FEATURE_DISABLED' ? 503 : 400;
      err.code = verdict.reason;
      err.detail = verdict.detail;
      throw err;
    }

    let reward;
    try {
      reward = await VideoReward.create({
        user_id: user._id,
        video_id: video._id,
        platform,
        external_post_url: externalPostUrl || null,
        amount_cents: verdict.amount_cents,
        verification_status: 'pending_verification',
        idempotency_key: idempotencyKey,
      });
    } catch (err) {
      // Lost the race — another request with the same key just created the row.
      if (err.code === 11000) {
        const existing2 = await VideoReward.findOne({
          user_id: user._id,
          idempotency_key: idempotencyKey,
        });
        if (existing2) return { reward: existing2, replayed: true };
      }
      throw err;
    }

    try {
      const { entry } = await PromoWalletLedger.reserve({
        amount_cents: reward.amount_cents,
        ref_id: reward._id,
        reason: 'video_share_reward_pending',
        metadata: { video_id: String(video._id), platform },
      });
      reward.reserved_ledger_id = entry._id;
      await reward.save();
    } catch (err) {
      // Reservation failed — mark the row rejected so no one treats it as
      // pending forever. The user can retry with a fresh idempotency key.
      winstonLogger.error('VideoRewardService: reserve failed', {
        message: err.message,
        reward_id: String(reward._id),
      });
      reward.verification_status = 'rejected';
      reward.rejection_reason = 'reserve_failed';
      reward.rejected_at = new Date();
      await reward.save();
      events.emit('video_reward:rejected', { reward });
      return { reward, replayed: false };
    }

    events.emit('video_reward:pending', { reward });
    return { reward, replayed: false };
  }

  static async verifyReward({ reward_id, actor_id = null, metadata = {} }) {
    const reward = await VideoReward.findById(reward_id);
    if (!reward) {
      const err = new Error('Reward not found');
      err.statusCode = 404;
      err.code = 'REWARD_NOT_FOUND';
      throw err;
    }
    if (reward.verification_status !== 'pending_verification') {
      return { reward, noop: true };
    }
    const { entry } = await PromoWalletLedger.commit({
      amount_cents: reward.amount_cents,
      ref_id: reward._id,
      reason: 'video_share_reward_verified',
      metadata: { ...metadata, actor_id: actor_id ? String(actor_id) : null },
    });
    reward.verification_status = 'verified';
    reward.settled_ledger_id = entry._id;
    reward.verified_at = new Date();
    await reward.save();
    events.emit('video_reward:verified', { reward });
    return { reward };
  }

  static async rejectReward({ reward_id, reason, actor_id = null }) {
    const reward = await VideoReward.findById(reward_id);
    if (!reward) {
      const err = new Error('Reward not found');
      err.statusCode = 404;
      err.code = 'REWARD_NOT_FOUND';
      throw err;
    }
    if (reward.verification_status !== 'pending_verification') {
      return { reward, noop: true };
    }
    await PromoWalletLedger.release({
      amount_cents: reward.amount_cents,
      ref_id: reward._id,
      reason: 'video_share_reward_rejected',
      metadata: { reason, actor_id: actor_id ? String(actor_id) : null },
    });
    reward.verification_status = 'rejected';
    reward.rejection_reason = reason || 'unspecified';
    reward.rejected_at = new Date();
    await reward.save();
    events.emit('video_reward:rejected', { reward });
    return { reward };
  }

  static async listForUser({ user_id, limit = 50 }) {
    return VideoReward.find({ user_id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('video_id', 'title')
      .lean();
  }
}

module.exports = VideoRewardService;
