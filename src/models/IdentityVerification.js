/**
 * IdentityVerification Model
 *
 * Stores ID+ Verification submissions (CP-11 / SE-06). One active submission
 * per user at a time; historical submissions are retained for audit.
 *
 * Security & compliance notes:
 *  - Document/selfie assets are stored in the private media provider; only the
 *    secure URL + provider public_id are persisted here.
 *  - `toJSON` strips the raw asset URLs so they are never leaked to the owner
 *    or public API — only staff service code reads them directly.
 *  - Retention: approved submissions should have their assets purged 90 days
 *    after approval (handled by a scheduled job; `purge_after` records the due
 *    date).
 */

const mongoose = require('mongoose');

const identityVerificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    tier: {
      type: String,
      enum: ['basic', 'premium'],
      default: 'basic',
      required: true,
    },

    document_type: {
      type: String,
      enum: ['drivers_license', 'state_id', 'passport'],
      required: true,
    },

    // Stored asset references (private). Stripped from API responses.
    document_front_url: { type: String, default: null },
    document_front_public_id: { type: String, default: null },
    document_back_url: { type: String, default: null },
    document_back_public_id: { type: String, default: null },
    selfie_url: { type: String, default: null },
    selfie_public_id: { type: String, default: null },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'needs_more_info'],
      default: 'pending',
      index: true,
    },

    // Automated checks (face-match, liveness, duplicate detection) — populated
    // by an async pipeline / third-party provider (Persona, Onfido, Jumio).
    automated_checks: {
      face_match_score: { type: Number, default: null },
      liveness_passed: { type: Boolean, default: null },
      duplicate_suspected: { type: Boolean, default: false },
      provider: { type: String, default: null },
      provider_reference: { type: String, default: null },
    },

    // Manual review (Premium tier / escalations)
    reviewer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    review_notes: { type: String, default: null },
    rejection_reason: { type: String, default: null },

    submitted_at: { type: Date, default: Date.now },
    reviewed_at: { type: Date, default: null },

    // Asset retention due date (set on approval).
    purge_after: { type: Date, default: null },
    assets_purged: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

identityVerificationSchema.index({ user_id: 1, status: 1 });
identityVerificationSchema.index({ status: 1, submitted_at: 1 }); // review queue
identityVerificationSchema.index({ purge_after: 1 }, { sparse: true });

/**
 * Strip private asset URLs from any serialized output.
 */
identityVerificationSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.document_front_url;
  delete obj.document_front_public_id;
  delete obj.document_back_url;
  delete obj.document_back_public_id;
  delete obj.selfie_url;
  delete obj.selfie_public_id;
  return obj;
};

/**
 * Static: findLatestForUser
 */
identityVerificationSchema.statics.findLatestForUser = function findLatestForUser(userId) {
  return this.findOne({ user_id: userId }).sort({ submitted_at: -1 });
};

module.exports = mongoose.model('IdentityVerification', identityVerificationSchema);
