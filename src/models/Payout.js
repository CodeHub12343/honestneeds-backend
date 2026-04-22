/**
 * Payout Model
 * Stores payout transactions for campaign creators
 * 
 * Business Logic:
 * - Tracks payouts initiated from campaign completion
 * - Records payment processor details (Stripe, PayPal, Bank)
 * - Maintains payout status and error tracking
 * - Supports retry logic and audit trails
 */

const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema(
  {
    // Payout identifiers
    payout_id: {
      type: String,
      unique: true,
      sparse: true,
      // Format: PAYOUT-YYYY-MM-DD-XXXXX
    },

    // Campaign reference (what campaign is this payout for?)
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID required'],
      index: true,
    },

    campaign_ref_id: {
      type: String,
      sparse: true,
      // Campaign's public campaign_id field
    },

    // Creator reference (who is receiving the payout?)
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator ID required'],
      index: true,
    },

    // Payout amounts (in cents)
    total_raised_cents: {
      type: Number,
      required: true,
      min: 0,
    },

    platform_fee_cents: {
      type: Number,
      required: true,
      // 20% platform fee
    },

    payout_amount_cents: {
      type: Number,
      required: true,
      // total_raised - platform_fee
      min: 0,
    },

    // Payout status
    status: {
      type: String,
      enum: ['initiated', 'processing', 'completed', 'failed', 'pending_retry'],
      default: 'initiated',
      index: true,
    },

    // Payment method and processor details
    payment_method: {
      type: String,
      enum: ['stripe', 'paypal', 'bank_transfer', 'manual'],
      required: true,
    },

    // Stripe Connect
    stripe_transfer_id: {
      type: String,
      sparse: true,
      // Stripe transfer ID if paid via Stripe
    },

    stripe_account_id: {
      type: String,
      sparse: true,
      // Creator's Stripe Connected Account
    },

    // PayPal
    paypal_transaction_id: {
      type: String,
      sparse: true,
      // PayPal payout transaction ID
    },

    // Bank transfer via ACH
    bank_transfer_ref: {
      type: String,
      sparse: true,
      // Internal bank transfer reference
    },

    ach_transfer_id: {
      type: String,
      sparse: true,
      // ACH network transfer ID
    },

    // Manual payout (for admin entry)
    manual_reference: {
      type: String,
      sparse: true,
      // Admin-supplied reference for manual payouts
    },

    manual_entered_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true,
      // Admin who manually entered the payout
    },

    // Error tracking
    error_message: {
      type: String,
      sparse: true,
      // Error details if payout failed
    },

    error_code: {
      type: String,
      enum: [
        'invalid_account',
        'insufficient_balance',
        'account_restricted',
        'transfer_limit',
        'processing_error',
        'network_error',
        'invalid_amount',
        'rate_limit',
        'unknown_error',
      ],
      sparse: true,
    },

    // Retry tracking
    retry_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    next_retry_at: {
      type: Date,
      sparse: true,
      index: true,
      // When to retry if payout failed
    },

    last_error_at: {
      type: Date,
      sparse: true,
      // When the last error occurred
    },

    // Timestamps
    initiated_at: {
      type: Date,
      default: Date.now,
      index: true,
    },

    processing_started_at: {
      type: Date,
      sparse: true,
    },

    completed_at: {
      type: Date,
      sparse: true,
      index: true,
    },

    // Audit trail
    notes: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        action: {
          type: String,
          enum: ['created', 'processing', 'completed', 'failed', 'retrying', 'manual_update'],
        },
        message: String,
        updated_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          sparse: true,
        },
      },
    ],

    // Metadata
    metadata: {
      campaign_title: String,
      creator_name: String,
      creator_email: String,
      total_donations_count: Number,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    collection: 'payouts',
  }
);

// Indexes for efficient queries
payoutSchema.index({ campaign_id: 1, creator_id: 1 });
payoutSchema.index({ status: 1, initiated_at: -1 });
payoutSchema.index({ payment_method: 1, status: 1 });
payoutSchema.index({ stripe_transfer_id: 1 }, { sparse: true });
payoutSchema.index({ paypal_transaction_id: 1 }, { sparse: true });
payoutSchema.index({ next_retry_at: 1 }, { sparse: true });

// Instance methods
payoutSchema.methods.isCompleted = function () {
  return this.status === 'completed';
};

payoutSchema.methods.isFailed = function () {
  return this.status === 'failed';
};

payoutSchema.methods.isPending = function () {
  return ['initiated', 'processing', 'pending_retry'].includes(this.status);
};

payoutSchema.methods.canRetry = function () {
  return this.status === 'failed' && this.retry_count < 5;
};

payoutSchema.methods.addNote = function (action, message, userId = null) {
  this.notes.push({
    timestamp: new Date(),
    action,
    message,
    updated_by: userId,
  });
};

payoutSchema.methods.markAsProcessing = function () {
  this.status = 'processing';
  this.processing_started_at = new Date();
  this.addNote('processing', 'Payout processing initiated');
};

payoutSchema.methods.markAsCompleted = function (transactionId, processor = null) {
  this.status = 'completed';
  this.completed_at = new Date();

  if (processor === 'stripe' && transactionId) {
    this.stripe_transfer_id = transactionId;
  } else if (processor === 'paypal' && transactionId) {
    this.paypal_transaction_id = transactionId;
  } else if (processor === 'bank' && transactionId) {
    this.ach_transfer_id = transactionId;
  }

  this.addNote('completed', `Payout completed via ${processor || 'unknown'}`);
};

payoutSchema.methods.markAsFailed = function (errorMsg, errorCode = 'unknown_error') {
  this.status = 'failed';
  this.error_message = errorMsg;
  this.error_code = errorCode;
  this.last_error_at = new Date();
  this.addNote('failed', `Payout failed: ${errorMsg}`);
};

payoutSchema.methods.scheduleRetry = function (delayMinutes = 60) {
  this.status = 'pending_retry';
  this.retry_count += 1;
  this.next_retry_at = new Date(Date.now() + delayMinutes * 60 * 1000);
  this.addNote('retrying', `Retry scheduled in ${delayMinutes} minutes (attempt ${this.retry_count}/5)`);
};

// Static methods for queries
payoutSchema.statics.findPending = async function () {
  return this.find({ status: 'initiated' }).sort({ initiated_at: 1 });
};

payoutSchema.statics.findFailedForRetry = async function () {
  return this.find({
    status: 'pending_retry',
    next_retry_at: { $lte: new Date() },
  }).sort({ next_retry_at: 1 });
};

payoutSchema.statics.findByCampaign = async function (campaignId) {
  return this.findOne({ campaign_id: campaignId }).sort({ initiated_at: -1 });
};

payoutSchema.statics.findByCreator = async function (creatorId, limit = 50) {
  return this.find({ creator_id: creatorId }).sort({ initiated_at: -1 }).limit(limit);
};

// Virtual for display
payoutSchema.virtual('payout_amount_dollars').get(function () {
  return (this.payout_amount_cents / 100).toFixed(2);
});

payoutSchema.virtual('platform_fee_dollars').get(function () {
  return (this.platform_fee_cents / 100).toFixed(2);
});

payoutSchema.virtual('total_raised_dollars').get(function () {
  return (this.total_raised_cents / 100).toFixed(2);
});

payoutSchema.set('toJSON', { virtuals: true });
payoutSchema.set('toObject', { virtuals: true });

// Create model
const Payout = mongoose.model('Payout', payoutSchema);

module.exports = Payout;
