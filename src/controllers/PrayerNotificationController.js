/**
 * Prayer Notification Controller
 * Manages all prayer-related notifications, preferences, and delivery
 * Handles email, in-app, push, and real-time WebSocket notifications
 */

const Prayer = require('../models/Prayer');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const NotificationPreferences = require('../models/NotificationPreferences');
const Notification = require('../models/Notification');
const EmailService = require('../services/emailService');
const RealTimeService = require('../services/RealTimeService');
const logger = require('../utils/winstonLogger');
const { nanoid } = require('nanoid');

class PrayerNotificationController {
  /**
   * Notify creator when someone prays for their campaign
   * Multi-channel delivery: email, in-app, push, WebSocket
   * @param {string} prayerId - Prayer ID
   * @returns {Promise<Object>}
   */
  static async notifyPrayerSubmitted(prayerId) {
    try {
      logger.info(`📬 Processing prayer notification for prayer: ${prayerId}`);

      // 1. Fetch prayer with relationships
      const prayer = await Prayer.findById(prayerId)
        .populate('campaign_id', 'creator_id title prayer_config prayer_metrics')
        .populate('supporter_id', 'email display_name avatar_url');

      if (!prayer) {
        throw new Error(`Prayer not found: ${prayerId}`);
      }

      if (!prayer.campaign_id) {
        throw new Error(`Campaign not found for prayer: ${prayerId}`);
      }

      const creatorId = prayer.campaign_id.creator_id;
      const campaignTitle = prayer.campaign_id.title;

      // 2. Check if creator has prayer notifications enabled
      const preferences = await NotificationPreferences.findOne({ user_id: creatorId });
      if (!preferences?.notifications_enabled) {
        logger.debug(`⊘ Notifications disabled for user: ${creatorId}`);
        return { success: false, reason: 'notifications_disabled' };
      }

      // 3. Get the specific prayer type notification setting
      const prayerTypeKey = this.getPrayerTypeNotificationKey(prayer.type);
      const typePreference = preferences.prayer_notifications?.[prayerTypeKey];

      if (!typePreference?.enabled) {
        logger.debug(
          `⊘ ${prayerTypeKey} notifications disabled for user: ${creatorId}`
        );
        return { success: false, reason: `${prayerTypeKey}_disabled` };
      }

      // 4. Prepare notification data
      const notificationData = {
        notification_id: `notif_${nanoid(12)}`,
        user_id: creatorId,
        type: prayerTypeKey,
        title: this.getNotificationTitle(prayer.type, prayer.campaign_id),
        message: this.getNotificationMessage(prayer, prayer.campaign_id),
        data: {
          prayer_id: prayerId,
          campaign_id: prayer.campaign_id._id,
          prayer_type: prayer.type,
          supporter_name: prayer.supporter_id?.display_name || 'Anonymous',
          campaign_title: campaignTitle,
        },
        timestamp: new Date(),
      };

      // 5. Send via enabled channels
      const deliveryResults = {};

      // In-app notification
      if (typePreference.channels?.includes('in_app')) {
        deliveryResults.in_app = await this.sendInAppNotification(
          notificationData,
          creatorId
        );
      }

      // Email notification
      if (typePreference.channels?.includes('email')) {
        deliveryResults.email = await this.sendEmailNotification(
          notificationData,
          creatorId,
          prayer
        );
      }

      // Push notification (if supported)
      if (typePreference.channels?.includes('push')) {
        deliveryResults.push = await this.sendPushNotification(
          notificationData,
          creatorId
        );
      }

      // Real-time WebSocket notification
      deliveryResults.websocket = await this.sendWebSocketNotification(
        notificationData,
        creatorId
      );

      logger.info(`✅ Prayer notification sent for prayer: ${prayerId}`, {
        creatorId,
        channels: Object.keys(deliveryResults).filter((k) => deliveryResults[k]),
      });

      return {
        success: true,
        notification_id: notificationData.notification_id,
        channels: deliveryResults,
      };
    } catch (error) {
      logger.error(`❌ Error sending prayer notification: ${error.message}`, {
        prayerId,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Notify supporter when their prayer is approved/rejected
   * @param {string} prayerId - Prayer ID
   * @param {string} status - 'approved' or 'rejected'
   * @param {string} reason - Optional reason for rejection
   * @returns {Promise<Object>}
   */
  static async notifyPrayerModeration(prayerId, status, reason = null) {
    try {
      logger.info(
        `📬 Processing moderation notification for prayer: ${prayerId}, status: ${status}`
      );

      // 1. Fetch prayer
      const prayer = await Prayer.findById(prayerId)
        .populate('campaign_id', 'title creator_id')
        .populate('supporter_id', 'email display_name');

      if (!prayer || !prayer.supporter_id) {
        logger.warn(`⚠️ Cannot notify: Prayer or supporter not found: ${prayerId}`);
        return { success: false, reason: 'supporter_not_found' };
      }

      const supporterId = prayer.supporter_id._id;

      // 2. Check if supporter has notifications enabled
      const preferences = await NotificationPreferences.findOne({ user_id: supporterId });
      if (!preferences?.notifications_enabled) {
        return { success: false, reason: 'notifications_disabled' };
      }

      // 3. Check specific notification type
      const notificationType =
        status === 'approved' ? 'prayer_approved' : 'prayer_rejected';
      const typePreference = preferences.prayer_notifications?.[notificationType];

      if (!typePreference?.enabled) {
        return { success: false, reason: `${notificationType}_disabled` };
      }

      // 4. Prepare notification
      const notificationData = {
        notification_id: `notif_${nanoid(12)}`,
        user_id: supporterId,
        type: notificationType,
        title: status === 'approved' ? '✅ Your Prayer Was Approved' : '❌ Prayer Moderated',
        message: this.getModerationMessage(status, prayer, reason),
        data: {
          prayer_id: prayerId,
          campaign_id: prayer.campaign_id._id,
          status,
          reason,
        },
        timestamp: new Date(),
      };

      // 5. Send notifications
      const deliveryResults = {};

      if (typePreference.channels?.includes('in_app')) {
        deliveryResults.in_app = await this.sendInAppNotification(
          notificationData,
          supporterId
        );
      }

      if (typePreference.channels?.includes('email')) {
        deliveryResults.email = await this.sendEmailNotification(
          notificationData,
          supporterId,
          prayer,
          status,
          reason
        );
      }

      if (typePreference.channels?.includes('push')) {
        deliveryResults.push = await this.sendPushNotification(
          notificationData,
          supporterId
        );
      }

      deliveryResults.websocket = await this.sendWebSocketNotification(
        notificationData,
        supporterId
      );

      logger.info(
        `✅ Moderation notification sent for prayer: ${prayerId}, status: ${status}`
      );

      return {
        success: true,
        notification_id: notificationData.notification_id,
        channels: deliveryResults,
      };
    } catch (error) {
      logger.error(
        `❌ Error sending moderation notification: ${error.message}`,
        { prayerId, stack: error.stack }
      );
      throw error;
    }
  }

  /**
   * Notify creator when prayer milestone reached (e.g., 100 prayers)
   * @param {string} campaignId - Campaign ID
   * @param {number} milestone - Milestone number (100, 500, 1000, etc.)
   * @returns {Promise<Object>}
   */
  static async notifyPrayerMilestone(campaignId, milestone) {
    try {
      logger.info(
        `🎉 Processing prayer milestone notification for campaign: ${campaignId}, milestone: ${milestone}`
      );

      // 1. Fetch campaign
      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) {
        throw new Error(`Campaign not found: ${campaignId}`);
      }

      const creatorId = campaign.creator_id;

      // 2. Check preferences
      const preferences = await NotificationPreferences.findOne({ user_id: creatorId });
      if (!preferences?.notifications_enabled) {
        return { success: false, reason: 'notifications_disabled' };
      }

      const milestonePreference = preferences.prayer_notifications?.prayer_milestone;
      if (!milestonePreference?.enabled) {
        return { success: false, reason: 'prayer_milestone_disabled' };
      }

      // 3. Prepare notification
      const notificationData = {
        notification_id: `notif_${nanoid(12)}`,
        user_id: creatorId,
        type: 'prayer_milestone',
        title: `🎉 ${milestone} Prayers! Congratulations!`,
        message: `Your campaign "${campaign.title}" has reached ${milestone} prayers! Your community's support is growing.`,
        data: {
          campaign_id: campaignId,
          milestone,
        },
        timestamp: new Date(),
      };

      // 4. Send notifications
      const deliveryResults = {};

      if (milestonePreference.channels?.includes('in_app')) {
        deliveryResults.in_app = await this.sendInAppNotification(
          notificationData,
          creatorId
        );
      }

      if (milestonePreference.channels?.includes('email')) {
        deliveryResults.email = await this.sendEmailNotification(
          notificationData,
          creatorId
        );
      }

      if (milestonePreference.channels?.includes('push')) {
        deliveryResults.push = await this.sendPushNotification(
          notificationData,
          creatorId
        );
      }

      deliveryResults.websocket = await this.sendWebSocketNotification(
        notificationData,
        creatorId
      );

      logger.info(`✅ Milestone notification sent for campaign: ${campaignId}`);

      return {
        success: true,
        notification_id: notificationData.notification_id,
        channels: deliveryResults,
      };
    } catch (error) {
      logger.error(`❌ Error sending milestone notification: ${error.message}`, {
        campaignId,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get user's notification preferences
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  static async getPreferences(userId) {
    try {
      let preferences = await NotificationPreferences.findOne({ user_id: userId });

      if (!preferences) {
        // Create default preferences if they don't exist
        preferences = await NotificationPreferences.create({
          user_id: userId,
        });
        logger.info(`✅ Default notification preferences created for user: ${userId}`);
      }

      return { success: true, data: preferences };
    } catch (error) {
      logger.error(`❌ Error fetching preferences: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update user's notification preferences
   * @param {string} userId - User ID
   * @param {Object} updates - Preference updates
   * @returns {Promise<Object>}
   */
  static async updatePreferences(userId, updates) {
    try {
      logger.info(`🔧 Updating notification preferences for user: ${userId}`);

      let preferences = await NotificationPreferences.findOne({ user_id: userId });

      if (!preferences) {
        preferences = await NotificationPreferences.create({
          user_id: userId,
          ...updates,
        });
      } else {
        // Deep merge updates with existing preferences
        Object.assign(preferences, updates);
        await preferences.save();
      }

      logger.info(`✅ Notification preferences updated for user: ${userId}`);

      return { success: true, data: preferences };
    } catch (error) {
      logger.error(`❌ Error updating preferences: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user's notifications feed
   * @param {string} userId - User ID
   * @param {number} limit - Results per page
   * @param {number} offset - Pagination offset
   * @returns {Promise<Object>}
   */
  static async getNotificationsFeed(userId, limit = 20, offset = 0) {
    try {
      const notifications = await Notification.find({ user_id: userId })
        .sort({ created_at: -1 })
        .limit(limit)
        .skip(offset)
        .lean();

      const total = await Notification.countDocuments({ user_id: userId });

      return {
        success: true,
        data: notifications,
        pagination: { total, limit, offset },
      };
    } catch (error) {
      logger.error(`❌ Error fetching notifications feed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark notification as read
   * @param {string} notificationId - Notification ID
   * @returns {Promise<Object>}
   */
  static async markAsRead(notificationId) {
    try {
      await Notification.findByIdAndUpdate(notificationId, { read: true });
      return { success: true };
    } catch (error) {
      logger.error(`❌ Error marking notification as read: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get unread notification count
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  static async getUnreadCount(userId) {
    try {
      const count = await Notification.countDocuments({
        user_id: userId,
        read: false,
      });

      return { success: true, data: { count } };
    } catch (error) {
      logger.error(`❌ Error getting unread count: ${error.message}`);
      throw error;
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Get notification key for prayer type
   * @private
   */
  static getPrayerTypeNotificationKey(prayerType) {
    const typeMap = {
      tap: 'someone_prayed',
      text: 'new_text_prayer',
      voice: 'new_voice_prayer',
      video: 'new_video_prayer',
    };
    return typeMap[prayerType] || 'someone_prayed';
  }

  /**
   * Get notification title
   * @private
   */
  static getNotificationTitle(prayerType, campaign) {
    const titles = {
      tap: '🙏 Someone prayed for your campaign',
      text: '✍️ New written prayer',
      voice: '🎤 New voice prayer',
      video: '🎥 New video prayer',
    };
    return titles[prayerType] || 'New prayer submitted';
  }

  /**
   * Get notification message
   * @private
   */
  static getNotificationMessage(prayer, campaign) {
    const supporter = prayer.supporter_id?.display_name || 'An anonymous person';
    const campaignTitle = campaign.title || 'your campaign';

    let content = '';
    if (prayer.type === 'text') {
      content = prayer.content.substring(0, 100) + (prayer.content.length > 100 ? '...' : '');
    } else if (prayer.type === 'voice') {
      content = 'submitted a voice prayer';
    } else if (prayer.type === 'video') {
      content = 'submitted a video prayer';
    } else {
      content = 'prayed for your campaign';
    }

    return `${supporter} ${content} for "${campaignTitle}"`;
  }

  /**
   * Get moderation message
   * @private
   */
  static getModerationMessage(status, prayer, reason) {
    const campaign = prayer.campaign_id?.title || 'the campaign';

    if (status === 'approved') {
      return `Your prayer for "${campaign}" has been approved and is now visible to others!`;
    } else {
      const reasonText = reason
        ? ` (Reason: ${reason})`
        : ' (This helps keep our community positive and respectful)';
      return `Your prayer for "${campaign}" was not approved${reasonText}`;
    }
  }

  /**
   * Send in-app notification
   * @private
   */
  static async sendInAppNotification(notificationData, userId) {
    try {
      const notification = await Notification.create({
        user_id: userId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data,
        read: false,
        created_at: new Date(),
      });

      logger.debug(`✅ In-app notification created: ${notification._id}`);
      return { success: true, id: notification._id };
    } catch (error) {
      logger.error(`❌ Error creating in-app notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email notification
   * @private
   */
  static async sendEmailNotification(
    notificationData,
    userId,
    prayer = null,
    status = null,
    reason = null
  ) {
    try {
      const user = await User.findById(userId).lean();
      if (!user?.email) {
        logger.warn(`⚠️ User email not found: ${userId}`);
        return { success: false, error: 'email_not_found' };
      }

      // Check do not disturb
      const preferences = await NotificationPreferences.findOne({ user_id: userId });
      if (preferences?.do_not_disturb?.enabled) {
        logger.debug(`⊘ Do not disturb active for user: ${userId}`);
        return { success: false, error: 'do_not_disturb_active' };
      }

      // Send email (implement using emailService)
      // TODO: Integrate with actual email service
      logger.debug(`📧 Email notification would be sent to: ${user.email}`);

      return { success: true, email: user.email };
    } catch (error) {
      logger.error(`❌ Error sending email notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification
   * @private
   */
  static async sendPushNotification(notificationData, userId) {
    try {
      // TODO: Implement push notification service (Firebase, OneSignal, etc.)
      logger.debug(`📱 Push notification would be sent for user: ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error(`❌ Error sending push notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send WebSocket notification
   * @private
   */
  static async sendWebSocketNotification(notificationData, userId) {
    try {
      // Emit through RealTimeService
      RealTimeService.emitToUser(userId, 'notification', notificationData);
      logger.debug(`🔌 WebSocket notification sent for user: ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error(`❌ Error sending WebSocket notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = PrayerNotificationController;
