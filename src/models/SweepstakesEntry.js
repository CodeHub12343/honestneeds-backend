/**
 * Sweepstakes Entry Model
 * Tracks sweepstakes entries created from donations
 * 
 * Each $1 donated = 1 sweepstakes entry
 * Used for random drawing to award prizes
 */

const mongoose = require('mongoose');

const sweepstakesEntrySchema = new mongoose.Schema(
  {
    // Identifiers
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
    transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: [true, 'Transaction ID required'],
      unique: true, // One entry record per transaction
      index: true,
    },
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator ID required'],
      index: true,
    },

    // Entry details
    entries_count: {
      type: Number,
      required: [true, 'Entries count required'],
      min: [1, 'Must have at least 1 entry'],
      description: 'Total entries ($1 = 1 entry). $50 donation = 50 entries',
    },
    donation_amount_cents: {
      type: Number,
      required: [true, 'Donation amount required'],
      min: [100, 'Minimum donation $1.00 (100 cents)'],
    },

    // Status tracking
    status: {
      type: String,
      enum: ['active', 'won', 'expired', 'claimed', 'partial_claim'],
      default: 'active',
      index: true,
      description: 'active: In current drawing, won: Selected in drawing, claimed: Prize claimed',
    },

    // Drawing information (if won)
    drawing_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SweepstakesDrawing',
      sparse: true,
    },
    is_winner: {
      type: Boolean,
      default: false,
      index: true,
    },
    winning_entries: {
      type: Number,
      default: 0,
      description: 'Number of entries that won (if partial win)',
    },
    prize_amount_cents: {
      type: Number,
      default: 0,
    },
    won_at: Date,
    claimed_at: Date,

    // Fraud detection
    ip_address: String,
    user_agent: String,
    fraud_check_status: {
      type: String,
      enum: ['pending', 'passed', 'flagged', 'rejected'],
      default: 'pending',
    },
    fraud_score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    // Audit trail
    notes: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        action: String,
        detail: String,
      },
    ],

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
    collection: 'sweepstakes_entries',
    timestamps: false,
  }
);

// Create compound indexes for common queries
sweepstakesEntrySchema.index(
  { campaign_id: 1, status: 1 },
  { name: 'campaign_status_idx' }
);
sweepstakesEntrySchema.index(
  { supporter_id: 1, created_at: -1 },
  { name: 'supporter_date_idx' }
);
sweepstakesEntrySchema.index(
  { is_winner: 1, campaign_id: 1 },
  { name: 'winner_campaign_idx' }
);

module.exports = mongoose.model('SweepstakesEntry', sweepstakesEntrySchema);
