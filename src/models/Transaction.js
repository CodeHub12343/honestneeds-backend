/**
 * Transaction Model
 * Stores donation and transaction records with verification status
 */

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    transaction_id: {
      type: String,
      unique: true,
      sparse: true,
      // Format: TRANS-YYYY-MM-DD-XXXXX
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID required'],
      index: true,
    },
    supporter_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Supporter ID required'],
      index: true,
    },
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator ID required'],
    },
    transaction_type: {
      type: String,
      enum: ['donation', 'share_reward', 'referral_reward'],
      default: 'donation',
    },
    // Amount in cents (so $10.50 = 1050)
    amount_cents: {
      type: Number,
      required: [true, 'Amount required'],
      min: [1, 'Amount must be at least $0.01'],
      max: [1000000, 'Amount cannot exceed $10,000'],
    },
    // Fee calculation
    platform_fee_cents: {
      type: Number,
      required: true,
      // Calculated as 20% of amount
    },
    net_amount_cents: {
      type: Number,
      required: true,
      // amount - platform_fee
    },
    payment_method: {
      type: String,
      enum: ['paypal', 'stripe', 'bank_transfer', 'credit_card', 'check', 'money_order', 'venmo'],
      required: true,
    },
    // Transaction status
    status: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'refunded', 'pending_hold', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    // Optional proof (screenshot, payment confirmation URL)
    proof_url: {
      type: String,
      validate: {
        validator: function (val) {
          if (!val) return true;
          return /^https?:\/\/.+/.test(val);
        },
        message: 'Proof URL must be a valid HTTP(S) URL',
      },
    },
    // Admin verification
    verified_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verified_at: Date,
    // Rejection details
    rejection_reason: String,
    rejected_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    rejected_at: Date,
    // Hold period details (for share rewards)
    hold_until_date: {
      type: Date,
      default: null,
      index: true,
      sparse: true,
    },
    hold_reason: {
      type: String,
      enum: ['share_reward_fraud_protection', 'chargeback_protection', 'manual_hold'],
      default: null,
    },
    approved_at: Date,
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    hold_fraud_check_result: {
      type: String,
      enum: ['passed', 'flagged', 'rejected'],
      default: null,
    },
    hold_fraud_reason: String,
    // Refund details
    refund_reason: String,
    refunded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    refunded_at: Date,
    // Audit trail
    notes: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        action: String,
        performed_by: mongoose.Schema.Types.ObjectId,
        detail: String,
      },
    ],
    // Sweepstakes
    sweepstakes_entries_awarded: {
      type: Number,
      default: 0,
    },
    // ✅ ADDED: Sweepstakes entries created from this donation
    sweepstakes_entries_created: {
      type: Number,
      default: 0,
      min: 0,
      description: 'Number of sweepstakes entries created ($1 = 1 entry)',
    },
    // ✅ ADDED: Idempotency key for preventing duplicate donations
    idempotency_key: {
      type: String,
      unique: true,
      sparse: true, // Allow null for existing transactions
      index: true,
      description: 'Unique key for preventing duplicate donations on retry',
    },
    // IP and user agent for fraud detection
    ip_address: String,
    user_agent: String,
    // Timestamps
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
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'transactions',
  }
);

// Indexes for common queries
transactionSchema.index({ campaign_id: 1, status: 1 });
transactionSchema.index({ supporter_id: 1, created_at: -1 });
transactionSchema.index({ creator_id: 1, created_at: -1 });
transactionSchema.index({ status: 1, created_at: -1 });
transactionSchema.index({ created_at: -1 });
// ✅ ADDED: Index for idempotency key lookup
transactionSchema.index(
  { idempotency_key: 1 },
  { unique: true, sparse: true, name: 'idempotency_key_idx' }
);
// Index for hold processing job efficiency
transactionSchema.index({ status: 1, hold_until_date: 1 });
transactionSchema.index({ hold_until_date: 1, status: 1 });

// Generate transaction_id before saving
transactionSchema.pre('save', async function (next) {
  if (!this.transaction_id) {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    this.transaction_id = `TRANS-${dateStr}-${random}`;
  }
  next();
});

// Virtual for getter methods
transactionSchema.virtual('amount_dollars').get(function () {
  return this.amount_cents / 100;
});

transactionSchema.virtual('platform_fee_dollars').get(function () {
  return this.platform_fee_cents / 100;
});

transactionSchema.virtual('net_amount_dollars').get(function () {
  return this.net_amount_cents / 100;
});

// Method to add note to audit trail
transactionSchema.methods.addNote = function (action, detail, performedBy) {
  this.notes.push({
    action,
    detail,
    performed_by: performedBy,
  });
  return this;
};

// Method to verify transaction
transactionSchema.methods.verify = function (adminId) {
  this.status = 'verified';
  this.verified_by = adminId;
  this.verified_at = new Date();
  this.addNote('verified', 'Transaction verified by admin', adminId);
  return this;
};

// Method to reject transaction
transactionSchema.methods.reject = function (adminId, reason) {
  this.status = 'failed';
  this.rejected_by = adminId;
  this.rejected_at = new Date();
  this.rejection_reason = reason;
  this.addNote('rejected', `Rejection reason: ${reason}`, adminId);
  return this;
};

// Method to refund transaction
transactionSchema.methods.refund = function (adminId, reason) {
  this.status = 'refunded';
  this.refunded_by = adminId;
  this.refunded_at = new Date();
  this.refund_reason = reason;
  this.addNote('refunded', `Refund reason: ${reason}`, adminId);
  return this;
};

// Lean query helper - REMOVED (Mongoose provides this by default)
// transactionSchema.query.lean = function () {
//   return this.lean();
// };

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
