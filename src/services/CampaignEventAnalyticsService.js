/**
 * CampaignEventAnalyticsService
 * -------------------------------------------------------------------------
 * Instrumentation for the Free → Share Campaign upgrade funnel and the
 * community boost system.
 *
 * Why this exists
 * ---------------
 * Requiring a payout method before a campaign can promise sharer rewards is a
 * BREAKING change to campaign creation: creators who could previously start a
 * Share Campaign will start being refused. The rollout plan calls for measuring
 * how many legitimate creators that gate would block BEFORE it starts blocking
 * them — and that measurement is impossible without an upgrade funnel. This
 * service is that funnel.
 *
 * It answers, concretely:
 *   - how many upgrade attempts happen, and how many succeed
 *   - of the failures, how many are the payout gate versus everything else
 *     (the payout-gate drop-off rate — the number the rollout decision hangs on)
 *   - who initiates upgrades: creators, sponsors, or admins
 *   - how many boosts are recorded, and how many are suppressed for low trust
 *     (the early-warning signal for boost farming)
 *
 * Design rules
 * ------------
 * 1. RECORDING NEVER THROWS. An analytics failure must not roll back an upgrade
 *    that already happened, or fail a boost the user already saw succeed. Every
 *    recorder swallows its own errors and logs them.
 * 2. Events are written with `is_public: false`. These are operational metrics,
 *    not activity-feed content — a failed upgrade attempt is nobody's news.
 * 3. Events attach to the CAMPAIGN (`entity_type: 'Campaign'`), so a campaign's
 *    full history reads back in one query, with the upgrade/boost id carried in
 *    `metadata.context`.
 */

const ActivityLog = require('../models/ActivityLog');
const winstonLogger = require('../utils/winstonLogger');

// Failure reason codes that mean "the payout gate stopped this". Grouped
// because they are one product problem even though the API distinguishes them.
const PAYOUT_GATE_CODES = new Set([
  'NO_PAYOUT_METHOD',
  'OWNER_PAYOUT_NOT_READY',
  'UNSUPPORTED_PAYOUT_METHOD',
  'PAYMENT_METHOD_NOT_FOUND',
  'INVALID_PAYMENT_METHOD_ID',
  'PAYOUT_READINESS_CHECK_FAILED',
]);

class CampaignEventAnalyticsService {
  /**
   * Write one event. Private — callers use the named recorders below.
   * Never throws.
   */
  static async record({ activityType, userId, campaignId, description, context = {}, req }) {
    try {
      if (!activityType || !userId) return null;

      return await ActivityLog.create({
        activity_type: activityType,
        user_id: userId,
        entity_type: 'Campaign',
        entity_id: campaignId || undefined,
        description: (description || activityType).slice(0, 1000),
        severity: 'low',
        // Operational metrics, not activity-feed content.
        is_public: false,
        metadata: {
          source: req ? 'web' : 'api',
          ip_address: req?.ip || req?.headers?.['x-forwarded-for'] || undefined,
          user_agent: req?.headers?.['user-agent'] || undefined,
          context,
        },
      });
    } catch (error) {
      // Analytics must never break the thing it is measuring.
      winstonLogger.warn('CampaignEventAnalyticsService.record failed', {
        activityType,
        message: error.message,
      });
      return null;
    }
  }

  // ── Upgrade funnel ──────────────────────────────────────────────────────

  /** Someone asked to upgrade. The denominator of the funnel. */
  static recordUpgradeAttempted({ campaign, actorId, initiatorType, req }) {
    return this.record({
      activityType: 'campaign_upgrade_attempted',
      userId: actorId,
      campaignId: campaign?._id,
      description: `Upgrade attempted on "${campaign?.title || 'campaign'}" by ${initiatorType}`,
      context: {
        initiator_type: initiatorType,
        campaign_ref: campaign?.campaign_id,
        from_campaign_type: campaign?.campaign_type,
      },
      req,
    });
  }

  /** The campaign actually became a Share Campaign. */
  static recordUpgradeSucceeded({ campaign, actorId, initiatorType, upgradeId, payoutLevel, req }) {
    return this.record({
      activityType: 'campaign_upgrade_succeeded',
      userId: actorId,
      campaignId: campaign?._id,
      description: `Upgrade completed on "${campaign?.title || 'campaign'}" by ${initiatorType}`,
      context: {
        initiator_type: initiatorType,
        upgrade_id: upgradeId ? String(upgradeId) : null,
        campaign_ref: campaign?.campaign_id,
        payout_readiness_level: payoutLevel || null,
        paid_sharing_active: !!campaign?.share_config?.is_paid_sharing_active,
      },
      req,
    });
  }

