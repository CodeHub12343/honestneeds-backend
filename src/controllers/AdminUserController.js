/**
 * AdminUserController
 *
 * Handles all admin user management operations:
 * - User list with filtering
 * - User detail view
 * - User verification/rejection
 * - User blocking/unblocking
 * - Report management (list, submit, resolve)
 * - User data export (GDPR)
 * - User deletion
 * - Admin statistics
 */

const User = require('../models/User');
const UserReport = require('../models/UserReport');
const { winstonLogger } = require('../utils/logger');
const json2csv = require('json2csv').Parser;

class AdminUserController {
  /**
   * GET /admin/users
   * List all users with filtering and pagination
   *
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number (default: 1)
   * @param {number} req.query.limit - Results per page (default: 20, max: 100)
   * @param {string} req.query.search - Search email/display_name
   * @param {string} req.query.role - Filter by role (user|creator|admin)
   * @param {string} req.query.verified - Filter by verified status (true|false)
   * @param {string} req.query.status - Filter by account status (active|blocked|deleted)
   * @param {string} req.query.sortBy - Sort field (email|created_at|login_count|donations_made)
   * @returns {Object} Paginated users list
   */
  async listUsers(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const search = req.query.search?.trim().toLowerCase();
      const role = req.query.role;
      const verified = req.query.verified;
      const status = req.query.status;
      const sortBy = req.query.sortBy || 'created_at';

      winstonLogger.info('Admin: listing users', { page, limit, search, role, verified, status });

      // Build query
      const query = {};

      // Search filter
      if (search) {
        query.$or = [
          { email: { $regex: search, $options: 'i' } },
          { display_name: { $regex: search, $options: 'i' } }
        ];
      }

      // Role filter
      if (role && ['user', 'creator', 'admin'].includes(role)) {
        query.role = role;
      }

      // Verification filter
      if (verified !== undefined) {
        query.verified = verified === 'true';
      }

      // Account status filter
      if (status === 'active') {
        query.deleted_at = null;
        query.blocked = { $ne: true };
      } else if (status === 'blocked') {
        query.blocked = true;
      } else if (status === 'deleted') {
        query.deleted_at = { $ne: null };
      }

      // Build sort
      const sortObj = {};
      if (sortBy === 'donations_made') {
        sortObj['stats.donations_made'] = -1;
      } else if (sortBy === 'login_count') {
        sortObj.login_count = -1;
      } else {
        sortObj[sortBy] = sortBy === 'email' ? 1 : -1;
      }

      const skip = (page - 1) * limit;
      const users = await User.find(query)
        .select('-password_hash -verification_token -password_reset_token')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await User.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: {
          users,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: page < Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error listing users', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to list users',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /admin/users/:userId
   * Get detailed user information
   *
   * @param {Object} req - Express request
   * @param {string} req.params.userId - User ID
   * @returns {Object} User details with stats and reports count
   */
  async getUserDetail(req, res) {
    try {
      const { userId } = req.params;

      winstonLogger.info('Admin: getting user detail', { userId });

      const user = await User.findById(userId)
        .select('-password_hash -verification_token -password_reset_token')
        .lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get associated reports count
      const reportCount = await UserReport.countDocuments({
        reported_user_id: userId
      });

      return res.status(200).json({
        success: true,
        data: {
          ...user,
          reports_count: reportCount
        }
      });
    } catch (error) {
      winstonLogger.error('Error getting user detail', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get user details',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * PATCH /admin/users/:userId/verify
   * Verify a user account (mark as verified)
   *
   * @param {Object} req - Express request
   * @param {string} req.params.userId - User ID
   * @returns {Object} Updated user
   */
  async verifyUser(req, res) {
    try {
      const { userId } = req.params;
      const adminId = req.user?.userId;

      winstonLogger.info('Admin: verifying user', { userId, adminId });

      const user = await User.findByIdAndUpdate(
        userId,
        {
          verified: true,
          verification_token: null,
          verification_token_expires: null,
          updated_at: new Date()
        },
        { new: true }
      ).select('-password_hash -verification_token -password_reset_token');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Log action
      winstonLogger.info('User verified', { userId, verifiedBy: adminId });

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User verified successfully'
      });
    } catch (error) {
      winstonLogger.error('Error verifying user', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to verify user',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * PATCH /admin/users/:userId/reject-verification
   * Reject user verification and require re-submission
   *
   * @param {Object} req - Express request
   * @param {string} req.params.userId - User ID
   * @param {string} req.body.reason - Rejection reason
   * @returns {Object} Updated user
   */
  async rejectVerification(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = req.user?.userId;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      winstonLogger.info('Admin: rejecting verification', { userId, reason });

      const user = await User.findByIdAndUpdate(
        userId,
        {
          verified: false,
          verification_token: null,
          verification_token_expires: null,
          verification_notes: reason,
          updated_at: new Date()
        },
        { new: true }
      ).select('-password_hash -verification_token -password_reset_token');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      winstonLogger.info('Verification rejected', { userId, rejectedBy: adminId, reason });

      return res.status(200).json({
        success: true,
        data: user,
        message: 'Verification rejected, user notified'
      });
    } catch (error) {
      winstonLogger.error('Error rejecting verification', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to reject verification',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * PATCH /admin/users/:userId/block
   * Block a user from platform activities
   *
   * @param {Object} req - Express request
   * @param {string} req.params.userId - User ID
   * @param {string} req.body.reason - Block reason
   * @returns {Object} Updated user with blocked status
   */
  async blockUser(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = req.user?.userId;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Block reason is required'
        });
      }

      // Cannot block other admins
      const targetUser = await User.findById(userId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (targetUser.role === 'admin' && targetUser._id.toString() !== adminId) {
        return res.status(403).json({
          success: false,
          message: 'Cannot block other administrators'
        });
      }

      winstonLogger.info('Admin: blocking user', { userId, reason });

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          blocked: true,
          blocked_at: new Date(),
          blocked_by: adminId,
          blocked_reason: reason,
          updated_at: new Date()
        },
        { new: true }
      ).select('-password_hash -verification_token -password_reset_token');

      winstonLogger.warn('User blocked', { userId, blockedBy: adminId, reason });

      return res.status(200).json({
        success: true,
        data: updatedUser,
        message: 'User blocked successfully'
      });
    } catch (error) {
      winstonLogger.error('Error blocking user', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to block user',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * PATCH /admin/users/:userId/unblock
   * Unblock a previously blocked user
   *
   * @param {Object} req - Express request
   * @param {string} req.params.userId - User ID
   * @returns {Object} Updated user
   */
  async unblockUser(req, res) {
    try {
      const { userId } = req.params;
      const adminId = req.user?.userId;

      winstonLogger.info('Admin: unblocking user', { userId });

      const user = await User.findByIdAndUpdate(
        userId,
        {
          blocked: false,
          blocked_at: null,
          blocked_by: null,
          blocked_reason: null,
          updated_at: new Date()
        },
        { new: true }
      ).select('-password_hash -verification_token -password_reset_token');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      winstonLogger.info('User unblocked', { userId, unblockedBy: adminId });

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User unblocked successfully'
      });
    } catch (error) {
      winstonLogger.error('Error unblocking user', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to unblock user',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /admin/users/:userId/reports
   * Get reports filed against a specific user
   *
   * @param {Object} req - Express request
   * @param {string} req.params.userId - User ID
   * @param {number} req.query.page - Page number
   * @param {string} req.query.status - Filter by report status
   * @returns {Object} Reports against user
   */
  async getUserReports(req, res) {
    try {
      const { userId } = req.params;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
      const status = req.query.status;

      winstonLogger.info('Admin: getting user reports', { userId, page });

      const query = { reported_user_id: userId };
      if (status && ['open', 'investigating', 'resolved', 'dismissed'].includes(status)) {
        query.status = status;
      }

      const skip = (page - 1) * limit;
      const reports = await UserReport.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('reporter_id', 'email display_name')
        .populate('resolved_by', 'email display_name')
        .lean();

      const total = await UserReport.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: {
          reports,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error getting user reports', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get user reports',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /admin/reports
   * List all user reports with filtering
   *
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number
   * @param {number} req.query.limit - Results per page
   * @param {string} req.query.status - Filter by status (open|investigating|resolved|dismissed)
   * @param {string} req.query.severity - Filter by severity (low|medium|high|critical)
   * @param {string} req.query.sortBy - Sort field (created_at|severity|updated_at)
   * @returns {Object} Paginated reports list
   */
  async listReports(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const status = req.query.status;
      const severity = req.query.severity;
      const sortBy = req.query.sortBy || 'created_at';

      winstonLogger.info('Admin: listing reports', { page, limit, status, severity });

      const query = {};

      if (status && ['open', 'investigating', 'resolved', 'dismissed'].includes(status)) {
        query.status = status;
      }

      if (severity && ['low', 'medium', 'high', 'critical'].includes(severity)) {
        query.severity = severity;
      }

      const sortObj = {};
      sortObj[sortBy] = sortBy === 'severity' ? 1 : -1;

      const skip = (page - 1) * limit;
      const reports = await UserReport.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .populate('reporter_id', 'email display_name')
        .populate('reported_user_id', 'email display_name')
        .populate('resolved_by', 'email display_name')
        .lean();

      const total = await UserReport.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: {
          reports,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: page < Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error listing reports', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to list reports',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /admin/reports
   * Submit a report against a user (public endpoint)
   *
   * @param {Object} req - Express request
   * @param {string} req.body.reported_user_id - User being reported
   * @param {string} req.body.reason - Report reason
   * @param {string} req.body.description - Detailed description
   * @param {Array} req.body.evidence_urls - Evidence URLs
   * @returns {Object} Created report
   */
  async submitReport(req, res) {
    try {
      const reporterId = req.user?.userId;
      const { reported_user_id, reason, description, evidence_urls } = req.body;

      if (!reporterId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to submit a report'
        });
      }

      // Validate input
      if (!reported_user_id || !reason || !description) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: reported_user_id, reason, description'
        });
      }

      if (description.length < 20 || description.length > 5000) {
        return res.status(400).json({
          success: false,
          message: 'Description must be between 20 and 5000 characters'
        });
      }

      winstonLogger.info('New report submitted', { 
        reporter: reporterId, 
        reported: reported_user_id, 
        reason 
      });

      const report = new UserReport({
        reporter_id: reporterId,
        reported_user_id,
        reason,
        description,
        evidence_urls: evidence_urls || [],
        severity: 'medium'
      });

      await report.save();

      return res.status(201).json({
        success: true,
        data: report,
        message: 'Report submitted successfully. Our team will review it soon.'
      });
    } catch (error) {
      winstonLogger.error('Error submitting report', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to submit report',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * PATCH /admin/reports/:reportId/resolve
   * Resolve a report and take action
   *
   * @param {Object} req - Express request
   * @param {string} req.params.reportId - Report ID
   * @param {string} req.body.status - Resolution status (resolved|dismissed)
   * @param {string} req.body.action_taken - Action taken (none|warning|blocked|deleted|other)
   * @param {string} req.body.resolution_notes - Admin notes
   * @returns {Object} Updated report
   */
  async resolveReport(req, res) {
    try {
      const { reportId } = req.params;
      const { status, action_taken, resolution_notes } = req.body;
      const adminId = req.user?.userId;

      if (!status || !['resolved', 'dismissed'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Valid resolution status required (resolved or dismissed)'
        });
      }

      winstonLogger.info('Admin: resolving report', { reportId, status, action: action_taken });

      const report = await UserReport.findByIdAndUpdate(
        reportId,
        {
          status,
          action_taken: action_taken || 'none',
          resolution_notes: resolution_notes || null,
          resolved_by: adminId,
          resolved_at: new Date(),
          updated_at: new Date()
        },
        { new: true }
      ).populate('reported_user_id', 'email display_name')
       .populate('reporter_id', 'email display_name');

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }

      winstonLogger.warn('Report resolved', { 
        reportId, 
        status, 
        actionTaken: action_taken,
        resolvedBy: adminId 
      });

      return res.status(200).json({
        success: true,
        data: report,
        message: 'Report resolved successfully'
      });
    } catch (error) {
      winstonLogger.error('Error resolving report', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to resolve report',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /admin/users/:userId/export
   * Export user data (GDPR compliance)
   *
   * @param {Object} req - Express request
   * @param {string} req.params.userId - User ID
   * @param {string} req.query.format - Export format (json|csv, default: json)
   * @returns {Object} User data in requested format
   */
  async exportUserData(req, res) {
    try {
      const { userId } = req.params;
      const format = req.query.format || 'json';

      if (!['json', 'csv'].includes(format)) {
        return res.status(400).json({
          success: false,
          message: 'Format must be json or csv'
        });
      }

      winstonLogger.info('Admin: exporting user data', { userId, format });

      const user = await User.findById(userId)
        .select('-password_hash')
        .lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get associated data
      const reports = await UserReport.find({
        $or: [
          { reporter_id: userId },
          { reported_user_id: userId }
        ]
      }).lean();

      const exportData = {
        user,
        reports,
        exported_at: new Date(),
        exported_by: req.user?.userId
      };

      if (format === 'csv') {
        const parser = new json2csv({ fields: Object.keys(user) });
        const csv = parser.parse([user]);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="user-${userId}-export.csv"`);
        return res.send(csv);
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="user-${userId}-export.json"`);
      return res.json(exportData);
    } catch (error) {
      winstonLogger.error('Error exporting user data', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to export user data',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * DELETE /admin/users/:userId
   * Delete a user account (soft delete)
   *
   * @param {Object} req - Express request
   * @param {string} req.params.userId - User ID
   * @param {string} req.body.reason - Deletion reason
   * @param {boolean} req.body.hard_delete - Hard delete (remove all data)
   * @returns {Object} Deletion confirmation
   */
  async deleteUser(req, res) {
    try {
      const { userId } = req.params;
      const { reason, hard_delete } = req.body;
      const adminId = req.user?.userId;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Deletion reason is required'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user has active campaigns
      const Campaign = require('../models/Campaign');
      const activeCampaigns = await Campaign.countDocuments({
        creator_id: userId,
        status: { $in: ['active', 'draft'] }
      });

      if (activeCampaigns > 0 && !hard_delete) {
        return res.status(409).json({
          success: false,
          message: `Cannot delete user with ${activeCampaigns} active/draft campaigns. Use hard_delete or archive campaigns first.`
        });
      }

      winstonLogger.info('Admin: deleting user', { userId, reason, hardDelete: hard_delete });

      if (hard_delete) {
        // Hard delete - remove from database
        await User.findByIdAndRemove(userId);
        await UserReport.deleteMany({ $or: [
          { reporter_id: userId },
          { reported_user_id: userId }
        ]});
        winstonLogger.warn('User hard deleted', { userId, deletedBy: adminId });
      } else {
        // Soft delete
        user.deleted_at = new Date();
        user.deletion_reason = reason;
        user.deleted_by = adminId;
        await user.save();
        winstonLogger.warn('User soft deleted', { userId, deletedBy: adminId });
      }

      return res.status(200).json({
        success: true,
        message: `User${hard_delete ? ' permanently' : ''} deleted successfully`
      });
    } catch (error) {
      winstonLogger.error('Error deleting user', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to delete user',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /admin/users/statistics
   * Get admin dashboard statistics
   *
   * @param {Object} req - Express request
   * @returns {Object} Platform statistics
   */
  async getUserStatistics(req, res) {
    try {
      winstonLogger.info('Admin: getting user statistics');

      const totalUsers = await User.countDocuments({ deleted_at: null });
      const verifiedUsers = await User.countDocuments({ verified: true, deleted_at: null });
      const blockedUsers = await User.countDocuments({ blocked: true, deleted_at: null });
      const adminUsers = await User.countDocuments({ role: 'admin', deleted_at: null });
      const creatorUsers = await User.countDocuments({ role: 'creator', deleted_at: null });

      // Report statistics
      const totalReports = await UserReport.countDocuments();
      const openReports = await UserReport.countDocuments({ status: 'open' });
      const criticalReports = await UserReport.countDocuments({ severity: 'critical' });

      // Recent activity
      const newUsersToday = await User.countDocuments({
        created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        deleted_at: null
      });

      return res.status(200).json({
        success: true,
        data: {
          users: {
            total: totalUsers,
            verified: verifiedUsers,
            blocked: blockedUsers,
            admins: adminUsers,
            creators: creatorUsers,
            regular: totalUsers - adminUsers - creatorUsers
          },
          reports: {
            total: totalReports,
            open: openReports,
            critical: criticalReports,
            pending_action: openReports + criticalReports
          },
          activity: {
            new_users_today: newUsersToday
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error getting user statistics', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new AdminUserController();
