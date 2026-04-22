/**
 * Wallet Model
 * Stores user wallet balances including available, pending, and reserved funds
 * All amounts are stored in cents to avoid floating point issues
 */

const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
      index: true,
    },
    // Total balance in wallet (cents)
    balance_cents: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Available for withdrawal (cents)
    available_cents: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Pending from recent donations/earnings (cents)
    pending_cents: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Reserved for active campaigns or holds (cents)
    reserved_cents: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Lifetime earnings (cents)
    total_earned_cents: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Total amount withdrawn (cents)
    total_withdrawn_cents: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Currency
    currency: {
      type: String,
      default: 'USD',
    },
    // Last transaction timestamp
    last_transaction_at: {
      type: Date,
      default: null,
    },
    // Last updated timestamp
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Index for quick lookups
walletSchema.index({ user_id: 1 });

// Pre-save middleware to validate balance consistency
walletSchema.pre('save', function (next) {
  // balance_cents should equal: available + pending + reserved
  const calculatedBalance = this.available_cents + this.pending_cents + this.reserved_cents;
  if (calculatedBalance !== this.balance_cents) {
    this.balance_cents = calculatedBalance;
  }
  next();
});

module.exports = mongoose.model('Wallet', walletSchema);
