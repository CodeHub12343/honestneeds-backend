/**
 * CampaignUpgrade Model
 * -------------------------------------------------------------------------
 * One record per attempt to upgrade a Free Campaign (`campaign_type:
 * 'fundraising'`) into a Share Campaign (`campaign_type: 'sharing'`).
 *
 * A single collection serves all three initiators — the campaign creator, a
 * qualified sponsor, and an admin — because the eligibility predicate, the
 * payout gate, the atomic write, the audit record and the notification are
 * identical across them. Only *authorisation* and *whether owner approval is
 * required* differ, and both are captured by `initiator_type` + `status`.
 *
 * Idempotency: `idempotency_key` carries a UNIQUE index. A replayed request
 * (double-click, retry, flaky network) collides on that index and the service
 * returns the original outcome rather than performing a second upgrade.
 *
 * Concurrency: this document is created BEFORE the campaign is mutated, so a
 * crash between the two leaves an auditable non-terminal record rather than an
 * unexplained campaign type change.
 */

const mongoose = require('mongoose');

const UPGRADE_STATUSES = [
  'pending_owner_approval',
  'completed',
  'rejected',
  'cancelled',
  'failed',
  'expired',
];

const INITIATOR_TYPES = ['creator', 'sponsor', 'admin'];

const campaignUpgradeSchema = new mongoose.Schema(
  {
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    // Human-readable campaign id (CAMP-YYYY-NNN-XXXXXX), denormalised so audit
    // views and notifications don't need a join.
    campaign_ref: {
      type: String,
      default: null,
    },
    campaign_title: {
      type: String,
      default: null,
    },

    // The campaign's owner. NEVER changes as a result of an upgrade — a
    // sponsored or admin upgrade leaves ownership exactly where it was.
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Who actually triggered this upgrade. Equals owner_id for 'creator'.
    initiated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    initiator_type: {
      type: String,
      enum: INITIATOR_TYPES,
      required: true,
    },

    status: {
      type: String,
      enum: UPGRADE_STATUSES,
      default: 'completed',
      index: true,
    },

    from_campaign_type: {
      type: String,
      enum: ['fundraising', 'sharing'],
      required: true,
    },
    to_campaign_type: {
      type: String,
      enum: ['sharing'],
      default: 'sharing',
    },

    // Snapshot of the share_config this upgrade applied, and what was there
    // before. Kept for the audit trail and for manual remediation.
    applied_share_config: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    previous_share_config: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Evidence of the withdrawal-readiness check at the moment the decision was
    // made. Deliberately stores NO payment credentials — only the reference and
    // the resolved level.
    payout_readiness: {
      ready: { type: Boolean, default: false },
      readiness_level: {
        type: String,
        enum: ['verified', 'provisional', 'none'],
        default: 'none',
      },
      payment_method_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaymentMethod',
        default: null,
      },
      method_type: { type: String, default: null },
      checked_at: { type: Date, default: null },
    },

    reason: { type: String, maxlength: 500, default: null },
    admin_note: { type: String, maxlength: 1000, default: null },
    rejection_reason: { type: String, maxlength: 500, default: null },

    // Namespaced as `${campaignId}:${actorId}:${clientUuid}` so a key cannot
    // collide across campaigns or actors.
    idempotency_key: {
      type: String,
      required: true,
    },

    approved_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    // Sponsor requests only — an unanswered request should not linger forever.
    expires_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'campaign_upgrades',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

campaignUpgradeSchema.index({ campaign_id: 1, created_at: -1 });
campaignUpgradeSchema.index({ owner_id: 1, status: 1 });
campaignUpgradeSchema.index({ initiated_by: 1, created_at: -1 });
campaignUpgradeSchema.index({ expires_at: 1 }, { sparse: true });

// The idempotency guarantee. A replayed upgrade request hits E11000 here and is
// resolved by the service into the original result.
campaignUpgradeSchema.index({ idempotency_key: 1 }, { unique: true });

// At most ONE open sponsor request per campaign, so a campaign cannot
// accumulate a queue of competing requests the owner has to triage.
campaignUpgradeSchema.index(
  { campaign_id: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending_owner_approval' },
    name: 'one_pending_upgrade_per_campaign',
  }
);

campaignUpgradeSchema.virtual('is_terminal').get(function isTerminal() {
  return ['completed', 'rejected', 'cancelled', 'failed', 'expired'].includes(this.status);
});

/**
 * Find the open (awaiting owner) request for a campaign, if any.
 */
campaignUpgradeSchema.statics.findPendingForCampaign = function findPendingForCampaign(campaignId) {
  return this.findOne({ campaign_id: campaignId, status: 'pending_owner_approval' });
};

/**
 * Sweep sponsor requests that were never answered. Called by a scheduled job or
 * lazily before creating a new request, so an abandoned request cannot block
 * the campaign forever via the partial unique index above.
 */
campaignUpgradeSchema.statics.expireStaleRequests = async function expireStaleRequests(now = new Date()) {
  const result = await this.updateMany(
    {
      status: 'pending_owner_approval',
      expires_at: { $ne: null, $lte: now },
    },
    { $set: { status: 'expired' } }
  );
  return result.modifiedCount || 0;
};

module.exports = mongoose.model('CampaignUpgrade', campaignUpgradeSchema);
module.exports.UPGRADE_STATUSES = UPGRADE_STATUSES;
module.exports.INITIATOR_TYPES = INITIATOR_TYPES;
