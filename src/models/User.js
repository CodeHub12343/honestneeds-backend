/**
 * User Model
 * MongoDB schema for users collection
 */

const mongoose = require('mongoose');
const { hashPassword, verifyPassword } = require('../utils/passwordUtils');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password_hash: {
      type: String,
      required: [true, 'Password hash is required'],
      // Don't validate minlength here - will be hashed by pre-save hook
      // Bcrypt hashes are always 60 characters after hashing
    },
    display_name: {
      type: String,
      required: [true, 'Display name is required'],
      minlength: 2,
      maxlength: 100,
    },
    first_name: {
      type: String,
      trim: true,
      maxlength: 60,
      default: null,
    },
    last_name: {
      type: String,
      trim: true,
      maxlength: 60,
      default: null,
    },
    // Unique handle (stored lowercase). Uniqueness is enforced by a PARTIAL
    // index declared below — not here — because `sparse` does not help when the
    // field is explicitly stored as null (default: null), which made every
    // null-username user collide on insert.
    username: {
      type: String,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: [/^[a-z0-9_.]+$/, 'Username may only contain letters, numbers, underscores and dots'],
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    phone_verified: {
      type: Boolean,
      default: false,
    },
    // Transient phone verification challenge (OTP). Never returned in toJSON.
    phone_verification: {
      code_hash: { type: String, default: null },
      expires_at: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      last_sent_at: { type: Date, default: null },
    },
    avatar_url: {
      type: String,
      default: null,
    },
    avatar_public_id: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    role: {
      type: String,
      enum: ['user', 'creator', 'admin'],
      default: 'user',
      index: true,
    },
    // ── Granular admin RBAC (AD-03) ────────────────────────────────────
    // Only meaningful when role === 'admin'. Empty array on an admin is
    // treated as super_admin for backward compatibility. Valid keys are
    // defined in config/adminRoles.js (super_admin|moderator|finance|
    // compliance|support|analyst).
    admin_roles: {
      type: [String],
      default: [],
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verification_token: {
      type: String,
      default: null,
    },
    verification_token_expires: {
      type: Date,
      default: null,
    },
    password_reset_token: {
      type: String,
      default: null,
    },
    password_reset_expires: {
      type: Date,
      default: null,
    },
    stripe_customer_id: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    location: {
      latitude: Number,
      longitude: Number,
      address: String,
      city: String,
      state: String,
      country: String,
      coordinates: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
      },
    },
    stats: {
      campaigns_created: { type: Number, default: 0 },
      donations_made: { type: Number, default: 0 },
      shares_recorded: { type: Number, default: 0 },
      total_donated: { type: Number, default: 0 }, // in cents
      total_earned: { type: Number, default: 0 }, // in cents
      referral_count: { type: Number, default: 0 },
      prayers_sent: { type: Number, default: 0 }, // RG-06/16 tap-to-pray count
    },
    // Trust-based Share-to-Earn (Phase 5): how reliably this creator settles
    // sharer payouts. Raw counters only; derived score via CreatorReliabilityService.
    creator_reliability: {
      payouts_confirmed: { type: Number, default: 0 }, // slices the creator marked paid
      payouts_received: { type: Number, default: 0 }, // slices the sharer confirmed received
      payouts_disputed: { type: Number, default: 0 }, // slices the creator disputed
      total_pay_time_hours: { type: Number, default: 0 }, // sum of (paid_at − requested_at), for averaging
      on_time_count: { type: Number, default: 0 }, // slices paid within the on-time window (7d)
      total_paid_cents: { type: Number, default: 0 }, // lifetime settled to sharers
      last_payout_at: { type: Date, default: null },
    },
    preferences: {
      email_notifications: { type: Boolean, default: true },
      marketing_emails: { type: Boolean, default: false },
      newsletter: { type: Boolean, default: false },
      // Causes the user follows (onboarding Step 3). Stable cause codes from
      // config/causes.js; powers interest-based campaign matching.
      interests: { type: [String], default: [] },
    },
    last_login: { type: Date, default: null },
    login_count: { type: Number, default: 0 },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
    deleted_at: {
      type: Date,
      default: null,
      index: true,
      sparse: true,
    },
    deletion_reason: {
      type: String,
      default: null,
    },
    deleted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Account suspension/blocking
    blocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    blocked_at: {
      type: Date,
      default: null,
    },
    blocked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    blocked_reason: {
      type: String,
      default: null,
    },
    block_count: {
      type: Number,
      default: 0,
    },
    // Verification/KYC tracking
    verification_status: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified',
    },
    verification_notes: {
      type: String,
      default: null,
    },

    // ── Trust & Verification badges (Profile Level 2) ──────────────────
    // Derived/aggregated trust state. The authoritative identity review lives
    // in the IdentityVerification collection; these flags are the fast-read
    // projection that powers profile badges.
    verification_badges: {
      email_verified: { type: Boolean, default: false },
      phone_verified: { type: Boolean, default: false },
      identity_verified: { type: Boolean, default: false },
      community_verified: { type: Boolean, default: false },
      nonprofit_verified: { type: Boolean, default: false },
    },
    // Identity verification tier once approved: null | 'basic' | 'premium'
    identity_tier: {
      type: String,
      enum: [null, 'basic', 'premium'],
      default: null,
    },
    // Composite trust score (0-100), recomputed by VerificationService.
    trust_score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // ── Gamification (Profile Level 3 / RG-02, RG-03) ──────────────────
    gamification: {
      xp: { type: Number, default: 0 },
      level: { type: Number, default: 1 },
      badges: [
        {
          code: { type: String, required: true },
          name: String,
          icon: String,
          category: String,
          earned_at: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      last_daily_login_xp: { type: Date, default: null },

      // ── RG-04 Daily Streak Rewards ──────────────────────────────────
      streak: {
        current: { type: Number, default: 0 }, // consecutive active days
        longest: { type: Number, default: 0 },
        last_active_date: { type: Date, default: null }, // last day that counted
        milestones_reached: { type: [Number], default: [] }, // day-counts already rewarded
      },

      // ── RG-09 Viral Multiplier (cached snapshot, recomputed on share) ──
      viral: {
        tier: { type: String, default: 'Cold' },
        multiplier: { type: Number, default: 1.0 },
        conversions_7d: { type: Number, default: 0 },
        updated_at: { type: Date, default: null },
      },

      // ── RG-10 Golden Tickets ─────────────────────────────────────────
      golden_tickets_won: { type: Number, default: 0 },
      last_golden_ticket_date: { type: Date, default: null },
      golden_tickets_today: { type: Number, default: 0 },
      // Temporary share-reward multiplier from a golden ticket boost prize
      active_boost: {
        multiplier: { type: Number, default: 1.0 },
        expires_at: { type: Date, default: null },
      },

      // ── RG-14 Hope Meter (cached composite score 0-100) ──────────────
      hope_score: { type: Number, default: 0 },
    },

    // ── Creator Profile (Profile Level 4) ──────────────────────────────
    creator_profile: {
      personal_story: { type: String, maxlength: 5000, default: '' },
      why_joined: { type: String, maxlength: 2000, default: '' },
      areas_of_need: { type: [String], default: [] },
      response_rate: { type: Number, default: 0, min: 0, max: 100 }, // %
      community_rating: { type: Number, default: 0, min: 0, max: 5 },
      rating_count: { type: Number, default: 0 },
    },

    // ── Privacy controls (governs public profile / activity feed) ──────
    privacy: {
      profile_visibility: {
        type: String,
        enum: ['public', 'private'],
        default: 'public',
      },
      show_activity_feed: { type: Boolean, default: true },
      show_stats: { type: Boolean, default: true },
      show_donations: { type: Boolean, default: false },
      show_location: { type: Boolean, default: true },
    },

    // Cached profile completion percentage (0-100) and onboarding flag.
    // Recomputed on profile mutations via recomputeProfileCompletion().
    profile_completion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    profile_setup_completed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Unique username — but only for documents where username is an actual string.
// A partial index (not sparse) is required so that the many users with
// `username: null` are excluded from the uniqueness constraint entirely.
userSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: 'string' } } }
);

