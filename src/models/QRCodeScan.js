const mongoose = require('mongoose');

/**
 * QRCodeScan Schema
 * Tracks individual QR code scan events with user and sweepstakes integration
 * 
 * Each scan records:
 * - Which QR code was scanned
 * - Which campaign it's linked to
 * - Who scanned it (if authenticated)
 * - Device/location information
 * - Sweepstakes entry awarded status
 * 
 * @typedef {Object} QRCodeScan
 * @property {String} scan_id - Unique scan ID (SCAN-YYYY-XXXXXX)
 * @property {ObjectId} qr_code_id - Reference to QRCode (optional, may be anonymous)
 * @property {ObjectId} campaign_id - Reference to Campaign
 * @property {ObjectId} user_id - Reference to User who scanned (optional, anonymous allowed)
 * @property {String} ip_address - IP address of scanner
 * @property {String} user_agent - User agent string
 * @property {Object} location - Geographic location {country, region, city}
 * @property {String} device_type - Device category (mobile, tablet, desktop)
 * @property {String} referrer - HTTP referrer (if available)
 * @property {String} sweepstakes_entry_awarded - Status (pending, awarded, failed, ineligible)
 * @property {Number} sweepstakes_entries - Number of entries awarded (+1 per scan)
 * @property {Date} scanned_at - When scan occurred
 * @property {Date} created_at - Record creation time
 */

const QRCodeScanSchema = new mongoose.Schema(
  {
    scan_id: {
      type: String,
      required: [true, 'Scan ID is required'],
      unique: true,
      index: true,
      match: [/^SCAN-\d{4}-[A-Z0-9]{6}$/, 'Scan ID must be in format SCAN-YYYY-XXXXXX'],
    },

    qr_code_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QRCode',
      index: true,
      // Optional: QR may be untracked or anonymous
    },

    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },

    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      // Optional: Allow anonymous scans
    },

    ip_address: {
      type: String,
      required: [true, 'IP address is required'],
      // Hashed in production for privacy
    },

    user_agent: {
      type: String,
      maxlength: [500, 'User agent cannot exceed 500 characters'],
    },

    location: {
      country: String,
      region: String,
      city: String,
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
      _id: false,
    },

    device_type: {
      type: String,
      enum: ['mobile', 'tablet', 'desktop', 'unknown'],
      default: 'unknown',
      index: true,
    },

    referrer: String,

    sweepstakes_entry_awarded: {
      type: String,
      enum: ['pending', 'awarded', 'failed', 'ineligible', 'duplicate'],
      default: 'pending',
      index: true,
    },

    sweepstakes_entries: {
      type: Number,
      default: 1,
      // Standard: +1 entry per QR scan
      // Can be 0 if user is ineligible
    },

    scanned_at: {
      type: Date,
      required: [true, 'Scan timestamp is required'],
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    collection: 'qr_code_scans',
  }
);

// Index for query efficiency: campaign scans by date
QRCodeScanSchema.index({ campaign_id: 1, scanned_at: -1 });

// Index for user sweep entries: user scans by period
QRCodeScanSchema.index({ user_id: 1, scanned_at: -1 });

// Index for duplicate detection: same user scanning same QR multiple times
QRCodeScanSchema.index({ user_id: 1, qr_code_id: 1, scanned_at: -1 });

// Index for sweepstakes processing: find scans needing entry processing
QRCodeScanSchema.index({
  sweepstakes_entry_awarded: 1,
  scanned_at: -1,
});

module.exports = mongoose.model('QRCodeScan', QRCodeScanSchema);
