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
    phone: {
      type: String,
      trim: true,
      default: null,
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
    },
    preferences: {
      email_notifications: { type: Boolean, default: true },
      marketing_emails: { type: Boolean, default: false },
      newsletter: { type: Boolean, default: false },
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
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
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

const User = mongoose.model('User', userSchema);

module.exports = User;
