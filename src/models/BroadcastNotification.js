const mongoose = require('mongoose');

/**
 * BroadcastNotification Schema
 * Stores broadcast notifications sent by admins to users
 *
 * @typedef {Object} BroadcastNotification
 * @property {String} title - Notification title
 * @property {String} message - Notification message
 * @property {String} type - Notification type (alert, announcement, system, warning)
 * @property {ObjectId} created_by - Admin who created notification
 * @property {Date} scheduled_for - When to send notification
 * @property {String} status - draft/scheduled/sent/failed/cancelled
 * @property {Array} targets - Target user segments
 * @property {Object} recipients_data - Tracking for sent notifications
 */

const BroadcastNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      maxlength: 150,
      index: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    description: {
      type: String,
      maxlength: 500,
    },

    // Notification type and priority
    type: {
      type: String,
      enum: ['alert', 'announcement', 'system', 'warning', 'info'],
      default: 'announcement',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'critical'],
      default: 'normal',
    },

    // Creator
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Targeting
    target_segments: {
      type: [String],
      enum: [
        'all_users',
        'creators_only',
        'donors_only',
        'volunteers_only',
        'unverified_users',
        'verified_users',
        'blocked_users',
        'premium_users',
      ],
      default: ['all_users'],
    },

    // Specific user targeting
    target_user_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Scheduling
    scheduled_for: {
      type: Date,
      default: Date.now,
      index: true,
    },
    sent_at: Date,

    // Status tracking
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sent', 'partially_sent', 'failed', 'cancelled'],
      default: 'draft',
      index: true,
    },

    // Execution details
    execution: {
      total_recipients: {
        type: Number,
        default: 0,
      },
      successful_sends: {
        type: Number,
        default: 0,
      },
      failed_sends: {
        type: Number,
        default: 0,
      },
      started_at: Date,
      completed_at: Date,
      error_message: String,
    },

    // Recipients metadata
    recipients_snapshot: {
      // Snapshot of target data when notification was created
      total_users: Number,
      segments_breakdown: mongoose.Schema.Types.Mixed,
    },

    // Action button (optional)
    action: {
      label: String,
      url: String,
      type: {
        type: String,
        enum: ['internal_link', 'external_link', 'none'],
      },
    },

    // Metadata and tracking
    metadata: mongoose.Schema.Types.Mixed,
    read_count: {
      type: Number,
      default: 0,
    },
    click_count: {
      type: Number,
      default: 0,
    },

    // Audit
    updated_by: mongoose.Schema.Types.ObjectId,
    updated_at: Date,

    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Indexes for efficient querying
 */
BroadcastNotificationSchema.index({ created_by: 1, created_at: -1 });
BroadcastNotificationSchema.index({ status: 1, scheduled_for: 1 });
BroadcastNotificationSchema.index({ type: 1, created_at: -1 });
BroadcastNotificationSchema.index({ created_at: -1 });

/**
 * Instance Methods
 */

/**
 * Check if notification is ready to send
 */
BroadcastNotificationSchema.methods.isReadyToSend = function () {
  return (
    this.status === 'scheduled' &&
    this.scheduled_for <= new Date() &&
    !this.sent_at
  );
};

/**
 * Mark as sent
 */
BroadcastNotificationSchema.methods.markAsSent = function (successCount, failCount) {
  this.status = failCount > 0 ? 'partially_sent' : 'sent';
  this.sent_at = new Date();
  this.execution.successful_sends = successCount;
  this.execution.failed_sends = failCount;
  this.execution.completed_at = new Date();
  return this.save();
};

/**
 * Mark as failed
 */
BroadcastNotificationSchema.methods.markAsFailed = function (errorMessage) {
  this.status = 'failed';
  this.execution.error_message = errorMessage;
  this.execution.completed_at = new Date();
  return this.save();
};

/**
 * Cancel notification
 */
BroadcastNotificationSchema.methods.cancel = function () {
  if (['draft', 'scheduled'].includes(this.status)) {
    this.status = 'cancelled';
    return this.save();
  }
  throw new Error('Cannot cancel notification that has already been sent');
};

/**
 * Get estimated recipient count
 */
BroadcastNotificationSchema.methods.getEstimatedRecipientCount = function () {
  return this.execution.total_recipients || this.recipients_snapshot?.total_users || 0;
};

/**
 * Get send progress percentage
 */
BroadcastNotificationSchema.methods.getSendProgressPercentage = function () {
  const total = this.execution.total_recipients;
  if (total === 0) return 0;
  const sent = this.execution.successful_sends + this.execution.failed_sends;
  return Math.round((sent / total) * 100);
};

/**
 * Add metrics
 */
BroadcastNotificationSchema.methods.recordInteraction = function (type) {
  if (type === 'read') {
    this.read_count += 1;
  } else if (type === 'click') {
    this.click_count += 1;
  }
  return this.save();
};

/**
 * Static Methods
 */

/**
 * Create new broadcast notification
 */
BroadcastNotificationSchema.statics.createBroadcast = async function (notificationData) {
  const notification = new this(notificationData);
  return notification.save();
};

/**
 * Get pending notifications to send
 */
BroadcastNotificationSchema.statics.getPendingNotifications = function () {
  return this.find({
    status: 'scheduled',
    scheduled_for: { $lte: new Date() },
  }).populate('created_by', 'name email');
};

/**
 * Get notifications by status
 */
BroadcastNotificationSchema.statics.getByStatus = function (status, limit = 50, skip = 0) {
  return this.find({ status })
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip)
    .populate('created_by', 'name email');
};

/**
 * Get notifications created by admin
 */
BroadcastNotificationSchema.statics.getAdminNotifications = function (adminId, limit = 50, skip = 0) {
  return this.find({ created_by: adminId })
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip);
};

/**
 * Get notifications for date range
 */
BroadcastNotificationSchema.statics.getNotificationsByDateRange = function (
  startDate,
  endDate,
  limit = 100
) {
  return this.find({
    created_at: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('created_by', 'name email');
};

/**
 * Get statistics
 */
BroadcastNotificationSchema.statics.getStatistics = async function (startDate, endDate) {
  const pipeline = [
    {
      $match: {
        created_at: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalRead: { $sum: '$read_count' },
        totalClicked: { $sum: '$click_count' },
      },
    },
  ];
  return this.aggregate(pipeline);
};

/**
 * Get top performing notifications
 */
BroadcastNotificationSchema.statics.getTopPerforming = function (limit = 10) {
  return this.find({ status: { $in: ['sent', 'partially_sent'] } })
    .sort({ click_count: -1 })
    .limit(limit);
};

module.exports = mongoose.model('BroadcastNotification', BroadcastNotificationSchema);
