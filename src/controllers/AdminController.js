const AdminService = require('../services/AdminService');
const { logger } = require('../utils/logger');

/**
 * AdminController
 * Handles all admin operations for user, campaign, report management
 */

class AdminController {
  /**
   * USER MANAGEMENT ENDPOINTS
   */

  /**
   * GET /admin/users
   * List all users with optional filters
   */
  static async listUsers(req, res) {
    try {
      const { page, limit, status, sortBy } = req.query;
      const result = await AdminService.listUsers({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        status,
        sortBy: sortBy || 'created_at',
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error listing users:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'LIST_USERS_ERROR',
          message: 'Failed to list users',
          details: error.message,
        },
      });
    }
  }

  /**
   * GET /admin/users/:userId
   * Get user details
   */
  static async getUserDetail(req, res) {
    try {
      const { userId } = req.params;
      const user = await AdminService.getUserDetail(userId);

      return res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      logger.error('Error getting user detail:', error);
      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_USER_ERROR',
          message: 'Failed to get user detail',
          details: error.message,
        },
      });
    }
  }

  /**
   * PATCH /admin/users/:userId/verify
   * Verify user
   */
  static async verifyUser(req, res) {
    try {
      const { userId } = req.params;
      const adminId = req.user._id;
      const { metadata } = req.body;

      const user = await AdminService.verifyUser(userId, adminId, metadata);

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User verified successfully',
      });
    } catch (error) {
      logger.error('Error verifying user:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'VERIFY_USER_ERROR',
          message: 'Failed to verify user',
          details: error.message,
        },
      });
    }
  }

  /**
   * PATCH /admin/users/:userId/reject-verification
   * Reject user verification
   */
  static async rejectUserVerification(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = req.user._id;

      const user = await AdminService.rejectUserVerification(userId, adminId, reason);

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User verification rejected',
      });
    } catch (error) {
      logger.error('Error rejecting user verification:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'REJECT_USER_ERROR',
          message: 'Failed to reject user verification',
          details: error.message,
        },
      });
    }
  }

  /**
   * PATCH /admin/users/:userId/block
   * Block user
   */
  static async blockUser(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = req.user._id;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Block reason is required',
          },
        });
      }

      const user = await AdminService.blockUser(userId, adminId, reason);

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User blocked successfully',
      });
    } catch (error) {
      logger.error('Error blocking user:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'BLOCK_USER_ERROR',
          message: 'Failed to block user',
          details: error.message,
        },
      });
    }
  }

  /**
   * PATCH /admin/users/:userId/unblock
   * Unblock user
   */
  static async unblockUser(req, res) {
    try {
      const { userId } = req.params;
      const adminId = req.user._id;

      const user = await AdminService.unblockUser(userId, adminId);

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User unblocked successfully',
      });
    } catch (error) {
      logger.error('Error unblocking user:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'UNBLOCK_USER_ERROR',
          message: 'Failed to unblock user',
          details: error.message,
        },
      });
    }
  }

  /**
   * DELETE /admin/users/:userId
   * Delete user (soft delete)
   */
  static async deleteUser(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = req.user._id;

      const user = await AdminService.deleteUser(userId, adminId, reason);

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting user:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_USER_ERROR',
          message: 'Failed to delete user',
          details: error.message,
        },
      });
    }
  }

  /**
   * CAMPAIGN MANAGEMENT ENDPOINTS
   */

  /**
   * GET /admin/campaigns
   * List all campaigns with filters
   */
  static async listCampaigns(req, res) {
    try {
      const { page, limit, status, sortBy } = req.query;
      const result = await AdminService.listCampaigns({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        status,
        sortBy: sortBy || 'created_at',
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error listing campaigns:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'LIST_CAMPAIGNS_ERROR',
          message: 'Failed to list campaigns',
          details: error.message,
        },
      });
    }
  }

  /**
   * GET /admin/campaigns/:campaignId
   * Get campaign detail
   */
  static async getCampaignDetail(req, res) {
    try {
      const { campaignId } = req.params;
      const campaign = await AdminService.getCampaignDetail(campaignId);

      return res.status(200).json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      logger.error('Error getting campaign detail:', error);
      if (error.message === 'Campaign not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaign not found',
          },
        });
      }
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_CAMPAIGN_ERROR',
          message: 'Failed to get campaign detail',
          details: error.message,
        },
      });
    }
  }

  /**
   * PATCH /admin/campaigns/:campaignId/approve
   * Approve campaign
   */
  static async approveCampaign(req, res) {
    try {
      const { campaignId } = req.params;
      const { notes } = req.body;
      const adminId = req.user._id;

      const campaign = await AdminService.approveCampaign(campaignId, adminId, notes);

      return res.status(200).json({
        success: true,
        data: campaign,
        message: 'Campaign approved successfully',
      });
    } catch (error) {
      logger.error('Error approving campaign:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'APPROVE_CAMPAIGN_ERROR',
          message: 'Failed to approve campaign',
          details: error.message,
        },
      });
    }
  }

  /**
   * PATCH /admin/campaigns/:campaignId/reject
   * Reject campaign
   */
  static async rejectCampaign(req, res) {
    try {
      const { campaignId } = req.params;
      const { reason } = req.body;
      const adminId = req.user._id;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Rejection reason is required',
          },
        });
      }

      const campaign = await AdminService.rejectCampaign(campaignId, adminId, reason);

      return res.status(200).json({
        success: true,
        data: campaign,
        message: 'Campaign rejected successfully',
      });
    } catch (error) {
      logger.error('Error rejecting campaign:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'REJECT_CAMPAIGN_ERROR',
          message: 'Failed to reject campaign',
          details: error.message,
        },
      });
    }
  }

  /**
   * REPORT MANAGEMENT ENDPOINTS
   */

  /**
   * GET /admin/reports
   * List all reports with filters
   */
  static async listReports(req, res) {
    try {
      const { page, limit, status } = req.query;
      const result = await AdminService.listReports({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        status,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error listing reports:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'LIST_REPORTS_ERROR',
          message: 'Failed to list reports',
          details: error.message,
        },
      });
    }
  }

  /**
   * POST /admin/reports/:reportId/resolve
   * Resolve report
   */
  static async resolveReport(req, res) {
    try {
      const { reportId } = req.params;
      const { resolution, actionTaken } = req.body;
      const adminId = req.user._id;

      if (!resolution) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_RESOLUTION',
            message: 'Resolution is required',
          },
        });
      }

      const report = await AdminService.resolveReport(reportId, adminId, resolution, actionTaken);

      return res.status(200).json({
        success: true,
        data: report,
        message: 'Report resolved successfully',
      });
    } catch (error) {
      logger.error('Error resolving report:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'RESOLVE_REPORT_ERROR',
          message: 'Failed to resolve report',
          details: error.message,
        },
      });
    }
  }

  /**
   * POST /admin/reports/:reportId/dismiss
   * Dismiss report
   */
  static async dismissReport(req, res) {
    try {
      const { reportId } = req.params;
      const { reason } = req.body;
      const adminId = req.user._id;

      const report = await AdminService.dismissReport(reportId, adminId, reason);

      return res.status(200).json({
        success: true,
        data: report,
        message: 'Report dismissed successfully',
      });
    } catch (error) {
      logger.error('Error dismissing report:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DISMISS_REPORT_ERROR',
          message: 'Failed to dismiss report',
          details: error.message,
        },
      });
    }
  }

  /**
   * DONATIONS ENDPOINT
   */

  /**
   * GET /admin/donations
   * List all donations with filters
   */
  static async listDonations(req, res) {
    try {
      const { page, limit, status, campaignId } = req.query;
      const result = await AdminService.listDonations({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        status,
        campaignId,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error listing donations:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'LIST_DONATIONS_ERROR',
          message: 'Failed to list donations',
          details: error.message,
        },
      });
    }
  }

  /**
   * ANALYTICS ENDPOINTS
   */

  /**
   * GET /admin/dashboard
   * Get admin dashboard statistics
   */
  static async getDashboardStatistics(req, res) {
    try {
      const stats = await AdminService.getDashboardStatistics();

      return res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting dashboard statistics:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DASHBOARD_ERROR',
          message: 'Failed to get dashboard statistics',
          details: error.message,
        },
      });
    }
  }

  /**
   * GET /admin/logs
   * Get audit logs
   */
  static async getAuditLogs(req, res) {
    try {
      const { page, limit, actionType, adminId } = req.query;
      const result = await AdminService.getAuditLogs({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        actionType,
        adminId,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error getting audit logs:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'LOGS_ERROR',
          message: 'Failed to get audit logs',
          details: error.message,
        },
      });
    }
  }

  /**
   * SETTINGS ENDPOINTS
   */

  /**
   * GET /admin/settings
   * Get all settings
   */
  static async getSettings(req, res) {
    try {
      const settings = await AdminService.getSettings();

      return res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Error getting settings:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_SETTINGS_ERROR',
          message: 'Failed to get settings',
          details: error.message,
        },
      });
    }
  }

  /**
   * POST /admin/settings
   * Update settings
   */
  static async updateSettings(req, res) {
    try {
      const { key, value } = req.body;
      const adminId = req.user._id;

      if (!key || value === undefined) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Key and value are required',
          },
        });
      }

      const settings = await AdminService.updateSettings(key, value, adminId);

      return res.status(200).json({
        success: true,
        data: settings,
        message: 'Settings updated successfully',
      });
    } catch (error) {
      logger.error('Error updating settings:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_SETTINGS_ERROR',
          message: 'Failed to update settings',
          details: error.message,
        },
      });
    }
  }

  /**
   * BROADCAST NOTIFICATION ENDPOINTS
   */

  /**
   * POST /admin/notifications/broadcast
   * Create broadcast notification
   */
  static async createBroadcastNotification(req, res) {
    try {
      const { title, message, type, targetSegments, scheduledFor } = req.body;
      const adminId = req.user._id;

      if (!title || !message) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Title and message are required',
          },
        });
      }

      const notification = await AdminService.createBroadcastNotification(
        {
          title,
          message,
          type: type || 'announcement',
          target_segments: targetSegments || ['all_users'],
          scheduled_for: scheduledFor || new Date(),
        },
        adminId
      );

      return res.status(201).json({
        success: true,
        data: notification,
        message: 'Broadcast notification created successfully',
      });
    } catch (error) {
      logger.error('Error creating broadcast notification:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_NOTIFICATION_ERROR',
          message: 'Failed to create broadcast notification',
          details: error.message,
        },
      });
    }
  }

  /**
   * GET /admin/notifications
   * Get broadcast notifications
   */
  static async getBroadcastNotifications(req, res) {
    try {
      const { page, limit, status } = req.query;
      const notifications = await AdminService.getBroadcastNotifications({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        status,
      });

      return res.status(200).json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      logger.error('Error getting broadcast notifications:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_NOTIFICATIONS_ERROR',
          message: 'Failed to get broadcast notifications',
          details: error.message,
        },
      });
    }
  }

  /**
   * ACTIVITY FEED ENDPOINTS
   */

  /**
   * GET /admin/activity-feed
   * Get recent platform activities
   */
  static async getActivityFeed(req, res) {
    try {
      const { page, limit, activity_type, user_id } = req.query;
      const result = await AdminService.getActivityFeed({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        activity_type,
        user_id,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error getting activity feed:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'ACTIVITY_FEED_ERROR',
          message: 'Failed to get activity feed',
          details: error.message,
        },
      });
    }
  }

  /**
   * ALERTS ENDPOINTS
   */

  /**
   * GET /admin/alerts
   * Get system alerts
   */
  static async getAlerts(req, res) {
    try {
      const { page, limit, status, severity } = req.query;
      const result = await AdminService.getAlerts({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        status: status || 'open',
        severity,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error getting alerts:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_ALERTS_ERROR',
          message: 'Failed to get alerts',
          details: error.message,
        },
      });
    }
  }

  /**
   * POST /admin/alerts/:alertId/resolve
   * Resolve alert
   */
  static async resolveAlert(req, res) {
    try {
      const { alertId } = req.params;
      const { notes } = req.body;
      const adminId = req.user._id;

      const alert = await AdminService.resolveAlert(alertId, adminId, notes);

      return res.status(200).json({
        success: true,
        data: alert,
        message: 'Alert resolved successfully',
      });
    } catch (error) {
      logger.error('Error resolving alert:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'RESOLVE_ALERT_ERROR',
          message: 'Failed to resolve alert',
          details: error.message,
        },
      });
    }
  }

  /**
   * POST /admin/alerts/:alertId/dismiss
   * Dismiss alert
   */
  static async dismissAlert(req, res) {
    try {
      const { alertId } = req.params;
      const { reason } = req.body;
      const adminId = req.user._id;

      const alert = await AdminService.dismissAlert(alertId, adminId, reason);

      return res.status(200).json({
        success: true,
        data: alert,
        message: 'Alert dismissed successfully',
      });
    } catch (error) {
      logger.error('Error dismissing alert:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DISMISS_ALERT_ERROR',
          message: 'Failed to dismiss alert',
          details: error.message,
        },
      });
    }
  }

  /**
   * POST /admin/alerts/:alertId/assign
   * Assign alert to admin
   */
  static async assignAlert(req, res) {
    try {
      const { alertId } = req.params;
      const adminId = req.user._id;

      const alert = await AdminService.assignAlert(alertId, adminId);

      return res.status(200).json({
        success: true,
        data: alert,
        message: 'Alert assigned successfully',
      });
    } catch (error) {
      logger.error('Error assigning alert:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'ASSIGN_ALERT_ERROR',
          message: 'Failed to assign alert',
          details: error.message,
        },
      });
    }
  }

  /**
   * CATEGORIES ENDPOINTS
   */

  /**
   * GET /admin/categories
   * List all categories
   */
  static async listCategories(req, res) {
    try {
      const { page, limit, is_active, is_featured } = req.query;
      const result = await AdminService.listCategories({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        is_active: is_active ? is_active === 'true' : undefined,
        is_featured: is_featured ? is_featured === 'true' : undefined,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error listing categories:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'LIST_CATEGORIES_ERROR',
          message: 'Failed to list categories',
          details: error.message,
        },
      });
    }
  }

  /**
   * POST /admin/categories
   * Create category
   */
  static async createCategory(req, res) {
    try {
      const adminId = req.user._id;
      const category = await AdminService.createCategory(req.body, adminId);

      return res.status(201).json({
        success: true,
        data: category,
        message: 'Category created successfully',
      });
    } catch (error) {
      logger.error('Error creating category:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_CATEGORY_ERROR',
          message: 'Failed to create category',
          details: error.message,
        },
      });
    }
  }

  /**
   * PATCH /admin/categories/:categoryId
   * Update category
   */
  static async updateCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const adminId = req.user._id;
      const category = await AdminService.updateCategory(categoryId, req.body, adminId);

      return res.status(200).json({
        success: true,
        data: category,
        message: 'Category updated successfully',
      });
    } catch (error) {
      logger.error('Error updating category:', error);
      if (error.message === 'Category not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found',
          },
        });
      }
      return res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_CATEGORY_ERROR',
          message: 'Failed to update category',
          details: error.message,
        },
      });
    }
  }

  /**
   * DELETE /admin/categories/:categoryId
   * Delete category (soft delete)
   */
  static async deleteCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const adminId = req.user._id;
      const category = await AdminService.deleteCategory(categoryId, adminId);

      return res.status(200).json({
        success: true,
        data: category,
        message: 'Category deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting category:', error);
      if (error.message === 'Category not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found',
          },
        });
      }
      return res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_CATEGORY_ERROR',
          message: 'Failed to delete category',
          details: error.message,
        },
      });
    }
  }

  /**
   * CONTENT MANAGEMENT ENDPOINTS
   */

  /**
   * GET /admin/content
   * List all platform content
   */
  static async listPlatformContent(req, res) {
    try {
      const { page, limit, is_published, language } = req.query;
      const result = await AdminService.listPlatformContent({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        is_published: is_published ? is_published === 'true' : undefined,
        language: language || 'en',
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error listing platform content:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'LIST_CONTENT_ERROR',
          message: 'Failed to list content',
          details: error.message,
        },
      });
    }
  }

  /**
   * GET /admin/content/:type
   * Get content by type
   */
  static async getPlatformContent(req, res) {
    try {
      const { type } = req.params;
      const { language } = req.query;

      const content = await AdminService.getPlatformContentByType(type, language || 'en');

      return res.status(200).json({
        success: true,
        data: content,
      });
    } catch (error) {
      logger.error('Error getting platform content:', error);
      if (error.message === 'Content not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CONTENT_NOT_FOUND',
            message: 'Content not found',
          },
        });
      }
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_CONTENT_ERROR',
          message: 'Failed to get content',
          details: error.message,
        },
      });
    }
  }

  /**
   * POST /admin/content/:type
   * Create or update content
   */
  static async savePlatformContent(req, res) {
    try {
      const { type } = req.params;
      const adminId = req.user._id;

      const content = await AdminService.savePlatformContent(type, req.body, adminId);

      return res.status(200).json({
        success: true,
        data: content,
        message: 'Content saved successfully',
      });
    } catch (error) {
      logger.error('Error saving platform content:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'SAVE_CONTENT_ERROR',
          message: 'Failed to save content',
          details: error.message,
        },
      });
    }
  }

  /**
   * POST /admin/content/:contentId/publish
   * Publish content
   */
  static async publishContent(req, res) {
    try {
      const { contentId } = req.params;
      const adminId = req.user._id;

      const content = await AdminService.publishContent(contentId, adminId);

      return res.status(200).json({
        success: true,
        data: content,
        message: 'Content published successfully',
      });
    } catch (error) {
      logger.error('Error publishing content:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'PUBLISH_CONTENT_ERROR',
          message: 'Failed to publish content',
          details: error.message,
        },
      });
    }
  }

  /**
   * POST /admin/content/:contentId/unpublish
   * Unpublish content
   */
  static async unpublishContent(req, res) {
    try {
      const { contentId } = req.params;
      const adminId = req.user._id;

      const content = await AdminService.unpublishContent(contentId, adminId);

      return res.status(200).json({
        success: true,
        data: content,
        message: 'Content unpublished successfully',
      });
    } catch (error) {
      logger.error('Error unpublishing content:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'UNPUBLISH_CONTENT_ERROR',
          message: 'Failed to unpublish content',
          details: error.message,
        },
      });
    }
  }

  /**
   * DELETE /admin/content/:contentId
   * Delete content
   */
  static async deleteContent(req, res) {
    try {
      const { contentId } = req.params;
      const adminId = req.user._id;

      const content = await AdminService.deleteContent(contentId, adminId);

      return res.status(200).json({
        success: true,
        data: content,
        message: 'Content deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting content:', error);
      if (error.message === 'Content not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CONTENT_NOT_FOUND',
            message: 'Content not found',
          },
        });
      }
      return res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_CONTENT_ERROR',
          message: 'Failed to delete content',
          details: error.message,
        },
      });
    }
  }
}

module.exports = AdminController;
