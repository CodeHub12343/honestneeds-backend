/**
 * BusinessProfile Model
 *
 * Backs the Business Features suite (BU-01 Profile Pages, BU-02 Directory,
 * BU-03 Analytics, BU-05 Badge/Verification). One profile per User; a regular
 * user "becomes" a business by creating a profile (no role change required, so
 * auth/JWT is untouched).
 *
 * Public surface:
 *  - `getPublicProfile()` returns the safe, directory/profile-page payload.
 *  - The verification *documents* live in BusinessVerification (private); only
 *    the derived `verification_status` / `is_verified` badge live here.
 */

const mongoose = require('mongoose');

const BUSINESS_INDUSTRIES = [
  'retail',
  'food_beverage',
  'technology',
  'healthcare',
  'finance',
  'real_estate',
  'manufacturing',
  'professional_services',
  'education',
  'nonprofit',
  'hospitality',
  'construction',
  'transportation',
  'media',
  'other',
];

const BusinessProfileSchema = new mongoose.Schema(
  {
    // ── Ownership ───────────────────────────────────────────────
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
      index: true,
    },

    // ── Core identity (BU-01) ───────────────────────────────────
    business_name: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      minlength: [2, 'Business name must be at least 2 characters'],
      maxlength: [120, 'Business name cannot exceed 120 characters'],
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
      // Set from business_name on first save (see pre-validate hook).
    },
    tagline: {
      type: String,
      maxlength: [160, 'Tagline cannot exceed 160 characters'],
      default: '',
    },
    description: {
      type: String,
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
      default: '',
    },
    industry: {
      type: String,
      enum: {
        values: BUSINESS_INDUSTRIES,
        message: '{VALUE} is not a valid industry',
      },
      default: 'other',
      index: true,
    },

    // ── Branding ────────────────────────────────────────────────
    logo_url: { type: String, default: '' },
    logo_public_id: { type: String, default: '' },
    banner_url: { type: String, default: '' },
    banner_public_id: { type: String, default: '' },

    // ── Contact / web ───────────────────────────────────────────
    website_url: { type: String, default: '' },
    contact_email: { type: String, default: '' },
    contact_phone: { type: String, default: '' },
    social_links: {
      facebook: { type: String, default: '' },
      instagram: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      twitter: { type: String, default: '' },
      _id: false,
    },

    // ── Location (BU-02 directory filtering) ────────────────────
    location: {
      city: { type: String, default: '', index: true },
      state: { type: String, default: '', index: true },
      country: { type: String, default: '', index: true },
      _id: false,
    },

    // ── Mission / CSR (BU-04) ───────────────────────────────────
    mission_statement: {
      type: String,
      maxlength: [2000, 'Mission statement cannot exceed 2000 characters'],
      default: '',
    },

    // ── Verification badge (BU-05) ──────────────────────────────
    // Source of truth for documents is BusinessVerification; this is the
    // derived, public-facing badge state.
    verification_status: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified',
      index: true,
    },
    is_verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    verified_at: { type: Date, default: null },

    // ── Lifecycle ───────────────────────────────────────────────
    status: {
      type: String,
      enum: ['active', 'hidden', 'suspended'],
      default: 'active',
      index: true,
    },
    suspended_reason: { type: String, default: null },

    // ── Denormalised counters (kept fresh by services) ──────────
    stats: {
      total_sponsored_cents: { type: Number, default: 0 },
      sponsorships_count: { type: Number, default: 0 },
      opportunities_posted: { type: Number, default: 0 },
      giveaways_count: { type: Number, default: 0 },
      profile_views: { type: Number, default: 0 },
      _id: false,
    },

    deleted_at: { type: Date, default: null, index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// ── Indexes for directory search (BU-02) ──
BusinessProfileSchema.index({ status: 1, is_verified: -1, created_at: -1 });
BusinessProfileSchema.index({ industry: 1, status: 1 });
BusinessProfileSchema.index({ business_name: 'text', description: 'text', tagline: 'text' });

/**
 * Generate a URL-safe slug from the business name. Uniqueness is enforced by
 * the unique index; collisions get a short random suffix.
 */
function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

BusinessProfileSchema.pre('validate', function preValidate(next) {
  if (!this.slug && this.business_name) {
    const base = slugify(this.business_name) || 'business';
    const suffix = Math.random().toString(36).substring(2, 7);
    this.slug = `${base}-${suffix}`;
  }
  next();
});

// ── Instance methods ──

/**
 * Safe, public-facing payload for directory listings and profile pages.
 * Never exposes raw verification documents (those live in BusinessVerification).
 */
BusinessProfileSchema.methods.getPublicProfile = function getPublicProfile() {
  return {
    id: this._id.toString(),
    user_id: this.user_id?.toString(),
    business_name: this.business_name,
    slug: this.slug,
    tagline: this.tagline,
    description: this.description,
    industry: this.industry,
    logo_url: this.logo_url,
    banner_url: this.banner_url,
    website_url: this.website_url,
    social_links: this.social_links,
    location: this.location,
    mission_statement: this.mission_statement,
    is_verified: this.is_verified,
    verification_status: this.verification_status,
    stats: {
      total_sponsored_cents: this.stats?.total_sponsored_cents || 0,
      sponsorships_count: this.stats?.sponsorships_count || 0,
      opportunities_posted: this.stats?.opportunities_posted || 0,
      giveaways_count: this.stats?.giveaways_count || 0,
    },
    created_at: this.created_at,
  };
};

// ── Static methods ──

BusinessProfileSchema.statics.findByUserId = function findByUserId(userId) {
  return this.findOne({ user_id: userId, deleted_at: null });
};

BusinessProfileSchema.statics.findBySlug = function findBySlug(slug) {
  return this.findOne({ slug, deleted_at: null });
};

module.exports = mongoose.model('BusinessProfile', BusinessProfileSchema);
module.exports.BUSINESS_INDUSTRIES = BUSINESS_INDUSTRIES;
