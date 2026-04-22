const mongoose = require('mongoose');

/**
 * QRCode Schema
 * Tracks QR code generation, scans, and conversion metrics
 * 
 * @typedef {Object} QRCode
 * @property {ObjectId} campaign_id - Reference to Campaign (required)
 * @property {String} code - QR code data/string
 * @property {String} url - URL encoded in QR code
 * @property {String} label - Human label for this QR (e.g., "Flyer", "Email Campaign")
 * @property {ObjectId} created_by - User who generated QR code
 * @property {Number} total_scans - Total number of QR scans
 * @property {Object[]} scans - Array of scan events { timestamp, source, device, location, ip }
 * @property {Number} total_conversions - Number of conversions from QR scans
 * @property {Object[]} conversions - Array of conversion tracking { donation_id, timestamp }
 * @property {String} status - 'active' | 'inactive'
 * @property {Date} expires_at - When QR code expires (optional)
 * @property {Date} created_at - Creation timestamp
 * @property {Date} updated_at - Last update
 */

const QRCodeSchema = new mongoose.Schema(
  {
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },
    code: {
      type: String,
      required: [true, 'QR code data is required'],
      unique: true,
    },
    url: {
      type: String,
      required: [true, 'URL is required'],
    },
    label: {
      type: String,
      maxlength: [100, 'Label cannot exceed 100 characters'],
      default: 'QR Code',
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator ID is required'],
    },
    total_scans: {
      type: Number,
      default: 0,
      index: true,
    },
    scans: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        source: {
          type: String,
          enum: ['mobile', 'desktop', 'unknown'],
          default: 'unknown',
        },
        device: String, // iOS, Android, Windows, Mac, etc.
        location: String, // Geographic location from IP
        ip: String, // IP address (should be hashed in production)
        user_agent: String,
        referrer: String,
        _id: false,
      },
    ],
    total_conversions: {
      type: Number,
      default: 0,
      index: true,
    },
    conversions: [
      {
        donation_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Donation',
        },
        amount: Number,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        _id: false,
      },
    ],
    conversion_rate: {
      type: Number,
      default: 0, // total_conversions / total_scans
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    expires_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Indexes
QRCodeSchema.index({ campaign_id: 1, status: 1 });
QRCodeSchema.index({ created_by: 1, created_at: -1 });
QRCodeSchema.index({ total_scans: -1 });
QRCodeSchema.index({ total_conversions: -1 });

/**
 * Instance Methods
 */

/**
 * Add a scan record
 */
QRCodeSchema.methods.addScan = function (scanData) {
  this.scans.push(scanData);
  this.total_scans += 1;
  this.updateConversionRate();
  return this.save();
};

/**
 * Add a conversion record
 */
QRCodeSchema.methods.addConversion = function (conversionData) {
  this.conversions.push(conversionData);
  this.total_conversions += 1;
  this.updateConversionRate();
  return this.save();
};

/**
 * Update conversion rate (percentage)
 */
QRCodeSchema.methods.updateConversionRate = function () {
  if (this.total_scans === 0) {
    this.conversion_rate = 0;
  } else {
    this.conversion_rate = parseFloat(((this.total_conversions / this.total_scans) * 100).toFixed(2));
  }
};

/**
 * Deactivate QR code
 */
QRCodeSchema.methods.deactivate = function () {
  this.status = 'inactive';
  return this.save();
};

/**
 * Reactivate QR code
 */
QRCodeSchema.methods.reactivate = function () {
  this.status = 'active';
  return this.save();
};

/**
 * Get scan statistics for a time period
 */
QRCodeSchema.methods.getScanStatistics = function (startDate, endDate) {
  const periodScans = this.scans.filter((scan) => {
    const scanDate = new Date(scan.timestamp);
    return scanDate >= startDate && scanDate <= endDate;
  });

  const deviceBreakdown = {};
  const sourceBreakdown = { mobile: 0, desktop: 0, unknown: 0 };

  periodScans.forEach((scan) => {
    // Device breakdown
    if (scan.device) {
      deviceBreakdown[scan.device] = (deviceBreakdown[scan.device] || 0) + 1;
    }
    // Source breakdown
    sourceBreakdown[scan.source] = (sourceBreakdown[scan.source] || 0) + 1;
  });

  return {
    total_scans: periodScans.length,
    device_breakdown: deviceBreakdown,
    source_breakdown: sourceBreakdown,
  };
};

/**
 * Static Methods
 */

/**
 * Find QR codes by campaign
 */
QRCodeSchema.statics.findByCampaign = function (campaignId) {
  return this.find({
    campaign_id: campaignId,
    status: 'active',
  }).lean();
};

/**
 * Find active QR codes created by user
 */
QRCodeSchema.statics.findByCreator = function (userId) {
  return this.find({
    created_by: userId,
    status: 'active',
  })
    .sort({ created_at: -1 })
    .lean();
};

/**
 * Get top QR codes by scans
 */
QRCodeSchema.statics.getTopByScans = function (limit = 10) {
  return this.find({ status: 'active' })
    .sort({ total_scans: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get top QR codes by conversions
 */
QRCodeSchema.statics.getTopByConversions = function (limit = 10) {
  return this.find({ status: 'active' })
    .sort({ total_conversions: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get analytics aggregation
 */
QRCodeSchema.statics.getAnalyticsAggregation = function (campaignId) {
  return this.aggregate([
    {
      $match: {
        campaign_id: mongoose.Types.ObjectId.isValid(campaignId)
          ? mongoose.Types.ObjectId(campaignId)
          : null,
        status: 'active',
      },
    },
    {
      $group: {
        _id: null,
        total_qr_codes: { $sum: 1 },
        total_scans: { $sum: '$total_scans' },
        total_conversions: { $sum: '$total_conversions' },
        average_scans: { $avg: '$total_scans' },
        average_conversion_rate: { $avg: '$conversion_rate' },
      },
    },
  ]);
};

module.exports = mongoose.model('QRCode', QRCodeSchema);
