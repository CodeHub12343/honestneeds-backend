/**
 * Referral Tracking Model
 * Tracks referral visits and conversions (donations)
 */

const mongoose = require('mongoose');

const referralTrackingSchema = new mongoose.Schema(
  {
    // Primary key
    tracking_id: {
      type: String,
      required: [true, 'Tracking ID is required'],
      unique: true,
      index: true,
    },

    // Relationships
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },

    share_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShareRecord',
      required: [true, 'Share ID is required'],
      index: true,
    },

    referrer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Referrer ID is required'],
      index: true,
    },

    // Referral visit tracking
    referral_visits: [
      {
        visitor_id: mongoose.Schema.Types.ObjectId, // Can be null if visitor wasn't logged in
        visited_at: Date,
        device: String,
        ip_address: String,
        user_agent: String,
      },
    ],

    // Conversion (donation) tracking
    conversions: [
      {
        converted_by_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        donation_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Donation',
          required: true,
        },
        donation_amount: Number, // in cents
        converted_at: Date,
        reward_pending: Boolean,
        reward_amount: Number, // in cents
      },
    ],

    // Statistics
    total_visits: {
      type: Number,
      default: 0,
      min: 0,
    },

    total_conversions: {
      type: Number,
      default: 0,
      min: 0,
    },

    total_conversion_amount: {
      type: Number, // in cents
      default: 0,
      min: 0,
    },

    conversion_rate: {
      type: Number, // Percentage: 0-100
      default: 0,
      min: 0,
      max: 100,
    },

    // Status
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Timestamps
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
    collection: 'referral_tracking',
    timestamps: true,
  }
);

// Indexes for analytics
referralTrackingSchema.index({ campaign_id: 1, created_at: -1 });
referralTrackingSchema.index({ referrer_id: 1, created_at: -1 });
referralTrackingSchema.index({ campaign_id: 1, conversion_rate: -1 }); // Top performers
referralTrackingSchema.index({ is_active: 1, total_conversions: -1 });

// Pre-save middleware to calculate conversion rate
referralTrackingSchema.pre('save', function (next) {
  if (this.total_visits > 0) {
    this.conversion_rate = (this.total_conversions / this.total_visits) * 100;
  } else {
    this.conversion_rate = 0;
  }
  this.updated_at = new Date();
  next();
});

const ReferralTracking = mongoose.model('ReferralTracking', referralTrackingSchema);

module.exports = ReferralTracking;
