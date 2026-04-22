const mongoose = require('mongoose');

/**
 * SweepstakesSubmission Schema
 * 
 * Tracks user entries for sweepstakes drawings
 * Supports multiple entry sources: campaigns, donations, shares, QR scans
 * 
 * Entry allocation:
 * - Campaign created: +1 (once per user per period)
 * - Donation: +1 per donation (any amount)
 * - Share: +0.5 per share recorded
 * - QR scan: +1 per scan
 */

const sweepstakesSubmissionSchema = new mongoose.Schema(
  {
    // User reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Drawing period (e.g., "2026-06", "2026-08")
    drawingPeriod: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: (v) => /^\d{4}-\d{2}$/.test(v),
        message: 'Drawing period must be in YYYY-MM format',
      },
    },

    // Total entry count (sum of all sources)
    entryCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    // Entry sources breakdown
    entrySources: {
      campaignCreated: {
        count: { type: Number, default: 0, min: 0 },
        claimed: { type: Boolean, default: false }, // Prevent duplicate +1
        claimedAt: Date,
      },
      donations: {
        count: { type: Number, default: 0, min: 0 },
        totalAmount: { type: Number, default: 0, min: 0 }, // In cents
        donationIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Donation',
          },
        ],
      },
      shares: {
        count: { type: Number, default: 0, min: 0 },
        sharesRecorded: { type: Number, default: 0 }, // Actual share count (entry = count * 0.5)
        shareIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ShareRecord',
          },
        ],
      },
      qrScans: {
        count: { type: Number, default: 0, min: 0 },
        campaignId: mongoose.Schema.Types.ObjectId,
      },
    },

    // Entry history for audit trail
    entryHistory: [
      {
        source: {
          type: String,
          enum: ['campaign_created', 'donation', 'share', 'qr_scan'],
          required: true,
        },
        amount: { type: Number, required: true }, // 1, 0.5, 1, etc.
        sourceId: mongoose.Schema.Types.ObjectId, // Reference to generating record
        recordedAt: { type: Date, default: Date.now },
        metadata: mongoose.Schema.Types.Mixed, // Extra data (amount, channel, etc.)
      },
    ],

    // Validation tracking
    isValid: {
      type: Boolean,
      default: true,
      index: true,
    },
    validationFlags: [
      {
        flag: {
          type: String,
          enum: [
            'suspicious_activity',
            'geo_restricted',
            'inactive_account',
            'underage',
            'excessive_entries',
          ],
        },
        detectedAt: Date,
        reason: String,
      },
    ],

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    submittedAt: {
      type: Date, // When final submission locked in for drawing
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for quick lookups
sweepstakesSubmissionSchema.index({ userId: 1, drawingPeriod: 1 }, { unique: true });
sweepstakesSubmissionSchema.index({ drawingPeriod: 1, isValid: 1 });
sweepstakesSubmissionSchema.index({ drawingPeriod: 1, entryCount: -1 }); // For leaderboards
sweepstakesSubmissionSchema.index({ updatedAt: -1 });

// Virtual for total participants calculation aggregation
sweepstakesSubmissionSchema.virtual('sourceCount').get(function () {
  return [
    this.entrySources.campaignCreated.count,
    this.entrySources.donations.count,
    this.entrySources.shares.count,
    this.entrySources.qrScans.count,
  ].filter((c) => c > 0).length;
});

// Virtual to show entry breakdown
sweepstakesSubmissionSchema.virtual('breakdown').get(function () {
  return {
    campaignCreated: this.entrySources.campaignCreated.count,
    donations: this.entrySources.donations.count,
    shares: this.entrySources.shares.count,
    qrScans: this.entrySources.qrScans.count,
    total: this.entryCount,
  };
});

// Method to add entry
sweepstakesSubmissionSchema.methods.addEntry = function (source, amount, metadata = {}) {
  this.entryCount += amount;
  this.updatedAt = new Date();

  // Add to history
  this.entryHistory.push({
    source,
    amount,
    sourceId: metadata.sourceId || null,
    recordedAt: new Date(),
    metadata,
  });

  return this;
};

// Method to validate submission
sweepstakesSubmissionSchema.methods.validate = async function (userModel) {
  this.validationFlags = [];

  try {
    // Fetch user to check status
    const user = await userModel.findById(this.userId);
    if (!user) {
      this.isValid = false;
      this.validationFlags.push({
        flag: 'inactive_account',
        detectedAt: new Date(),
        reason: 'User not found',
      });
      return this;
    }

    // Check if account is suspended/deleted
    if (user.status === 'suspended' || user.status === 'deleted') {
      this.isValid = false;
      this.validationFlags.push({
        flag: 'inactive_account',
        detectedAt: new Date(),
        reason: `Account status: ${user.status}`,
      });
    }

    // Check age (18+)
    if (user.dateOfBirth) {
      const age = new Date().getFullYear() - user.dateOfBirth.getFullYear();
      if (age < 18) {
        this.isValid = false;
        this.validationFlags.push({
          flag: 'underage',
          detectedAt: new Date(),
          reason: `Age: ${age}`,
        });
      }
    }

    // Check geo-restrictions
    if (user.state && ['Florida', 'New York', 'Illinois'].includes(user.state)) {
      this.isValid = false;
      this.validationFlags.push({
        flag: 'geo_restricted',
        detectedAt: new Date(),
        reason: `Restricted state: ${user.state}`,
      });
    }

    // Check for excessive entries (more than 1000)
    if (this.entryCount > 1000) {
      this.isValid = false;
      this.validationFlags.push({
        flag: 'excessive_entries',
        detectedAt: new Date(),
        reason: `Entry count: ${this.entryCount}`,
      });
    }

    return this;
  } catch (error) {
    this.isValid = false;
    this.validationFlags.push({
      flag: 'suspicious_activity',
      detectedAt: new Date(),
      reason: `Validation error: ${error.message}`,
    });
    return this;
  }
};

// Static method to calculate current drawing period
sweepstakesSubmissionSchema.statics.getCurrentDrawingPeriod = function () {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Static method to get next drawing period
sweepstakesSubmissionSchema.statics.getNextDrawingPeriod = function () {
  const now = new Date();
  let month = now.getMonth() + 2; // Next 2 months
  let year = now.getFullYear();

  if (month > 12) {
    month -= 12;
    year += 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
};

// Static method to get drawing period for date
sweepstakesSubmissionSchema.statics.getDrawingPeriodForDate = function (date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const SweepstakesSubmission = mongoose.model(
  'SweepstakesSubmission',
  sweepstakesSubmissionSchema
);

module.exports = SweepstakesSubmission;
