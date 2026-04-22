const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * WinnerClaim Model - Tracks prize claims from sweepstakes winners
 * 
 * Claim Flow:
 * 1. Winner receives notification they won
 * 2. Winner initiates claim via /sweepstakes/:id/claim endpoint
 * 3. Claim is created with 'pending' status
 * 4. Admin reviews and approves payment
 * 5. Prize is transferred to winner's account
 * 6. Claim status updated to 'claimed'
 */
const winnerClaimSchema = new Schema(
  {
    // Reference to sweepstakes drawing
    sweepstakesId: {
      type: Schema.Types.ObjectId,
      ref: 'Sweepstakes',
      required: true,
      index: true,
    },

    // Reference to winning user
    winnerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    winnerEmail: {
      type: String,
      required: true,
    },

    // Prize information (snapshot from sweepstakes at time of claim)
    prizeAmount: {
      type: Number,
      required: true,
      // Stored in cents
    },

    // Payment details
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'stripe', 'paypal', 'direct_deposit', 'check'],
      default: 'bank_transfer',
    },

    // Account details for payment (encrypted in production)
    paymentDetails: {
      accountName: String,
      accountNumber: String,
      routingNumber: String,
      bankName: String,
      // Note: In production, these would be encrypted using crypto module
    },

    // Claim Status Flow
    status: {
      type: String,
      enum: ['pending', 'approved', 'claimed', 'rejected', 'expired'],
      default: 'pending',
      index: true,
    },

    // Claim Timeline
    claimedAt: {
      type: Date,
      default: null,
      // When user submitted claim
    },

    approvedAt: {
      type: Date,
      default: null,
      // When admin approved payment
    },

    approvedByAdmin: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
      // When payment was actually processed
    },

    // Rejection/Notes
    rejectionReason: {
      type: String,
      default: null,
    },

    adminNotes: {
      type: String,
      default: null,
    },

    // Transaction tracking
    transactionId: {
      type: String,
      default: null,
      // Reference to payment processor transaction
      unique: true,
      sparse: true,
    },

    // Verification
    verificationAttempts: {
      type: Number,
      default: 0,
    },

    isVerified: {
      type: Boolean,
      default: false,
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

    expiresAt: {
      type: Date,
      // Claim expires if not completed by deadline
      // Set when claim is created (usually 30 days)
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'winner_claims',
  }
);

// Indexes
winnerClaimSchema.index({ sweepstakesId: 1, winnerId: 1 });
winnerClaimSchema.index({ status: 1 });
winnerClaimSchema.index({ createdAt: -1 });
winnerClaimSchema.index({ expiresAt: 1 });

// Virtual for formatted prize amount
winnerClaimSchema.virtual('prizeAmountDollars').get(function () {
  return (this.prizeAmount / 100).toFixed(2);
});

// Method to check if claim is expired
winnerClaimSchema.methods.isExpired = function () {
  return this.expiresAt && new Date() > this.expiresAt && this.status === 'pending';
};

// Method to mark as expired
winnerClaimSchema.methods.markAsExpired = async function () {
  if (this.isExpired()) {
    this.status = 'expired';
    return this.save();
  }
  return this;
};

// Static method to find active claim for sweepstakes
winnerClaimSchema.statics.findActiveClaim = async function (sweepstakesId, winnerId) {
  return this.findOne({
    sweepstakesId,
    winnerId,
    status: { $in: ['pending', 'approved'] },
  });
};

// Static method to create claim
winnerClaimSchema.statics.createClaim = async function (sweepstakesData, userData) {
  const claim = new this({
    sweepstakesId: sweepstakesData._id,
    winnerId: userData._id,
    winnerEmail: userData.email,
    prizeAmount: sweepstakesData.prizeAmount,
    claimedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  });

  return claim.save();
};

module.exports = mongoose.model('WinnerClaim', winnerClaimSchema);
