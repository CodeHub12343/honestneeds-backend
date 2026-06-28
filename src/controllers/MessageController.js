/**
 * Message Controller
 * HTTP handlers for the direct messaging system.
 *
 * Covers messaging features:
 *  - MS-01 Supporter-to-Creator Messaging
 *  - MS-07 Volunteer Coordination Messaging
 *  - MS-08 Business-to-Sponsor Messaging
 *
 * All endpoints require authentication (req.user populated by authMiddleware).
 */

const MessagingService = require('../services/MessagingService');
const { MessagingError } = require('../services/MessagingService');
const messageValidators = require('../validators/messageValidators');
const { winstonLogger } = require('../utils/logger');

/**
 * Map a thrown error to an HTTP response.
 * @private
 */
function handleError(res, error, context) {
  if (error instanceof MessagingError) {
    return res.status(error.statusCode).json({
      success: false,
      error: { code: error.code, message: error.message },
    });
  }

  winstonLogger.error(`Messaging error: ${context}`, {
    error: error.message,
    stack: error.stack,
  });

  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

/**
 * POST /api/messages/conversations
 * Start a conversation (or fetch the existing one) and optionally send the
 * first message.
 */
exports.startConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { success, value, errors } = messageValidators.validate(
      messageValidators.startConversationSchema,
      req.body
    );

    if (!success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors },
      });
    }

    const { conversation, created } = await MessagingService.getOrCreateConversation({
      initiatorId: userId,
      recipientId: value.recipient_id,
      contextType: value.context_type,
      campaignId: value.campaign_id || null,
      subject: value.subject || null,
    });

    let message = null;
    const hasBody = value.body && value.body.trim().length > 0;
    const hasAttachments = value.attachments && value.attachments.length > 0;

    if (hasBody || hasAttachments) {
      message = await MessagingService.sendMessage({
        conversation,
        senderId: userId,
        body: value.body,
        attachments: value.attachments,
      });
    }

    return res.status(created ? 201 : 200).json({
      success: true,
      message: created ? 'Conversation created' : 'Conversation retrieved',
      data: {
        conversation: MessagingService.shapeConversationForUser(
          conversation.toObject(),
          userId
        ),
        sent_message: message,
      },
    });
  } catch (error) {
    return handleError(res, error, 'startConversation');
  }
};

/**
 * GET /api/messages/conversations
 * List the authenticated user's conversations.
 */
exports.listConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { success, value, errors } = messageValidators.validate(
      messageValidators.listConversationsSchema,
      req.query
    );

    if (!success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors },
      });
    }

    const result = await MessagingService.listConversations({
      userId,
      page: value.page,
      limit: value.limit,
      contextType: value.context_type,
      unreadOnly: value.unread_only,
      archived: value.archived,
    });

    return res.status(200).json({
      success: true,
      data: result.conversations,
      pagination: result.pagination,
    });
  } catch (error) {
    return handleError(res, error, 'listConversations');
  }
};

/**
 * GET /api/messages/conversations/:id
 * Get a single conversation's detail.
 */
exports.getConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversation = await MessagingService.getConversationForUser(
      req.params.id,
      userId
    );

    await conversation.populate('participants', 'display_name avatar_url role');
    await conversation.populate('campaign_id', 'title');

    return res.status(200).json({
      success: true,
      data: MessagingService.shapeConversationForUser(conversation.toObject(), userId),
    });
  } catch (error) {
    return handleError(res, error, 'getConversation');
  }
};

/**
 * GET /api/messages/conversations/:id/messages
 * List messages in a conversation (newest first).
 */
exports.listMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { success, value, errors } = messageValidators.validate(
      messageValidators.listMessagesSchema,
      req.query
    );

    if (!success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors },
      });
    }

    const conversation = await MessagingService.getConversationForUser(
      req.params.id,
      userId
    );

    const result = await MessagingService.listMessages({
      conversation,
      userId,
      page: value.page,
      limit: value.limit,
      before: value.before,
    });

    return res.status(200).json({
      success: true,
      data: result.messages,
      pagination: result.pagination,
    });
  } catch (error) {
    return handleError(res, error, 'listMessages');
  }
};

/**
 * POST /api/messages/conversations/:id/messages
 * Send a message in an existing conversation.
 */
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { success, value, errors } = messageValidators.validate(
      messageValidators.sendMessageSchema,
      req.body
    );

    if (!success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors },
      });
    }

    const conversation = await MessagingService.getConversationForUser(
      req.params.id,
      userId
    );

    const message = await MessagingService.sendMessage({
      conversation,
      senderId: userId,
      body: value.body,
      attachments: value.attachments,
    });

    return res.status(201).json({
      success: true,
      message: 'Message sent',
      data: message,
    });
  } catch (error) {
    return handleError(res, error, 'sendMessage');
  }
};

