/**
 * UserReport Model
 * Schema for user-submitted abuse/safety reports
 */

const mongoose = require('mongoose');

const userReportSchema = new mongoose.Schema(
  {
    report_id: {
      type: String,
      unique: true,
      index: true,
      default: () => `REPORT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    },
    reporter_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    reported_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    reason: {
      type: String,
      enum: [
        'inappropriate_content',
        'harassment',
        'scam_fraud',
        'fake_profile',
        'sexual_abuse',
        'violence',
        'misinformation',
        'spam',
        'other'
      ],
      required: true
    },
    description: {
      type: String,
      maxlength: 5000,
      required: true
    },
    evidence_urls: [{
      type: String,
      trim: true
    }],
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved', 'dismissed'],
      default: 'open',
      index: true
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    resolution_notes: {
      type: String,
      default: null,
      maxlength: 2000
    },
    resolved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    resolved_at: {
      type: Date,
      default: null
    },
    action_taken: {
      type: String,
      enum: ['none', 'warning', 'blocked', 'deleted', 'other'],
      default: 'none'
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true
    },
    updated_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

// Indexes for common queries
userReportSchema.index({ status: 1, created_at: -1 });
userReportSchema.index({ reported_user_id: 1, status: 1 });
userReportSchema.index({ severity: 1, status: 1 });
userReportSchema.index({ reporter_id: 1, created_at: -1 });
userReportSchema.index({ resolved_by: 1, resolved_at: -1 });
userReportSchema.index({ reason: 1, status: 1 });

/**
 * Instance Methods
 */

/**
 * Mark report as investigating
 */
userReportSchema.methods.startInvestigation = function (adminId) {
  this.status = 'investigating';
  this.resolved_by = adminId;
  this.updated_at = new Date();
  return this.save();
};

/**
 * Resolve report
 */
userReportSchema.methods.resolve = function (resolution, actionTaken, adminId) {
  this.status = 'resolved';
  this.resolution_notes = resolution;
  this.action_taken = actionTaken || 'none';
  this.resolved_by = adminId;
  this.resolved_at = new Date();
  this.updated_at = new Date();
  return this.save();
};

/**
 * Dismiss report
 */
userReportSchema.methods.dismiss = function (reason, adminId) {
  this.status = 'dismissed';
  this.resolution_notes = reason;
  this.action_taken = 'none';
  this.resolved_by = adminId;
  this.resolved_at = new Date();
  this.updated_at = new Date();
  return this.save();
};

/**
 * Check if report is still open
 */
userReportSchema.methods.isOpen = function () {
  return this.status === 'open';
};

/**
 * Check if report is investigating
 */
userReportSchema.methods.isInvestigating = function () {
  return this.status === 'investigating';
};

/**
 * Get days since report created
 */
userReportSchema.methods.getDaysSinceCreation = function () {
  const now = new Date();
  const diff = now - this.created_at;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

/**
 * Get days since resolved
 */
userReportSchema.methods.getDaysSinceResolution = function () {
  if (!this.resolved_at) return null;
  const now = new Date();
  const diff = now - this.resolved_at;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

/**
 * Get readable reason
 */
userReportSchema.methods.getReasonLabel = function () {
  const labels = {
    inappropriate_content: 'Inappropriate Content',
    harassment: 'Harassment',
    scam_fraud: 'Scam/Fraud',
    fake_profile: 'Fake Profile',
    sexual_abuse: 'Sexual Abuse',
    violence: 'Violence',
    misinformation: 'Misinformation',
    spam: 'Spam',
    other: 'Other',
  };
  return labels[this.reason] || this.reason;
};

/**
 * Static Methods
 */

/**
 * Get open reports
 */
userReportSchema.statics.getOpenReports = function (limit = 50, skip = 0) {
  return this.find({ status: 'open' })
    .sort({ severity: -1, created_at: -1 })
    .limit(limit)
    .skip(skip)
    .populate('reporter_id', 'name email')
    .populate('reported_user_id', 'name email');
};

/**
 * Get reports by status
 */
userReportSchema.statics.getByStatus = function (status, limit = 50, skip = 0) {
  return this.find({ status })
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip)
    .populate('reporter_id', 'name email')
    .populate('reported_user_id', 'name email')
    .populate('resolved_by', 'name email');
};

/**
 * Get reports against user
 */
userReportSchema.statics.getReportsAgainstUser = function (userId) {
  return this.find({ reported_user_id: userId })
    .sort({ created_at: -1 })
    .populate('reporter_id', 'name email')
    .populate('resolved_by', 'name email');
};

/**
 * Get reports by reporter
 */
userReportSchema.statics.getReportsByReporter = function (reporterId, limit = 50, skip = 0) {
  return this.find({ reporter_id: reporterId })
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip)
    .populate('reported_user_id', 'name email');
};

/**
 * Get reports by reason
 */
userReportSchema.statics.getByReason = function (reason, limit = 50, skip = 0) {
  return this.find({ reason })
    .sort({ severity: -1, created_at: -1 })
    .limit(limit)
    .skip(skip)
    .populate('reporter_id', 'name email')
    .populate('reported_user_id', 'name email');
};

/**
 * Get reports by severity
 */
userReportSchema.statics.getBySeverity = function (severity) {
  return this.find({ severity }).sort({ created_at: -1 });
};

/**
 * Get reports for date range
 */
userReportSchema.statics.getReportsByDateRange = function (startDate, endDate) {
  return this.find({
    created_at: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .sort({ created_at: -1 })
    .populate('reporter_id', 'name email')
    .populate('reported_user_id', 'name email');
};

/**
 * Get statistics
 */
userReportSchema.statics.getStatistics = async function (startDate, endDate) {
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
      $facet: {
        byStatus: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ],
        byReason: [
          {
            $group: {
              _id: '$reason',
              count: { $sum: 1 },
            },
          },
        ],
        bySeverity: [
          {
            $group: {
              _id: '$severity',
              count: { $sum: 1 },
            },
          },
        ],
        averageResolutionTime: [
          {
            $match: { resolved_at: { $exists: true } },
          },
          {
            $group: {
              _id: null,
              avgTime: {
                $avg: {
                  $subtract: ['$resolved_at', '$created_at'],
                },
              },
            },
          },
        ],
      },
    },
  ];
  return this.aggregate(pipeline);
};

/**
 * Check if user has too many reports
 */
userReportSchema.statics.getUserReportCount = async function (userId) {
  return this.countDocuments({ reported_user_id: userId, status: { $in: ['open', 'investigating'] } });
};

/**
 * Get reports requiring action
 */
userReportSchema.statics.getReportsRequiringAction = function () {
  return this.find({
    $or: [{ status: 'open' }, { status: 'investigating' }],
  })
    .sort({ severity: -1, created_at: 1 })
    .populate('reporter_id', 'name email')
    .populate('reported_user_id', 'name email');
};

/**
 * Bulk update status
 */
userReportSchema.statics.bulkUpdateStatus = function (reportIds, status, adminId) {
  return this.updateMany(
    { _id: { $in: reportIds } },
    {
      status,
      resolved_by: adminId,
      resolved_at: status === 'resolved' ? new Date() : null,
      updated_at: new Date(),
    }
  );
};

module.exports = mongoose.model('UserReport', userReportSchema);
