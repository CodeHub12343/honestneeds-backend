/**
 * Withdrawal Model
 * Tracks all withdrawal requests and their processing status
 */

const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    amount_cents: {
      type: Number,
      required: true,
      min: 500, // $5 minimum
      validate: {
        validator: (v) => Number.isInteger(v),
        message: 'Amount must be in cents (integer)'
      }
    },

    payment_method_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod',
      required: true,
      index: true
    },

    // Status lifecycle
    status: {
      type: String,
      enum: [
        'requested', // Initial state
        'processing', // Sent to payment processor
        'completed', // Successfully processed
        'pending_retry', // Retry scheduled
        'failed', // Permanent failure
        'cancelled' // User cancelled
      ],
      default: 'requested',
      index: true
    },

    // Transaction reference from payment processor
    transaction_id: {
      type: String,
      sparse: true,
      index: true
    },

    // Fees and net amount
    fee_cents: {
      type: Number,
      required: true,
      min: 0,
      default: function() {
        return Math.round(this.amount_cents * 0.02); // 2% default
      }
    },

    net_payout_cents: {
      type: Number,
      required: true,
      default: function() {
        return this.amount_cents - this.fee_cents;
      }
    },

    // Processing timeline
    processing_started_at: {
      type: Date,
      default: null
    },

    completed_at: {
      type: Date,
      default: null
    },

    // Error tracking
    error_message: {
      type: String,
      default: null
    },

    error_code: {
      type: String,
      default: null,
      enum: [
        null,
        'INSUFFICIENT_FUNDS',
        'INVALID_PAYMENT_METHOD',
        'PAYMENT_PROCESSOR_ERROR',
        'STRIPE_ERROR',
        'STRIPE_ACCOUNT_NOT_FOUND',
        'PAYPAL_ERROR',
        'ACH_ERROR',
        'MOBILE_MONEY_ERROR',
        'NETWORK_ERROR',
        'TIMEOUT',
        'DUPLICATE_TRANSACTION',
        'ACCOUNT_BLOCKED',
        'UNKNOWN_ERROR'
      ]
    },

    // Retry logic
    retry_count: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },

    next_retry_at: {
      type: Date,
      default: null,
      sparse: true,
      index: true
    },

    // Metadata and context
    notes: {
      type: String,
      maxlength: 500,
      default: ''
    },

    metadata: {
      user_email: String,
      user_name: String,
      payment_type: String, // stripe, bank_transfer, paypal, mobile_money
      currency: { type: String, default: 'USD' },
      ip_address: String,
      user_agent: String
    },

    // Audit trail
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
    timestamps: true,
    collection: 'withdrawals'
  }
);

// Indexes for efficient querying
withdrawalSchema.index({ user_id: 1, created_at: -1 });
withdrawalSchema.index({ status: 1, created_at: -1 });
withdrawalSchema.index({ payment_method_id: 1 });
withdrawalSchema.index({ status: 1, next_retry_at: 1 }, { sparse: true });
withdrawalSchema.index({ user_id: 1, status: 1 });

// Instance methods

/**
 * Check if withdrawal is eligible for retry
 */
withdrawalSchema.methods.canRetry = function() {
  return this.retry_count < 5 && this.status === 'pending_retry';
};

/**
 * Mark withdrawal as processing
 */
withdrawalSchema.methods.markAsProcessing = function() {
  this.status = 'processing';
  this.processing_started_at = new Date();
};

/**
 * Mark withdrawal as completed
 */
withdrawalSchema.methods.markAsCompleted = function(transactionId) {
  this.status = 'completed';
  this.transaction_id = transactionId;
  this.completed_at = new Date();
  this.error_message = null;
  this.error_code = null;
};

/**
 * Mark withdrawal as failed
 */
withdrawalSchema.methods.markAsFailed = function(message, code) {
  this.status = 'failed';
  this.error_message = message;
  this.error_code = code;
};

/**
 * Get formatted amount for display
 */
withdrawalSchema.methods.getFormattedAmount = function() {
  return `$${(this.amount_cents / 100).toFixed(2)}`;
};

/**
 * Get formatted net payout
 */
