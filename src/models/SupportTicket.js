/**
 * SupportTicket + SupportMessage — TASK-9.3.
 *
 * Status machine: open → pending → resolved → closed.
 *   - `open`     — new or re-opened; waiting on staff.
 *   - `pending`  — staff replied; waiting on user response.
 *   - `resolved` — staff believes it's done; user has 7d to re-open.
 *   - `closed`   — terminal; a new issue requires a new ticket.
 *
 * One-open-per-user: enforced with a partial unique index on
 * (user_id, status) over the open+pending statuses. Users with a ticket
 * already in play are told to reply on it instead of opening a second — the
 * alternative is a queue flooded with duplicates.
 *
 * Attachments: cap 5 per ticket (stored as public_id references, see
 * cloudinary uploader). Larger evidence goes in follow-up messages.
 */

const mongoose = require('mongoose');

const STATUSES = ['open', 'pending', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const CATEGORIES = [
  'account',
  'payment',
  'campaign',
  'volunteer',
  'veterans',
  'trust_safety',
  'bug',
  'other',
];

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, maxlength: 600 },
    public_id: { type: String, default: null },
    mime: { type: String, default: null },
    size_bytes: { type: Number, default: null },
  },
  { _id: false }
);

const supportTicketSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, maxlength: 140, trim: true },
    category: { type: String, enum: CATEGORIES, default: 'other', index: true },
    priority: { type: String, enum: PRIORITIES, default: 'normal', index: true },

    status: { type: String, enum: STATUSES, default: 'open', required: true, index: true },

    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    attachments: {
      type: [attachmentSchema],
      default: [],
      validate: {
        validator: (v) => !v || v.length <= 5,
        message: 'Up to 5 attachments per ticket',
      },
    },

    first_response_at: { type: Date, default: null },
    resolved_at: { type: Date, default: null },
    closed_at: { type: Date, default: null },
    closed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Normalised for feed queries ("staff queue — oldest unanswered first")
    last_user_message_at: { type: Date, default: null, index: true },
    last_staff_message_at: { type: Date, default: null },

    // Internal note the user never sees (staff-only triage context).
    internal_notes: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// One-open-per-user. The partial filter keeps resolved/closed rows out so
// a user can always open a new ticket after one closes.
supportTicketSchema.index(
  { user_id: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['open', 'pending'] } },
    name: 'one_open_per_user',
  }
);
supportTicketSchema.index({ status: 1, last_user_message_at: 1 });

supportTicketSchema.statics.STATUSES = STATUSES;
supportTicketSchema.statics.PRIORITIES = PRIORITIES;
supportTicketSchema.statics.CATEGORIES = CATEGORIES;

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

// ── Messages ──────────────────────────────────────────────────────────────

const supportMessageSchema = new mongoose.Schema(
  {
    ticket_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SupportTicket',
      required: true,
      index: true,
    },
    author_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    author_role: {
      type: String,
      enum: ['user', 'staff'],
      required: true,
    },

    body: { type: String, required: true, maxlength: 10_000 },

    attachments: {
      type: [attachmentSchema],
      default: [],
      validate: { validator: (v) => !v || v.length <= 5, message: 'Up to 5 attachments per message' },
    },

    // Set when the message came from an AI draft the staff member accepted
    // and sent. For audit — see TASK-9.5.
    ai_drafted: { type: Boolean, default: false },

    // Internal messages are visible to staff only.
    internal: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

supportMessageSchema.index({ ticket_id: 1, created_at: 1 });

const SupportMessage = mongoose.model('SupportMessage', supportMessageSchema);

module.exports = SupportTicket;
module.exports.SupportTicket = SupportTicket;
module.exports.SupportMessage = SupportMessage;
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
module.exports.CATEGORIES = CATEGORIES;
