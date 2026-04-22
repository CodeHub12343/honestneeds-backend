const mongoose = require('mongoose');

/**
 * Alert Schema
 * System-generated alerts for suspicious activities and important events
 */
const alertSchema = new mongoose.Schema(
  {
    alert_type: {
      type: String,
      required: true,
      enum: [
        'fraud_detected',
        'suspicious_activity',
        'policy_violation',
        'spam_detected',
        'high_refund_rate',
        'unusual_donation_pattern',
        'unauthorized_access',
        'system_error',
        'content_violation',
        'user_report_surge',
      ],
      index: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high', 'critical'],
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    // Related entities
    related_entity: {
      type: String,
      enum: ['User', 'Campaign', 'Donation', 'Report', 'System'],
    },
    related_entity_id: mongoose.Schema.Types.ObjectId,

    // Alert source
    source: {
      type: String,
      enum: ['system', 'manual', 'rule_engine', 'ai_detection'],
      default: 'system',
    },

    // Alert metrics
    metrics: {
      reported_count: { type: Number, default: 1 },
      affected_count: { type: Number, default: 1 },
      confidence_score: {
        type: Number,
        min: 0,
        max: 100,
        default: 75,
      },
    },

    // Status and resolution
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved', 'dismissed', 'escalated'],
      default: 'open',
      index: true,
    },
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolution_notes: String,
    resolved_at: Date,
    resolved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Risk assessment
    risk_level: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
    },
    recommended_action: {
      type: String,
      enum: ['none', 'warn_user', 'block_campaign', 'block_user', 'suspend_account'],
    },
    action_taken: String,

    // Evidence
    evidence: [
      {
        type: String,
        description: String,
        timestamp: Date,
      },
    ],

    // Notification
    notified_admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    notification_sent_at: Date,
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Indexes
alertSchema.index({ status: 1, created_at: -1 });
alertSchema.index({ severity: 1, status: 1 });
alertSchema.index({ alert_type: 1, created_at: -1 });
alertSchema.index({ related_entity_id: 1 });
alertSchema.index({ assigned_to: 1 });

/**
 * Static method to create alert
 */
alertSchema.statics.createAlert = async function (alertData) {
  try {
    const alert = new this(alertData);
    return await alert.save();
  } catch (error) {
    console.error('Error creating alert:', error);
    throw error;
  }
};

/**
 * Static method to get open alerts
 */
alertSchema.statics.getOpenAlerts = async function (limit = 50, skip = 0) {
  return this.find({ status: { $in: ['open', 'investigating'] } })
    .sort({ severity: -1, created_at: -1 })
    .limit(limit)
    .skip(skip)
    .populate('assigned_to', 'name email')
    .populate('related_entity_id')
    .lean();
};

/**
 * Static method to get alerts by severity
 */
alertSchema.statics.getAlertsBySeverity = async function (severity, limit = 50) {
  return this.find({ severity, status: { $ne: 'dismissed' } })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();
};

/**
 * Static method to get critical alerts
 */
alertSchema.statics.getCriticalAlerts = async function () {
  return this.find({
    severity: 'critical',
    status: { $in: ['open', 'investigating'] },
  })
    .sort({ created_at: -1 })
    .populate('assigned_to', 'name email')
    .lean();
};

/**
 * Static method to resolve alert
 */
alertSchema.statics.resolveAlert = async function (alertId, adminId, notes) {
  return this.findByIdAndUpdate(
    alertId,
    {
      status: 'resolved',
      resolved_at: new Date(),
      resolved_by: adminId,
      resolution_notes: notes,
    },
    { new: true }
  );
};

/**
 * Instance method to dismiss alert
 */
alertSchema.methods.dismiss = async function (reason) {
  this.status = 'dismissed';
  this.resolution_notes = reason;
  return this.save();
};

/**
 * Instance method to assign alert
 */
alertSchema.methods.assignTo = async function (adminId) {
  this.assigned_to = adminId;
  return this.save();
};

module.exports = mongoose.model('Alert', alertSchema);
