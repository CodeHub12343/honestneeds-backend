/**
 * Messaging Service
 * Business logic for the direct (1:1) messaging system.
 *
 * Responsibilities:
 *  - Create / fetch conversations (one thread per participant pair + context)
 *  - Send, edit, and delete messages
 *  - Track unread counts and read receipts per participant
 *  - Archive / mute / block / soft-delete threads per participant
 *  - Fan out delivery side effects: real-time WebSocket push, in-app
 *    notification record, and best-effort transactional email
 *
 * All delivery side effects are best-effort and never block the core write.
 */

const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const wsNotificationService = require('../websocket/NotificationService');
const emailService = require('../utils/emailService');
const { winstonLogger } = require('../utils/logger');

/**
 * Domain error with an attached HTTP status code so the controller can map
 * failures to responses without sprinkling status logic through the service.
 */
class MessagingError extends Error {
  constructor(message, statusCode = 400, code = 'MESSAGING_ERROR') {
    super(message);
    this.name = 'MessagingError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class MessagingService {
  /**
   * Get an existing conversation between two users for a context, or create it.
   *
   * @param {Object} params
   * @param {string} params.initiatorId - User starting/owning the action
   * @param {string} params.recipientId - The other participant
   * @param {string} [params.contextType='direct']
   * @param {string|null} [params.campaignId=null]
   * @param {string|null} [params.subject=null]
   * @returns {Promise<{ conversation: Object, created: boolean }>}
   */
  static async getOrCreateConversation({
    initiatorId,
    recipientId,
    contextType = 'direct',
    campaignId = null,
    subject = null,
  }) {
    if (!initiatorId || !recipientId) {
      throw new MessagingError('Both participants are required', 400, 'MISSING_PARTICIPANTS');
    }

    if (initiatorId.toString() === recipientId.toString()) {
      throw new MessagingError('You cannot start a conversation with yourself', 400, 'SELF_CONVERSATION');
    }

    if (!mongoose.isValidObjectId(recipientId)) {
      throw new MessagingError('Invalid recipient id', 400, 'INVALID_RECIPIENT');
    }

    // Recipient must exist
    const recipient = await User.findById(recipientId).select('_id display_name email').lean();
    if (!recipient) {
      throw new MessagingError('Recipient not found', 404, 'RECIPIENT_NOT_FOUND');
    }

    // If a campaign context is provided, validate it exists
    if (campaignId) {
      if (!mongoose.isValidObjectId(campaignId)) {
        throw new MessagingError('Invalid campaign id', 400, 'INVALID_CAMPAIGN');
      }
      const campaign = await Campaign.findById(campaignId).select('_id title').lean();
      if (!campaign) {
        throw new MessagingError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      }
    }

    const pairKey = Conversation.buildPairKey(
      initiatorId,
      recipientId,
      contextType,
      campaignId
    );

    let conversation = await Conversation.findOne({ pair_key: pairKey });

    if (conversation) {
      // If the initiator previously soft-deleted the thread, restore their view.
      const state = conversation.getParticipantState(initiatorId);
      if (state && state.deleted) {
        state.deleted = false;
        state.deleted_at = null;
        await conversation.save();
      }
      return { conversation, created: false };
    }

    conversation = await Conversation.create({
      participants: [initiatorId, recipientId],
      pair_key: pairKey,
      context_type: contextType,
      campaign_id: campaignId,
      subject: subject || null,
      created_by: initiatorId,
      participant_state: [
        { user_id: initiatorId, unread_count: 0 },
        { user_id: recipientId, unread_count: 0 },
      ],
    });

    winstonLogger.info('💬 Conversation created', {
      conversationId: conversation.conversation_id,
      contextType,
      campaignId: campaignId || null,
    });

    return { conversation, created: true };
  }

  /**
   * Send a message within a conversation.
   *
   * @param {Object} params
   * @param {Object} params.conversation - Conversation document (Mongoose)
   * @param {string} params.senderId
   * @param {string} [params.body='']
   * @param {Array}  [params.attachments=[]]
   * @param {boolean} [params.isSystem=false]
   * @returns {Promise<Object>} The created message (lean object)
   */
  static async sendMessage({
    conversation,
    senderId,
    body = '',
    attachments = [],
    isSystem = false,
  }) {
    if (!conversation.isParticipant(senderId) && !isSystem) {
      throw new MessagingError('You are not a participant of this conversation', 403, 'NOT_PARTICIPANT');
    }

    if (conversation.isBlocked()) {
      throw new MessagingError('This conversation is blocked', 403, 'CONVERSATION_BLOCKED');
    }

    const recipientId = conversation.getOtherParticipant(senderId);
    if (!recipientId) {
      throw new MessagingError('Recipient could not be resolved', 400, 'NO_RECIPIENT');
    }

    const message = await Message.create({
      conversation_id: conversation._id,
      sender_id: senderId,
      recipient_id: recipientId,
      body: body || '',
      attachments: attachments || [],
      is_system: isSystem,
      delivered: true,
      delivered_at: new Date(),
    });

    // Update conversation denormalized state
    const snippet = (body || (attachments.length ? '[Attachment]' : '')).slice(0, 200);
    conversation.last_message = {
      body: snippet,
      sender_id: senderId,
      sent_at: message.created_at,
      is_system: isSystem,
    };
    conversation.message_count += 1;

    // Increment unread for the recipient only
    const recipientState = conversation.getParticipantState(recipientId);
    if (recipientState) {
      recipientState.unread_count += 1;
      // Un-archive the thread for the recipient so new messages resurface it
      recipientState.archived = false;
      // Restore visibility if recipient had soft-deleted the thread
      if (recipientState.deleted) {
        recipientState.deleted = false;
        recipientState.deleted_at = null;
      }
    }

    await conversation.save();

    // Fire-and-forget delivery side effects (never block the write)
    this.dispatchDeliveries({ conversation, message, senderId, recipientId }).catch((err) => {
      winstonLogger.error('Failed to dispatch message deliveries', {
        messageId: message.message_id,
        error: err.message,
      });
    });

    return message.toObject();
  }

  /**
   * Fan out real-time, in-app, and email notifications for a new message.
   * Best-effort; each channel failure is isolated.
   * @private
   */
  static async dispatchDeliveries({ conversation, message, senderId, recipientId }) {
    if (message.is_system) {
      // System messages still push in real time but skip personal notifications
      this.pushRealTime(recipientId, conversation, message);
      return;
    }

    const sender = await User.findById(senderId)
      .select('display_name avatar_url')
      .lean();
    const senderName = sender?.display_name || 'Someone';

    // 1) Real-time WebSocket push (queued if recipient offline)
    this.pushRealTime(recipientId, conversation, message, senderName);

    // 2) In-app notification record
    const recipientState = conversation.getParticipantState(recipientId);
    const muted = recipientState?.muted;

    if (!muted) {
      try {
        // Persist + push the bell notification through the unified dispatcher.
        // Realtime chat delivery is already handled by pushRealTime() above and
        // the transactional email below, so restrict this to the in-app channel
        // to avoid a duplicate email.
        const NotificationDispatcher = require('./NotificationDispatcher');
        await NotificationDispatcher.notify({
          userId: recipientId,
          type: 'new_message',
          data: {
            conversation_id: conversation.conversation_id,
            campaign_id: conversation.campaign_id || undefined,
            user_id: senderId,
            sender_name: senderName,
            supporter_name: senderName,
            preview:
              message.body && message.body.length
                ? message.body.slice(0, 140)
                : 'Sent you an attachment',
            message_id: message.message_id,
            context_type: conversation.context_type,
          },
          overrides: {
            title: `New message from ${senderName}`,
            message:
              message.body && message.body.length
                ? message.body.slice(0, 140)
                : 'Sent you an attachment',
            action_url: `/messages?c=${conversation.conversation_id}`,
            icon_emoji: '💬',
            color: 'info',
            channels: ['in_app'],
          },
        });
      } catch (err) {
        winstonLogger.error('Failed to create in-app message notification', {
          recipientId: recipientId.toString(),
          error: err.message,
        });
      }

      // 3) Best-effort transactional email
      try {
        const recipient = await User.findById(recipientId)
          .select('email display_name')
          .lean();
        if (recipient?.email && typeof emailService.sendNewMessageEmail === 'function') {
          await emailService.sendNewMessageEmail(recipient.email, {
            recipientName: recipient.display_name,
            senderName,
            preview:
              message.body && message.body.length
                ? message.body.slice(0, 200)
                : 'Sent you an attachment',
            conversationId: conversation.conversation_id,
          });
        }
      } catch (err) {
        winstonLogger.warn('Failed to send message email (non-fatal)', {
          recipientId: recipientId.toString(),
          error: err.message,
        });
      }
    }
  }

  /**
   * Push a real-time message event over WebSocket.
   * @private
   */
  static pushRealTime(recipientId, conversation, message, senderName = null) {
    try {
      wsNotificationService.notifyUser(recipientId.toString(), {
        type: 'new_message',
        data: {
          conversation_id: conversation.conversation_id,
          message_id: message.message_id,
          sender_id: message.sender_id,
          sender_name: senderName,
          body: message.body,
          attachments: message.attachments,
          is_system: message.is_system,
          context_type: conversation.context_type,
          campaign_id: conversation.campaign_id || null,
          created_at: message.created_at,
        },
      });
    } catch (err) {
      winstonLogger.warn('Real-time message push failed (non-fatal)', {
        error: err.message,
      });
    }
  }

  /**
   * List a user's conversations.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {number} [params.page=1]
   * @param {number} [params.limit=25]
   * @param {string} [params.contextType]
   * @param {boolean} [params.unreadOnly=false]
   * @param {boolean} [params.archived=false]
   * @returns {Promise<{ conversations: Array, pagination: Object }>}
   */
  static async listConversations({
    userId,
    page = 1,
    limit = 25,
    contextType,
    unreadOnly = false,
    archived = false,
  }) {
    const query = {
      participants: userId,
      // Exclude threads the user has soft-deleted (unless re-activated)
      participant_state: {
        $elemMatch: { user_id: userId, deleted: { $ne: true }, archived: !!archived },
      },
    };

    if (contextType) {
      query.context_type = contextType;
    }

    if (unreadOnly) {
      query.participant_state.$elemMatch.unread_count = { $gt: 0 };
    }

    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .sort({ 'last_message.sent_at': -1, updated_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('participants', 'display_name avatar_url role')
        .populate('campaign_id', 'title')
        .lean(),
      Conversation.countDocuments(query),
    ]);

    const shaped = conversations.map((c) => this.shapeConversationForUser(c, userId));

    return {
      conversations: shaped,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + conversations.length < total,
      },
    };
  }

