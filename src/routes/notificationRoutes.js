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
const winstonLogger = require('../utils/winstonLogger');

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

    // Default preferences - in production, fetch from database
    const preferences = {
      notificationsEnabled: true,
      soundEnabled: true,
      browserNotificationsEnabled: false,
      emailNotificationsEnabled: true,
      pushNotificationsEnabled: false,
      notificationTypes: {
        campaignActivated: true,
        donationReceived: true,
        goalReached: true,
        milestoneAchieved: true,
        commentReceived: true,
        shares: true,
      },
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '08:00',
      },
      soundSettings: {
        volume: 0.8,
        soundType: 'bell', // bell, chime, ding, notify
      },
    };

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

    const { preferences } = req.body;

    if (!preferences) {
      return res.status(400).json({
        success: false,
        message: 'preferences is required',
      });
    }

    // In production, save to database
    // await UserNotificationPreference.findOneAndUpdate(
    //   { userId },
    //   { preferences },
    //   { upsert: true, new: true }
    // );

    winstonLogger.info('📝 Notification preferences updated', {
      userId,
      preferences,
    });

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      data: preferences,
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
      parseInt(offset)
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
