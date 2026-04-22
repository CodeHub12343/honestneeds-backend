const mongoose = require('mongoose');

/**
 * Campaign Boost Model
 * Tracks boost purchases for campaigns with Stripe integration
 * 
 * Boost Tiers (synced with frontend):
 * - Free: No cost, 1x visibility
 * - Basic: $9.99, 5x visibility
 * - Pro: $24.99, 15x visibility
 * - Premium: $99.99, 50x visibility
 */

const campaignBoostSchema = new mongoose.Schema(
  {
    // Core Boost Info
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Boost Tier
    tier: {
      type: String,
      enum: ['free', 'basic', 'pro', 'premium'],
      default: 'free',
      required: true,
    },

    // Visibility Multiplier
    visibility_weight: {
      type: Number,
      enum: [1, 5, 15, 50],
      default: 1,
      required: true,
    },

    // Pricing
    price_cents: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'usd',
    },

    // Duration
    duration_days: {
      type: Number,
      default: 30,
    },
    start_date: {
      type: Date,
      default: () => new Date(),
    },
    end_date: {
      type: Date,
      required: true,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Payment Information
    stripe_payment_id: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    stripe_session_id: String,
    stripe_customer_id: String,
    payment_status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    payment_method: {
      type: String,
      enum: ['stripe', 'manual'],
      default: 'stripe',
    },

    // Renewal Information
    is_renewed: {
      type: Boolean,
      default: false,
    },
    renewal_count: {
      type: Number,
      default: 0,
    },
    previous_boost_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CampaignBoost',
      default: null,
    },

    // Boost Stats
    views_with_boost: {
      type: Number,
      default: 0,
    },
    engagement_with_boost: {
      type: Number,
      default: 0,
    },
    conversions_with_boost: {
      type: Number,
      default: 0,
    },
    roi_percentage: {
      type: Number,
      default: 0,
    },

    // Cancellation
    cancelled_at: {
      type: Date,
      default: null,
    },
    cancellation_reason: String,

    // Metadata
    custom_data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'campaign_boosts',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient querying
campaignBoostSchema.index({ campaign_id: 1, created_at: -1 });
campaignBoostSchema.index({ creator_id: 1, is_active: 1 });
campaignBoostSchema.index({ payment_status: 1, created_at: -1 });
campaignBoostSchema.index({ end_date: 1 });

// Virtual for days remaining
campaignBoostSchema.virtual('days_remaining').get(function () {
  if (!this.is_active) return 0;
  const now = new Date();
  const diff = this.end_date - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
});

// Virtual for percentage complete
campaignBoostSchema.virtual('percentage_complete').get(function () {
  const totalDays = this.duration_days;
  const daysRemaining = this.days_remaining;
  const daysElapsed = totalDays - daysRemaining;
  return Math.round((daysElapsed / totalDays) * 100);
});

// Virtual for readable price
campaignBoostSchema.virtual('price_display').get(function () {
  return `$${(this.price_cents / 100).toFixed(2)}`;
});

// Static method: Get active boosts for campaigns
campaignBoostSchema.statics.getActiveBoosts = async function (campaignIds) {
  return this.find({
    campaign_id: { $in: campaignIds },
    is_active: true,
    end_date: { $gt: new Date() },
    payment_status: 'completed',
  });
};

// Static method: Get boost by campaign
campaignBoostSchema.statics.getBoostBycampaign = async function (campaignId) {
  return this.findOne({
    campaign_id: campaignId,
    is_active: true,
    end_date: { $gt: new Date() },
    payment_status: 'completed',
  });
};

// Static method: Get creator's active boosts
campaignBoostSchema.statics.getCreatorActiveBoosts = async function (creatorId) {
  return this.find({
    creator_id: creatorId,
    is_active: true,
    end_date: { $gt: new Date() },
    payment_status: 'completed',
  }).sort({ created_at: -1 });
};

// Instance method: Deactivate boost
campaignBoostSchema.methods.deactivate = async function () {
  this.is_active = false;
  this.cancelled_at = new Date();
  await this.save();
  return this;
};

// Instance method: Renew boost
campaignBoostSchema.methods.renewBoost = async function () {
  const newEndDate = new Date();
  newEndDate.setDate(newEndDate.getDate() + this.duration_days);

  const newBoost = new this.constructor({
    campaign_id: this.campaign_id,
    creator_id: this.creator_id,
    tier: this.tier,
    visibility_weight: this.visibility_weight,
    price_cents: this.price_cents,
    currency: this.currency,
    duration_days: this.duration_days,
    end_date: newEndDate,
    previous_boost_id: this._id,
  });

  this.renewal_count += 1;
  await this.save();
  await newBoost.save();

  return newBoost;
};

// Instance method: Update stats
campaignBoostSchema.methods.updateStats = async function (views, engagement, conversions) {
  this.views_with_boost = views || 0;
  this.engagement_with_boost = engagement || 0;
  this.conversions_with_boost = conversions || 0;

  // Calculate ROI if boost cost exists
  if (this.price_cents > 0 && conversions > 0) {
    const revenue = conversions * 50; // Assuming $50 avg donation
    const cost = this.price_cents / 100;
    this.roi_percentage = Math.round(((revenue - cost) / cost) * 100);
  }

  await this.save();
  return this;
};

module.exports = mongoose.model('CampaignBoost', campaignBoostSchema);