// Geospatial index for location-based queries
userSchema.index({ 'location.coordinates': '2dsphere' }, { sparse: true });

// Compound indexes for common queries
userSchema.index({ role: 1, created_at: -1 });
userSchema.index({ email: 1, deleted_at: 1 });
userSchema.index({ role: 1, blocked: 1 }); // For filtering unblocked admins/creators
userSchema.index({ blocked: 1, created_at: -1 }); // For blocked user lists

// Password reset token indexes for efficient lookups
userSchema.index({ password_reset_token: 1, password_reset_expires: 1 }, { sparse: true }); // For verifying reset tokens
userSchema.index({ password_reset_expires: 1 }, { sparse: true, expireAfterSeconds: 86400 }); // Auto-clean expired tokens after 24h

/**
 * Virtual: is_active
 * Returns true if user is not soft-deleted
 */
userSchema.virtual('is_active').get(function isActive() {
  return this.deleted_at === null;
});

/**
 * Pre-save hook: hash password if modified
 */
userSchema.pre('save', async function preSave(next) {
  try {
    // Only hash if password is modified
    if (!this.isModified('password_hash')) {
      return next();
    }

    // Check password length before hashing
    if (this.password_hash.length < 8) {
      const error = new Error('Password must be at least 8 characters');
      return next(error);
    }

    // Hash password
    const hashedPassword = await hashPassword(this.password_hash);
    this.password_hash = hashedPassword;

    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Method: compare password
 * Compares plain text password with stored hash
 * @param {string} plainPassword - Plain text password
 * @returns {Promise<boolean>} True if passwords match
 */
userSchema.methods.comparePassword = async function comparePassword(plainPassword) {
  try {
    const isMatch = await verifyPassword(plainPassword, this.password_hash);
    return isMatch;
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

/**
 * Method: toJSON
 * Excludes sensitive fields from JSON serialization
 */
userSchema.methods.toJSON = function toJSON() {
  const user = this.toObject();

  // Remove sensitive fields
  delete user.password_hash;
  delete user.verification_token;
  delete user.verification_token_expires;
  delete user.password_reset_token;
  delete user.password_reset_expires;
  delete user.phone_verification;

  return user;
};

/**
 * Static: findActive
 * Finds only non-deleted users
 */
userSchema.statics.findActive = function findActive() {
  return this.find({ deleted_at: null });
};

/**
 * Static: findByEmail
 * Finds user by email (case-insensitive)
 */
userSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({
    email: email.toLowerCase(),
    deleted_at: null,
  });
};

/**
 * Static: findByRole
 * Finds users by role
 */
userSchema.statics.findByRole = function findByRole(role, limit = 100) {
  return this.find({ role, deleted_at: null })
    .sort({ created_at: -1 })
    .limit(limit);
};

/**
 * Method: softDelete
 * Soft deletes the user (sets deleted_at timestamp)
 */
userSchema.methods.softDelete = function softDelete() {
  this.deleted_at = new Date();
  return this.save();
};

/**
 * Method: restore
 * Restores a soft-deleted user
 */
userSchema.methods.restore = function restore() {
  this.deleted_at = null;
  return this.save();
};

/**
 * Method: updateLastLogin
 * Updates last login timestamp and increments login count
 */
userSchema.methods.updateLastLogin = function updateLastLogin() {
  this.last_login = new Date();
  this.login_count += 1;
  return this.save();
};

/**
 * Method: isBlocked
 * Checks if user is currently blocked
 * @returns {boolean} True if user is blocked
 */
userSchema.methods.isBlocked = function isBlocked() {
  return this.blocked === true;
};

/**
 * Method: isVerified
 * Checks if user is verified
 * @returns {boolean} True if verified
 */
userSchema.methods.isVerified = function isVerified() {
  return this.verified === true;
};

/**
 * Method: blockUser
 * Blocks the user with reason and admin ID
 * @param {string} reason - Block reason
 * @param {ObjectId} adminId - Admin who blocked the user
 * @returns {Promise}
 */
userSchema.methods.blockUser = function blockUser(reason, adminId) {
  this.blocked = true;
  this.blocked_at = new Date();
  this.blocked_reason = reason;
  this.blocked_by = adminId;
  this.block_count = (this.block_count || 0) + 1;
  return this.save();
};

/**
 * Method: unblockUser
 * Unblocks the user
 * @returns {Promise}
 */
userSchema.methods.unblockUser = function unblockUser() {
  this.blocked = false;
  this.blocked_at = null;
  this.blocked_reason = null;
  this.blocked_by = null;
  return this.save();
};

/**
 * Virtual: full_name
 * Prefers explicit first/last name, falls back to display_name.
 */
userSchema.virtual('full_name').get(function fullName() {
  const parts = [this.first_name, this.last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : this.display_name;
});

/**
 * The fields that make up the "Basic Profile Setup" checklist and their
 * relative weight toward the 0-100 completion meter. Identity verification is
 * weighted heavily because it is the trust cornerstone of the platform.
 */
const COMPLETION_WEIGHTS = [
  { key: 'first_name', weight: 10, has: (u) => !!u.first_name },
  { key: 'last_name', weight: 10, has: (u) => !!u.last_name },
  { key: 'username', weight: 10, has: (u) => !!u.username },
  { key: 'avatar', weight: 15, has: (u) => !!u.avatar_url },
  { key: 'bio', weight: 10, has: (u) => !!(u.bio && u.bio.trim().length >= 20) },
  { key: 'location', weight: 10, has: (u) => !!(u.location && u.location.city && u.location.country) },
  { key: 'email_verified', weight: 10, has: (u) => !!u.verification_badges?.email_verified },
  { key: 'phone_verified', weight: 10, has: (u) => !!u.verification_badges?.phone_verified },
  { key: 'identity_verified', weight: 15, has: (u) => !!u.verification_badges?.identity_verified },
];

/**
 * Method: recomputeProfileCompletion
 * Recalculates the cached profile_completion percentage and the
 * profile_setup_completed flag (basic setup = all non-identity items done).
 * Does NOT save — callers persist as part of their own write.
 * @returns {number} completion percentage (0-100)
 */
userSchema.methods.recomputeProfileCompletion = function recomputeProfileCompletion() {
  const total = COMPLETION_WEIGHTS.reduce((sum, f) => sum + f.weight, 0);
  const earned = COMPLETION_WEIGHTS.reduce((sum, f) => (f.has(this) ? sum + f.weight : sum), 0);
  const pct = Math.round((earned / total) * 100);

  this.profile_completion = pct;

  // "Basic setup complete" = every checklist item except identity verification.
  const basicDone = COMPLETION_WEIGHTS
    .filter((f) => f.key !== 'identity_verified')
    .every((f) => f.has(this));
  this.profile_setup_completed = basicDone;

  return pct;
};

/**
 * Method: getCompletionChecklist
 * Returns each completion item with done/weight, for UI meters & AI strength.
 */
userSchema.methods.getCompletionChecklist = function getCompletionChecklist() {
  return COMPLETION_WEIGHTS.map((f) => ({
    key: f.key,
    done: !!f.has(this),
    weight: f.weight,
  }));
};

/**
 * Static: isUsernameAvailable
 * Case-insensitive availability check, optionally excluding a user (self).
 * @param {string} username
 * @param {string} [excludeUserId]
 * @returns {Promise<boolean>}
 */
userSchema.statics.isUsernameAvailable = async function isUsernameAvailable(username, excludeUserId = null) {
  if (!username) return false;
  const query = { username: username.toLowerCase().trim(), deleted_at: null };
  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }
  const existing = await this.findOne(query).select('_id').lean();
  return !existing;
};

// Indexes for leaderboards (RG-05)
userSchema.index({ 'gamification.xp': -1 });
userSchema.index({ 'stats.total_donated': -1 });
userSchema.index({ 'stats.shares_recorded': -1 });
userSchema.index({ 'stats.referral_count': -1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
