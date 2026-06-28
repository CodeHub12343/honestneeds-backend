/**
 * Conversation Model
 * Represents a direct 1:1 messaging thread between two users.
 *
 * Powers the platform's direct messaging features:
 *  - MS-01 Supporter-to-Creator Messaging  (context_type: 'campaign')
 *  - MS-07 Volunteer Coordination Messaging (context_type: 'volunteer')
 *  - MS-08 Business-to-Sponsor Messaging    (context_type: 'sponsor')
 *  - General direct messaging               (context_type: 'direct')
 *
 * A conversation is uniquely identified by its sorted participant pair plus
 * its context (context_type + campaign_id), so the same two users can hold
 * separate threads about different campaigns without collisions.
 */

const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

/**
 * Per-participant state embedded in the conversation.
 * Tracks unread counts and personal flags (archive/mute/block/soft-delete)
 * so that actions by one user do not affect the other's view of the thread.
 */
const participantStateSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    unread_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    last_read_at: {
      type: Date,
      default: null,
    },
    // Personal flags - only affect this participant's view
    archived: {
      type: Boolean,
      default: false,
    },
    muted: {
      type: Boolean,
      default: false,
    },
    // User has hidden/deleted the thread for themselves (soft delete)
    deleted: {
      type: Boolean,
      default: false,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
    // This participant has blocked the other participant
    has_blocked: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: String,
      unique: true,
      index: true,
    },

    // Exactly two participants for a 1:1 direct conversation
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 2,
        message: 'A conversation must have exactly two participants',
      },
      index: true,
    },

    // Deterministic key for the participant pair + context, used to enforce
    // a single thread per pair/context. Built as: sortedIdA_sortedIdB[:context]
    pair_key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    participant_state: {
      type: [participantStateSchema],
      default: [],
    },

    // Context that the conversation is attached to
    context_type: {
      type: String,
      enum: ['direct', 'campaign', 'volunteer', 'sponsor'],
      default: 'direct',
      index: true,
    },

    // Optional campaign this conversation relates to
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
      index: true,
    },

    subject: {
      type: String,
      maxlength: 200,
      default: null,
    },

    // Denormalized snapshot of the most recent message for fast list rendering
    last_message: {
      body: { type: String, default: null },
      sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      sent_at: { type: Date, default: null },
      is_system: { type: Boolean, default: false },
    },

    message_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ['active', 'blocked', 'closed'],
      default: 'active',
      index: true,
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Indexes for efficient querying
 */
// List a user's conversations sorted by recent activity
conversationSchema.index({ participants: 1, 'last_message.sent_at': -1 });
conversationSchema.index({ campaign_id: 1, context_type: 1 });
conversationSchema.index({ created_at: -1 });

/**
 * Build the deterministic pair key for two users + context.
 * Sorting the IDs guarantees the same key regardless of who initiates.
 *
 * @param {string} userA
 * @param {string} userB
 * @param {string} contextType
 * @param {string|null} campaignId
 * @returns {string}
 */
conversationSchema.statics.buildPairKey = function buildPairKey(
  userA,
  userB,
  contextType = 'direct',
  campaignId = null
) {
  const sorted = [userA.toString(), userB.toString()].sort();
  const contextSuffix = campaignId
    ? `${contextType}:${campaignId.toString()}`
    : contextType;
  return `${sorted[0]}_${sorted[1]}:${contextSuffix}`;
};

/**
 * Pre-validate hook: generate a human-readable conversation_id.
 */
conversationSchema.pre('validate', function preValidate(next) {
  if (!this.conversation_id) {
    this.conversation_id = `CONV-${nanoid(16)}`;
  }
  next();
});

/**
 * Get the participant_state subdocument for a given user.
 * @param {string} userId
 * @returns {Object|null}
 */
conversationSchema.methods.getParticipantState = function getParticipantState(userId) {
  return (
    this.participant_state.find(
      (state) => state.user_id.toString() === userId.toString()
    ) || null
  );
};

/**
 * Get the other participant's id (for a 1:1 conversation).
 * @param {string} userId
 * @returns {mongoose.Types.ObjectId|null}
 */
conversationSchema.methods.getOtherParticipant = function getOtherParticipant(userId) {
  return (
    this.participants.find((p) => p.toString() !== userId.toString()) || null
  );
};

/**
 * Check whether a user is a participant of this conversation.
 * @param {string} userId
 * @returns {boolean}
 */
conversationSchema.methods.isParticipant = function isParticipant(userId) {
  return this.participants.some((p) => p.toString() === userId.toString());
};

/**
 * Whether the conversation is blocked by either participant.
 * @returns {boolean}
 */
conversationSchema.methods.isBlocked = function isBlocked() {
  return (
    this.status === 'blocked' ||
    this.participant_state.some((state) => state.has_blocked)
  );
};

module.exports = mongoose.model('Conversation', conversationSchema);
