/**
 * Token Blacklist Model
 * Stores invalidated tokens for logout and security purposes
 * Automatically removes expired tokens via TTL index
 */

const mongoose = require('mongoose');

const tokenBlacklistSchema = new mongoose.Schema(
  {
    // Token (usually stored as hash for privacy)
    token: {
      type: String,
      required: true,
      index: true,
    },
    // User who logged out
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Token type (access, refresh)
    token_type: {
      type: String,
      enum: ['access', 'refresh'],
      default: 'access',
    },
    // When token expires (same as JWT exp time)
    expires_at: {
      type: Date,
      required: true,
      index: true,
    },
    // Blacklist reason (logout, password_change, account_deletion, etc.)
    reason: {
      type: String,
      enum: ['logout', 'password_change', 'account_deletion', 'security_breach', 'admin_action'],
      default: 'logout',
    },
    // When blacklist was created
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

/**
 * TTL Index: Automatically delete expired tokens after they expire
 * MongoDB will remove documents when the current time passes the expires_at field
 */
tokenBlacklistSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

/**
 * Compound index for checking if user token is blacklisted
 */
tokenBlacklistSchema.index({ user_id: 1, token: 1 });

/**
 * Static method: Add token to blacklist
 */
tokenBlacklistSchema.statics.addToBlacklist = async function addToBlacklist(token, userId, expiresAt, reason = 'logout') {
  return this.create({
    token,
    user_id: userId,
    token_type: 'access',
    expires_at: expiresAt,
    reason,
  });
};

/**
 * Static method: Check if token is blacklisted
 */
tokenBlacklistSchema.statics.isBlacklisted = async function isBlacklisted(token, userId) {
  const blacklistedToken = await this.findOne({
    token,
    user_id: userId,
    expires_at: { $gt: new Date() },
  });
  return !!blacklistedToken;
};

/**
 * Static method: Clear all tokens for a user
 */
tokenBlacklistSchema.statics.clearUserTokens = async function clearUserTokens(userId, reason = 'security_breach') {
  return this.updateMany(
    { user_id: userId },
    { reason }
  );
};

/**
 * Static method: Clear all expired tokens
 */
tokenBlacklistSchema.statics.clearExpiredTokens = async function clearExpiredTokens() {
  return this.deleteMany({
    expires_at: { $lt: new Date() },
  });
};

const TokenBlacklist = mongoose.model('TokenBlacklist', tokenBlacklistSchema);

module.exports = TokenBlacklist;
