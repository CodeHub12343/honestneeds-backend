/**
 * Share Withdrawal Model
 * Tracks withdrawal requests and payment processing for share earnings
 */

const mongoose = require('mongoose');

const shareWithdrawalSchema = new mongoose.Schema(
  {
    // Identifiers
    withdrawal_id: {
      type: String,
      required: [true, 'Withdrawal ID is required'],
      unique: true,
      index: true,
    },

    // Relationships
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    // Campaign-specific withdrawal breakdown
    // Tracks which earnings from which campaigns are being withdrawn
    campaign_withdrawals: {
      type: [
        {
          campaign_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Campaign',
            required: true,
          },
          amount_cents: {
            type: Number,
            required: true,
            min: 0,
          },
        }
      ],
      default: [],
      validate: {
        validator: function(v) {
          // If campaign_withdrawals is provided, must have at least one entry
          return v.length > 0;
        },
        message: 'Campaign withdrawals must have at least one campaign',
      },
    },

    // Amount information (in cents)
    amount_requested: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 100, // Minimum $1
    },

    processing_fee: {
      type: Number, // Fee deducted from withdrawal
      default: 0,
      min: 0,
    },

    amount_paid: {
      type: Number, // Amount actually sent to user (after fees)
      default: 0,
      min: 0,
    },

    // Payment method
    payment_method_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod',
    },

    payment_type: {
      type: String,
      enum: {
        values: ['bank_transfer', 'mobile_money', 'stripe', 'paypal'],
        message: 'Invalid payment type',
      },
      required: true,
      index: true,
    },

    // Payment details (masked)
    payment_details: {
      last4: String, // Last 4 digits of account
      accountHolder: String,
      accountType: String, // checking, savings, mobile_wallet, etc.
    },

    // Status
    status: {
      type: String,
      enum: {
        values: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        message: 'Invalid withdrawal status',
      },
      default: 'pending',
      index: true,
    },

    // Transaction tracking
    transaction_id: {
      type: String,
      index: true,
      sparse: true,
    },

    // Metadata
    requested_at: {
      type: Date,
      default: Date.now,
      index: true,
    },

    processed_at: {
      type: Date,
      index: true,
    },

    completed_at: {
      type: Date,
      index: true,
    },

    // Failure information
    failure_reason: {
      type: String,
      default: null,
    },

    retry_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    last_retry_at: {
      type: Date,
    },

    // Admin notes
    admin_notes: {
      type: String,
      default: null,
    },

    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },

    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'share_withdrawals',
    timestamps: true,
  }
);

// Indexes
shareWithdrawalSchema.index({ user_id: 1, created_at: -1 }); // User's withdrawal history
shareWithdrawalSchema.index({ status: 1, created_at: -1 }); // Processing - find pending withdrawals
shareWithdrawalSchema.index({ requested_at: 1, status: 1 }); // For batch processing

// Methods
shareWithdrawalSchema.methods.markProcessing = function () {
  this.status = 'processing';
  this.processed_at = new Date();
};

shareWithdrawalSchema.methods.markCompleted = function (transactionId) {
  this.status = 'completed';
  this.completed_at = new Date();
  this.transaction_id = transactionId;
};

shareWithdrawalSchema.methods.markFailed = function (reason) {
  this.status = 'failed';
  this.failure_reason = reason;
  this.retry_count += 1;
  this.last_retry_at = new Date();
};

shareWithdrawalSchema.methods.recordRetry = function () {
  this.retry_count += 1;
  this.last_retry_at = new Date();
};

// Statics
shareWithdrawalSchema.statics.getUserWithdrawals = function (userId) {
  return this.find({ user_id: userId }).sort({ requested_at: -1 });
};

shareWithdrawalSchema.statics.getPendingWithdrawals = function () {
  return this.find({ status: 'pending' }).sort({ requested_at: 1 });
};

shareWithdrawalSchema.statics.getFailedWithdrawals = function (maxRetries = 3) {
  return this.find({
    status: 'failed',
    retry_count: { $lt: maxRetries },
  }).sort({ last_retry_at: 1 });
};

module.exports = mongoose.model('ShareWithdrawal', shareWithdrawalSchema);