/**
 * PATCH /api/messages/conversations/:id/read
 * Mark a conversation as read for the authenticated user.
 */
exports.markRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversation = await MessagingService.getConversationForUser(
      req.params.id,
      userId
    );

    const result = await MessagingService.markConversationRead(conversation, userId);

    return res.status(200).json({
      success: true,
      message: 'Conversation marked as read',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, 'markRead');
  }
};

/**
 * PATCH /api/messages/messages/:messageId
 * Edit a message (sender only).
 */
exports.editMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { success, value, errors } = messageValidators.validate(
      messageValidators.editMessageSchema,
      req.body
    );

    if (!success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors },
      });
    }

    const message = await MessagingService.editMessage({
      messageId: req.params.messageId,
      userId,
      body: value.body,
    });

    return res.status(200).json({
      success: true,
      message: 'Message updated',
      data: message,
    });
  } catch (error) {
    return handleError(res, error, 'editMessage');
  }
};

/**
 * DELETE /api/messages/messages/:messageId
 * Delete a message. Query ?scope=everyone to hard-delete (sender only);
 * default hides the message for the requesting user only.
 */
exports.deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const forEveryone = req.query.scope === 'everyone';

    const result = await MessagingService.deleteMessage({
      messageId: req.params.messageId,
      userId,
      forEveryone,
    });

    return res.status(200).json({
      success: true,
      message: 'Message deleted',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, 'deleteMessage');
  }
};

/**
 * PATCH /api/messages/conversations/:id/archive
 * Archive or unarchive a conversation for the user. Body: { archived: bool }
 */
exports.archiveConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const archived = req.body.archived !== false; // default true
    const conversation = await MessagingService.getConversationForUser(
      req.params.id,
      userId
    );

    const result = await MessagingService.setParticipantFlag(
      conversation,
      userId,
      'archived',
      archived
    );

    return res.status(200).json({
      success: true,
      message: archived ? 'Conversation archived' : 'Conversation unarchived',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, 'archiveConversation');
  }
};

/**
 * PATCH /api/messages/conversations/:id/mute
 * Mute or unmute notifications for a conversation. Body: { muted: bool }
 */
exports.muteConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const muted = req.body.muted !== false; // default true
    const conversation = await MessagingService.getConversationForUser(
      req.params.id,
      userId
    );

    const result = await MessagingService.setParticipantFlag(
      conversation,
      userId,
      'muted',
      muted
    );

    return res.status(200).json({
      success: true,
      message: muted ? 'Conversation muted' : 'Conversation unmuted',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, 'muteConversation');
  }
};

/**
 * PATCH /api/messages/conversations/:id/block
 * Block the other participant. Body: { blocked: bool } (default true)
 */
exports.blockConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const blocked = req.body.blocked !== false; // default true
    const conversation = await MessagingService.getConversationForUser(
      req.params.id,
      userId
    );

    const result = await MessagingService.setBlock(conversation, userId, blocked);

    return res.status(200).json({
      success: true,
      message: blocked ? 'Participant blocked' : 'Participant unblocked',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, 'blockConversation');
  }
};

/**
 * DELETE /api/messages/conversations/:id
 * Soft-delete (hide) a conversation for the authenticated user.
 */
exports.deleteConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversation = await MessagingService.getConversationForUser(
      req.params.id,
      userId
    );

    const result = await MessagingService.deleteConversationForUser(conversation, userId);

    return res.status(200).json({
      success: true,
      message: 'Conversation deleted',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, 'deleteConversation');
  }
};

/**
 * POST /api/messages/attachments
 * Upload a single image attachment (multipart field name: "image").
 * Reuses the shared Cloudinary upload middleware which populates req.file.
 * Returns a MessageAttachment-shaped object the client includes in a message.
 */
exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file || !req.file.image_url) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded (expected field "image")' },
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Attachment uploaded',
      data: {
        url: req.file.image_url,
        type: 'image',
        name: req.file.filename || null,
        size_bytes: req.file.size || null,
        width: req.file.image_width || null,
        height: req.file.image_height || null,
      },
    });
  } catch (error) {
    return handleError(res, error, 'uploadAttachment');
  }
};

/**
 * GET /api/messages/unread-count
 * Total unread messages across all conversations for the user.
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const unreadCount = await MessagingService.getTotalUnreadCount(userId);

    return res.status(200).json({
      success: true,
      data: { unread_count: unreadCount },
    });
  } catch (error) {
    return handleError(res, error, 'getUnreadCount');
  }
};
