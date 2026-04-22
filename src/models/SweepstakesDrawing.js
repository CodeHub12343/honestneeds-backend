const mongoose = require('mongoose');

/**
 * SweepstakesDrawing Schema
 *
 * Tracks sweepstakes drawing results, winners, and claims
 * Includes audit trail for randomness verification
 */

const sweepstakesDrawingSchema = new mongoose.Schema(
  {
    // Drawing identification
    drawingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `DRAWING-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },

    // Drawing period (e.g., "2026-06")
    drawingPeriod: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: (v) => /^\d{4}-\d{2}$/.test(v),
        message: 'Drawing period must be in YYYY-MM format',
      },
    },

    // Drawing execution details
    drawingDate: {
      type: Date,
      required: true,
      index: true,
    },

    // Prize information
    prizeAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 50000, // $500 in cents
    },

    // Drawing statistics
    totalParticipants: {
      type: Number,
      required: true,
      min: 1,
    },

    totalEntries: {
      type: Number,
      required: true,
      min: 1,
    },

    // Winner information
    winningUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    winningSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SweepstakesSubmission',
      required: true,
      index: true,
    },

    winnerEntryCount: {
      type: Number,
      required: true,
      min: 1,
    },

    // Winner probability
    winnerProbability: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // Drawing status
    status: {
      type: String,
      enum: ['drawn', 'notified', 'claimed', 'unclaimed_expired', 'error'],
      default: 'drawn',
      index: true,
    },

    // Notification tracking
    winnerNotifiedAt: Date,
    notificationAttempts: {
      type: Number,
      default: 0,
    },
    notificationErrors: [
      {
        attempt: Number,
        error: String,
        timestamp: Date,
      },
    ],

    // Claim tracking
    claimedAt: Date,
    claimDeadline: Date, // 30 days from drawing
    claimReason: String, // Why not claimed (expired, user deleted, etc.)

    // Randomness audit trail
    randomSeed: {
      type: String,
      required: true, // For reproducibility verification
    },

    // Reproducibility info
    algorithm: {
      type: String,
      default: 'vose_alias_method',
    },

    // Runner-up tracking (in case winner ineligible)
    runnerUpResults: [
      {
        rank: Number,
        userId: mongoose.Schema.Types.ObjectId,
        entryCount: Number,
        probability: Number,
        selectedAt: Date,
        reason: String, // Why not selected (deleted account, etc.)
      },
    ],

    // Error tracking
    errors: [
      {
        code: String,
        message: String,
        stack: String,
        timestamp: Date,
        resolved: Boolean,
      },
    ],

    // Metadata
    metadata: {
      source: { type: String, default: 'scheduled_job' }, // scheduled_job, manual_admin, etc.
      executedBy: mongoose.Schema.Types.ObjectId, // Admin user if manual
      notes: String,
    },

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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
sweepstakesDrawingSchema.index({ drawingPeriod: 1, status: 1 });
sweepstakesDrawingSchema.index({ winningUserId: 1, drawingPeriod: 1 });
sweepstakesDrawingSchema.index({ drawingDate: -1 });
sweepstakesDrawingSchema.index({ claimDeadline: 1, status: 1 });

// Virtual for days until deadline
sweepstakesDrawingSchema.virtual('daysUntilDeadline').get(function () {
  if (!this.claimDeadline) return null;
  const now = new Date();
  const days = Math.ceil((this.claimDeadline - now) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
});

// Virtual for prize in dollars
sweepstakesDrawingSchema.virtual('prizeAmountDollars').get(function () {
  return (this.prizeAmount / 100).toFixed(2);
});

// Method to mark as notified
sweepstakesDrawingSchema.methods.markNotified = function () {
  this.status = 'notified';
  this.winnerNotifiedAt = new Date();
  this.updatedAt = new Date();
  return this;
};

// Method to mark as claimed
sweepstakesDrawingSchema.methods.markClaimed = function () {
  this.status = 'claimed';
  this.claimedAt = new Date();
  this.updatedAt = new Date();
  return this;
};

// Method to mark as expired/unclaimed
sweepstakesDrawingSchema.methods.markExpired = function (reason = 'deadline_passed') {
  this.status = 'unclaimed_expired';
  this.claimReason = reason;
  this.updatedAt = new Date();
  return this;
};

// Method to record error
sweepstakesDrawingSchema.methods.recordError = function (code, message, stack = null) {
  this.errors.push({
    code,
    message,
    stack,
    timestamp: new Date(),
    resolved: false,
  });
  this.status = 'error';
  this.updatedAt = new Date();
  return this;
};

// Static method to get all unclaimed expiring soon
sweepstakesDrawingSchema.statics.getExpiringClaims = function (daysUntilExpiry = 3) {
  const now = new Date();
  const expiryDate = new Date(now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000);

  return this.find({
    status: 'notified',
    claimDeadline: { $lte: expiryDate, $gt: now },
  }).exec();
};

// Static method to get drawing for period
sweepstakesDrawingSchema.statics.getDrawingForPeriod = function (drawingPeriod) {
  return this.findOne({ drawingPeriod }).exec();
};

const SweepstakesDrawing = mongoose.model('SweepstakesDrawing', sweepstakesDrawingSchema);

module.exports = SweepstakesDrawing;
