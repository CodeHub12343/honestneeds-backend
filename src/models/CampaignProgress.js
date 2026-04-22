/**
 * Campaign Progress Model
 * Tracks campaign metrics trends for analytics and reporting
 * 
 * Stores daily snapshots of:
 * - donation amounts
 * - share counts
 * - volunteer counts
 * - customer referral counts
 * 
 * Retention: 90 days
 */

const mongoose = require('mongoose');

const campaignProgressSchema = new mongoose.Schema(
  {
    // Reference to campaign
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },

    // Creative identifier
    campaign_ref_id: {
      type: String,
      maxlength: 100,
    },

    // Date of this snapshot (start of day UTC)
    date: {
      type: Date,
      required: true,
      index: true,
    },

    // Donation metrics
    donations: {
      total_count: {
        type: Number,
        default: 0,
        min: 0,
      },
      total_amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      by_method: {
        paypal: { type: Number, default: 0 },
        stripe: { type: Number, default: 0 },
        bank_transfer: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
      },
    },

    // Sharing metrics
    shares: {
      total_count: {
        type: Number,
        default: 0,
        min: 0,
      },
      by_channel: {
        facebook: { type: Number, default: 0 },
        twitter: { type: Number, default: 0 },
        instagram: { type: Number, default: 0 },
        tiktok: { type: Number, default: 0 },
        whatsapp: { type: Number, default: 0 },
        email: { type: Number, default: 0 },
        sms: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
      },
      paid_shares: { type: Number, default: 0 },
      free_shares: { type: Number, default: 0 },
    },

    // Engagement metrics
    volunteers: {
      total_count: {
        type: Number,
        default: 0,
        min: 0,
      },
      new_today: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    customers: {
      total_acquired: {
        type: Number,
        default: 0,
        min: 0,
      },
      new_today: {
        type: Number,
        default: 0,
        min: 0,
      },
      referred_from: [
        {
          source_id: mongoose.Schema.Types.ObjectId,
          count: Number,
        },
      ],
    },

    // View metrics
    views: {
      total_count: {
        type: Number,
        default: 0,
        min: 0,
      },
      new_today: {
        type: Number,
        default: 0,
        min: 0,
      },
      unique_visitors: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Unique supporters (tracking set size)
    unique_supporters_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Calculated on the day
    calculated_at: {
      type: Date,
      default: () => new Date(),
    },

    // Created timestamp
    created_at: {
      type: Date,
      default: () => new Date(),
      // TTL Index: automatically delete after 90 days
      index: { expireAfterSeconds: 7776000 }, // 90 days
    },
  },
  {
    collection: 'campaign_progress',
    timestamps: false,
    strict: true,
  }
);

// Index for efficient queries
campaignProgressSchema.index({ campaign_id: 1, date: -1 });
campaignProgressSchema.index({ campaign_id: 1, created_at: -1 });

// Static method to find progress for date range
campaignProgressSchema.statics.findByDateRange = function (campaignId, startDate, endDate) {
  return this.find({
    campaign_id: campaignId,
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  }).sort({ date: 1 });
};

// Static method to find latest progress
campaignProgressSchema.statics.findLatest = function (campaignId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.find({
    campaign_id: campaignId,
    date: { $gte: startDate },
  }).sort({ date: -1 });
};

// Instance method to get trend
campaignProgressSchema.methods.getTrend = function () {
  return {
    date: this.date,
    donations: this.donations.total_amount,
    share_count: this.shares.total_count,
    volunteer_count: this.volunteers.total_count,
    customer_count: this.customers.total_acquired,
    view_count: this.views.total_count,
    unique_supporters: this.unique_supporters_count,
  };
};

module.exports = mongoose.model('CampaignProgress', campaignProgressSchema);
