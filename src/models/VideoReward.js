/**
 * VideoReward — one row per (video, user, platform, created window).
 *
 * State machine:
 *   pending_verification → verified | rejected
 *
 * reserve-on-pending → debit-on-verify / release-on-reject is enforced by
 * VideoRewardService, which is the only writer that transitions the state.
 */

const mongoose = require('mongoose');

const STATES = ['pending_verification', 'verified', 'rejected'];
const PLATFORMS = ['facebook', 'instagram', 'twitter', 'x', 'linkedin', 'tiktok', 'youtube', 'threads'];

const videoRewardSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    video_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true, index: true },

    platform: { type: String, enum: PLATFORMS, required: true },
    external_post_url: { type: String, default: null },

    amount_cents: { type: Number, required: true },
    verification_status: {
      type: String,
      enum: STATES,
      default: 'pending_verification',
      index: true,
    },

    // Set when funds are reserved on the promo wallet; dropped on verify/reject.
    reserved_ledger_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PromoWalletLedger',
      default: null,
    },
    settled_ledger_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PromoWalletLedger',
      default: null,
    },

    rejection_reason: { type: String, default: null },

    // The idempotency key the client sent on /videos/:id/share.
    idempotency_key: { type: String, required: true, index: true },

    verified_at: { type: Date, default: null },
    rejected_at: { type: Date, default: null },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Replay guard for /videos/:id/share: one row per (user, idempotency_key).
videoRewardSchema.index({ user_id: 1, idempotency_key: 1 }, { unique: true });

// Fast lookup of the sibling-race SET for a (video, user) within a cooldown.
videoRewardSchema.index({ video_id: 1, user_id: 1, createdAt: -1 });

videoRewardSchema.statics.STATES = STATES;
videoRewardSchema.statics.PLATFORMS = PLATFORMS;

module.exports = mongoose.model('VideoReward', videoRewardSchema);
module.exports.STATES = STATES;
module.exports.PLATFORMS = PLATFORMS;
