/**
 * VolunteerReferenceLetter Model (VO-07 Volunteer Reference Letters)
 *
 * A reference letter issued for a volunteer by an authorized referrer — a
 * campaign creator, a business that hosted them, or an admin. A volunteer can
 * request a letter (status `requested`); the referrer issues it (`issued`) or
 * declines (`declined`). Issued letters can be made public via a share token so
 * the volunteer can link to them on a résumé / profile.
 *
 * At issue time we snapshot the volunteer's verified hours and rating so the
 * letter remains a stable historical record.
 *
 * Status machine:
 *   requested  →  issued | declined
 *   (a referrer may also issue directly without a prior request)
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const VolunteerReferenceLetterSchema = new mongoose.Schema(
  {
    volunteer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    volunteer_profile_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VolunteerProfile',
      required: true,
      index: true,
    },

    // The party issuing the reference.
    referrer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    referrer_role: {
      type: String,
      enum: ['creator', 'business', 'admin'],
      required: true,
    },
    referrer_name: { type: String, default: '' },
    referrer_title: { type: String, default: '' },
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      default: null,
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
    },

    // Optional message from the volunteer when requesting a letter.
    request_message: { type: String, maxlength: 1000, default: '' },

    // The letter body (set when issued).
    body: { type: String, maxlength: 5000, default: '' },
    relationship: { type: String, maxlength: 300, default: '' },

    status: {
      type: String,
      enum: ['requested', 'issued', 'declined'],
      default: 'requested',
      index: true,
    },
    decline_reason: { type: String, maxlength: 500, default: null },

    // Snapshot of the volunteer's standing at issue time.
    snapshot: {
      total_hours: { type: Number, default: 0 },
      total_assignments: { type: Number, default: 0 },
      rating: { type: Number, default: 0 },
      proof_of_kindness_count: { type: Number, default: 0 },
      _id: false,
    },

    // Public sharing.
    is_public: { type: Boolean, default: false },
    public_token: { type: String, default: null, index: true, sparse: true },

    issued_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

VolunteerReferenceLetterSchema.index({ volunteer_id: 1, status: 1 });
VolunteerReferenceLetterSchema.index({ referrer_id: 1, status: 1 });

/**
 * Generate a URL-safe public share token (idempotent — keeps an existing one).
 * @returns {String}
 */
VolunteerReferenceLetterSchema.methods.ensurePublicToken = function ensurePublicToken() {
  if (!this.public_token) {
    this.public_token = crypto.randomBytes(16).toString('hex');
  }
  return this.public_token;
};

/**
 * Public-facing projection (safe for unauthenticated share links).
 */
VolunteerReferenceLetterSchema.methods.getPublicView = function getPublicView() {
  return {
    id: this._id.toString(),
    referrer_name: this.referrer_name,
    referrer_title: this.referrer_title,
    referrer_role: this.referrer_role,
    relationship: this.relationship,
    body: this.body,
    snapshot: this.snapshot,
    issued_at: this.issued_at,
  };
};

module.exports = mongoose.model('VolunteerReferenceLetter', VolunteerReferenceLetterSchema);
