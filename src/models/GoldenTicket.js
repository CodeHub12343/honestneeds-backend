/**
 * GoldenTicket (RG-10 Golden Ticket Drops)
 *
 * A record of a random reward a user won. Created when a "roll" hits (see
 * GamificationService.rollGoldenTicket). Tracks redemption so prizes that need
 * fulfilment (credits, boosts) can be claimed exactly once.
 */

const mongoose = require('mongoose');

const goldenTicketSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    prize_code: { type: String, required: true },
    prize_label: { type: String, required: true },
    // 'xp' | 'multiplier' | 'badge' | 'credit'
    prize_type: { type: String, required: true },
    prize_value: { type: mongoose.Schema.Types.Mixed, default: null },
    duration_hours: { type: Number, default: null }, // for multiplier prizes
    // What the user was doing when the ticket dropped (audit/context).
    source_action: { type: String, default: null },
    redeemed: { type: Boolean, default: false, index: true },
    redeemed_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

module.exports = mongoose.model('GoldenTicket', goldenTicketSchema);
