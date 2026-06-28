/**
 * Sponsorship Mongoose Model
 * Stores all sponsorship records including financial data,
 * sponsor profile, status, and auto-generated admin tasks.
 *
 * Status State Machine:
 *   pending_payment  →  pending_onboarding  (checkout submitted)
 *   pending_onboarding  →  active            (questionnaire completed)
 *   active  →  suspended                     (admin action)
 *   suspended  →  active                     (admin action)
 */

const mongoose = require('mongoose');

const AdminTaskSchema = new mongoose.Schema(
  {
    taskDescription: { type: String, required: true },
    isComplete: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { _id: true }
);

const SponsorshipSchema = new mongoose.Schema(
  {
    // ── Identification ──────────────────────────────────────────
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Optional link to a BusinessProfile (BU-03 analytics / BU-04 CSR rollups).
    // Set when the sponsoring user has a business profile, or passed explicitly
    // at checkout. Indexed for the business analytics aggregation.
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessProfile', default: null, index: true },
    tierId: { type: String, required: true },
    tierName: { type: String, required: true },

    // ── Financial ───────────────────────────────────────────────
    grossAmount: { type: Number, required: true },
    platformFee: { type: Number, required: true },
    netAmount: { type: Number, required: true },
    repaymentTotal: { type: Number, default: null },
    minMonthlyPayment: { type: Number, default: null },
    partnershipYears: { type: Number, default: null },
    isRecurring: { type: Boolean, default: false },

    // ── Payment ─────────────────────────────────────────────────
    paymentMethod: { type: String, required: true },
    paymentConfirmedBySponsor: { type: Boolean, default: false },
    paymentVerifiedByAdmin: { type: Boolean, default: false },
    stripeSessionId: { type: String, default: null },
    stripePaymentIntentId: { type: String, default: null },

    // ── Sponsor Profile (filled during onboarding) ──────────────
    sponsorName: { type: String, required: true },
    businessName: { type: String, default: '' },
    email: { type: String, required: true },
    logoUrl: { type: String, default: '' },
    websiteUrl: { type: String, default: '' },
    tagline: { type: String, default: '' },
    socialLinks: {
      facebook: { type: String, default: '' },
      instagram: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      twitter: { type: String, default: '' },
    },
    missionStatement: { type: String, default: '' },
    referralSource: { type: String, default: '' },

    // ── Status ──────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending_payment', 'pending_onboarding', 'active', 'suspended', 'expired'],
      default: 'pending_payment',
    },
    isLive: { type: Boolean, default: false },

    // ── Admin Tasks ─────────────────────────────────────────────
    adminTasks: [AdminTaskSchema],

    // ── Timestamps ──────────────────────────────────────────────
    activatedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// ── Safety: never allow isLive=true unless status is "active" ──
SponsorshipSchema.pre('save', function (next) {
  if (this.isLive && this.status !== 'active') {
    this.isLive = false;
  }
  next();
});

// ── Indexes for common queries ──
SponsorshipSchema.index({ status: 1, isLive: 1 });
SponsorshipSchema.index({ tierId: 1 });
SponsorshipSchema.index({ email: 1 });

module.exports =
  mongoose.models.Sponsorship ||
  mongoose.model('Sponsorship', SponsorshipSchema);
