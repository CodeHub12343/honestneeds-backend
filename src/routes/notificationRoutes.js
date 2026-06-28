/**
 * Notification Routes
 * Manages notification preferences and settings
 * 
 * Endpoints:
 * - GET /api/notifications/preferences - Get user's notification preferences
 * - POST /api/notifications/preferences - Update notification preferences
 * - GET /api/notifications/activity - Get activity feed
 * - POST /api/notifications/activity/:id/read - Mark as read
 * - POST /api/notifications/activity/read-all - Mark all as read
 * - POST /api/notifications/activity/:id/archive - Archive activity
 * - GET /api/notifications/unread-count - Get unread count
 * - GET /api/notifications/settings - Get notification settings/filters
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const ActivityFeedService = require('../services/ActivityFeedService');
const NotificationPreferences = require('../models/NotificationPreferences');
const winstonLogger = require('../utils/winstonLogger');

// Top-level keys on the NotificationPreferences document that callers may patch.
const PREF_KEYS = [
  'notifications_enabled',
  'channels',
  'prayer_notifications',
  'campaign_notifications',
  'marketing',
  'do_not_disturb',
  'frequency_limits',
  'privacy',
];

/**
 * GET /api/notifications/preferences
 * Get user's notification preferences
 * Auth: Required
 */
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User ID is required',
      });
    }

    // Load (or lazily create) the persisted preferences document.
    let preferences = await NotificationPreferences.findOne({ user_id: userId }).lean();
    if (!preferences) {
      const created = await NotificationPreferences.create({ user_id: userId });
      preferences = created.toObject();
    }

    res.status(200).json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    winstonLogger.error('❌ Error fetching notification preferences', {
      userId: req.user?.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to fetch preferences',
      error: error.message,
    });
  }
});

/**
 * POST /api/notifications/preferences
 * Update user's notification preferences
 * Auth: Required
 * Body: { notificationsEnabled, soundEnabled, ... }
 */
router.post('/preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User ID is required',
      });
    }

    // Accept either { preferences: {...} } or a flat body of preference keys.
    const incoming = req.body?.preferences || req.body || {};

    // Whitelist only known top-level keys to avoid clobbering user_id/timestamps.
    const update = {};
    PREF_KEYS.forEach((key) => {
      if (incoming[key] !== undefined) update[key] = incoming[key];
    });

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid preference fields provided',
      });
    }

    const saved = await NotificationPreferences.findOneAndUpdate(
      { user_id: userId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    winstonLogger.info('📝 Notification preferences updated', {
      userId,
      keys: Object.keys(update),
    });

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      data: saved,
    });
  } catch (error) {
    winstonLogger.error('❌ Error updating notification preferences', {
      userId: req.user?.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to update preferences',
      error: error.message,
    });
  }
});

/**
 * GET /api/notifications/activity
 * Get activity feed
 * Auth: Required
 * Query: limit, offset, filter
 */
router.get('/activity', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { limit = 20, offset = 0, filter } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User ID is required',
      });
    }

    const activities = await ActivityFeedService.getRecentActivity(
      userId,
      parseInt(limit),
      parseInt(offset),
      filter
    );

    const unreadCount = await ActivityFeedService.getUnreadCount(userId);

    res.status(200).json({
      success: true,
      data: activities,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: activities.length,
      },
      unreadCount,
    });
  } catch (error) {
    winstonLogger.error('❌ Error fetching activity feed', {
      userId: req.user?.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity',
      error: error.message,
    });
  }
});

/**
 * POST /api/notifications/activity/:id/read
 * Mark activity as read
 * Auth: Required
 * Params: id (Activity ID)
 */
router.post('/activity/:id/read', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User ID is required',
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Activity ID is required',
      });
    }

    await ActivityFeedService.markActivityAsRead(id, userId);

    res.status(200).json({
      success: true,
      message: 'Activity marked as read',
    });
  } catch (error) {
    winstonLogger.error('❌ Error marking activity as read', {
      userId: req.user?.id,
      activityId: req.params.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to mark as read',
      error: error.message,
    });
  }
});

/**
 * POST /api/notifications/activity/read-all
 * Mark all activities as read
 * Auth: Required
 */
router.post('/activity/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User ID is required',
      });
    }

    const result = await ActivityFeedService.markAllAsRead(userId);

    res.status(200).json({
      success: true,
      message: 'All activities marked as read',
      data: result,
    });
  } catch (error) {
    winstonLogger.error('❌ Error marking all as read', {
      userId: req.user?.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to mark all as read',
      error: error.message,
    });
  }
});

/**
 * POST /api/notifications/activity/:id/archive
 * Archive activity
 * Auth: Required
 * Params: id (Activity ID)
 */
router.post('/activity/:id/archive', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User ID is required',
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Activity ID is required',
      });
    }

    await ActivityFeedService.archiveActivity(id, userId);

    res.status(200).json({
      success: true,
      message: 'Activity archived',
    });
  } catch (error) {
    winstonLogger.error('❌ Error archiving activity', {
      userId: req.user?.id,
      activityId: req.params.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to archive',
      error: error.message,
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 * Auth: Required
 */
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User ID is required',
      });
    }

    const unreadCount = await ActivityFeedService.getUnreadCount(userId);

    res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    winstonLogger.error('❌ Error fetching unread count', {
      userId: req.user?.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: error.message,
    });
  }
});

/**
 * GET /api/notifications/settings
 * Get notification settings and filters
 * Auth: Required
 */
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User ID is required',
      });
    }

    const filters = await ActivityFeedService.getActivityFilters(userId);

    res.status(200).json({
      success: true,
      data: filters,
    });
  } catch (error) {
    winstonLogger.error('❌ Error fetching notification settings', {
      userId: req.user?.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message,
    });
  }
});

module.exports = router;
