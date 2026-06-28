/**
 * VolunteerOpportunity Model (BU-06)
 *
 * A business/organization posts a volunteer opportunity that volunteers browse
 * and apply to. This is the inverse of VolunteerOffer (where a volunteer offers
 * help on a campaign); applications against an opportunity live in
 * VolunteerApplication.
 *
 * Status machine:
 *   open  →  closed (manually or when filled)  |  expired (past end_date)
 */

const mongoose = require('mongoose');

const OPPORTUNITY_CATEGORIES = [
  'community_support',
  'fundraising',
  'event_staffing',
  'skilled_professional',
  'mentorship',
  'logistics',
  'administrative',
  'other',
];

const VolunteerOpportunitySchema = new mongoose.Schema(
  {
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      required: [true, 'Business ID is required'],
      index: true,
    },
    posted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Posting user ID is required'],
      index: true,
    },

    title: {
      type: String,
      required: [true, 'Title is required'],
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      minlength: [20, 'Description must be at least 20 characters'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    category: {
      type: String,
      enum: {
        values: OPPORTUNITY_CATEGORIES,
        message: '{VALUE} is not a valid category',
      },
      required: [true, 'Category is required'],
      index: true,
    },
    skills_required: {
      type: [String],
      validate: {
        validator: (v) => v.length <= 15,
        message: 'Skills array cannot exceed 15 items',
      },
      default: [],
    },

    // ── Logistics ───────────────────────────────────────────────
    is_remote: { type: Boolean, default: false },
    location: {
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
      address: { type: String, default: '' },
      _id: false,
    },
    time_commitment: {
      hours_per_week: { type: Number, min: 0, max: 168, default: 0 },
      duration_weeks: { type: Number, min: 0, default: 0 },
      schedule_notes: { type: String, maxlength: 500, default: '' },
      _id: false,
    },
    slots_available: {
      type: Number,
      min: [1, 'At least one slot is required'],
      default: 1,
    },
    slots_filled: {
      type: Number,
      min: 0,
      default: 0,
    },

    // ── Lifecycle ───────────────────────────────────────────────
    start_date: { type: Date, default: null },
    end_date: { type: Date, default: null, index: true },
    status: {
      type: String,
      enum: ['open', 'closed', 'expired'],
      default: 'open',
      index: true,
    },

    applications_count: { type: Number, default: 0 },

    deleted_at: { type: Date, default: null, index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

VolunteerOpportunitySchema.index({ status: 1, created_at: -1 });
VolunteerOpportunitySchema.index({ category: 1, status: 1 });
VolunteerOpportunitySchema.index({ business_id: 1, status: 1 });
VolunteerOpportunitySchema.index({ title: 'text', description: 'text' });

/**
 * Whether the opportunity is still accepting applications.
 */
VolunteerOpportunitySchema.methods.isAcceptingApplications = function isAcceptingApplications() {
  if (this.deleted_at) return false;
  if (this.status !== 'open') return false;
  if (this.end_date && new Date() > this.end_date) return false;
  if (this.slots_filled >= this.slots_available) return false;
  return true;
};

VolunteerOpportunitySchema.methods.getPublicView = function getPublicView() {
  const obj = this.toObject();
  return {
    id: this._id.toString(),
    business_id: this.business_id?.toString?.() || this.business_id,
    title: this.title,
    description: this.description,
    category: this.category,
    skills_required: this.skills_required,
    is_remote: this.is_remote,
    location: this.location,
    time_commitment: this.time_commitment,
    slots_available: this.slots_available,
    slots_filled: this.slots_filled,
    start_date: this.start_date,
    end_date: this.end_date,
    status: this.status,
    applications_count: this.applications_count,
    created_at: this.created_at,
    business: obj.business_id && obj.business_id.business_name ? obj.business_id : undefined,
  };
};

module.exports = mongoose.model('VolunteerOpportunity', VolunteerOpportunitySchema);
module.exports.OPPORTUNITY_CATEGORIES = OPPORTUNITY_CATEGORIES;
