/**
 * Activity Feed Service
 * Manages activity feed and notifications in database
 * 
 * Features:
 * - Record activity events
 * - Fetch activity history
 * - Mark as read
 * - Fetch unread count
 * - Archive old activities
 */

const mongoose = require('mongoose');
const winstonLogger = require('../utils/winstonLogger');
const Notification = require('../models/Notification');

/**
 * Maps a UI filter key to the set of Notification `type` values it covers.
 */
const FILTER_TYPE_GROUPS = {
  messages: ['new_message'],
  donations: ['donation_received', 'goal_reached'],
  campaigns: ['campaign_activated', 'campaign_ended', 'goal_reached'],
  system: ['system_alert', 'admin_message'],
};

class ActivityFeedService {
  /**
   * Record activity event
   * @param {Object} params - Activity parameters
   * @param {string} params.userId - User ID
   * @param {string} params.eventType - Event type (campaign_activated, donation_received, etc)
   * @param {string} params.campaignId - Campaign ID
   * @param {string} params.title - Activity title
   * @param {string} params.description - Activity description
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<Object>} Created activity
   */
  static async recordActivity({
    userId,
    eventType,
    campaignId,
    title,
    description,
    metadata = {},
  }) {
    try {
      // Persist + deliver through the unified dispatcher. `eventType` is treated
      // as a notification type when known; otherwise it falls back to a generic
      // system_alert so the activity is still recorded in the feed. Title and
      // description are passed as overrides so existing callers keep their copy.
      const NotificationDispatcher = require('./NotificationDispatcher');
      const { getType } = require('../notifications/notificationTypes');
      const type = getType(eventType) ? eventType : 'system_alert';

      const result = await NotificationDispatcher.notify({
        userId,
        type,
        data: { campaign_id: campaignId, ...metadata },
        overrides: {
          ...(title ? { title } : {}),
          ...(description ? { message: description } : {}),
        },
      });

      winstonLogger.info('📝 Activity recorded', {
        userId,
        eventType,
        campaignId,
        notificationId: result.notificationId,
      });

      return result;
    } catch (error) {
      winstonLogger.error('❌ Error recording activity', {
        userId,
        eventType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get recent activity for user
   * @param {string} userId - User ID
   * @param {number} limit - Max results
   * @param {number} offset - Pagination offset
   * @returns {Promise<Object[]>}
   */
  static async getRecentActivity(userId, limit = 20, offset = 0, filter = null) {
    try {
      const query = { user_id: userId, archived: false };
      if (filter && filter !== 'all' && FILTER_TYPE_GROUPS[filter]) {
        query.type = { $in: FILTER_TYPE_GROUPS[filter] };
      }

      const activities = await Notification.find(query)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .lean();

      return activities;
    } catch (error) {
      winstonLogger.error('❌ Error fetching activity', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get unread activity count
   * @param {string} userId - User ID
   * @returns {Promise<number>}
   */
  static async getUnreadCount(userId) {
    try {
      return await Notification.countDocuments({
        user_id: userId,
        read: false,
        archived: false,
      });
    } catch (error) {
      winstonLogger.error('❌ Error fetching unread count', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark activity as read
   * @param {string} activityId - Activity ID
   * @param {string} userId - User ID (for auth)
   * @returns {Promise<Object>}
   */
  static async markActivityAsRead(activityId, userId) {
    try {
      if (!mongoose.isValidObjectId(activityId)) {
        return { success: false };
      }
      const updated = await Notification.findOneAndUpdate(
        { _id: activityId, user_id: userId },
        { read: true, read_at: new Date() },
        { new: true }
      ).lean();
      return updated || { success: false };
    } catch (error) {
      winstonLogger.error('❌ Error marking activity as read', {
        activityId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark all activities as read
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  static async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { user_id: userId, read: false, archived: false },
        { read: true, read_at: new Date() }
      );
      return { modifiedCount: result.modifiedCount || 0 };
    } catch (error) {
      winstonLogger.error('❌ Error marking all as read', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Archive activity
   * @param {string} activityId - Activity ID
   * @param {string} userId - User ID (for auth)
   * @returns {Promise<Object>}
   */
  static async archiveActivity(activityId, userId) {
    try {
      if (!mongoose.isValidObjectId(activityId)) {
        return { success: false };
      }
      await Notification.findOneAndUpdate(
        { _id: activityId, user_id: userId },
        { archived: true, archived_at: new Date() }
      );
      return { success: true };
    } catch (error) {
      winstonLogger.error('❌ Error archiving activity', {
        activityId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get activity filters (predefined views)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Filter options
   */
  static async getActivityFilters(userId) {
    try {
      return {
        eventTypes: [
          { id: 'campaign_activated', label: 'Campaign Activated', icon: 'Rocket' },
          { id: 'campaign_paused', label: 'Campaign Paused', icon: 'PauseCircle' },
          { id: 'campaign_completed', label: 'Campaign Completed', icon: 'CheckCircle' },
          { id: 'donation_received', label: 'Donation Received', icon: 'DollarSign' },
          { id: 'goal_reached', label: 'Goal Reached', icon: 'Target' },
          { id: 'milestone_achieved', label: 'Milestone Achieved', icon: 'Trophy' },
          { id: 'comment_received', label: 'Comment Received', icon: 'MessageCircle' },
          { id: 'share_recorded', label: 'Share Recorded', icon: 'Share2' },
        ],
      };
    } catch (error) {
      winstonLogger.error('❌ Error getting activity filters', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = ActivityFeedService;
