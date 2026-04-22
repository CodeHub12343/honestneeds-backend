const mongoose = require('mongoose');

/**
 * AuditLog Schema
 * Tracks all admin actions for compliance and accountability
 *
 * @typedef {Object} AuditLog
 * @property {ObjectId} admin_id - Admin who performed action
 * @property {String} action_type - Type of action performed
 * @property {String} entity_type - Type of entity affected
 * @property {ObjectId} entity_id - ID of affected entity
 * @property {Object} changes - Before/after values
 * @property {String} status - success/failure/rollback
 * @property {Date} created_at - When action occurred
 */

const AuditLogSchema = new mongoose.Schema(
  {
    admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action_type: {
      type: String,
      required: true,
      enum: [
        'user_verified',
        'user_rejected',
        'user_blocked',
        'user_unblocked',
        'user_deleted',
        'campaign_approved',
        'campaign_rejected',
        'campaign_edited',
        'campaign_paused',
        'campaign_resumed',
        'campaign_ended',
        'report_resolved',
        'report_dismissed',
        'report_investigated',
        'donation_refunded',
        'withdrawal_processed',
        'settings_updated',
        'notification_broadcast',
        'content_removed',
        'comment_removed',
        'user_suspended',
        'user_reactivated',
      ],
      index: true,
    },
    entity_type: {
      type: String,
      enum: [
        'User',
        'Campaign',
        'UserReport',
        'Transaction',
        'Comment',
        'Content',
        'Settings',
        'Donation',
        'Withdrawal',
      ],
      index: true,
    },
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    description: String,

    // Track what changed
    changes: {
      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
    },

    // Additional context
    ip_address: String,
    user_agent: String,
    status: {
      type: String,
      enum: ['success', 'failed', 'rolled_back'],
      default: 'success',
    },

    // Error details if failed
    error_message: String,
    error_code: String,

    // Metadata
    metadata: mongoose.Schema.Types.Mixed,

    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

/**
 * Indexes for efficient querying
 */
AuditLogSchema.index({ admin_id: 1, created_at: -1 });
AuditLogSchema.index({ action_type: 1, created_at: -1 });
AuditLogSchema.index({ entity_type: 1, entity_id: 1 });
AuditLogSchema.index({ created_at: -1 });
AuditLogSchema.index({ status: 1 });

/**
 * Instance Methods
 */

/**
 * Check if action was successful
 */
AuditLogSchema.methods.isSuccessful = function () {
  return this.status === 'success';
};

/**
 * Get readable action description
 */
AuditLogSchema.methods.getActionDescription = function () {
  const descriptions = {
    user_verified: 'Verified user account',
    user_rejected: 'Rejected user verification',
    user_blocked: 'Blocked user account',
    user_unblocked: 'Unblocked user account',
    user_deleted: 'Deleted user account',
    campaign_approved: 'Approved campaign',
    campaign_rejected: 'Rejected campaign',
    campaign_edited: 'Edited campaign',
    campaign_paused: 'Paused campaign',
    campaign_resumed: 'Resumed campaign',
    campaign_ended: 'Ended campaign',
    report_resolved: 'Resolved report',
    report_dismissed: 'Dismissed report',
    report_investigated: 'Investigated report',
    donation_refunded: 'Refunded donation',
    withdrawal_processed: 'Processed withdrawal',
    settings_updated: 'Updated settings',
    notification_broadcast: 'Broadcast notification',
    content_removed: 'Removed content',
    comment_removed: 'Removed comment',
    user_suspended: 'Suspended user',
    user_reactivated: 'Reactivated user',
  };
  return descriptions[this.action_type] || this.action_type;
};

/**
 * Get time elapsed since action
 */
AuditLogSchema.methods.getTimeElapsed = function () {
  const now = new Date();
  const diff = now - this.created_at;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} days ago`;
  if (hours > 0) return `${hours} hours ago`;
  if (minutes > 0) return `${minutes} minutes ago`;
  return `${seconds} seconds ago`;
};

/**
 * Static Methods
 */

/**
 * Create audit log entry
 */
AuditLogSchema.statics.createLog = async function (logData) {
  const log = new this(logData);
  return log.save();
};

/**
 * Get logs by admin
 */
AuditLogSchema.statics.getAdminLogs = function (adminId, limit = 100, skip = 0) {
  return this.find({ admin_id: adminId })
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip)
    .populate('admin_id', 'name email role');
};

/**
 * Get logs by action type
 */
AuditLogSchema.statics.getLogsByActionType = function (actionType, limit = 100, skip = 0) {
  return this.find({ action_type: actionType })
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip)
    .populate('admin_id', 'name email role');
};

/**
 * Get logs by entity
 */
AuditLogSchema.statics.getEntityLogs = function (entityType, entityId) {
  return this.find({ entity_type: entityType, entity_id: entityId }).sort({ created_at: -1 });
};

/**
 * Get audit trail for date range
 */
AuditLogSchema.statics.getAuditTrail = function (startDate, endDate, filters = {}) {
  const query = {
    created_at: {
      $gte: startDate,
      $lte: endDate,
    },
    ...filters,
  };
  return this.find(query).sort({ created_at: -1 }).populate('admin_id', 'name email role');
};

/**
 * Get failed actions
 */
AuditLogSchema.statics.getFailedActions = function (limit = 100, skip = 0) {
  return this.find({ status: 'failed' })
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip)
    .populate('admin_id', 'name email role');
};

/**
 * Get statistics
 */
AuditLogSchema.statics.getStatistics = async function (startDate, endDate) {
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
        _id: '$action_type',
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
  ];
  return this.aggregate(pipeline);
};

module.exports = mongoose.model('AuditLog', AuditLogSchema);
