/**
 * VideoController — HTTP boundary for the video platform.
 * Routes mounted at /api/videos.
 */

const VideoService = require('../services/VideoService');
const VideoRewardService = require('../services/VideoRewardService');
const Video = require('../models/Video');
const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');

function fail(res, err, context) {
  const statusCode = err?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`VideoController.${context} failed`, { message: err?.message, stack: err?.stack });
  }
  return res.status(statusCode).json({
    success: false,
    error: { code: err?.code || 'VIDEO_ERROR', message: err?.message || 'Video action failed' },
  });
}

class VideoController {
  static async signUpload(req, res) {
    try {
      const data = VideoService.signUpload({ userId: req.user.userId });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return fail(res, err, 'signUpload');
    }
  }

  static async create(req, res) {
    try {
      const { public_id, title, description, tags, visibility, campaign_id, is_veteran } = req.body || {};
      const doc = await VideoService.createFromUpload({
        userId: req.user.userId,
        publicId: public_id,
        title,
        description,
        tags,
        visibility,
        campaignId: campaign_id || null,
        isVeteran: !!is_veteran,
        req,
      });
      return res.status(201).json({ success: true, data: doc.toJSON() });
    } catch (err) {
      return fail(res, err, 'create');
    }
  }

  static async list(req, res) {
    try {
      const cursor = req.query.cursor || null;
      const limit = parseInt(req.query.limit, 10) || 20;
      let isVeteran = null;
      if (req.query.is_veteran === 'true') isVeteran = true;
      else if (req.query.is_veteran === 'false') isVeteran = false;
      const data = await VideoService.listFeed({
        cursor,
        limit,
        isVeteran,
        tag: req.query.tag || null,
        campaignId: req.query.campaign_id || null,
      });
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      return fail(res, err, 'list');
    }
  }

  static async get(req, res) {
    try {
      const doc = await VideoService.getPublic(req.params.id);
      return res.status(200).json({ success: true, data: doc.toJSON() });
    } catch (err) {
      return fail(res, err, 'get');
    }
  }

  /**
   * POST /api/videos/:id/share — TASK-6.4.
   *
   * Idempotent via required `Idempotency-Key` header. The response shape is
   * fixed by the task's acceptance:
   *   { share_id, verification_status, reward_amount, reward_status }
   *
   * `share_id` here is the VideoReward._id — it's the identifier the caller
   * uses to look up the reward's state in subsequent polls.
   *
   * Replays return the ORIGINAL response verbatim (same share_id, same
   * verification_status) because the service short-circuits on the
   * (user, idempotency_key) unique index.
   */
  static async share(req, res) {
    try {
      const idempotencyKey =
        req.get('Idempotency-Key') || req.get('idempotency-key') || null;
      if (!idempotencyKey || idempotencyKey.length < 8) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'Idempotency-Key header is required (min 8 chars)',
          },
        });
      }

      const { platform, external_post_url } = req.body || {};
      if (!platform) {
        return res.status(400).json({
          success: false,
          error: { code: 'PLATFORM_REQUIRED', message: 'platform is required' },
        });
      }

      const [user, video] = await Promise.all([
        User.findById(req.user.userId),
        Video.findById(req.params.id),
      ]);
      if (!video) {
        return res.status(404).json({
          success: false,
          error: { code: 'VIDEO_NOT_FOUND', message: 'Video not found' },
        });
      }

      const { reward, replayed } = await VideoRewardService.requestReward({
        user,
        video,
        platform,
        externalPostUrl: external_post_url || null,
        idempotencyKey,
      });

      return res.status(replayed ? 200 : 201).json({
        success: true,
        data: {
          share_id: String(reward._id),
          verification_status: reward.verification_status,
          reward_amount: reward.amount_cents,
          reward_status:
            reward.verification_status === 'verified'
              ? 'paid'
              : reward.verification_status === 'rejected'
                ? 'rejected'
                : 'reserved',
          rejection_reason: reward.rejection_reason || null,
          replayed,
        },
      });
    } catch (err) {
      return fail(res, err, 'share');
    }
  }

  /** GET /api/videos/rewards/mine — list the caller's rewards (TASK-6.5 wiring). */
  static async myRewards(req, res) {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const rows = await VideoRewardService.listForUser({
        user_id: req.user.userId,
        limit,
      });
      return res.status(200).json({ success: true, data: rows });
    } catch (err) {
      return fail(res, err, 'myRewards');
    }
  }

  // ── Admin ───────────────────────────────────────────────────────────
  static async listPending(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 25;
      const data = await VideoService.listModerationQueue({ page, limit });
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      return fail(res, err, 'listPending');
    }
  }

  static async moderate(req, res) {
    try {
      const data = await VideoService.moderate({
        videoId: req.params.id,
        adminId: req.user.userId,
        decision: req.body?.decision,
        reason: req.body?.reason || null,
        req,
      });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return fail(res, err, 'moderate');
    }
  }
}

module.exports = VideoController;
