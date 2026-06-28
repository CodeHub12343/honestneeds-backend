/**
 * VolunteerHourLog Model (VO-03 Volunteer Hour Logging, VO-06 Proof of Kindness)
 *
 * A volunteer self-logs hours spent helping. Logs start as `pending` and are
 * verified (or rejected) by an authorized verifier — the campaign creator, the
 * business that posted the opportunity, or an admin. Only verified hours count
 * toward VolunteerProfile.total_hours, volunteer XP, and leaderboards.
 *
 * When a log includes proof attachments and the verifier marks
 * `proof_of_kindness: true`, the verified log becomes a "Proof of Kindness"
 * record (VO-06) and contributes to the volunteer's proof_of_kindness_count.
 *
 * Status machine:
 *   pending  →  verified | rejected
 *   pending  →  cancelled (by the volunteer, before verification)
 */

const mongoose = require('mongoose');

const HOUR_LOG_SOURCES = ['campaign', 'opportunity', 'assignment', 'independent'];

const VolunteerHourLogSchema = new mongoose.Schema(
  {
    volunteer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Volunteer ID is required'],
      index: true,
    },
    volunteer_profile_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VolunteerProfile',
      required: true,
      index: true,
    },

    // What the hours were logged against (at most one of campaign/opportunity).
    source: {
      type: String,
      enum: HOUR_LOG_SOURCES,
      default: 'independent',
      index: true,
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
      index: true,
    },
    opportunity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VolunteerOpportunity',
      default: null,
      index: true,
    },
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      default: null,
    },

    hours: {
      type: Number,
      required: [true, 'Hours are required'],
      min: [0.25, 'Hours must be at least 0.25'],
      max: [24, 'A single log cannot exceed 24 hours'],
    },
    activity_date: {
      type: Date,
      required: [true, 'Activity date is required'],
      index: true,
    },
    description: {
      type: String,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },

    // ── Proof of Kindness (VO-06) ─────────────────────────────────
    proof_attachments: [
      {
        url: { type: String, required: true },
        type: { type: String, enum: ['image', 'video', 'document', 'link'], default: 'image' },
        caption: { type: String, maxlength: 300, default: '' },
        _id: false,
      },
    ],
    proof_of_kindness: {
      // Whether the verifier flagged this verified log as a proof of kindness.
      type: Boolean,
      default: false,
    },

    // ── Verification ──────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    verified_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    verified_at: { type: Date, default: null },
    verifier_role: {
      type: String,
      enum: ['creator', 'business', 'admin', null],
      default: null,
    },
    decision_note: { type: String, maxlength: 1000, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

VolunteerHourLogSchema.index({ volunteer_id: 1, status: 1 });
VolunteerHourLogSchema.index({ campaign_id: 1, status: 1 });
VolunteerHourLogSchema.index({ opportunity_id: 1, status: 1 });
VolunteerHourLogSchema.index({ status: 1, created_at: -1 });

VolunteerHourLogSchema.methods.isVerifiable = function isVerifiable() {
  return this.status === 'pending';
};

module.exports = mongoose.model('VolunteerHourLog', VolunteerHourLogSchema);
module.exports.HOUR_LOG_SOURCES = HOUR_LOG_SOURCES;
