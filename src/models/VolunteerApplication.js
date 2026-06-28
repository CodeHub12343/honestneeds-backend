/**
 * VolunteerApplication Model (BU-06)
 *
 * A volunteer's application against a VolunteerOpportunity posted by a business.
 * One pending/active application per (volunteer, opportunity) pair.
 *
 * Status machine:
 *   pending  →  accepted | rejected | withdrawn
 *   accepted →  completed
 */

const mongoose = require('mongoose');

const VolunteerApplicationSchema = new mongoose.Schema(
  {
    opportunity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VolunteerOpportunity',
      required: true,
      index: true,
    },
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      required: true,
      index: true,
    },
    volunteer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    message: {
      type: String,
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
      default: '',
    },
    relevant_skills: {
      type: [String],
      default: [],
    },
    contact_email: { type: String, default: '' },
    contact_phone: { type: String, default: '' },

    // Category-specific questionnaire answers. Self-describing so a reviewer can
    // render them without the (frontend) form schema: each entry carries its own
    // human label alongside the stored value.
    application_answers: {
      type: [
        {
          key: { type: String, required: true },
          label: { type: String, default: '' },
          value: { type: mongoose.Schema.Types.Mixed, default: '' },
          _id: false,
        },
      ],
      default: [],
    },

    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'withdrawn', 'completed'],
      default: 'pending',
      index: true,
    },
    status_changed_at: { type: Date, default: Date.now },
    decision_note: { type: String, default: null },

    hours_logged: { type: Number, default: 0, min: 0 },
    completed_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// One active application per volunteer per opportunity.
VolunteerApplicationSchema.index({ opportunity_id: 1, volunteer_id: 1 }, { unique: true });
VolunteerApplicationSchema.index({ volunteer_id: 1, status: 1 });
VolunteerApplicationSchema.index({ business_id: 1, status: 1 });

module.exports = mongoose.model('VolunteerApplication', VolunteerApplicationSchema);
