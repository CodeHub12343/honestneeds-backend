/**
 * Message Routes
 * Direct (1:1) messaging API.
 *
 * Mounted at: /api/messages
 *
 * Conversation routes:
 *   POST   /conversations                       - Start/get a conversation (+ optional first message)
 *   GET    /conversations                       - List my conversations
 *   GET    /unread-count                        - Total unread message count
 *   GET    /conversations/:id                   - Get conversation detail
 *   GET    /conversations/:id/messages          - List messages in a conversation
 *   POST   /conversations/:id/messages          - Send a message
 *   PATCH  /conversations/:id/read              - Mark conversation read
 *   PATCH  /conversations/:id/archive          - Archive/unarchive conversation
 *   PATCH  /conversations/:id/mute             - Mute/unmute conversation
 *   PATCH  /conversations/:id/block            - Block/unblock the other participant
 *   DELETE /conversations/:id                   - Soft-delete conversation for me
 *
 * Message routes:
 *   PATCH  /messages/:messageId                 - Edit a message (sender only)
 *   DELETE /messages/:messageId                 - Delete a message (?scope=everyone)
 *
 * All routes require authentication.
 */

const router = require('express').Router();
const messageController = require('../controllers/MessageController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { createUploadMiddleware } = require('../middleware/uploadMiddleware');

// Cloudinary-backed upload middleware for message attachments (images).
const messageAttachmentUpload = createUploadMiddleware({
  folder: 'honestneed/messages',
  maxFileSize: 10 * 1024 * 1024, // 10MB
});

// All messaging endpoints require an authenticated user
router.use(authMiddleware);

/**
 * @route   GET /api/messages/unread-count
 * @desc    Get total unread message count for the authenticated user
 * @access  Private
 */
router.get('/unread-count', messageController.getUnreadCount);

/**
 * @route   POST /api/messages/attachments
 * @desc    Upload an image attachment (multipart field "image"); returns a
 *          MessageAttachment object to include in a subsequent message.
 * @access  Private
 */
router.post('/attachments', messageAttachmentUpload, messageController.uploadAttachment);

/**
 * @route   POST /api/messages/conversations
 * @desc    Start or retrieve a conversation; optionally send the first message
 * @access  Private
 * @body    { recipient_id, context_type?, campaign_id?, subject?, body?, attachments? }
 */
router.post('/conversations', messageController.startConversation);

/**
 * @route   GET /api/messages/conversations
 * @desc    List the authenticated user's conversations
 * @access  Private
 * @query   page, limit, context_type, unread_only, archived
 */
router.get('/conversations', messageController.listConversations);

/**
 * @route   GET /api/messages/conversations/:id
 * @desc    Get a conversation's detail
 * @access  Private (participant only)
 */
router.get('/conversations/:id', messageController.getConversation);

/**
 * @route   GET /api/messages/conversations/:id/messages
 * @desc    List messages within a conversation (newest first)
 * @access  Private (participant only)
 * @query   page, limit, before
 */
router.get('/conversations/:id/messages', messageController.listMessages);

/**
 * @route   POST /api/messages/conversations/:id/messages
 * @desc    Send a message in an existing conversation
 * @access  Private (participant only)
 * @body    { body?, attachments? }  (at least one required)
 */
router.post('/conversations/:id/messages', messageController.sendMessage);

/**
 * @route   PATCH /api/messages/conversations/:id/read
 * @desc    Mark a conversation as read for the user
 * @access  Private (participant only)
 */
router.patch('/conversations/:id/read', messageController.markRead);

/**
 * @route   PATCH /api/messages/conversations/:id/archive
 * @desc    Archive/unarchive a conversation. Body: { archived: bool }
 * @access  Private (participant only)
 */
router.patch('/conversations/:id/archive', messageController.archiveConversation);

/**
 * @route   PATCH /api/messages/conversations/:id/mute
 * @desc    Mute/unmute a conversation. Body: { muted: bool }
 * @access  Private (participant only)
 */
router.patch('/conversations/:id/mute', messageController.muteConversation);

/**
 * @route   PATCH /api/messages/conversations/:id/block
 * @desc    Block/unblock the other participant. Body: { blocked: bool }
 * @access  Private (participant only)
 */
router.patch('/conversations/:id/block', messageController.blockConversation);

/**
 * @route   DELETE /api/messages/conversations/:id
 * @desc    Soft-delete (hide) a conversation for the user
 * @access  Private (participant only)
 */
router.delete('/conversations/:id', messageController.deleteConversation);

/**
 * @route   PATCH /api/messages/messages/:messageId
 * @desc    Edit a message (sender only). Body: { body }
 * @access  Private (sender only)
 */
router.patch('/messages/:messageId', messageController.editMessage);

/**
 * @route   DELETE /api/messages/messages/:messageId
 * @desc    Delete a message. ?scope=everyone hard-deletes (sender only);
 *          otherwise hides for the requesting user.
 * @access  Private (participant only)
 */
router.delete('/messages/:messageId', messageController.deleteMessage);

module.exports = router;
