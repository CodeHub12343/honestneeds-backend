/**
 * Donation Model
 * Tracks individual donations to campaigns
 * Integrates with Stripe payment processing
 */

const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema(
  {
    donor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Donor ID required'],
      index: true,
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID required'],
      index: true,
    },
    // Amount in cents (so $10.50 = 1050)
    amount: {
      type: Number,
      required: [true, 'Amount required'],
      min: [1, 'Amount must be at least $0.01'],
    },
    payment_status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
      index: true,
    },
    stripe_payment_intent_id: {
      type: String,
      sparse: true,
      unique: true,
    },
    transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      sparse: true,
    },
    refund_id: {
      type: String,
      sparse: true,
    },
    refund_amount: {
      type: Number,
      default: 0,
    },
    payment_method_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod',
      sparse: true,
    },
    notes: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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
    timestamps: false, // We manage timestamps manually
    collection: 'donations',
  }
);

// Index for common queries
donationSchema.index({ donor_id: 1, created_at: -1 });
donationSchema.index({ campaign_id: 1, created_at: -1 });
donationSchema.index({ payment_status: 1, created_at: -1 });

// Update timestamp on save
donationSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

donationSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updated_at: new Date() });
  next();
});

module.exports = mongoose.model('Donation', donationSchema);
