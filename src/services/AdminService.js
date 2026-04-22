const User = require('../models/User');
const Campaign = require('../models/Campaign');
const UserReport = require('../models/UserReport');
const AuditLog = require('../models/AuditLog');
const PlatformSettings = require('../models/PlatformSettings');
const BroadcastNotification = require('../models/BroadcastNotification');
const Transaction = require('../models/Transaction');
const { logger } = require('../utils/logger');

class AdminService {
  /**
   * USER MANAGEMENT
   */

  /**
   * Get all users with optional filters
   */
  static async listUsers(filters = {}) {
    try {
      const { page = 1, limit = 20, status, sortBy = 'created_at' } = filters;
      const skip = (page - 1) * limit;

      const query = {};
      if (status === 'verified') query.is_verified = true;
      if (status === 'unverified') query.is_verified = false;
      if (status === 'blocked') query.is_blocked = true;

      const users = await User.find(query)
        .select('-password')
        .sort({ [sortBy]: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      const total = await User.countDocuments(query);

      return {
        users,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: page,
          limit,
        },
      };
    } catch (error) {
      logger.error('Error listing users:', error);
      throw error;
    }
  }

  /**
   * Get user details
   */
  static async getUserDetail(userId) {
    try {
      const user = await User.findById(userId).select('-password').lean();
      if (!user) throw new Error('User not found');

      // Get related statistics
      const reportCount = await UserReport.countDocuments({ reported_user_id: userId });
      const campaignCount = await Campaign.countDocuments({ creator_id: userId });
      const donationCount = await Transaction.countDocuments({
        donor_id: userId,
        type: 'donation',
      });

      return {
        ...user,
        report_count: reportCount,
        campaign_count: campaignCount,
        donation_count: donationCount,
      };
    } catch (error) {
      logger.error('Error getting user detail:', error);
      throw error;
    }
  }

  /**
   * Verify user
   */
  static async verifyUser(userId, adminId, metadata = {}) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          is_verified: true,
          verified_at: new Date(),
        },
        { new: true }
      ).select('-password');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'user_verified',
        entity_type: 'User',
        entity_id: userId,
        description: `User verified: ${user.email}`,
        changes: {
          before: { is_verified: false },
          after: { is_verified: true },
        },
        metadata,
      });

      return user;
    } catch (error) {
      logger.error('Error verifying user:', error);
      throw error;
    }
  }

  /**
   * Reject user verification
   */
  static async rejectUserVerification(userId, adminId, reason = '') {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          is_verified: false,
          verification_rejected_at: new Date(),
          verification_rejection_reason: reason,
        },
        { new: true }
      ).select('-password');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'user_rejected',
        entity_type: 'User',
        entity_id: userId,
        description: `User verification rejected: ${user.email}`,
        changes: {
          before: { is_verified: true },
          after: { is_verified: false },
        },
        metadata: { reason },
      });

      return user;
    } catch (error) {
      logger.error('Error rejecting user verification:', error);
      throw error;
    }
  }

  /**
   * Block user
   */
  static async blockUser(userId, adminId, reason = '') {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          is_blocked: true,
          blocked_at: new Date(),
          block_reason: reason,
        },
        { new: true }
      ).select('-password');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'user_blocked',
        entity_type: 'User',
        entity_id: userId,
        description: `User blocked: ${user.email}`,
        metadata: { reason },
      });

      logger.info(`User blocked: ${user.email}`);
      return user;
    } catch (error) {
      logger.error('Error blocking user:', error);
      throw error;
    }
  }

  /**
   * Unblock user
   */
  static async unblockUser(userId, adminId) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          is_blocked: false,
          blocked_at: null,
          block_reason: null,
        },
        { new: true }
      ).select('-password');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'user_unblocked',
        entity_type: 'User',
        entity_id: userId,
        description: `User unblocked: ${user.email}`,
      });

      return user;
    } catch (error) {
      logger.error('Error unblocking user:', error);
      throw error;
    }
  }

  /**
   * Delete user (soft delete)
   */
  static async deleteUser(userId, adminId, reason = '') {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          deleted_at: new Date(),
          deletion_reason: reason,
        },
        { new: true }
      ).select('-password');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'user_deleted',
        entity_type: 'User',
        entity_id: userId,
        description: `User deleted: ${user.email}`,
        metadata: { reason },
      });

      return user;
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * CAMPAIGN MANAGEMENT
   */

  /**
   * Get all campaigns with filters
   */
  static async listCampaigns(filters = {}) {
    try {
      const { page = 1, limit = 20, status, sortBy = 'created_at' } = filters;
      const skip = (page - 1) * limit;

      const query = {};
      if (status) query.status = status;

      const campaigns = await Campaign.find(query)
        .sort({ [sortBy]: -1 })
        .limit(limit)
        .skip(skip)
        .populate('creator_id', 'name email')
        .lean();

      const total = await Campaign.countDocuments(query);

      return {
        campaigns,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: page,
          limit,
        },
      };
    } catch (error) {
      logger.error('Error listing campaigns:', error);
      throw error;
    }
  }

  /**
   * Get campaign detail
   */
  static async getCampaignDetail(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId)
        .populate('creator_id', 'name email')
        .lean();

      if (!campaign) throw new Error('Campaign not found');

      // Get statistics
      const transactionCount = await Transaction.countDocuments({ campaign_id: campaignId });

      return {
        ...campaign,
        transaction_count: transactionCount,
      };
    } catch (error) {
      logger.error('Error getting campaign detail:', error);
      throw error;
    }
  }

  /**
   * Approve campaign
   */
  static async approveCampaign(campaignId, adminId, notes = '') {
    try {
      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          status: 'active',
          status_change_reason: 'Approved by admin',
          approved_by: adminId,
          approved_at: new Date(),
        },
        { new: true }
      ).populate('creator_id', 'name email');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'campaign_approved',
        entity_type: 'Campaign',
        entity_id: campaignId,
        description: `Campaign approved: ${campaign.title}`,
        metadata: { notes },
      });

      return campaign;
    } catch (error) {
      logger.error('Error approving campaign:', error);
      throw error;
    }
  }

  /**
   * Reject campaign
   */
  static async rejectCampaign(campaignId, adminId, reason = '') {
    try {
      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          status: 'rejected',
          status_change_reason: reason,
          rejected_by: adminId,
          rejected_at: new Date(),
        },
        { new: true }
      ).populate('creator_id', 'name email');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'campaign_rejected',
        entity_type: 'Campaign',
        entity_id: campaignId,
        description: `Campaign rejected: ${campaign.title}`,
        metadata: { reason },
      });

      return campaign;
    } catch (error) {
      logger.error('Error rejecting campaign:', error);
      throw error;
    }
  }

  /**
   * REPORT MANAGEMENT
   */

  /**
   * Get all reports
   */
  static async listReports(filters = {}) {
    try {
      const { page = 1, limit = 50, status } = filters;
      const skip = (page - 1) * limit;

      const query = {};
      if (status) query.status = status;

      const reports = await UserReport.find(query)
        .sort({ severity: -1, created_at: -1 })
        .limit(limit)
        .skip(skip)
        .populate('reporter_id', 'name email')
        .populate('reported_user_id', 'name email')
        .lean();

      const total = await UserReport.countDocuments(query);

      return {
        reports,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: page,
          limit,
        },
      };
    } catch (error) {
      logger.error('Error listing reports:', error);
      throw error;
    }
  }

  /**
   * Resolve report
   */
  static async resolveReport(reportId, adminId, resolution, actionTaken = 'none') {
    try {
      const report = await UserReport.findById(reportId);
      if (!report) throw new Error('Report not found');

      await report.resolve(resolution, actionTaken, adminId);

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'report_resolved',
        entity_type: 'UserReport',
        entity_id: reportId,
        description: `Report resolved: ${report.reason}`,
        metadata: { actionTaken, resolution },
      });

      return report;
    } catch (error) {
      logger.error('Error resolving report:', error);
      throw error;
    }
  }

  /**
   * Dismiss report
   */
  static async dismissReport(reportId, adminId, reason = '') {
    try {
      const report = await UserReport.findById(reportId);
      if (!report) throw new Error('Report not found');

      await report.dismiss(reason, adminId);

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'report_dismissed',
        entity_type: 'UserReport',
        entity_id: reportId,
        description: `Report dismissed: ${report.reason}`,
        metadata: { reason },
      });

      return report;
    } catch (error) {
      logger.error('Error dismissing report:', error);
      throw error;
    }
  }

  /**
   * ANALYTICS & REPORTING
   */

  /**
   * Get admin dashboard statistics
   */
  static async getDashboardStatistics() {
    try {
      const totalUsers = await User.countDocuments();
      const verifiedUsers = await User.countDocuments({ is_verified: true });
      const blockedUsers = await User.countDocuments({ is_blocked: true });

      const totalCampaigns = await Campaign.countDocuments();
      const activeCampaigns = await Campaign.countDocuments({ status: 'active' });
      const completedCampaigns = await Campaign.countDocuments({ status: 'completed' });

      const openReports = await UserReport.countDocuments({ status: 'open' });
      const investigatingReports = await UserReport.countDocuments({ status: 'investigating' });
      const resolvedReports = await UserReport.countDocuments({ status: 'resolved' });

      const totalTransactions = await Transaction.countDocuments();
      const totalRevenue = await Transaction.aggregate([
        { $match: { type: 'donation' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);

      return {
        users: {
          total: totalUsers,
          verified: verifiedUsers,
          unverified: totalUsers - verifiedUsers,
          blocked: blockedUsers,
        },
        campaigns: {
          total: totalCampaigns,
          active: activeCampaigns,
          completed: completedCampaigns,
          draft: totalCampaigns - activeCampaigns - completedCampaigns,
        },
        reports: {
          open: openReports,
          investigating: investigatingReports,
          resolved: resolvedReports,
          total: openReports + investigatingReports + resolvedReports,
        },
        transactions: {
          total: totalTransactions,
          revenue: totalRevenue[0]?.total || 0,
        },
      };
    } catch (error) {
      logger.error('Error getting dashboard statistics:', error);
      throw error;
    }
  }

  /**
   * Get audit logs
   */
  static async getAuditLogs(filters = {}) {
    try {
      const { page = 1, limit = 50, actionType, adminId } = filters;
      const skip = (page - 1) * limit;

      const query = {};
      if (actionType) query.action_type = actionType;
      if (adminId) query.admin_id = adminId;

      const logs = await AuditLog.find(query)
        .sort({ created_at: -1 })
        .limit(limit)
        .skip(skip)
        .populate('admin_id', 'name email')
        .lean();

      const total = await AuditLog.countDocuments(query);

      return {
        logs,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: page,
          limit,
        },
      };
    } catch (error) {
      logger.error('Error getting audit logs:', error);
      throw error;
    }
  }

  /**
   * SETTINGS MANAGEMENT
   */

  /**
   * Get all settings
   */
  static async getSettings() {
    try {
      return await PlatformSettings.getAllSettings();
    } catch (error) {
      logger.error('Error getting settings:', error);
      throw error;
    }
  }

  /**
   * Update settings
   */
  static async updateSettings(key, value, adminId) {
    try {
      const settings = await PlatformSettings.updateByKey(key, value, adminId);

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'settings_updated',
        entity_type: 'Settings',
        entity_id: settings._id,
        description: `Settings updated: ${key}`,
        changes: {
          before: { key },
          after: { key, value },
        },
      });

      return settings;
    } catch (error) {
      logger.error('Error updating settings:', error);
      throw error;
    }
  }

  /**
   * BROADCAST NOTIFICATIONS
   */

  /**
   * Create broadcast notification
   */
  static async createBroadcastNotification(notificationData, adminId) {
    try {
      const notification = await BroadcastNotification.createBroadcast({
        ...notificationData,
        created_by: adminId,
      });

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'notification_broadcast',
        entity_type: 'BroadcastNotification',
        entity_id: notification._id,
        description: `Broadcast notification created: ${notification.title}`,
        metadata: {
          segments: notificationData.target_segments,
          type: notificationData.type,
        },
      });

      return notification;
    } catch (error) {
      logger.error('Error creating broadcast notification:', error);
      throw error;
    }
  }

  /**
   * Get broadcast notifications
   */
  static async getBroadcastNotifications(filters = {}) {
    try {
      const { page = 1, limit = 20, status } = filters;
      const skip = (page - 1) * limit;

      const notifications = await BroadcastNotification.getByStatus(status || 'sent', limit, skip);

      return notifications;
    } catch (error) {
      logger.error('Error getting broadcast notifications:', error);
      throw error;
    }
  }

  /**
   * Cancel broadcast notification
   */
  static async cancelBroadcastNotification(notificationId, adminId) {
    try {
      const notification = await BroadcastNotification.findById(notificationId);
      if (!notification) throw new Error('Notification not found');

      await notification.cancel();

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'notification_cancelled',
        entity_type: 'BroadcastNotification',
        entity_id: notificationId,
        description: `Broadcast notification cancelled: ${notification.title}`,
      });

      return notification;
    } catch (error) {
      logger.error('Error cancelling broadcast notification:', error);
      throw error;
    }
  }

  /**
   * DONATION MANAGEMENT
   */

  /**
   * Get donations
   */
  static async listDonations(filters = {}) {
    try {
      const { page = 1, limit = 50, status, campaignId } = filters;
      const skip = (page - 1) * limit;

      const query = { type: 'donation' };
      if (status) query.status = status;
      if (campaignId) query.campaign_id = campaignId;

      const donations = await Transaction.find(query)
        .sort({ created_at: -1 })
        .limit(limit)
        .skip(skip)
        .populate('donor_id', 'name email')
        .populate('campaign_id', 'title')
        .lean();

      const total = await Transaction.countDocuments(query);

      return {
        donations,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: page,
          limit,
        },
      };
    } catch (error) {
      logger.error('Error listing donations:', error);
      throw error;
    }
  }

  /**
   * ACTIVITY FEED
   */

  /**
   * Get activity feed
   */
  static async getActivityFeed(filters = {}) {
    try {
      const ActivityLog = require('../models/ActivityLog');

      const { page = 1, limit = 50, activity_type, user_id } = filters;
      const skip = (page - 1) * limit;

      const query = { is_public: true };
      if (activity_type) query.activity_type = activity_type;
      if (user_id) query.user_id = user_id;

      const activities = await ActivityLog.find(query)
        .sort({ created_at: -1 })
        .limit(limit)
        .skip(skip)
        .populate('user_id', 'name email avatar')
        .lean();

      const total = await ActivityLog.countDocuments(query);

      return {
        activities,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: page,
          limit,
        },
      };
    } catch (error) {
      logger.error('Error getting activity feed:', error);
      throw error;
    }
  }

  /**
   * ALERTS MANAGEMENT
   */

  /**
   * Get alerts with filters
   */
  static async getAlerts(filters = {}) {
    try {
      const Alert = require('../models/Alert');

      const { page = 1, limit = 50, status = 'open', severity } = filters;
      const skip = (page - 1) * limit;

      const query = {};
      if (status) query.status = status;
      if (severity) query.severity = severity;

      const alerts = await Alert.find(query)
        .sort({ severity: -1, created_at: -1 })
        .limit(limit)
        .skip(skip)
        .populate('assigned_to', 'name email')
        .populate('related_entity_id')
        .lean();

      const total = await Alert.countDocuments(query);

      // Get alert statistics
      const stats = await Alert.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      const statsByStatus = stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {});

      return {
        alerts,
        statistics: statsByStatus,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: page,
          limit,
        },
      };
    } catch (error) {
      logger.error('Error getting alerts:', error);
      throw error;
    }
  }

  /**
   * Resolve alert
   */
  static async resolveAlert(alertId, adminId, notes = '') {
    try {
      const Alert = require('../models/Alert');

      const alert = await Alert.findByIdAndUpdate(
        alertId,
        {
          status: 'resolved',
          resolved_at: new Date(),
          resolved_by: adminId,
          resolution_notes: notes,
        },
        { new: true }
      ).populate('related_entity_id');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'alert_resolved',
        entity_type: 'Alert',
        entity_id: alertId,
        description: `Alert resolved: ${alert.title}`,
        metadata: { notes },
      });

      return alert;
    } catch (error) {
      logger.error('Error resolving alert:', error);
      throw error;
    }
  }

  /**
   * Dismiss alert
   */
  static async dismissAlert(alertId, adminId, reason = '') {
    try {
      const Alert = require('../models/Alert');

      const alert = await Alert.findByIdAndUpdate(
        alertId,
        {
          status: 'dismissed',
          resolution_notes: reason,
        },
        { new: true }
      );

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'alert_dismissed',
        entity_type: 'Alert',
        entity_id: alertId,
        description: `Alert dismissed: ${alert.title}`,
        metadata: { reason },
      });

      return alert;
    } catch (error) {
      logger.error('Error dismissing alert:', error);
      throw error;
    }
  }

  /**
   * Assign alert to admin
   */
  static async assignAlert(alertId, adminId) {
    try {
      const Alert = require('../models/Alert');

      const alert = await Alert.findByIdAndUpdate(
        alertId,
        {
          assigned_to: adminId,
          status: 'investigating',
        },
        { new: true }
      ).populate('assigned_to', 'name email');

      return alert;
    } catch (error) {
      logger.error('Error assigning alert:', error);
      throw error;
    }
  }

  /**
   * CATEGORIES MANAGEMENT
   */

  /**
   * Get all categories
   */
  static async listCategories(filters = {}) {
    try {
      const Category = require('../models/Category');

      const { page = 1, limit = 50, is_active, is_featured } = filters;
      const skip = (page - 1) * limit;

      const query = {};
      if (is_active !== undefined) query.is_active = is_active;
      if (is_featured !== undefined) query.is_featured = is_featured;

      const categories = await Category.find(query)
        .sort({ display_order: 1, name: 1 })
        .limit(limit)
        .skip(skip)
        .populate('created_by', 'name email')
        .populate('updated_by', 'name email')
        .lean();

      const total = await Category.countDocuments(query);

      return {
        categories,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: page,
          limit,
        },
      };
    } catch (error) {
      logger.error('Error listing categories:', error);
      throw error;
    }
  }

  /**
   * Create category
   */
  static async createCategory(categoryData, adminId) {
    try {
      const Category = require('../models/Category');

      const category = new Category({
        ...categoryData,
        created_by: adminId,
      });

      await category.save();

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'category_created',
        entity_type: 'Category',
        entity_id: category._id,
        description: `Category created: ${category.name}`,
      });

      return category;
    } catch (error) {
      logger.error('Error creating category:', error);
      throw error;
    }
  }

  /**
   * Update category
   */
  static async updateCategory(categoryId, categoryData, adminId) {
    try {
      const Category = require('../models/Category');

      const category = await Category.findByIdAndUpdate(
        categoryId,
        {
          ...categoryData,
          updated_by: adminId,
        },
        { new: true }
      );

      if (!category) throw new Error('Category not found');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'category_updated',
        entity_type: 'Category',
        entity_id: categoryId,
        description: `Category updated: ${category.name}`,
        metadata: { changes: categoryData },
      });

      return category;
    } catch (error) {
      logger.error('Error updating category:', error);
      throw error;
    }
  }

  /**
   * Delete category (soft delete)
   */
  static async deleteCategory(categoryId, adminId) {
    try {
      const Category = require('../models/Category');

      const category = await Category.findByIdAndUpdate(
        categoryId,
        {
          is_active: false,
          updated_by: adminId,
        },
        { new: true }
      );

      if (!category) throw new Error('Category not found');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'category_deleted',
        entity_type: 'Category',
        entity_id: categoryId,
        description: `Category deleted: ${category.name}`,
      });

      return category;
    } catch (error) {
      logger.error('Error deleting category:', error);
      throw error;
    }
  }

  /**
   * CONTENT MANAGEMENT (CMS)
   */

  /**
   * Get all platform content
   */
  static async listPlatformContent(filters = {}) {
    try {
      const PlatformContent = require('../models/PlatformContent');

      const { page = 1, limit = 50, is_published, language = 'en' } = filters;
      const skip = (page - 1) * limit;

      const query = { language };
      if (is_published !== undefined) query.is_published = is_published;

      const content = await PlatformContent.find(query)
        .sort({ display_order: 1, updated_at: -1 })
        .limit(limit)
        .skip(skip)
        .populate('author', 'name email')
        .populate('editor', 'name email')
        .lean();

      const total = await PlatformContent.countDocuments(query);

      return {
        content,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: page,
          limit,
        },
      };
    } catch (error) {
      logger.error('Error listing platform content:', error);
      throw error;
    }
  }

  /**
   * Get content by type
   */
  static async getPlatformContentByType(contentType, language = 'en') {
    try {
      const PlatformContent = require('../models/PlatformContent');

      const content = await PlatformContent.findOne({
        content_type: contentType,
        language,
      }).populate('author', 'name email').populate('editor', 'name email');

      if (!content) throw new Error('Content not found');

      return content;
    } catch (error) {
      logger.error('Error getting platform content:', error);
      throw error;
    }
  }

  /**
   * Create or update platform content
   */
  static async savePlatformContent(contentType, contentData, adminId) {
    try {
      const PlatformContent = require('../models/PlatformContent');

      let content = await PlatformContent.findOne({
        content_type: contentType,
        language: contentData.language || 'en',
      });

      if (!content) {
        content = new PlatformContent({
          content_type: contentType,
          ...contentData,
          author: adminId,
          editor: adminId,
        });
      } else {
        content = Object.assign(content, contentData);
        content.editor = adminId;
      }

      await content.save();

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'content_updated',
        entity_type: 'Content',
        entity_id: content._id,
        description: `Content updated: ${content.title}`,
        metadata: { content_type: contentType },
      });

      return content;
    } catch (error) {
      logger.error('Error saving platform content:', error);
      throw error;
    }
  }

  /**
   * Publish content
   */
  static async publishContent(contentId, adminId) {
    try {
      const PlatformContent = require('../models/PlatformContent');

      const content = await PlatformContent.findByIdAndUpdate(
        contentId,
        {
          is_published: true,
          publish_date: new Date(),
          editor: adminId,
        },
        { new: true }
      );

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'content_published',
        entity_type: 'Content',
        entity_id: contentId,
        description: `Content published: ${content.title}`,
      });

      return content;
    } catch (error) {
      logger.error('Error publishing content:', error);
      throw error;
    }
  }

  /**
   * Unpublish content
   */
  static async unpublishContent(contentId, adminId) {
    try {
      const PlatformContent = require('../models/PlatformContent');

      const content = await PlatformContent.findByIdAndUpdate(
        contentId,
        {
          is_published: false,
          editor: adminId,
        },
        { new: true }
      );

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'content_unpublished',
        entity_type: 'Content',
        entity_id: contentId,
        description: `Content unpublished: ${content.title}`,
      });

      return content;
    } catch (error) {
      logger.error('Error unpublishing content:', error);
      throw error;
    }
  }

  /**
   * Delete content
   */
  static async deleteContent(contentId, adminId) {
    try {
      const PlatformContent = require('../models/PlatformContent');

      const content = await PlatformContent.findByIdAndDelete(contentId);

      if (!content) throw new Error('Content not found');

      // Create audit log
      await AuditLog.createLog({
        admin_id: adminId,
        action_type: 'content_deleted',
        entity_type: 'Content',
        entity_id: contentId,
        description: `Content deleted: ${content.title}`,
      });

      return content;
    } catch (error) {
      logger.error('Error deleting content:', error);
      throw error;
    }
  }
}

module.exports = AdminService;
