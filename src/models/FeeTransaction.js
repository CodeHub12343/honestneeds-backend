const mongoose = require('mongoose');

/**
 * Fee Transaction Schema
 * Tracks all platform fees collected from donations
 */
const feeTransactionSchema = new mongoose.Schema({
  transaction_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Transaction',
    unique: true,
    index: true
  },
  campaign_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Campaign',
    index: true
  },
  
  // Amount tracking (in cents)
  gross_amount_cents: {
    type: Number,
    required: true,
    min: 1
  },
  platform_fee_cents: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'verified', 'unverified', 'settled', 'refunded'],
    default: 'pending',
    index: true
  },
  
  // Settlement tracking
  settled_at: {
    type: Date,
    default: null
  },
  settlement_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SettlementLedger',
    default: null
  },
  
  // Verification info
  verified_at: {
    type: Date,
    default: null
  },
  verified_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Refund info
  refund_reason: String,
  refunded_at: Date,
  refunded_by: mongoose.Schema.Types.ObjectId,
  
  // Audit trail
  notes: [{
    timestamp: Date,
    action: String,
    detail: String,
    performed_by: mongoose.Schema.Types.ObjectId
  }],
  
  // Timestamps
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
feeTransactionSchema.index({ campaign_id: 1, status: 1 });
feeTransactionSchema.index({ settlement_id: 1 });
feeTransactionSchema.index({ created_at: -1 });

// Virtual getters for dollars
feeTransactionSchema.virtual('gross_amount_dollars').get(function() {
  return this.gross_amount_cents / 100;
});

feeTransactionSchema.virtual('platform_fee_dollars').get(function() {
  return this.platform_fee_cents / 100;
});

// Methods
feeTransactionSchema.methods.markVerified = function(adminId) {
  this.status = 'verified';
  this.verified_at = new Date();
  this.verified_by = adminId;
  this.notes.push({
    timestamp: new Date(),
    action: 'verified',
    performed_by: adminId
  });
};

feeTransactionSchema.methods.markSettled = function(settlementId) {
  this.status = 'settled';
  this.settled_at = new Date();
  this.settlement_id = settlementId;
  this.notes.push({
    timestamp: new Date(),
    action: 'settled'
  });
};

feeTransactionSchema.methods.addNote = function(action, detail, performedBy) {
  this.notes.push({
    timestamp: new Date(),
    action,
    detail,
    performed_by: performedBy
  });
};

const FeeTransaction = mongoose.model('FeeTransaction', feeTransactionSchema);

module.exports = FeeTransaction;
