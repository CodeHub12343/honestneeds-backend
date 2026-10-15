/**
 * UpgradeRequest — owner-initiated "please upgrade my campaign" ask.
 * -------------------------------------------------------------------------
 * Direction note: this is the REVERSE of CampaignUpgrade's sponsor flow.
 *
 *   CampaignUpgrade  — a sponsor OFFERS to upgrade someone else's campaign;
 *                       owner approves/rejects.
 *   UpgradeRequest   — an owner ASKS the community to upgrade theirs;
 *                       any eligible sponsor fulfils it.
 *
 * Lifecycle:
 *
 *   open  ─(sponsor fulfils)──→  fulfilled
 *         ─(owner cancels)────→  cancelled
 *         ─(14d ttl)──────────→  expired
 *
 * Partial unique index on `(campaign_id, status='open')` guarantees a campaign
 * has at most one open request at a time — a second POST while one is open
 * fails fast at the DB.
 *
 * Not stored here (deliberate):
 *   - the sponsor fulfilment itself. That becomes a `CampaignUpgrade` row via
 *     the existing sponsor pipeline; this record only points at it with
 *     `fulfilled_by_upgrade_id`. One source of truth per concept.
 */

const mongoose = require('mongoose');

const UPGRADE_REQUEST_STATUSES = ['open', 'fulfilled', 'cancelled', 'expired'];
const REQUEST_TTL_DAYS = 14;

const upgradeRequestSchema = new mongoose.Schema(
  {
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    campaign_ref: { type: String, default: null },
    campaign_title: { type: String, default: null },

    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    message: {
      type: String,
      maxlength: 1000,
      default: null,
    },

    status: {
      type: String,
      enum: UPGRADE_REQUEST_STATUSES,
      default: 'open',
      index: true,
    },

    // Audit of fulfilment: pointer to the actual CampaignUpgrade row that
    // settled this request. Null until status === 'fulfilled'.
    fulfilled_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    fulfilled_by_upgrade_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CampaignUpgrade',
      default: null,
    },
    fulfilled_at: { type: Date, default: null },

    cancelled_at: { type: Date, default: null },
    cancel_reason: { type: String, default: null },

    expires_at: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000),
      index: true,
    },

    // Veterans-flagged campaigns surface higher in community listings
    // (Phase 7 wires the UI); denormalised at write-time so the list query
    // doesn't need a join.
    is_veteran: { type: Boolean, default: false, index: true },

    // Platform Sponsorship Pool fulfilment. Set when the admin "grants" this
    // request against the PromoWallet. `pool_grant_amount_cents` is what was
    // debited from the pool and later refunded if the downstream upgrade
    // failed; `pool_grant_ledger_id` points at the ledger row for audit.
    pool_funded: { type: Boolean, default: false, index: true },
    pool_grant_amount_cents: { type: Number, default: null },
    pool_grant_ledger_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PromoWalletLedger',
      default: null,
    },
    pool_granted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pool_granted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// At most one OPEN request per campaign.
upgradeRequestSchema.index(
  { campaign_id: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);
// Scanned by the TTL sweeper.
upgradeRequestSchema.index({ status: 1, expires_at: 1 });
// Community list ordering.
upgradeRequestSchema.index({ status: 1, created_at: -1 });

module.exports = mongoose.model('UpgradeRequest', upgradeRequestSchema);
module.exports.UPGRADE_REQUEST_STATUSES = UPGRADE_REQUEST_STATUSES;
module.exports.REQUEST_TTL_DAYS = REQUEST_TTL_DAYS;