  /**
   * An attempt was refused. `reasonCode` is what makes the funnel useful — it
   * separates "the payout gate blocked a real creator" from "this campaign was
   * never eligible anyway".
   */
  static recordUpgradeFailed({ campaign, actorId, initiatorType, reasonCode, req }) {
    return this.record({
      activityType: 'campaign_upgrade_failed',
      userId: actorId,
      campaignId: campaign?._id,
      description: `Upgrade failed on "${campaign?.title || 'campaign'}": ${reasonCode}`,
      context: {
        initiator_type: initiatorType,
        reason_code: reasonCode,
        payout_gate: PAYOUT_GATE_CODES.has(reasonCode),
        campaign_ref: campaign?.campaign_id,
      },
      req,
    });
  }

  /** A supporter asked the owner to upgrade. */
  static recordUpgradeRequested({ campaign, sponsorId, upgradeId, req }) {
    return this.record({
      activityType: 'campaign_upgrade_requested',
      userId: sponsorId,
      campaignId: campaign?._id,
      description: `Sponsored upgrade requested on "${campaign?.title || 'campaign'}"`,
      context: { upgrade_id: upgradeId ? String(upgradeId) : null, campaign_ref: campaign?.campaign_id },
      req,
    });
  }

  static recordUpgradeApproved({ campaign, ownerId, upgradeId, req }) {
    return this.record({
      activityType: 'campaign_upgrade_approved',
      userId: ownerId,
      campaignId: campaign?._id,
      description: `Owner approved a sponsored upgrade on "${campaign?.title || 'campaign'}"`,
      context: { upgrade_id: upgradeId ? String(upgradeId) : null },
      req,
    });
  }

  static recordUpgradeRejected({ campaignId, ownerId, upgradeId, reason, req }) {
    return this.record({
      activityType: 'campaign_upgrade_rejected',
      userId: ownerId,
      campaignId,
      description: 'Owner declined a sponsored upgrade',
      context: { upgrade_id: upgradeId ? String(upgradeId) : null, reason: reason || null },
      req,
    });
  }

  /**
   * The payout gate is in `warn` mode and this creator would have been refused
   * had it been enforcing. This is the soft-launch measurement: it produces the
   * same signal an enforced refusal would, without refusing anybody.
   */
  static recordShareCampaignGateWarned({ actorId, reasonCode, req }) {
    return this.record({
      activityType: 'share_campaign_gate_warned',
      userId: actorId,
      description: `Share Campaign created without a usable payout method (${reasonCode})`,
      context: { reason_code: reasonCode, would_block: true, gate_mode: 'warn' },
      req,
    });
  }

  // ── Community boosts ────────────────────────────────────────────────────

  /**
   * A boost landed. `counted` distinguishes ranking-effective boosts from
   * over-quota / low-trust ones, which is the boost-farming early warning.
   */
  static recordBoost({ campaign, boosterId, counted, suppressedReason, trustWeight, source, req }) {
    return this.record({
      activityType: counted ? 'campaign_boost_succeeded' : 'campaign_boost_suppressed',
      userId: boosterId,
      campaignId: campaign?._id,
      description: counted
        ? `Community boost on "${campaign?.title || 'campaign'}"`
        : `Community boost suppressed (${suppressedReason || 'unknown'})`,
      context: {
        counted: !!counted,
        suppressed_reason: suppressedReason || null,
        trust_weight: trustWeight ?? null,
        source: source || null,
        campaign_ref: campaign?.campaign_id,
      },
      req,
    });
  }

  static recordBoostRevoked({ campaignId, adminId, boostId, reason, req }) {
    return this.record({
      activityType: 'campaign_boost_revoked',
      userId: adminId,
      campaignId,
      description: 'Community boost revoked',
      context: { boost_id: boostId ? String(boostId) : null, reason: reason || null },
      req,
    });
  }

  // ── Reporting ───────────────────────────────────────────────────────────

