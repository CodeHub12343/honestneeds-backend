/**
 * Share Tracking Model
 * Tracks share campaign participation, earnings, and withdrawals
 * 
 * Complements Share.js by tracking:
 * - Join events (when user joins sharing campaign)
 * - Earnings accumulation by platform
 * - Withdrawal requests and history
 * - Performance metrics per platform
 */

const mongoose = require('mongoose');

// Share Tracking Schema - Tracks user participation in share campaigns
const shareTrackingSchema = new mongoose.Schema(
  {
    // Identifiers
    tracking_id: {
      type: String,
      required: [true, 'Tracking ID is required'],
      unique: true,
      index: true,
    },

    // Relationships
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },

    // Status
    status: {
      type: String,
      enum: {
        values: ['active', 'paused', 'completed', 'withdrawn'],
        message: 'Invalid participation status',
      },
      default: 'active',
      index: true,
    },

    // Earnings tracking
    total_earnings: {
      type: Number, // in cents
      default: 0,
      min: 0,
    },

    pending_earnings: {
      type: Number, // in cents, earnings not yet verified
      default: 0,
      min: 0,
    },

    withdrawn_earnings: {
      type: Number, // in cents, already withdrawn
      default: 0,
      min: 0,
    },

    // Shares & conversions
    total_shares: {
      type: Number,
      default: 0,
      min: 0,
    },

    shares_by_platform: {
      type: Map,
      of: {
        count: { type: Number, default: 0 },
        earnings: { type: Number, default: 0 }, // in cents
        conversions: { type: Number, default: 0 },
      },
      default: new Map(),
    },

    total_conversions: {
      type: Number, // Conversions to donations
      default: 0,
      min: 0,
    },

    conversion_rate: {
      type: Number, // Percentage: (conversions / shares) * 100
      default: 0,
      min: 0,
      max: 100,
    },

    // Referral link / code
    referral_code: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    referral_link: {
      type: String,
      index: true,
    },

    // Metadata
    joined_at: {
      type: Date,
      default: Date.now,
      index: true,
    },

    last_share_at: {
      type: Date,
      index: true,
    },

    last_withdrawal_at: {
      type: Date,
      index: true,
    },

    last_earnings_update: {
      type: Date,
      index: true,
    },

    // Performance - calculated fields
    avg_conversion_rate: {
      type: Number, // Average conversion rate for this user across all shares
      default: 0,
      min: 0,
      max: 100,
    },

    leaderboard_rank: {
      type: Number, // Cached rank for performance queries
      index: true,
    },

    // User preferences
    auto_withdraw_enabled: {
      type: Boolean,
      default: false,
    },

    minimum_withdraw_amount: {
      type: Number, // in cents, default $50
      default: 5000,
      min: 100,
    },

    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },

    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'share_tracking',
    timestamps: true,
  }
);

// Indexes for analytics and queries
shareTrackingSchema.index({ user_id: 1, campaign_id: 1 }, { unique: true }); // Unique per user+campaign
shareTrackingSchema.index({ user_id: 1, created_at: -1 }); // User's share history
shareTrackingSchema.index({ campaign_id: 1, total_earnings: -1 }); // Top earners for campaign
shareTrackingSchema.index({ total_earnings: -1, created_at: -1 }); // Global leaderboard
shareTrackingSchema.index({ status: 1, updated_at: -1 }); // Active participants

// Methods
shareTrackingSchema.methods.addShare = function (platform, amount = 0, isConversion = false) {
  if (!this.shares_by_platform.has(platform)) {
    this.shares_by_platform.set(platform, {
      count: 0,
      earnings: 0,
      conversions: 0,
    });
  }

  const platformData = this.shares_by_platform.get(platform);
  platformData.count += 1;
  platformData.earnings += amount;
  if (isConversion) {
    platformData.conversions += 1;
  }

  this.total_shares += 1;
  if (isConversion) {
    this.total_conversions += 1;
  }
  this.total_earnings += amount;
  this.last_share_at = new Date();
  this.updateConversionRate();

  return this;
};

shareTrackingSchema.methods.updateConversionRate = function () {
  if (this.total_shares > 0) {
    this.conversion_rate = parseFloat(((this.total_conversions / this.total_shares) * 100).toFixed(2));
  } else {
    this.conversion_rate = 0;
  }
};

shareTrackingSchema.methods.addPendingEarnings = function (amount) {
  this.pending_earnings += amount;
  this.last_earnings_update = new Date();
};

shareTrackingSchema.methods.verifyPendingEarnings = function (amount) {
  this.pending_earnings = Math.max(0, this.pending_earnings - amount);
  this.total_earnings += amount;
  this.last_earnings_update = new Date();
};

shareTrackingSchema.methods.recordWithdrawal = function (amount) {
  this.total_earnings = Math.max(0, this.total_earnings - amount);
  this.withdrawn_earnings += amount;
  this.last_withdrawal_at = new Date();
};

shareTrackingSchema.methods.getPlatformStatistics = function () {
  const stats = {};
  for (const [platform, data] of this.shares_by_platform.entries()) {
    stats[platform] = {
      shares: data.count,
      earnings: data.earnings,
      conversions: data.conversions,
      conversionRate: data.count > 0 ? parseFloat(((data.conversions / data.count) * 100).toFixed(2)) : 0,
    };
  }
  return stats;
};

// Statics
shareTrackingSchema.statics.findByCampaign = function (campaignId) {
  return this.find({ campaign_id: campaignId });
};

shareTrackingSchema.statics.findByUser = function (userId) {
  return this.find({ user_id: userId });
};

shareTrackingSchema.statics.getLeaderboard = function (limit = 10, campaignId = null) {
  const query = campaignId ? { campaign_id: campaignId } : {};
  return this.find(query)
    .sort({ total_earnings: -1, created_at: 1 })
    .limit(parseInt(limit))
    .populate('user_id', 'display_name profile_picture')
    .lean();
};

shareTrackingSchema.statics.getTopByPlatform = function (platform, limit = 10, campaignId = null) {
  const matchStage = campaignId
    ? { $match: { campaign_id: mongoose.Types.ObjectId(campaignId) } }
    : { $match: {} };

  return this.aggregate([
    matchStage,
    {
      $addFields: {
        platformEarnings: {
          $getField: { $literal: `shares_by_platform.${platform}.earnings` },
        },
      },
    },
    { $sort: { [`shares_by_platform.${platform}.earnings`]: -1 } },
    { $limit: parseInt(limit) },
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
  ]);
};

shareTrackingSchema.statics.getUserEarnings = function (userId) {
  return this.findOne({ user_id: userId }).lean();
};

module.exports = mongoose.model('ShareTracking', shareTrackingSchema);
