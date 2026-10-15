/**
 * VideoShare — one share of a Video to an external platform.
 *
 * Separate from the existing `ShareRecord` (which tracks campaign shares)
 * because video shares have a different reward trigger: the Phase 6 promo
 * wallet, not the creator's share budget.
 *
 * Reward lifecycle:
 *   pending_verification  — share recorded, awaiting proof
 *   verified              — eligible, promo wallet debit happens (Phase 6)
 *   rejected              — not eligible; reason stored
 *
 * Idempotency:
 *   `idempotency_key` is unique. Clients MUST supply one when calling the
 *   share endpoint. Replays return the original row.
 *
 * Fraud / cooldown enforcement:
 *   `(video_id, user_id, created_at desc)` index serves the 12h-cooldown
 *   check used by VideoRewardService (Phase 6).
 */

const mongoose = require('mongoose');

const VERIFICATION_STATUSES = ['pending_verification', 'verified', 'rejected'];
const REWARD_STATUSES = ['none', 'reserved', 'granted', 'released'];
const SUPPORTED_PLATFORMS = [
  'facebook',
  'instagram',
  'twitter',
  'x',
  'linkedin',
  'tiktok',
  'whatsapp',
  'telegram',
  'reddit',
  'other',
];

const videoShareSchema = new mongoose.Schema(
  {
    video_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Video',
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    platform: { type: String, enum: SUPPORTED_PLATFORMS, required: true },
    external_post_url: { type: String, default: null, maxlength: 2048 },

    // Replay protection — unique index declared below so a client retry is a
    // read, not a write.
    idempotency_key: { type: String, required: true },

    verification_status: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: 'pending_verification',
      index: true,
    },
    verification_notes: { type: String, default: null },
    verified_at: { type: Date, default: null },
    rejected_at: { type: Date, default: null },
    rejection_reason: { type: String, default: null, maxlength: 500 },

    reward_amount_cents: { type: Number, default: 0, min: 0 },
    reward_status: { type: String, enum: REWARD_STATUSES, default: 'none' },

    // Request context for fraud review.
    ip_address: { type: String, default: null },
    user_agent: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

videoShareSchema.index({ idempotency_key: 1 }, { unique: true });
videoShareSchema.index({ video_id: 1, user_id: 1, created_at: -1 }); // cooldown lookup
videoShareSchema.index({ user_id: 1, created_at: -1 });              // user share history
videoShareSchema.index({ verification_status: 1, created_at: -1 });

module.exports = mongoose.model('VideoShare', videoShareSchema);
module.exports.VERIFICATION_STATUSES = VERIFICATION_STATUSES;
module.exports.REWARD_STATUSES = REWARD_STATUSES;
module.exports.SUPPORTED_PLATFORMS = SUPPORTED_PLATFORMS;
