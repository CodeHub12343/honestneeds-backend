/**
 * BusinessGiveaway Model (BU-07)
 *
 * A business donates a product or service as a giveaway prize. Users enter; one
 * or more winners are drawn. Individual winner records (with fulfilment state)
 * live in GiveawayClaim. Entries are stored inline as lightweight references
 * since they are append-only and scoped to the giveaway.
 *
 * Status machine:
 *   draft  →  active  →  drawing_complete  →  fulfilled
 *   (active → cancelled at any time)
 */

const mongoose = require('mongoose');

const GIVEAWAY_TYPES = ['product', 'service', 'voucher', 'experience'];

const BusinessGiveawaySchema = new mongoose.Schema(
  {
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      required: [true, 'Business ID is required'],
      index: true,
    },
    posted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
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
      maxlength: [3000, 'Description cannot exceed 3000 characters'],
    },
    giveaway_type: {
      type: String,
      enum: {
        values: GIVEAWAY_TYPES,
        message: '{VALUE} is not a valid giveaway type',
      },
      required: [true, 'Giveaway type is required'],
    },

    // Declared retail value of the prize (cents). Used for CSR/impact reporting.
    estimated_value_cents: {
      type: Number,
      min: [0, 'Value cannot be negative'],
      default: 0,
    },
    image_url: { type: String, default: '' },
    image_public_id: { type: String, default: '' },

    winners_count: {
      type: Number,
      min: [1, 'At least one winner is required'],
      default: 1,
    },

    // ── Eligibility / timing ────────────────────────────────────
    entry_requirement: {
      type: String,
      enum: ['none', 'donor', 'verified_user'],
      default: 'none',
    },
    starts_at: { type: Date, default: Date.now },
    ends_at: {
      type: Date,
      required: [true, 'End date is required'],
      index: true,
    },

    status: {
      type: String,
      enum: ['draft', 'active', 'drawing_complete', 'fulfilled', 'cancelled'],
      default: 'draft',
      index: true,
    },

    // Append-only entries. Kept inline (one entry per user enforced in service).
    entries: [
      {
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        entered_at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    entries_count: { type: Number, default: 0, index: true },

    drawn_at: { type: Date, default: null },

    deleted_at: { type: Date, default: null, index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

BusinessGiveawaySchema.index({ status: 1, ends_at: 1 });
BusinessGiveawaySchema.index({ business_id: 1, status: 1 });

/**
 * Whether the giveaway is currently open for entries.
 */
BusinessGiveawaySchema.methods.isOpenForEntry = function isOpenForEntry() {
  if (this.deleted_at) return false;
  if (this.status !== 'active') return false;
  const now = new Date();
  if (this.starts_at && now < this.starts_at) return false;
  if (this.ends_at && now > this.ends_at) return false;
  return true;
};

/**
 * Public view excludes the raw entrant list (privacy) but keeps the count.
 */
BusinessGiveawaySchema.methods.getPublicView = function getPublicView() {
  const obj = this.toObject();
  return {
    id: this._id.toString(),
    business_id: this.business_id?._id?.toString?.() || this.business_id?.toString?.() || this.business_id,
    title: this.title,
    description: this.description,
    giveaway_type: this.giveaway_type,
    estimated_value_cents: this.estimated_value_cents,
    image_url: this.image_url,
    winners_count: this.winners_count,
    entry_requirement: this.entry_requirement,
    starts_at: this.starts_at,
    ends_at: this.ends_at,
    status: this.status,
    entries_count: this.entries_count,
    drawn_at: this.drawn_at,
    created_at: this.created_at,
    // Present only when business_id was populated (browse / detail views).
    business: obj.business_id && obj.business_id.business_name ? obj.business_id : undefined,
  };
};

module.exports = mongoose.model('BusinessGiveaway', BusinessGiveawaySchema);
module.exports.GIVEAWAY_TYPES = GIVEAWAY_TYPES;