  /**
   * The upgrade funnel over a window.
   *
   * `payout_gate_block_rate` is the headline: of every upgrade attempt that
   * failed, what share failed because the creator had no usable payout method.
   * A high number during soft-launch means the gate is about to block a lot of
   * legitimate creators, and the rollout should slow down.
   *
   * @param {Object} opts
   * @param {Date} [opts.startDate]
   * @param {Date} [opts.endDate]
   * @returns {Promise<Object>}
   */
  static async getUpgradeFunnel({ startDate, endDate } = {}) {
    const match = {
      activity_type: {
        $in: [
          'campaign_upgrade_attempted',
          'campaign_upgrade_succeeded',
          'campaign_upgrade_failed',
          'campaign_upgrade_requested',
          'campaign_upgrade_approved',
          'campaign_upgrade_rejected',
        ],
      },
    };
    if (startDate || endDate) {
      match.created_at = {};
      if (startDate) match.created_at.$gte = new Date(startDate);
      if (endDate) match.created_at.$lte = new Date(endDate);
    }

    const [byType, failuresByReason, byInitiator] = await Promise.all([
      ActivityLog.aggregate([
        { $match: match },
        { $group: { _id: '$activity_type', count: { $sum: 1 } } },
      ]),
      ActivityLog.aggregate([
        { $match: { ...match, activity_type: 'campaign_upgrade_failed' } },
        {
          $group: {
            _id: '$metadata.context.reason_code',
            count: { $sum: 1 },
            payout_gate: { $first: '$metadata.context.payout_gate' },
          },
        },
        { $sort: { count: -1 } },
      ]),
      ActivityLog.aggregate([
        { $match: { ...match, activity_type: 'campaign_upgrade_succeeded' } },
        { $group: { _id: '$metadata.context.initiator_type', count: { $sum: 1 } } },
      ]),
    ]);

    const counts = byType.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const attempted = counts.campaign_upgrade_attempted || 0;
    const succeeded = counts.campaign_upgrade_succeeded || 0;
    const failed = counts.campaign_upgrade_failed || 0;

    const payoutGateFailures = failuresByReason
      .filter((r) => r.payout_gate)
      .reduce((sum, r) => sum + r.count, 0);

    // Creations that the gate WOULD have refused while it is in warn mode.
    // Counted separately from real failures: nobody was actually turned away.
    const gateMatch = { activity_type: 'share_campaign_gate_warned' };
    if (match.created_at) gateMatch.created_at = match.created_at;
    const wouldBlock = await ActivityLog.countDocuments(gateMatch);

    const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

    return {
      window: { start: startDate || null, end: endDate || null },
      attempted,
      succeeded,
      failed,
      conversion_rate: pct(succeeded, attempted),
      // Of everything that failed, how much was the payout gate.
      payout_gate_failures: payoutGateFailures,
      payout_gate_share_of_failures: pct(payoutGateFailures, failed),
      // Of everything attempted, how much the payout gate turned away. This is
      // the number to watch before enabling the gate on campaign creation.
      payout_gate_block_rate: pct(payoutGateFailures, attempted),
      // Soft-launch signal: creations that would be refused once the gate is
      // switched from `warn` to `enforce`.
      would_block_on_creation: wouldBlock,
      failures_by_reason: failuresByReason.map((r) => ({
        reason_code: r._id || 'UNKNOWN',
        count: r.count,
        payout_gate: !!r.payout_gate,
      })),
      successes_by_initiator: byInitiator.map((r) => ({
        initiator_type: r._id || 'unknown',
        count: r.count,
      })),
      sponsored: {
        requested: counts.campaign_upgrade_requested || 0,
        approved: counts.campaign_upgrade_approved || 0,
        rejected: counts.campaign_upgrade_rejected || 0,
        approval_rate: pct(
          counts.campaign_upgrade_approved || 0,
          counts.campaign_upgrade_requested || 0
        ),
      },
    };
  }

  /**
   * Community boost volume and the suppression mix. A rising
   * `suppression_rate` with a `low_trust` majority is the boost-farming signal.
   */
  static async getBoostStats({ startDate, endDate } = {}) {
    const match = {
      activity_type: {
        $in: ['campaign_boost_succeeded', 'campaign_boost_suppressed', 'campaign_boost_revoked'],
      },
    };
    if (startDate || endDate) {
      match.created_at = {};
      if (startDate) match.created_at.$gte = new Date(startDate);
      if (endDate) match.created_at.$lte = new Date(endDate);
    }

    const [byType, suppressedByReason] = await Promise.all([
      ActivityLog.aggregate([
        { $match: match },
        { $group: { _id: '$activity_type', count: { $sum: 1 } } },
      ]),
      ActivityLog.aggregate([
        { $match: { ...match, activity_type: 'campaign_boost_suppressed' } },
        { $group: { _id: '$metadata.context.suppressed_reason', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const counts = byType.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const counted = counts.campaign_boost_succeeded || 0;
    const suppressed = counts.campaign_boost_suppressed || 0;
    const total = counted + suppressed;

    return {
      window: { start: startDate || null, end: endDate || null },
      counted,
      suppressed,
      revoked: counts.campaign_boost_revoked || 0,
      total,
      suppression_rate: total > 0 ? Math.round((suppressed / total) * 1000) / 10 : 0,
      suppressed_by_reason: suppressedByReason.map((r) => ({
        reason: r._id || 'unknown',
        count: r.count,
      })),
    };
  }
}

module.exports = CampaignEventAnalyticsService;
module.exports.PAYOUT_GATE_CODES = PAYOUT_GATE_CODES;