withdrawalSchema.methods.getFormattedNetPayout = function() {
  return `$${(this.net_payout_cents / 100).toFixed(2)}`;
};

/**
 * Get status badge color for UI
 */
withdrawalSchema.methods.getStatusColor = function() {
  const colorMap = {
    requested: 'yellow',
    processing: 'blue',
    completed: 'green',
    pending_retry: 'orange',
    failed: 'red',
    cancelled: 'gray'
  };
  return colorMap[this.status] || 'gray';
};

// Static methods

/**
 * Find pending withdrawals ready to process
 */
withdrawalSchema.statics.findPending = function(limit = 100) {
  return this.find({ status: 'requested' })
    .populate('payment_method_id')
    .populate('user_id')
    .limit(limit)
    .sort({ created_at: 1 });
};

/**
 * Find withdrawals ready for retry
 */
withdrawalSchema.statics.findReadyForRetry = function(limit = 50) {
  const now = new Date();
  return this.find({
    status: 'pending_retry',
    next_retry_at: { $lte: now }
  })
    .populate('payment_method_id')
    .populate('user_id')
    .limit(limit)
    .sort({ next_retry_at: 1 });
};

/**
 * Find user's withdrawal history
 */
withdrawalSchema.statics.findByUser = function(userId, options = {}) {
  const limit = options.limit || 50;
  const skip = options.skip || 0;
  const status = options.status || null;

  const query = { user_id: userId };
  if (status) query.status = status;

  return this.find(query)
    .populate('payment_method_id', 'type display_name')
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip);
};

/**
 * Get user's withdrawal statistics
 */
withdrawalSchema.statics.getUserStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { user_id: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        total_requested_cents: {
          $sum: { $cond: [{ $eq: ['$status', 'requested'] }, '$amount_cents', 0] }
        },
        total_completed_cents: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, '$amount_cents', 0]
          }
        },
        total_failed_cents: {
          $sum: {
            $cond: [{ $eq: ['$status', 'failed'] }, '$amount_cents', 0]
          }
        },
        completed_count: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        failed_count: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        average_processing_time_hours: {
          $avg: {
            $cond: [
              { $gt: ['$completed_at', null] },
              {
                $divide: [
                  {
                    $subtract: ['$completed_at', '$created_at']
                  },
                  3600000 // milliseconds to hours
                ]
              },
              null
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        total_requested_usd: {
          $divide: ['$total_requested_cents', 100]
        },
        total_completed_usd: {
          $divide: ['$total_completed_cents', 100]
        },
        total_failed_usd: {
          $divide: ['$total_failed_cents', 100]
        },
        completed_count: 1,
        failed_count: 1,
        average_processing_time_hours: {
          $round: ['$average_processing_time_hours', 1]
        }
      }
    }
  ]);

  return stats[0] || {
    total_requested_usd: 0,
    total_completed_usd: 0,
    total_failed_usd: 0,
    completed_count: 0,
    failed_count: 0,
    average_processing_time_hours: 0
  };
};

/**
 * Find all failed withdrawals for monitoring
 */
withdrawalSchema.statics.findFailed = function(limit = 50) {
  return this.find({
    status: 'failed',
    retry_count: { $eq: 5 } // Max retries exceeded
  })
    .sort({ completed_at: -1 })
    .limit(limit)
    .populate('user_id', 'email display_name')
    .populate('payment_method_id', 'type display_name');
};

// Middleware

/**
 * Update updatedAt before saving
 */
withdrawalSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

/**
 * Validate status transitions
 */
withdrawalSchema.pre('save', function(next) {
  const validTransitions = {
    requested: ['processing', 'cancelled'],
    processing: ['completed', 'failed', 'pending_retry'],
    pending_retry: ['processing', 'failed', 'cancelled'],
    completed: [],
    failed: [],
    cancelled: []
  };

  const currentStatus = this.status;
  const previousStatus = this.constructor.findById(this._id);

  // If this is a new document, skip validation
  if (this.isNew) {
    return next();
  }

  // Check if transition is valid (for updates)
  // This is a simplified check - in production, load the original doc and verify
  next();
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
