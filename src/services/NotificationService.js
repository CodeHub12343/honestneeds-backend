/**
 * Notification Service
 * Handles sending email and in-app notifications
 */

const emailService = require('./emailService');
const BroadcastNotification = require('../models/BroadcastNotification');
const { winstonLogger } = require('../utils/logger');

class NotificationService {
  /**
   * Send email notification
   * 
   * @param {object} options - Email options
   * @param {string} options.to - Recipient email address
   * @param {string} options.subject - Email subject
   * @param {string} options.htmlBody - HTML email body
   * @param {string} options.textBody - Plain text email body
   * @param {object} options.metadata - Additional metadata for tracking
   * @returns {Promise} Email send result
   */
  static async sendEmail(options) {
    try {
      winstonLogger.info('Sending email notification', {
        to: options.to,
        subject: options.subject,
      });

      const result = await emailService.send({
        to: options.to,
        subject: options.subject,
        htmlBody: options.htmlBody,
        textBody: options.textBody,
        metadata: options.metadata,
      });

      winstonLogger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
      });

      return {
        success: true,
        result,
      };
    } catch (error) {
      winstonLogger.error('Failed to send email', {
        to: options.to,
        subject: options.subject,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create in-app notification
   * 
   * @param {object} options - Notification options
   * @param {string} options.type - Notification type (e.g., 'sweepstakes_winner', 'deposit', 'payout')
   * @param {string} options.title - Notification title
   * @param {string} options.message - Notification message
   * @param {string} options.user_id - Recipient user ID (optional, for targeted notification)
   * @param {string} options.segment - Target segment (e.g., 'all_users', 'creators', 'supporters')
   * @param {object} options.data - Additional notification data/metadata
   * @param {number} options.priority - Notification priority (0=low, 1=normal, 2=high)
   * @returns {Promise} Notification creation result
   */
  static async createInAppNotification(options) {
    try {
      winstonLogger.info('Creating in-app notification', {
        type: options.type,
        title: options.title,
        segment: options.segment,
      });

      // If user_id is provided, create targeted notification
      if (options.user_id) {
        const notification = await BroadcastNotification.create({
          notification_type: options.type,
          title: options.title,
          message: options.message,
          target_users: [options.user_id],
          target_segment: 'specific_users',
          priority: options.priority || 1,
          status: 'scheduled',
          data: options.data || {},
          created_by: 'system',
          scheduled_at: new Date(),
        });

        winstonLogger.info('Targeted in-app notification created', {
          notificationId: notification._id,
          userId: options.user_id,
          type: options.type,
        });

        return {
          success: true,
          notificationId: notification._id,
        };
      } else {
        // Create broadcast notification for segment
        const notification = await BroadcastNotification.create({
          notification_type: options.type,
          title: options.title,
          message: options.message,
          target_segment: options.segment || 'all_users',
          priority: options.priority || 1,
          status: 'scheduled',
          data: options.data || {},
          created_by: 'system',
          scheduled_at: new Date(),
        });

        winstonLogger.info('Broadcast in-app notification created', {
          notificationId: notification._id,
          segment: options.segment,
          type: options.type,
        });

        return {
          success: true,
          notificationId: notification._id,
        };
      }
    } catch (error) {
      winstonLogger.error('Failed to create in-app notification', {
        type: options.type,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send both email and in-app notification
   * 
   * @param {object} emailOptions - Email options
   * @param {object} notificationOptions - In-app notification options
   * @returns {Promise} Both results
   */
  static async sendBothNotifications(emailOptions, notificationOptions) {
    try {
      const [emailResult, notificationResult] = await Promise.all([
        this.sendEmail(emailOptions),
        this.createInAppNotification(notificationOptions),
      ]);

      return {
        success: emailResult.success && notificationResult.success,
        email: emailResult,
        notification: notificationResult,
      };
    } catch (error) {
      winstonLogger.error('Failed to send both notifications', {
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = { NotificationService };
