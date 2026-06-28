/**
 * HopeResponderRequest Model (VO-08 Hope Responder Program — "Need Now")
 *
 * An emergency local-help request that is dispatched to nearby enrolled,
 * verified Hope Responders. A requester (any user, or a campaign creator on
 * behalf of a beneficiary) posts an urgent need with a location; matching
 * responders are notified and can accept. The first responders to accept (up to
 * `responders_needed`) fill the request; the requester confirms resolution.
 *
 * Status machine:
 *   open  →  matched (≥1 accepted)  →  resolved | expired | cancelled
 */

const mongoose = require('mongoose');
const { HOPE_RESPONDER } = require('../config/volunteerProgram');

const HopeResponderRequestSchema = new mongoose.Schema(
  {
    requester_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
    },

    title: {
      type: String,
      required: [true, 'Title is required'],
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    category: {
      type: String,
      enum: HOPE_RESPONDER.categories,
      required: [true, 'Category is required'],
      index: true,
    },
    urgency: {
      type: String,
      enum: HOPE_RESPONDER.urgency_levels,
      default: 'high',
      index: true,
    },

    // GeoJSON point [longitude, latitude].
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    address_text: { type: String, maxlength: 300, default: '' },
    city: { type: String, default: '', index: true },

    responders_needed: { type: Number, min: 1, max: 50, default: 1 },

    // Responders who accepted the dispatch.
    responders: [
      {
        volunteer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        volunteer_profile_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VolunteerProfile' },
        status: {
          type: String,
          enum: ['accepted', 'on_the_way', 'arrived', 'completed', 'withdrawn'],
          default: 'accepted',
        },
        accepted_at: { type: Date, default: Date.now },
        completed_at: { type: Date, default: null },
        _id: false,
      },
    ],

    status: {
      type: String,
      enum: ['open', 'matched', 'resolved', 'expired', 'cancelled'],
      default: 'open',
      index: true,
    },
    contact_phone: { type: String, default: '' },
    contact_method: { type: String, enum: ['phone', 'inApp', 'email'], default: 'inApp' },

    expires_at: { type: Date, default: null, index: true },
    resolved_at: { type: Date, default: null },
    resolution_note: { type: String, maxlength: 1000, default: null },

    notified_count: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

HopeResponderRequestSchema.index({ location: '2dsphere' });
HopeResponderRequestSchema.index({ status: 1, urgency: 1, created_at: -1 });
HopeResponderRequestSchema.index({ city: 1, status: 1 });

/**
 * Whether the request can still accept new responders.
 */
HopeResponderRequestSchema.methods.isAcceptingResponders = function isAcceptingResponders() {
  if (!['open', 'matched'].includes(this.status)) return false;
  if (this.expires_at && new Date() > this.expires_at) return false;
  const active = this.responders.filter((r) => r.status !== 'withdrawn').length;
  return active < this.responders_needed;
};

module.exports = mongoose.model('HopeResponderRequest', HopeResponderRequestSchema);
