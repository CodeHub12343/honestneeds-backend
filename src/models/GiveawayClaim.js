/**
 * GiveawayClaim Model (BU-07)
 *
 * One record per giveaway winner. Created when a BusinessGiveaway is drawn;
 * tracks the winner's fulfilment workflow (shipping/redemption details).
 *
 * Status machine:
 *   pending_claim  →  claimed  →  shipped | redeemed → fulfilled
 *   (pending_claim → expired if not claimed within the window)
 */

const mongoose = require('mongoose');

const CLAIM_WINDOW_DAYS = 30;

const GiveawayClaimSchema = new mongoose.Schema(
  {
    giveaway_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessGiveaway',
      required: true,
      index: true,
    },
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      required: true,
      index: true,
    },
    winner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['pending_claim', 'claimed', 'shipped', 'redeemed', 'fulfilled', 'expired'],
      default: 'pending_claim',
      index: true,
    },

    // Fulfilment details supplied by the winner on claim.
    fulfilment: {
      contact_email: { type: String, default: '' },
      contact_phone: { type: String, default: '' },
      shipping_address: { type: String, default: '' },
      notes: { type: String, maxlength: 1000, default: '' },
      _id: false,
    },

    // Tracking info supplied by the business on fulfilment.
    tracking_reference: { type: String, default: null },

    claim_deadline: {
      type: Date,
      default: () => new Date(Date.now() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    },
    claimed_at: { type: Date, default: null },
    fulfilled_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

GiveawayClaimSchema.index({ giveaway_id: 1, winner_id: 1 }, { unique: true });
GiveawayClaimSchema.index({ winner_id: 1, status: 1 });

module.exports = mongoose.model('GiveawayClaim', GiveawayClaimSchema);
module.exports.CLAIM_WINDOW_DAYS = CLAIM_WINDOW_DAYS;
