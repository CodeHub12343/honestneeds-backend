/**
 * Campaign Comment Model (CA-15)
 * MongoDB schema for campaign comments & encouragement messages.
 *
 * Supports:
 *  - Top-level comments and one level of threaded replies (parent_id)
 *  - Quick "encouragement" reactions (predefined supportive messages)
 *  - Likes (tracked by user to prevent double-counting)
 *  - Soft delete + lightweight moderation (report / hide)
 */

const mongoose = require('mongoose');

const campaignCommentSchema = new mongoose.Schema(
  {
    // Comment identification
    comment_id: {
      type: String,
      required: [true, 'Comment ID is required'],
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

    // Author reference
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    // Denormalized author display info (for fast rendering)
    author_name: {
      type: String,
      default: 'Anonymous',
      maxlength: 120,
    },
    author_avatar_url: {
      type: String,
      maxlength: 500,
    },

    // Threading: null for top-level comments, otherwise the parent comment _id
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CampaignComment',
      default: null,
      index: true,
    },

    // Comment type — free-form comment or a quick encouragement reaction
    comment_type: {
      type: String,
      enum: ['comment', 'encouragement'],
      default: 'comment',
      index: true,
    },

    // For encouragement reactions: which predefined template was used
    encouragement_key: {
      type: String,
      enum: [
        'praying_for_you',
        'stay_strong',
        'you_got_this',
        'sending_love',
        'we_are_with_you',
        'keep_going',
        null,
      ],
      default: null,
    },

    // The message body (optional for pure encouragement reactions)
    content: {
      type: String,
      maxlength: 2000,
      trim: true,
    },

    is_anonymous: {
      type: Boolean,
      default: false,
    },

    // Engagement
    like_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    liked_by: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    reply_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Moderation
    status: {
      type: String,
      enum: ['visible', 'hidden', 'flagged'],
      default: 'visible',
      index: true,
    },
    report_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    reported_by: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Was this comment posted by the campaign creator?
    is_creator: {
      type: Boolean,
      default: false,
    },

    // Soft delete
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deleted_at: {
      type: Date,
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
  },
  {
    collection: 'campaign_comments',
    timestamps: false,
  }
);

// Indexes for common queries
campaignCommentSchema.index({ campaign_id: 1, parent_id: 1, created_at: -1 });
campaignCommentSchema.index({ campaign_id: 1, status: 1, is_deleted: 1 });

// Update updated_at on save
campaignCommentSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

// Soft delete helper
campaignCommentSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

// Ownership check
campaignCommentSchema.methods.isOwnedBy = function (userId) {
  return this.user_id.toString() === userId.toString();
};

module.exports = mongoose.model('CampaignComment', campaignCommentSchema);
