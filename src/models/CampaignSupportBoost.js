/**
 * CampaignSupportBoost Model
 * -------------------------------------------------------------------------
 * COMMUNITY (peer) boost — one user amplifying ANOTHER user's campaign.
 *
 * ⚠️ This is NOT the same thing as `CampaignBoost`. `CampaignBoost` is the
 * creator's own PAID Stripe visibility purchase ($20 pro tier) for their own
 * campaign. This model is the free, peer-to-peer signal. They are separate
 * collections, separate routes (/api/boosts vs
 * /api/campaigns/:id/support-boost) and separate UI language ("Promote" for
 * the paid one, "Boost"/"Support" for this one). Do not conflate them:
 * community boosts must never outrank a paid boost in listings, or the paid
 * product loses its value.
 *
 * Quota: one ranking-effective boost per user per campaign per UTC day. That
 * is enforced by the UNIQUE index on {campaign_id, booster_id, boost_day} —
 * a database invariant, not an application check, so a concurrent
 * double-submit fails with E11000 instead of racing. This deliberately mirrors
 * the existing "1 tip-eligible share per campaign per day, over-quota is free"
 * rule from ShareGrant.
 *
 * Privacy: IP and user-agent are stored HASHED. These records are retained
 * long-term to power ranking, and retaining raw IPs for that is not justified.
 */

const mongoose = require('mongoose');

const BOOST_TYPES = ['share', 'endorse', 'amplify'];
const BOOST_SOURCES = ['campaign_page', 'discover', 'share_flow', 'notification', 'api'];
const SUPPRESSED_REASONS = ['daily_quota', 'low_trust', 'fraud_flag'];

const campaignSupportBoostSchema = new mongoose.Schema(
  {
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    // Denormalised so self-boost checks and owner notifications don't need a join.
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    booster_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    boost_type: {
      type: String,
      enum: BOOST_TYPES,
      default: 'share',
    },
    source: {
      type: String,
      enum: BOOST_SOURCES,
      default: 'campaign_page',
    },

    // Set when the boost was backed by a real, recorded share.
    share_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Share',
      default: null,
    },
    channel: { type: String, default: null },

    // ── Ranking contribution ────────────────────────────────────────────
    // A boost is always RECORDED (so the user gets feedback and analytics stay
    // truthful), but only counts toward ranking when it clears the quota and
    // the booster carries non-zero trust. Suppressed boosts look identical to
    // the attacker, which is the point — no signal to optimise against.
    counts_toward_score: {
      type: Boolean,
      default: true,
      index: true,
    },
    trust_weight: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    score_contribution: {
      type: Number,
      default: 0,
      min: 0,
    },
    suppressed_reason: {
      type: String,
      enum: [...SUPPRESSED_REASONS, null],
      default: null,
    },

    xp_awarded: { type: Number, default: 0 },

    ip_hash: { type: String, default: null, index: true },
    user_agent_hash: { type: String, default: null },

    // 'YYYY-MM-DD' in UTC. The quota key — part of the unique index below.
    boost_day: {
      type: String,
      required: true,
    },

    revoked_at: { type: Date, default: null },
    revoked_reason: { type: String, default: null },
    revoked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'campaign_support_boosts',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// The one-per-day guarantee, enforced by the database.
campaignSupportBoostSchema.index(
  { campaign_id: 1, booster_id: 1, boost_day: 1 },
  { unique: true, name: 'one_boost_per_user_per_campaign_per_day' }
);
campaignSupportBoostSchema.index({ campaign_id: 1, created_at: -1 });
campaignSupportBoostSchema.index({ booster_id: 1, created_at: -1 });
campaignSupportBoostSchema.index({ ip_hash: 1, created_at: -1 });
campaignSupportBoostSchema.index({ campaign_id: 1, counts_toward_score: 1 });

/**
 * UTC day key for the quota window.
 * @param {Date} [date]
 * @returns {string} 'YYYY-MM-DD'
 */
campaignSupportBoostSchema.statics.dayKey = function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
};

/**
 * Start of the next UTC day — when the user may boost this campaign again.
 * @param {Date} [from]
 * @returns {Date}
 */
campaignSupportBoostSchema.statics.nextBoostAvailableAt = function nextBoostAvailableAt(
  from = new Date()
) {
  const next = new Date(from);
  next.setUTCHours(24, 0, 0, 0);
  return next;
};

/**
 * Has this user already boosted this campaign today?
 */
campaignSupportBoostSchema.statics.findTodaysBoost = function findTodaysBoost(
  campaignId,
  boosterId,
  date = new Date()
) {
  return this.findOne({
    campaign_id: campaignId,
    booster_id: boosterId,
    boost_day: this.dayKey(date),
  });
};

module.exports = mongoose.model('CampaignSupportBoost', campaignSupportBoostSchema);
module.exports.BOOST_TYPES = BOOST_TYPES;
module.exports.BOOST_SOURCES = BOOST_SOURCES;
module.exports.SUPPRESSED_REASONS = SUPPRESSED_REASONS;
