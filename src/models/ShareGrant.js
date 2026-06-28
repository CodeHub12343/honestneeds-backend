/**
 * ShareGrant Model
 *
 * Backs the "request a second/third share" flow (client rule, 2026-06).
 *
 * By default a sharer earns a tip from only ONE reward-eligible share per
 * campaign per UTC day. To share again FOR A TIP on the same day they ask the
 * campaign creator for permission and say why (e.g. "I'll post it to a different
 * platform"). Each APPROVED grant unlocks exactly one extra reward-eligible
 * share for the campaign on its `for_date`. When that extra share is actually
 * recorded, the grant is marked `consumed`.
 *
 * Free (non-reward-eligible) re-sharing never needs a grant — it is always
 * allowed (subject only to the existing per-IP rate limit).
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const shareGrantSchema = new mongoose.Schema(
  {
    request_id: {
      type: String,
      unique: true,
      index: true,
    },

    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },

    // The sharer asking for an extra reward-eligible share.
    requester_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requester ID is required'],
      index: true,
    },

    // The campaign creator who approves/denies (cached for fast inbox queries).
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator ID is required'],
      index: true,
    },

    // Why they want to share again (required — "I'll share it to other platforms").
    reason: {
      type: String,
      required: [true, 'A reason is required'],
      trim: true,
      maxlength: [1000, 'Reason cannot exceed 1000 characters'],
    },

    // Optional: the platform/channel they intend to share the extra time on.
    requested_channel: {
      type: String,
      enum: {
        values: ['email', 'facebook', 'twitter', 'instagram', 'linkedin', 'sms', 'whatsapp', 'telegram', 'reddit', 'tiktok', 'other', null],
        message: 'Invalid channel',
      },
      default: null,
    },

    status: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'denied', 'consumed', 'expired'],
        message: 'Invalid grant status',
      },
      default: 'pending',
      index: true,
    },

    // The UTC day (midnight) this extra share applies to. Set at request time to
    // "today" so a grant can't be banked indefinitely.
    for_date: {
      type: Date,
      required: true,
      index: true,
    },

    // Review trail.
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
    review_note: {
      type: String,
      default: null,
      maxlength: [500, 'Review note cannot exceed 500 characters'],
    },

    // Consumption trail — set when the granted slot is actually used by a share.
    consumed_share_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShareRecord',
      default: null,
    },
    consumed_at: {
      type: Date,
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
    collection: 'share_grants',
    timestamps: true,
  }
);

// Creator inbox: pending requests for a campaign, newest first.
shareGrantSchema.index({ campaign_id: 1, status: 1, created_at: -1 });
// Sharer's own requests.
shareGrantSchema.index({ requester_id: 1, created_at: -1 });
// Quota math: granted slots for a (campaign, requester, day).
shareGrantSchema.index({ campaign_id: 1, requester_id: 1, for_date: 1, status: 1 });

shareGrantSchema.pre('validate', function preValidate(next) {
  if (!this.request_id) {
    const year = new Date().getFullYear();
    this.request_id = `SGR-${year}-${uuidv4().substring(0, 6).toUpperCase()}`;
  }
  next();
});

const ShareGrant = mongoose.model('ShareGrant', shareGrantSchema);

module.exports = ShareGrant;
