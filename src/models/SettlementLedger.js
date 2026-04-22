const mongoose = require('mongoose');

/**
 * Settlement Ledger Schema
 * Tracks all fee settlements and payouts
 */
const settlementLedgerSchema = new mongoose.Schema({
  period: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}$/,
    index: true
  },
  
  settled_by_admin_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    index: true
  },
  
  // Settlement amounts (in cents)
  total_fees_cents: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Stats
  fee_count: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Metadata
  reason: {
    type: String,
    default: 'Manual settlement'
  },
  
  // Settlement status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed',
    index: true
  },
  
  // Payout details (for future automation)
  payout_method: {
    type: String,
    enum: ['manual', 'stripe', 'bank_transfer', 'other'],
    default: 'manual'
  },
  
  payout_details: {
    account_id: String,
    reference_number: String,
    bank_account: String
  },
  
  // Verification
  verified_at: Date,
  verified_by: mongoose.Schema.Types.ObjectId,
  
  // Ledger entries for this settlement
  ledger_entries: [{
    timestamp: Date,
    action: String,
    amount_cents: Number,
    description: String,
    notes: String
  }],
  
  // Timestamps
  settled_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Indexes
settlementLedgerSchema.index({ settled_by_admin_id: 1, settled_at: -1 });
settlementLedgerSchema.index({ status: 1, settled_at: -1 });

// Virtual getters
settlementLedgerSchema.virtual('total_fees_dollars').get(function() {
  return (this.total_fees_cents / 100).toFixed(2);
});

// Methods
settlementLedgerSchema.methods.recordLedgerEntry = async function(entryData) {
  this.ledger_entries.push({
    timestamp: new Date(),
    action: entryData.action,
    amount_cents: entryData.amount_cents,
    description: entryData.description,
    notes: entryData.notes
  });
  return this.save();
};

settlementLedgerSchema.methods.markVerified = async function(adminId) {
  this.verified_at = new Date();
  this.verified_by = adminId;
  return this.save();
};

// Pre-save middleware to ensure ledger entry on settlement
settlementLedgerSchema.pre('save', async function(next) {
  if (this.isNew && this.status === 'completed') {
    if (this.ledger_entries.length === 0) {
      this.ledger_entries.push({
        timestamp: new Date(),
        action: 'settlement_initiated',
        amount_cents: this.total_fees_cents,
        description: `Settlement for period ${this.period}`,
        notes: this.reason
      });
    }
  }
  next();
});

const SettlementLedger = mongoose.model('SettlementLedger', settlementLedgerSchema);

module.exports = SettlementLedger;
