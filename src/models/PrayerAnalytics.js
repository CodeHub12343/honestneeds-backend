const mongoose = require('mongoose');

const prayerAnalyticsSchema = new mongoose.Schema({
  campaign_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
    index: true,
  },

  date: {
    type: Date,
    required: true,
    index: true,
    // Midnight of the day
  },

  // Daily breakdown by type
  prayers_submitted_today: {
    type: Number,
    default: 0,
  },

  prayers_approved_today: {
    type: Number,
    default: 0,
  },

  tap_prayers_today: {
    type: Number,
    default: 0,
  },

  text_prayers_today: {
    type: Number,
    default: 0,
  },

  voice_prayers_today: {
    type: Number,
    default: 0,
  },

  video_prayers_today: {
    type: Number,
    default: 0,
  },

  // Unique supporters who prayed today
  unique_supporters: {
    type: Number,
    default: 0,
  },

  unique_supporter_ids: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],

  // Engagement metrics
  average_engagement_time_seconds: {
    type: Number,
    default: 0,
  },

  max_engagement_time_seconds: {
    type: Number,
    default: 0,
  },

  // Public vs private
  public_prayers: {
    type: Number,
    default: 0,
  },

  private_prayers: {
    type: Number,
    default: 0,
  },

  // Anonymous prayers
  anonymous_prayers: {
    type: Number,
    default: 0,
  },

  // Flagged prayers
  flagged_prayers: {
    type: Number,
    default: 0,
  },

  // User reports
  reported_prayers: {
    type: Number,
    default: 0,
  },

  created_at: {
    type: Date,
    default: Date.now,
  },

  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Compound unique index
prayerAnalyticsSchema.index({ campaign_id: 1, date: 1 }, { unique: true });

// Middleware
prayerAnalyticsSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

// Statics - Get or create for today (using UTC)
prayerAnalyticsSchema.statics.getOrCreateForToday = function (campaignId) {
  // Use UTC midnight to match how dates are stored
  const today = new Date();
  const utcMidnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));

  return this.findOne({
    campaign_id: campaignId,
    date: utcMidnight,
  }).then(doc => {
    if (doc) return doc;
    return this.create({
      campaign_id: campaignId,
      date: utcMidnight,
    });
  });
};

// Statics - Get daily trend for campaign (using UTC)
prayerAnalyticsSchema.statics.getDailyTrend = function (campaignId, days = 30) {
  const today = new Date();
  const utcMidnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
  const startDate = new Date(utcMidnight);
  startDate.setUTCDate(startDate.getUTCDate() - days);

  return this.find({
    campaign_id: campaignId,
    date: { $gte: startDate },
  })
    .sort({ date: 1 })
    .lean();
};

module.exports = mongoose.model('PrayerAnalytics', prayerAnalyticsSchema);
