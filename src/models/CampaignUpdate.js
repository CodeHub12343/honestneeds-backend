/**
 * Campaign Update Model
 * MongoDB schema for campaign progress updates
 * 
 * Allows campaign creators to post updates about campaign progress
 * Supporters can view updates and track campaign developments
 */

const mongoose = require('mongoose');

const campaignUpdateSchema = new mongoose.Schema(
  {
    // Update identification
    update_id: {
      type: String,
      required: [true, 'Update ID is required'],
      unique: true,
      index: true,
    },

    // Campaign reference
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },

    // Creator reference
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator ID is required'],
      index: true,
    },

    // Update content
    title: {
      type: String,
      required: [true, 'Update title is required'],
      minlength: 5,
      maxlength: 200,
      trim: true,
    },

    content: {
      type: String,
      required: [true, 'Update content is required'],
      minlength: 10,
      maxlength: 5000,
      trim: true,
    },

    // Media attachments
    media_urls: [
      {
        type: String,
        match: [
          /^https?:\/\/.+/,
          'Media URL must be a valid HTTP/HTTPS URL',
        ],
      },
    ],

    // Sentiment analysis (auto-detected)
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
      default: 'neutral',
    },

    // Update type/category
    update_type: {
      type: String,
      enum: [
        'progress_milestone',
        'funding_update',
        'volunteer_impact',
        'community_response',
        'thank_you',
        'challenge_overcome',
        'need_for_help',
        'general_update',
      ],
      default: 'general_update',
      index: true,
    },

    // Update status
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
      index: true,
    },

    // Engagement metrics (updated in real-time)
    engagement: {
      view_count: {
        type: Number,
        default: 0,
        min: 0,
      },
      share_count: {
        type: Number,
        default: 0,
        min: 0,
      },
      comment_count: {
        type: Number,
        default: 0,
        min: 0,
      },
      like_count: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Views by user (for analytics)
    viewed_by: [
      {
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        viewed_at: {
          type: Date,
          default: () => new Date(),
        },
      },
    ],

    // Soft delete support
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Timestamps
    created_at: {
      type: Date,
      default: () => new Date(),
      index: true,
    },

    updated_at: {
      type: Date,
      default: () => new Date(),
    },

    deleted_at: {
      type: Date,
    },
  },
  {
    timestamps: false, // Using custom created_at and updated_at
    collection: 'campaign_updates',
  }
);

// Indexes for common queries
campaignUpdateSchema.index({ campaign_id: 1, created_at: -1 });
campaignUpdateSchema.index({ creator_id: 1, created_at: -1 });
campaignUpdateSchema.index({ status: 1, is_deleted: 1 });
campaignUpdateSchema.index({ update_type: 1, created_at: -1 });

// Pre-save middleware to update timestamp
campaignUpdateSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

// Query helper to exclude deleted updates
campaignUpdateSchema.query.notDeleted = function () {
  return this.where({ is_deleted: false });
};

// Instance method to soft delete
campaignUpdateSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

// Instance method to restore
campaignUpdateSchema.methods.restore = function () {
  this.is_deleted = false;
  this.deleted_at = null;
  return this.save();
};

// Static method to increment view count
campaignUpdateSchema.statics.incrementViewCount = async function (updateId, userId) {
  return this.findByIdAndUpdate(
    updateId,
    {
      $inc: { 'engagement.view_count': 1 },
      $addToSet: {
        viewed_by: {
          user_id: userId || null,
          viewed_at: new Date(),
        },
      },
    },
    { new: true }
  );
};

// Static method to increment engagement metrics
campaignUpdateSchema.statics.incrementEngagement = async function (updateId, metric) {
  const validMetrics = ['view_count', 'share_count', 'comment_count', 'like_count'];
  if (!validMetrics.includes(metric)) {
    throw new Error(`Invalid metric: ${metric}`);
  }

  return this.findByIdAndUpdate(
    updateId,
    {
      $inc: { [`engagement.${metric}`]: 1 },
    },
    { new: true }
  );
};

module.exports = mongoose.model('CampaignUpdate', campaignUpdateSchema);
