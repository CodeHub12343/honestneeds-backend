const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Sweepstakes Model - Represents a monthly random drawing
 * 
 * Monthly Sweepstakes System:
 * - One sweepstakes per month
 * - Automatic random selection from all eligible users (18+, valid state, active account)
 * - Admin selects winner and amount
 * - Winner claims prize via payment method
 * 
 * Status Flow:
 * - 'active': Currently accepting entries (all eligible users auto-included)
 * - 'drawing': Drawing period, winner being selected
 * - 'completed': Winner selected, awaiting claim
 * - 'claimed': Prize claimed by winner
 * - 'cancelled': Drawing cancelled
 */
const sweepstakesSchema = new Schema(
  {
    // Identification
    month: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // Format: "2026-04" (YYYY-MM)
      match: /^\d{4}-\d{2}$/,
    },

    title: {
      type: String,
      required: true,
      // Example: "April 2026 Monthly Drawing"
    },

    description: {
      type: String,
      default: 'Monthly sweepstakes drawing for all eligible users',
    },

    // Prize Details
    prizeAmount: {
      type: Number,
      required: true,
      // Stored in cents (e.g., 50000 = $500.00)
      min: 0,
    },

    prizeDescription: {
      type: String,
      default: 'Cash Prize',
    },

    // Timeline
    entryStartDate: {
      type: Date,
      required: true,
      // When users become eligible (usually first day of month)
    },

    entryEndDate: {
      type: Date,
      required: true,
      // When eligibility period closes (usually last day of month)
    },

    drawingDate: {
      type: Date,
      required: true,
      // When drawing is performed
    },

    claimDeadline: {
      type: Date,
      required: true,
      // Deadline for winner to claim prize
    },

    // Winner Information
    winnerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    winnerEmail: {
      type: String,
      default: null,
    },

    // Status & Metadata
    status: {
      type: String,
      enum: ['active', 'drawing', 'completed', 'claimed', 'cancelled'],
      default: 'active',
      index: true,
    },

    // Number of eligible participants (snapshot at drawing time)
    eligibleParticipants: {
      type: Number,
      default: 0,
    },

    // Notes from admin
    adminNotes: {
      type: String,
      default: null,
    },

    // Draw details
    drawMethod: {
      type: String,
      enum: ['random_selection', 'manual_selection'],
      default: 'random_selection',
    },

    drawnByAdmin: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },

    drawnAt: {
      type: Date,
      default: null,
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
    },
  },
  {
    timestamps: true,
    collection: 'sweepstakes',
  }
);

// Indexes for efficient queries
sweepstakesSchema.index({ month: 1 });
sweepstakesSchema.index({ status: 1 });
sweepstakesSchema.index({ winnerId: 1 });
sweepstakesSchema.index({ createdAt: -1 });
sweepstakesSchema.index({ entryEndDate: 1 });

// Virtual for formatted prize amount
sweepstakesSchema.virtual('prizeAmountDollars').get(function () {
  return (this.prizeAmount / 100).toFixed(2);
});

// Method to check if drawing is open
sweepstakesSchema.methods.isDrawingOpen = function () {
  const now = new Date();
  return this.status === 'active' && now <= this.entryEndDate;
};

// Method to check if winner can claim
sweepstakesSchema.methods.canWinnerClaim = function () {
  const now = new Date();
  return this.status === 'completed' && this.winnerId && now <= this.claimDeadline;
};

// Static method to get current/active sweepstakes
sweepstakesSchema.statics.getCurrentSweepstakes = async function () {
  const now = new Date();
  
  // Return sweepstakes that match ONE of these conditions:
  // 1. Active sweepstakes during entry period: status='active' AND entryEndDate >= now
  // 2. Completed sweepstakes during claim period: status='completed' AND claimDeadline >= now
  return this.findOne({
    $or: [
      {
        status: 'active',
        entryEndDate: { $gte: now },
      },
      {
        status: 'completed',
        claimDeadline: { $gte: now },
      }
    ]
  }).sort({ createdAt: -1 });
};

// Static method to get sweepstakes by month
sweepstakesSchema.statics.getByMonth = async function (month) {
  return this.findOne({ month });
};

// Static method to create monthly sweepstakes (admin only)
sweepstakesSchema.statics.createMonthly = async function (month, prizeAmount) {
  const year = month.split('-')[0];
  const monthNum = month.split('-')[1];

  const startDate = new Date(year, parseInt(monthNum) - 1, 1);
  const endDate = new Date(year, parseInt(monthNum), 0); // Last day of month
  const drawDate = new Date(year, parseInt(monthNum), 1); // First day of next month
  const claimDate = new Date(year, parseInt(monthNum), 15); // Mid of next month

  return this.create({
    month,
    title: `${startDate.toLocaleDateString('en-US', { month: 'long' })} ${year} Monthly Drawing`,
    description: `Monthly sweepstakes drawing for all eligible users in ${startDate.toLocaleDateString('en-US', { month: 'long' })} ${year}`,
    prizeAmount,
    prizeDescription: `$${(prizeAmount / 100).toFixed(2)} Cash Prize`,
    entryStartDate: startDate,
    entryEndDate: endDate,
    drawingDate: drawDate,
    claimDeadline: claimDate,
    status: 'active',
  });
};

module.exports = mongoose.model('Sweepstakes', sweepstakesSchema);
