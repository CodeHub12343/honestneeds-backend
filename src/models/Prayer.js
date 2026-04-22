const mongoose = require('mongoose');

const prayerSchema = new mongoose.Schema({
  prayer_id: {
    type: String,
    unique: true,
    required: true,
    index: true,
    // Format: "prayer_" + nanoid(10)
  },

  // Relationships
  campaign_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
    index: true,
  },

  supporter_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    // null if anonymous
  },

  // Prayer Type (discriminator for conditional fields)
  type: {
    type: String,
    enum: ['tap', 'text', 'voice', 'video'],
    required: true,
    index: true,
  },

  // Content (conditional on type)
  content: {
    // For type='text': prayer message
    type: String,
    maxlength: 1000,
    trim: true,
    sparse: true, // Not required for all types
  },

  audio_url: {
    // For type='voice': S3/GCS URL
    type: String,
    sparse: true,
    // Format: https://storage.example.com/prayers/[campaignId]/[prayerId]_audio.mp3
  },

  audio_duration_seconds: {
    type: Number,
    min: 1,
    max: 60,
    sparse: true,
  },

  video_url: {
    // For type='video': S3/GCS URL
    type: String,
    sparse: true,
  },

  video_thumbnail_url: {
    type: String,
    sparse: true,
  },

  video_duration_seconds: {
    type: Number,
    min: 1,
    max: 60,
    sparse: true,
  },

  // Privacy & Visibility
  is_anonymous: {
    type: Boolean,
    default: false,
    index: true,
  },

  visibility: {
    type: String,
    enum: ['public', 'private', 'creator_only'],
    default: 'private',
    index: true,
  },

  // Moderation
  status: {
    type: String,
    enum: ['submitted', 'approved', 'rejected', 'flagged'],
    default: 'submitted',
    index: true,
  },

  flagged_reason: {
    // Why was this flagged for review?
    type: String,
    enum: [
      'profanity_detected',
      'spam_pattern',
      'inappropriate_content',
      'user_reported',
      'requires_approval_policy',
      null,
    ],
    sparse: true,
  },

  is_deleted: {
    type: Boolean,
    default: false,
    index: true,
    // Soft delete for GDPR compliance
  },

  // User Reports
  reported_by: [
    {
      user_id: mongoose.Schema.Types.ObjectId,
      reason: {
        type: String,
        enum: ['spam', 'profanity', 'inappropriate', 'harassment', 'other'],
      },
      reported_at: {
        type: Date,
        default: Date.now,
      },
    },
  ],

  report_count: {
    type: Number,
    default: 0,
    index: true,
  },

  // Metadata
  ip_address: {
    // For spam detection
    type: String,
    sparse: true,
  },

  user_agent: {
    type: String,
    sparse: true,
  },

  // Timestamps
  created_at: {
    type: Date,
    default: Date.now,
    index: true,
  },

  approved_at: {
    type: Date,
    sparse: true,
  },

  rejected_at: {
    type: Date,
    sparse: true,
  },

  updated_at: {
    type: Date,
    default: Date.now,
  },

  // Denormalized (for performance)
  supporter_name: {
    type: String,
    sparse: true,
    // Cached name if public and not anonymous
  },

  campaign_title: {
    type: String,
    sparse: true,
    // Quick reference
  },

  creator_id: {
    // Cached creator ID for quick authorization checks
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
});

// Compound indexes for common queries
prayerSchema.index({ campaign_id: 1, created_at: -1 });
prayerSchema.index({ campaign_id: 1, status: 1, is_deleted: 1 });
prayerSchema.index({ campaign_id: 1, visibility: 1, status: 1 });
prayerSchema.index({ supporter_id: 1, created_at: -1 });
prayerSchema.index({ created_at: -1 }); // For admin dashboard
prayerSchema.index({ report_count: 1, status: 1 }); // Moderation queue
prayerSchema.index({ is_deleted: 1, created_at: -1 }); // Soft delete queries
prayerSchema.index({ campaign_id: 1, type: 1 }); // For breakdown queries

// Virtuals
prayerSchema.virtual('isApproved').get(function () {
  return this.status === 'approved';
});

prayerSchema.virtual('isFlagged').get(function () {
  return this.status === 'flagged';
});

prayerSchema.virtual('isPublic').get(function () {
  return this.visibility === 'public';
});

// Middleware - Set timestamps
prayerSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

// Middleware - Auto-flag if report count reaches threshold
prayerSchema.pre('save', function (next) {
  if (!this.isModified('report_count')) return next();

  if (this.report_count >= 3 && this.status !== 'flagged') {
    this.status = 'flagged';
    this.flagged_reason = 'user_reported';
  }

  if (this.report_count >= 5 && this.visibility !== 'private') {
    this.visibility = 'private';
  }

  next();
});

// Note: .lean() is a built-in Mongoose method - no need to redefine it

// Query to get active (not deleted) prayers
prayerSchema.query.active = function () {
  return this.where({ is_deleted: false });
};

// Query to get approved/public prayers
prayerSchema.query.public = function () {
  return this.where({ status: 'approved', visibility: 'public', is_deleted: false });
};

// Statics - Find by prayer ID
prayerSchema.statics.findByPrayerId = function (prayerId) {
  return this.findOne({ prayer_id: prayerId });
};

// Statics - Find campaign prayers with pagination
prayerSchema.statics.findCampaignPrayers = function (campaignId, options = {}) {
  const { limit = 20, offset = 0, includePrivate = false, status = 'approved' } = options;

  const query = { campaign_id: campaignId, is_deleted: false };

  if (!includePrivate) {
    query.status = status;
    query.visibility = 'public';
  }

  return this.find(query)
    .sort({ created_at: -1 })
    .skip(offset)
    .limit(limit)
    .lean();
};

// Statics - Count campaign prayers by type
prayerSchema.statics.countByType = function (campaignId) {
  return this.aggregate([
    {
      $match: {
        campaign_id: new mongoose.Types.ObjectId(campaignId),
        is_deleted: false,
      },
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
      },
    },
  ]);
};

// Statics - Get moderation queue
prayerSchema.statics.getModerationQueue = function (options = {}) {
  const { limit = 20, offset = 0, status = 'flagged' } = options;

  const statusQuery = status === 'all' ? {} : { status };

  return this.find({
    ...statusQuery,
    is_deleted: false,
  })
    .populate('supporter_id', 'username email')
    .populate('creator_id', 'username email')
    .sort({ report_count: -1, created_at: -1 })
    .skip(offset)
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('Prayer', prayerSchema);
