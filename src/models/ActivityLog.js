const mongoose = require('mongoose');

/**
 * ActivityLog Schema
 * Tracks user and admin activities across the platform
 * Used for audit trail and activity feed
 */
const activityLogSchema = new mongoose.Schema(
  {
    activity_type: {
      type: String,
      required: true,
      enum: [
        // User activities
        'user_registered',
        'user_login',
        'user_logout',
        'user_profile_updated',
        'user_verification_submitted',
        'user_blocked',
        'user_unblocked',
        // Campaign activities
        'campaign_created',
        'campaign_updated',
        'campaign_activated',
        'campaign_paused',
        'campaign_completed',
        'campaign_rejected',
        'campaign_approved',
        // Donation activities
        'donation_received',
        'donation_refunded',
        // Sharing activities
        'campaign_shared',
        'referral_click',
        // Admin activities
        'admin_action_taken',
        'settings_modified',
        'content_published',
        'notification_broadcast',
      ],
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    entity_type: {
      type: String,
      enum: [
        'User',
        'Campaign',
        'Donation',
        'Share',
        'Report',
        'Settings',
        'Content',
        'Notification',
      ],
    },
    entity_id: mongoose.Schema.Types.ObjectId,
    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    // Metadata about the action
    metadata: {
      ip_address: String,
      user_agent: String,
      source: {
        type: String,
        enum: ['web', 'mobile_app', 'api', 'admin'],
        default: 'web',
      },
      // Additional context
      changes: {
        before: mongoose.Schema.Types.Mixed,
        after: mongoose.Schema.Types.Mixed,
      },
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low',
    },
    is_public: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Indexes for efficient queries
activityLogSchema.index({ created_at: -1 });
activityLogSchema.index({ user_id: 1, created_at: -1 });
activityLogSchema.index({ activity_type: 1, created_at: -1 });
activityLogSchema.index({ entity_type: 1, entity_id: 1 });
activityLogSchema.index({ activity_type: 1, user_id: 1 });

/**
 * Static method to create activity log
 */
activityLogSchema.statics.createLog = async function (logData) {
  try {
    const log = new this(logData);
    return await log.save();
  } catch (error) {
    console.error('Error creating activity log:', error);
    throw error;
  }
};

/**
 * Static method to get recent activities
 */
activityLogSchema.statics.getRecentActivities = async function (filters = {}) {
  const {
    limit = 50,
    skip = 0,
    activity_type,
    user_id,
    entity_type,
  } = filters;

  const query = { is_public: true };

  if (activity_type) query.activity_type = activity_type;
  if (user_id) query.user_id = user_id;
  if (entity_type) query.entity_type = entity_type;

  return this.find(query)
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip)
    .populate('user_id', 'name email avatar')
    .lean();
};

/**
 * Static method to get activity by user
 */
activityLogSchema.statics.getUserActivities = async function (userId, limit = 50) {
  return this.find({ user_id: userId, is_public: true })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();
};

/**
 * Static method to get activity summary
 */
activityLogSchema.statics.getActivitySummary = async function (startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        created_at: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      },
    },
    {
      $group: {
        _id: '$activity_type',
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);
};

module.exports = mongoose.model('ActivityLog', activityLogSchema);
