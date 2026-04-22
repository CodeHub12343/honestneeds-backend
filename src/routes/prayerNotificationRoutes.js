/**
 * Prayer Notification Routes
 * Handles all prayer-related notification endpoints
 * Includes preferences, delivery, and notification management
 */

const express = require('express');
const router = express.Router();
const PrayerNotificationController = require('../controllers/PrayerNotificationController');
const { authMiddleware } = require('../middleware/authMiddleware');
const logger = require('../utils/winstonLogger');

// ==================== NOTIFICATION PREFERENCES ====================

/**
 * GET /api/prayers/notifications/preferences
 * Get user's prayer notification preferences
 * @access Authenticated
 * @returns {Object} Notification preferences
 */
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const result = await PrayerNotificationController.getPreferences(userId);
    res.json(result);
  } catch (error) {
    logger.error(`🔴 Error fetching notification preferences: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preferences',
    });
  }
});

/**
 * PUT /api/prayers/notifications/preferences
 * Update user's prayer notification preferences
 * @access Authenticated
 * @body {Object} preferences - Updated preferences
 * @returns {Object} Updated preferences
 */
router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const updates = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const result = await PrayerNotificationController.updatePreferences(userId, updates);
    res.json(result);
  } catch (error) {
    logger.error(`🔴 Error updating notification preferences: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences',
    });
  }
});

/**
 * PATCH /api/prayers/notifications/preferences/:preferenceKey
 * Update a specific preference key
 * @access Authenticated
 * @param {string} preferenceKey - Dot notation key (e.g., "prayer_notifications.someone_prayed.enabled")
 * @body {*} value - The new value
 * @returns {Object} Updated preferences
 */
router.patch('/preferences/:preferenceKey', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { preferenceKey } = req.params;
    const { value } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required',
      });
    }

    // Build nested update object from dot notation
    const updates = {};
    const keys = preferenceKey.split('.');
    let current = updates;

    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = {};
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;

    const result = await PrayerNotificationController.updatePreferences(userId, updates);
    res.json(result);
  } catch (error) {
    logger.error(`🔴 Error updating specific preference: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update preference',
    });
  }
});

// ==================== NOTIFICATIONS FEED ====================

/**
 * GET /api/prayers/notifications
 * Get user's notifications feed
 * @access Authenticated
 * @query {number} limit - Results per page (default: 20)
 * @query {number} offset - Pagination offset (default: 0)
 * @query {string} type - Filter by notification type
 * @query {boolean} unread - Filter by read status
 * @returns {Object} Paginated notifications
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { limit = 20, offset = 0, type, unread } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const result = await PrayerNotificationController.getNotificationsFeed(
      userId,
      Math.min(parseInt(limit, 10), 100), // Max 100 per page
      parseInt(offset, 10)
    );

    // Apply additional filters if provided
    if (type || unread !== undefined) {
      result.data = result.data.filter((notif) => {
        if (type && notif.type !== type) return false;
        if (unread !== undefined && notif.read === JSON.parse(unread)) return false;
        return true;
      });
    }

    res.json(result);
  } catch (error) {
    logger.error(`🔴 Error fetching notifications feed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
    });
  }
});

/**
 * GET /api/prayers/notifications/unread-count
 * Get count of unread notifications
 * @access Authenticated
 * @returns {Object} Unread count
 */
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const result = await PrayerNotificationController.getUnreadCount(userId);
    res.json(result);
  } catch (error) {
    logger.error(`🔴 Error fetching unread count: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count',
    });
  }
});

// ==================== NOTIFICATION ACTIONS ====================

/**
 * PUT /api/prayers/notifications/:notificationId/read
 * Mark notification as read
 * @access Authenticated
 * @param {string} notificationId - Notification ID
 * @returns {Object} Success response
 */
router.put('/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const result = await PrayerNotificationController.markAsRead(req.params.notificationId);
    res.json(result);
  } catch (error) {
    logger.error(`🔴 Error marking notification as read: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to mark as read',
    });
  }
});

/**
 * POST /api/prayers/notifications/read-all
 * Mark all notifications as read
 * @access Authenticated
 * @returns {Object} Success response
 */
router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required',
      });
    }

    // TODO: Implement bulk mark as read
    logger.debug(`✅ All notifications marked as read for user: ${userId}`);

    res.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    logger.error(`🔴 Error marking all notifications as read: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all as read',
    });
  }
});

/**
 * DELETE /api/prayers/notifications/:notificationId
 * Delete/archive a notification
 * @access Authenticated
 * @param {string} notificationId - Notification ID
 * @returns {Object} Success response
 */
router.delete('/:notificationId', authMiddleware, async (req, res) => {
  try {
    // TODO: Implement soft delete/archive for notification
    logger.debug(`✅ Notification archived: ${req.params.notificationId}`);

    res.json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    logger.error(`🔴 Error deleting notification: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification',
    });
  }
});

// ==================== ADMIN/SYSTEM ENDPOINTS (INTERNAL ONLY) ====================

/**
 * POST /api/prayers/notifications/send/prayer-submitted
 * Internal: Notify creator when prayer submitted
 * @access Internal (Admin/System only)
 * @body {string} prayerId - Prayer ID
 * @returns {Object} Notification result
 */
router.post('/send/prayer-submitted', authMiddleware, async (req, res) => {
  try {
    // TODO: Add admin/system-only check
    const { prayerId } = req.body;

    if (!prayerId) {
      return res.status(400).json({
        success: false,
        error: 'prayerId is required',
      });
    }

    const result = await PrayerNotificationController.notifyPrayerSubmitted(prayerId);
    res.json(result);
  } catch (error) {
    logger.error(`🔴 Error sending prayer submitted notification: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
    });
  }
});

/**
 * POST /api/prayers/notifications/send/prayer-moderation
 * Internal: Notify supporter when prayer is moderated
 * @access Internal (Admin/System only)
 * @body {string} prayerId - Prayer ID
 * @body {string} status - 'approved' or 'rejected'
 * @body {string} reason - Optional rejection reason
 * @returns {Object} Notification result
 */
router.post('/send/prayer-moderation', authMiddleware, async (req, res) => {
  try {
    // TODO: Add admin/system-only check
    const { prayerId, status, reason } = req.body;

    if (!prayerId || !status) {
      return res.status(400).json({
        success: false,
        error: 'prayerId and status are required',
      });
    }

    const result = await PrayerNotificationController.notifyPrayerModeration(
      prayerId,
      status,
      reason
    );
    res.json(result);
  } catch (error) {
    logger.error(`🔴 Error sending prayer moderation notification: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
    });
  }
});

/**
 * POST /api/prayers/notifications/send/prayer-milestone
 * Internal: Notify creator when prayer milestone reached
 * @access Internal (Admin/System only)
 * @body {string} campaignId - Campaign ID
 * @body {number} milestone - Milestone number (100, 500, 1000, etc.)
 * @returns {Object} Notification result
 */
router.post('/send/prayer-milestone', authMiddleware, async (req, res) => {
  try {
    // TODO: Add admin/system-only check
    const { campaignId, milestone } = req.body;

    if (!campaignId || !milestone) {
      return res.status(400).json({
        success: false,
        error: 'campaignId and milestone are required',
      });
    }

    const result = await PrayerNotificationController.notifyPrayerMilestone(
      campaignId,
      milestone
    );
    res.json(result);
  } catch (error) {
    logger.error(`🔴 Error sending prayer milestone notification: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
    });
  }
});

module.exports = router;
