/**
 * AIConversation Model (AI-01 AI Responder)
 *
 * A persistent chat session between a user and HonestNeed's AI Responder — the
 * "campaign advisor" guide reachable from the platform's bottom navigation.
 *
 * Each document is one session and embeds its message turns. Sessions are kept
 * per user so the Responder can show a user their recent history (the PRD asks
 * for the last 10 sessions). When the AI cannot resolve a request the session is
 * flagged for human handoff. After a session a user may leave a satisfaction
 * rating, feeding the AI-01 success metrics.
 */

const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

/**
 * A single turn in the conversation. Assistant turns also carry the structured
 * extras the Responder returns: suggested follow-up questions, in-app action
 * links, and whether the model decided a human is needed.
 */
const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 8000,
    },
    // Assistant-only: suggested follow-up questions surfaced as quick replies.
    suggestions: {
      type: [String],
      default: undefined,
    },
    // Assistant-only: deep links into the app the user can take next.
    action_links: {
      type: [
        {
          _id: false,
          label: { type: String },
          href: { type: String },
          description: { type: String, default: null },
        },
      ],
      default: undefined,
    },
    // Assistant-only: the model judged it could not resolve this on its own.
    needs_human: {
      type: Boolean,
      default: undefined,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const aiConversationSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: String,
      unique: true,
      index: true,
    },

    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Short human-readable label, derived from the first user message.
    title: {
      type: String,
      maxlength: 120,
      default: 'New conversation',
    },

    status: {
      type: String,
      enum: ['active', 'handoff_requested', 'resolved', 'closed'],
      default: 'active',
      index: true,
    },

    messages: {
      type: [messageSchema],
      default: [],
    },

    message_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    last_message_at: {
      type: Date,
      default: null,
      index: true,
    },

    // Snapshot of the app context at the most recent turn (current page, role,
    // campaign in view, etc.) — useful for support follow-up and analytics.
    last_context: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Human handoff state (set when the AI cannot resolve the request).
    handoff: {
      requested: { type: Boolean, default: false },
      requested_at: { type: Date, default: null },
      reason: { type: String, default: null },
      resolved: { type: Boolean, default: false },
      resolved_at: { type: Date, default: null },
    },

    // Post-session satisfaction (AI-01 success metric: rating > 4.2/5).
    satisfaction: {
      rating: { type: Number, min: 1, max: 5, default: null },
      feedback: { type: String, maxlength: 2000, default: null },
      rated_at: { type: Date, default: null },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// List a user's recent sessions fast.
aiConversationSchema.index({ user_id: 1, last_message_at: -1 });
aiConversationSchema.index({ status: 1, 'handoff.resolved': 1 });

aiConversationSchema.pre('validate', function preValidate(next) {
  if (!this.conversation_id) {
    this.conversation_id = `AICONV-${nanoid(16)}`;
  }
  next();
});

/**
 * Append a turn and keep the denormalized counters in sync.
 * @param {Object} msg - { role, content, suggestions?, action_links?, needs_human? }
 * @returns {this}
 */
aiConversationSchema.methods.addMessage = function addMessage(msg) {
  this.messages.push({ ...msg, created_at: new Date() });
  this.message_count = this.messages.length;
  this.last_message_at = new Date();
  // Title the session from the first user message.
  if (msg.role === 'user' && (this.title === 'New conversation' || !this.title)) {
    this.title = msg.content.slice(0, 117).trim() + (msg.content.length > 117 ? '…' : '');
  }
  return this;
};

/**
 * Whether the given user owns this conversation.
 * @param {string} userId
 * @returns {boolean}
 */
aiConversationSchema.methods.isOwnedBy = function isOwnedBy(userId) {
  return this.user_id.toString() === userId.toString();
};

/**
 * Recent sessions for a user (most recent first), capped at `limit`.
 * @param {string} userId
 * @param {number} [limit=10]
 * @returns {Promise<Array>}
 */
aiConversationSchema.statics.listRecentForUser = function listRecentForUser(userId, limit = 10) {
  return this.find({ user_id: userId })
    .sort({ last_message_at: -1, created_at: -1 })
    .limit(Math.min(limit, 50))
    .lean();
};

module.exports = mongoose.model('AIConversation', aiConversationSchema);