  /**
   * Shape a lean conversation into a per-user view (extract my unread count,
   * the other participant, etc.).
   * @private
   */
  static shapeConversationForUser(conversation, userId) {
    const myState =
      (conversation.participant_state || []).find(
        (s) => s.user_id.toString() === userId.toString()
      ) || {};

    const other =
      (conversation.participants || []).find(
        (p) => (p._id || p).toString() !== userId.toString()
      ) || null;

    return {
      id: conversation._id,
      conversation_id: conversation.conversation_id,
      context_type: conversation.context_type,
      campaign: conversation.campaign_id || null,
      subject: conversation.subject,
      status: conversation.status,
      other_participant: other,
      last_message: conversation.last_message,
      message_count: conversation.message_count,
      unread_count: myState.unread_count || 0,
      archived: !!myState.archived,
      muted: !!myState.muted,
      is_blocked:
        conversation.status === 'blocked' ||
        (conversation.participant_state || []).some((s) => s.has_blocked),
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    };
  }

  /**
   * Fetch a single conversation a user participates in.
   * @returns {Promise<Object>} Mongoose document
   */
  static async getConversationForUser(conversationId, userId) {
    const query = mongoose.isValidObjectId(conversationId)
      ? { $or: [{ _id: conversationId }, { conversation_id: conversationId }] }
      : { conversation_id: conversationId };

    const conversation = await Conversation.findOne(query);

    if (!conversation) {
      throw new MessagingError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    if (!conversation.isParticipant(userId)) {
      throw new MessagingError('You do not have access to this conversation', 403, 'NOT_PARTICIPANT');
    }

    return conversation;
  }

  /**
   * List messages within a conversation (newest first), excluding messages the
   * user has hidden for themselves.
   *
   * @param {Object} params
   * @param {Object} params.conversation - Conversation document
   * @param {string} params.userId
   * @param {number} [params.page=1]
   * @param {number} [params.limit=50]
   * @param {Date}   [params.before]
   * @returns {Promise<{ messages: Array, pagination: Object }>}
   */
  static async listMessages({ conversation, userId, page = 1, limit = 50, before }) {
    const query = {
      conversation_id: conversation._id,
      is_deleted: false,
      deleted_for: { $ne: userId },
    };

    if (before) {
      query.created_at = { $lt: new Date(before) };
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments(query),
    ]);

    return {
      messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + messages.length < total,
      },
    };
  }

  /**
   * Mark a conversation as read for a user: zero their unread count and stamp
   * unread inbound messages as read.
   *
   * @param {Object} conversation - Conversation document
   * @param {string} userId
   * @returns {Promise<{ marked: number }>}
   */
  static async markConversationRead(conversation, userId) {
    const state = conversation.getParticipantState(userId);
    if (state) {
      state.unread_count = 0;
      state.last_read_at = new Date();
      await conversation.save();
    }

    const result = await Message.updateMany(
      { conversation_id: conversation._id, recipient_id: userId, read: false },
      { $set: { read: true, read_at: new Date() } }
    );

    // Notify the sender(s) of read receipt in real time
    const other = conversation.getOtherParticipant(userId);
    if (other) {
      try {
        wsNotificationService.notifyUser(other.toString(), {
          type: 'messages_read',
          data: {
            conversation_id: conversation.conversation_id,
            read_by: userId,
            read_at: new Date().toISOString(),
          },
        });
      } catch (err) {
        winstonLogger.debug('Read-receipt push failed (non-fatal)', { error: err.message });
      }
    }

    return { marked: result.modifiedCount || 0 };
  }

  /**
   * Edit a message (sender only, not a system message).
   * @returns {Promise<Object>} Updated message (lean)
   */
  static async editMessage({ messageId, userId, body }) {
    const message = await this.findMessage(messageId);

    if (message.sender_id.toString() !== userId.toString()) {
      throw new MessagingError('You can only edit your own messages', 403, 'NOT_MESSAGE_OWNER');
    }
    if (message.is_system) {
      throw new MessagingError('System messages cannot be edited', 400, 'SYSTEM_MESSAGE');
    }
    if (message.is_deleted) {
      throw new MessagingError('Cannot edit a deleted message', 400, 'MESSAGE_DELETED');
    }

    message.body = body;
    message.edited = true;
    message.edited_at = new Date();
    await message.save();

    // Reflect edit in conversation snapshot if this was the latest message
    const conversation = await Conversation.findById(message.conversation_id);
    if (
      conversation &&
      conversation.last_message &&
      conversation.last_message.sent_at &&
      message.created_at.getTime() === conversation.last_message.sent_at.getTime()
    ) {
      conversation.last_message.body = body.slice(0, 200);
      await conversation.save();
    }

    return message.toObject();
  }

  /**
   * Delete a message. Default is per-user (hide for me). The sender may delete
   * for everyone (hard delete) via `forEveryone`.
   *
   * @param {Object} params
   * @param {string} params.messageId
   * @param {string} params.userId
   * @param {boolean} [params.forEveryone=false]
   * @returns {Promise<{ deleted: boolean, scope: string }>}
   */
  static async deleteMessage({ messageId, userId, forEveryone = false }) {
    const message = await this.findMessage(messageId);

    const conversation = await Conversation.findById(message.conversation_id);
    if (!conversation || !conversation.isParticipant(userId)) {
      throw new MessagingError('You do not have access to this message', 403, 'NOT_PARTICIPANT');
    }

    if (forEveryone) {
      if (message.sender_id.toString() !== userId.toString()) {
        throw new MessagingError('Only the sender can delete a message for everyone', 403, 'NOT_MESSAGE_OWNER');
      }
      message.is_deleted = true;
      message.deleted_at = new Date();
      message.body = '';
      message.attachments = [];
      await message.save();
      return { deleted: true, scope: 'everyone' };
    }

    if (!message.deleted_for.some((id) => id.toString() === userId.toString())) {
      message.deleted_for.push(userId);
      await message.save();
    }
    return { deleted: true, scope: 'self' };
  }

  /**
   * Resolve a message by Mongo _id or message_id.
   * @private
   */
  static async findMessage(messageId) {
    const query = mongoose.isValidObjectId(messageId)
      ? { $or: [{ _id: messageId }, { message_id: messageId }] }
      : { message_id: messageId };
    const message = await Message.findOne(query);
    if (!message) {
      throw new MessagingError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }
    return message;
  }

  /**
   * Toggle a per-participant boolean flag (archived / muted).
   * @param {Object} conversation
   * @param {string} userId
   * @param {'archived'|'muted'} flag
   * @param {boolean} value
   */
  static async setParticipantFlag(conversation, userId, flag, value) {
    const state = conversation.getParticipantState(userId);
    if (!state) {
      throw new MessagingError('Participant state not found', 404, 'STATE_NOT_FOUND');
    }
    state[flag] = value;
    await conversation.save();
    return { [flag]: value };
  }

  /**
   * Block or unblock the other participant.
   * Blocking sets conversation.status to 'blocked'; unblocking restores
   * 'active' only if neither participant still blocks.
   */
  static async setBlock(conversation, userId, blocked) {
    const state = conversation.getParticipantState(userId);
    if (!state) {
      throw new MessagingError('Participant state not found', 404, 'STATE_NOT_FOUND');
    }
    state.has_blocked = blocked;

    const anyoneBlocks = conversation.participant_state.some((s) => s.has_blocked);
    conversation.status = anyoneBlocks ? 'blocked' : 'active';
    await conversation.save();

    return { blocked, conversation_status: conversation.status };
  }

  /**
   * Soft-delete (hide) a conversation for a user.
   */
  static async deleteConversationForUser(conversation, userId) {
    const state = conversation.getParticipantState(userId);
    if (state) {
      state.deleted = true;
      state.deleted_at = new Date();
      state.unread_count = 0;
      await conversation.save();
    }
    return { deleted: true };
  }

  /**
   * Total unread message count across all of a user's active conversations.
   * @param {string} userId
   * @returns {Promise<number>}
   */
  static async getTotalUnreadCount(userId) {
    const result = await Conversation.aggregate([
      { $match: { participants: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$participant_state' },
      {
        $match: {
          'participant_state.user_id': new mongoose.Types.ObjectId(userId),
          'participant_state.deleted': { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$participant_state.unread_count' },
        },
      },
    ]);

    return result.length ? result[0].total : 0;
  }
}

module.exports = MessagingService;
module.exports.MessagingError = MessagingError;
