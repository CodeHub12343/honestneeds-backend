/**
 * Share Verification Service
 * Manages admin verification workflow for share records
 * Handles verification, rejection, and appeal mechanisms
 */

const { ShareRecord, ShareBudgetReload } = require('../models/Share');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const winstonLogger = require('../utils/winstonLogger');
const emailService = require('./emailService');

class ShareVerificationService {
  /**
   * Get pending shares for admin review
   * Filters, pagination, and sorting
   *
   * @param {Object} filters - Filter options
   * @param {string} filters.status - 'pending_verification', 'rejected', 'appealed'
   * @param {string} filters.campaignId - Filter by campaign (optional)
   * @param {string} filters.supporterId - Filter by supporter (optional)
   * @param {string} filters.channel - Filter by channel (optional)
   * @param {number} filters.page - Page number (default: 1)
   * @param {number} filters.limit - Items per page (default: 20, max: 100)
   * @param {string} filters.sortBy - Sort field: created_at, reward_amount (default: created_at)
   * @param {string} filters.sortOrder - 'asc' or 'desc' (default: desc)
   * @returns {Promise<Object>} - Shares with pagination metadata
   */
  static async getPendingShares(filters = {}) {
    try {
      const {
        status = 'pending_verification',
        campaignId,
        supporterId,
        channel,
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc',
      } = filters;

      // Validate pagination
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const skip = (pageNum - 1) * limitNum;

      // Build query
      const query = {};

      // Status filter (support multiple statuses)
      if (status) {
        query.status = Array.isArray(status)
          ? { $in: status }
          : status;
      }

      // Optional filters
      if (campaignId) query.campaign_id = campaignId;
      if (supporterId) query.supporter_id = supporterId;
      if (channel) query.channel = channel;

      // Build sort object
      const sortObj = {};
      const validSortFields = ['created_at', 'reward_amount', 'updated_at'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
      sortObj[sortField] = sortOrder === 'asc' ? 1 : -1;

      // Execute query with population
      const shares = await ShareRecord
        .find(query)
        .populate('campaign_id', 'title creator_id')
        .populate('supporter_id', 'name email')
        .populate('verified_by', 'name email')
        .populate('rejected_by', 'name email')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec();

      // Get total count for pagination
      const total = await ShareRecord.countDocuments(query);

      return {
        success: true,
        data: {
          shares: shares.map(share => ({
            share_id: share.share_id,
            campaign_id: share.campaign_id._id,
            campaign_title: share.campaign_id.title,
            supporter_id: share.supporter_id._id,
            supporter_name: share.supporter_id.name,
            supporter_email: share.supporter_id.email,
            channel: share.channel,
            reward_amount: share.reward_amount,
            is_paid: share.is_paid,
            status: share.status,
            rejection_reason: share.rejection_reason,
            rejected_by: share.rejected_by,
            rejected_at: share.rejected_at,
            appeal_status: share.appeal_status,
            appeal_reason: share.appeal_reason,
            created_at: share.created_at,
            updated_at: share.updated_at,
            device_info: share.device_info,
            ip_address: share.ip_address,
            notes: share.notes,
          })),
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum),
            totalRecords: total,
            recordsPerPage: limitNum,
          },
        },
      };
    } catch (error) {
      winstonLogger.error('Error fetching pending shares', {
        error: error.message,
        filters,
      });
      throw {
        code: 'FETCH_PENDING_SHARES_ERROR',
        message: 'Failed to fetch pending shares',
        statusCode: 500,
      };
    }
  }

  /**
   * Verify (approve) a share
   *
   * @param {string} shareId - Share ObjectId or share_id
   * @param {string} adminId - Admin User ObjectId
   * @returns {Promise<Object>} - Updated share record
   */
  static async verifyShare(shareId, adminId) {
    try {
      // Find share (by _id or share_id)
      const share = await ShareRecord.findOne({
        $or: [{ _id: shareId }, { share_id: shareId }],
      })
        .populate('supporter_id', 'name email')
        .populate('campaign_id', 'title creator_id');

      if (!share) {
        throw {
          code: 'SHARE_NOT_FOUND',
          message: 'Share record not found',
          statusCode: 404,
        };
      }

      // Can only verify pending or appealed shares
      if (!['pending_verification', 'appealed'].includes(share.status)) {
        throw {
          code: 'INVALID_STATUS',
          message: `Cannot verify share with status: ${share.status}`,
          statusCode: 400,
        };
      }

      // Update share
      const previousStatus = share.status;
      share.status = 'verified';
      share.verified_by = adminId;
      share.verified_at = new Date();

      await share.save();

      // Create audit log
      if (AuditLog) {
        await AuditLog.create({
          admin_id: adminId,
          action_type: 'share_verified',
          entity_type: 'ShareRecord',
          entity_id: share._id,
          description: `Share verified: ${share.share_id}`,
          changes: {
            before: { status: previousStatus, verified_by: null },
            after: { status: 'verified', verified_by: adminId },
          },
          metadata: {
            share_id: share.share_id,
            campaign_id: share.campaign_id._id,
            supporter_id: share.supporter_id._id,
          },
        });
      }

      // Send notification email
      try {
        await emailService.sendShareVerifiedEmail(
          share.supporter_id.email,
          {
            supporter_name: share.supporter_id.name,
            share_id: share.share_id,
            campaign_title: share.campaign_id.title,
            reward_amount: (share.reward_amount / 100).toFixed(2),
          }
        );
      } catch (emailError) {
        winstonLogger.warn('Failed to send share verified email', {
          error: emailError.message,
          shareId: share._id,
        });
      }

      winstonLogger.info('Share verified', {
        share_id: share.share_id,
        admin_id: adminId,
      });

      return {
        success: true,
        message: 'Share verified successfully',
        data: share,
      };
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const code = error.code || 'VERIFICATION_ERROR';

      winstonLogger.error('Error verifying share', {
        error: error.message,
        shareId,
        adminId,
      });

      throw {
        code,
        message: error.message || 'Failed to verify share',
        statusCode,
      };
    }
  }

  /**
   * Reject a share with reason
   *
   * @param {string} shareId - Share ObjectId or share_id
   * @param {string} adminId - Admin User ObjectId
   * @param {string} reason - Rejection reason (required)
   * @returns {Promise<Object>} - Updated share record
   */
  static async rejectShare(shareId, adminId, reason) {
    try {
      // Validate reason
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        throw {
          code: 'INVALID_REASON',
          message: 'Rejection reason is required and must be a non-empty string',
          statusCode: 400,
        };
      }

      if (reason.length > 500) {
        throw {
          code: 'REASON_TOO_LONG',
          message: 'Rejection reason cannot exceed 500 characters',
          statusCode: 400,
        };
      }

      // Find share
      const share = await ShareRecord.findOne({
        $or: [{ _id: shareId }, { share_id: shareId }],
      })
        .populate('supporter_id', 'name email')
        .populate('campaign_id', 'title creator_id');

      if (!share) {
        throw {
          code: 'SHARE_NOT_FOUND',
          message: 'Share record not found',
          statusCode: 404,
        };
      }

      // Can only reject pending or appealed shares
      if (!['pending_verification', 'appealed'].includes(share.status)) {
        throw {
          code: 'INVALID_STATUS',
          message: `Cannot reject share with status: ${share.status}`,
          statusCode: 400,
        };
      }

      // Update share
      const previousStatus = share.status;
      share.status = 'rejected';
      share.rejected_by = adminId;
      share.rejected_at = new Date();
      share.rejection_reason = reason.trim();
      // Clear appeal fields on rejection
      share.appeal_reason = null;
      share.appeal_status = null;
      share.appealed_at = null;
      share.appeal_reviewed_by = null;
      share.appeal_reviewed_at = null;

      await share.save();

      // Create audit log
      if (AuditLog) {
        await AuditLog.create({
          admin_id: adminId,
          action_type: 'share_rejected',
          entity_type: 'ShareRecord',
          entity_id: share._id,
          description: `Share rejected: ${share.share_id}`,
          changes: {
            before: { status: previousStatus, rejected_by: null },
            after: { status: 'rejected', rejected_by: adminId },
          },
          metadata: {
            share_id: share.share_id,
            campaign_id: share.campaign_id._id,
            supporter_id: share.supporter_id._id,
            rejection_reason: reason,
          },
        });
      }

      // Send notification email
      try {
        await emailService.sendShareRejectedEmail(
          share.supporter_id.email,
          {
            supporter_name: share.supporter_id.name,
            share_id: share.share_id,
            campaign_title: share.campaign_id.title,
            rejection_reason: reason,
          }
        );
      } catch (emailError) {
        winstonLogger.warn('Failed to send share rejected email', {
          error: emailError.message,
          shareId: share._id,
        });
      }

      winstonLogger.info('Share rejected', {
        share_id: share.share_id,
        admin_id: adminId,
        reason,
      });

      return {
        success: true,
        message: 'Share rejected successfully',
        data: share,
      };
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const code = error.code || 'REJECTION_ERROR';

      winstonLogger.error('Error rejecting share', {
        error: error.message,
        shareId,
        adminId,
      });

      throw {
        code,
        message: error.message || 'Failed to reject share',
        statusCode,
      };
    }
  }

  /**
   * Submit appeal for rejected share
   *
   * @param {string} shareId - Share ObjectId or share_id
   * @param {string} supporterId - Supporter User ObjectId
   * @param {string} appealReason - Appeal reason/explanation
   * @returns {Promise<Object>} - Updated share record
   */
  static async submitAppeal(shareId, supporterId, appealReason) {
    try {
      // Validate reason
      if (!appealReason || typeof appealReason !== 'string' || appealReason.trim().length === 0) {
        throw {
          code: 'INVALID_APPEAL_REASON',
          message: 'Appeal reason is required',
          statusCode: 400,
        };
      }

      if (appealReason.length > 1000) {
        throw {
          code: 'APPEAL_REASON_TOO_LONG',
          message: 'Appeal reason cannot exceed 1000 characters',
          statusCode: 400,
        };
      }

      // Find share
      const share = await ShareRecord.findOne({
        $or: [{ _id: shareId }, { share_id: shareId }],
      });

      if (!share) {
        throw {
          code: 'SHARE_NOT_FOUND',
          message: 'Share record not found',
          statusCode: 404,
        };
      }

      // Verify ownership
      if (share.supporter_id.toString() !== supporterId.toString()) {
        throw {
          code: 'UNAUTHORIZED',
          message: 'You can only appeal your own shares',
          statusCode: 403,
        };
      }

      // Can only appeal rejected shares
      if (share.status !== 'rejected') {
        throw {
          code: 'INVALID_STATUS',
          message: `Can only appeal rejected shares. Current status: ${share.status}`,
          statusCode: 400,
        };
      }

      // Check if already appealed (prevent duplicate appeals)
      if (share.appeal_status && share.appeal_status !== 'rejected') {
        throw {
          code: 'APPEAL_ALREADY_PENDING',
          message: 'This share is already under appeal',
          statusCode: 400,
        };
      }

      // Update share
      share.status = 'appealed';
      share.appealed_at = new Date();
      share.appeal_reason = appealReason.trim();
      share.appeal_status = 'pending';
      // Clear previous appeal review if this is a reappeal
      share.appeal_reviewed_by = null;
      share.appeal_reviewed_at = null;
      share.appeal_review_reason = null;

      await share.save();

      // Create audit log
      if (AuditLog) {
        await AuditLog.create({
          user_id: supporterId,
          action_type: 'share_appeal_submitted',
          entity_type: 'ShareRecord',
          entity_id: share._id,
          description: `Appeal submitted for share: ${share.share_id}`,
          metadata: {
            share_id: share.share_id,
            appeal_reason: appealReason,
          },
        });
      }

      // Send confirmation email to supporter
      try {
        const supporter = await User.findById(supporterId, 'name email');
        await emailService.sendShareAppealSubmittedEmail(
          supporter.email,
          {
            supporter_name: supporter.name,
            share_id: share.share_id,
          }
        );
      } catch (emailError) {
        winstonLogger.warn('Failed to send appeal submitted email', {
          error: emailError.message,
          shareId: share._id,
        });
      }

      winstonLogger.info('Share appeal submitted', {
        share_id: share.share_id,
        supporter_id: supporterId,
      });

      return {
        success: true,
        message: 'Appeal submitted successfully. We will review it within 2-3 business days.',
        data: share,
      };
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const code = error.code || 'APPEAL_ERROR';

      winstonLogger.error('Error submitting share appeal', {
        error: error.message,
        shareId,
        supporterId,
      });

      throw {
        code,
        message: error.message || 'Failed to submit appeal',
        statusCode,
      };
    }
  }

  /**
   * Review and decide on an appeal
   *
   * @param {string} shareId - Share ObjectId or share_id
   * @param {string} adminId - Admin User ObjectId
   * @param {boolean} approved - Whether appeal is approved
   * @param {string} reviewReason - Reason for the decision
   * @returns {Promise<Object>} - Updated share record
   */
  static async reviewAppeal(shareId, adminId, approved, reviewReason) {
    try {
      // Validate inputs
      if (typeof approved !== 'boolean') {
        throw {
          code: 'INVALID_APPROVAL_VALUE',
          message: 'Approved must be a boolean',
          statusCode: 400,
        };
      }

      if (!reviewReason || typeof reviewReason !== 'string' || reviewReason.trim().length === 0) {
        throw {
          code: 'INVALID_REVIEW_REASON',
          message: 'Review reason is required',
          statusCode: 400,
        };
      }

      if (reviewReason.length > 500) {
        throw {
          code: 'REVIEW_REASON_TOO_LONG',
          message: 'Review reason cannot exceed 500 characters',
          statusCode: 400,
        };
      }

      // Find share
      const share = await ShareRecord.findOne({
        $or: [{ _id: shareId }, { share_id: shareId }],
      })
        .populate('supporter_id', 'name email')
        .populate('campaign_id', 'title creator_id');

      if (!share) {
        throw {
          code: 'SHARE_NOT_FOUND',
          message: 'Share record not found',
          statusCode: 404,
        };
      }

      // Can only review appealed shares
      if (share.status !== 'appealed') {
        throw {
          code: 'INVALID_STATUS',
          message: `Cannot review appeal for share with status: ${share.status}`,
          statusCode: 400,
        };
      }

      // Update share
      const previousStatus = share.status;
      const finalStatus = approved ? 'verified' : 'rejected';

      share.status = finalStatus;
      share.appeal_status = approved ? 'approved' : 'rejected';
      share.appeal_reviewed_by = adminId;
      share.appeal_reviewed_at = new Date();
      share.appeal_review_reason = reviewReason.trim();

      // If approved, clear rejection fields
      if (approved) {
        share.rejected_by = null;
        share.rejected_at = null;
        share.rejection_reason = null;
        share.verified_by = adminId;
        share.verified_at = new Date();
      } else {
        // If rejected again, update rejection fields
        share.rejected_by = adminId;
        share.rejected_at = new Date();
        share.rejection_reason = reviewReason.trim();
      }

      await share.save();

      // Create audit log
      if (AuditLog) {
        await AuditLog.create({
          admin_id: adminId,
          action_type: 'share_appeal_reviewed',
          entity_type: 'ShareRecord',
          entity_id: share._id,
          description: `Appeal ${approved ? 'approved' : 'rejected'} for share: ${share.share_id}`,
          changes: {
            before: { status: previousStatus, appeal_status: 'pending' },
            after: { status: finalStatus, appeal_status: approved ? 'approved' : 'rejected' },
          },
          metadata: {
            share_id: share.share_id,
            campaign_id: share.campaign_id._id,
            supporter_id: share.supporter_id._id,
            approved,
            review_reason: reviewReason,
          },
        });
      }

      // Send notification email
      try {
        if (approved) {
          await emailService.sendShareAppealApprovedEmail(
            share.supporter_id.email,
            {
              supporter_name: share.supporter_id.name,
              share_id: share.share_id,
              campaign_title: share.campaign_id.title,
              review_reason: reviewReason,
            }
          );
        } else {
          await emailService.sendShareAppealRejectedEmail(
            share.supporter_id.email,
            {
              supporter_name: share.supporter_id.name,
              share_id: share.share_id,
              campaign_title: share.campaign_id.title,
              review_reason: reviewReason,
            }
          );
        }
      } catch (emailError) {
        winstonLogger.warn('Failed to send appeal review email', {
          error: emailError.message,
          shareId: share._id,
        });
      }

      winstonLogger.info('Share appeal reviewed', {
        share_id: share.share_id,
        admin_id: adminId,
        approved,
      });

      return {
        success: true,
        message: `Appeal ${approved ? 'approved' : 'rejected'} successfully`,
        data: share,
      };
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const code = error.code || 'APPEAL_REVIEW_ERROR';

      winstonLogger.error('Error reviewing share appeal', {
        error: error.message,
        shareId,
        adminId,
      });

      throw {
        code,
        message: error.message || 'Failed to review appeal',
        statusCode,
      };
    }
  }

  /**
   * Get share details for admin review
   *
   * @param {string} shareId - Share ObjectId or share_id
   * @returns {Promise<Object>} - Detailed share record with related data
   */
  static async getShareDetail(shareId) {
    try {
      const share = await ShareRecord.findOne({
        $or: [{ _id: shareId }, { share_id: shareId }],
      })
        .populate('campaign_id', 'title description image_url creator_id')
        .populate('supporter_id', 'name email phone is_verified')
        .populate('verified_by', 'name email')
        .populate('rejected_by', 'name email')
        .populate('appeal_reviewed_by', 'name email');

      if (!share) {
        throw {
          code: 'SHARE_NOT_FOUND',
          message: 'Share record not found',
          statusCode: 404,
        };
      }

      return {
        success: true,
        data: share,
      };
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const code = error.code || 'FETCH_DETAIL_ERROR';

      winstonLogger.error('Error fetching share detail', {
        error: error.message,
        shareId,
      });

      throw {
        code,
        message: error.message || 'Failed to fetch share details',
        statusCode,
      };
    }
  }
}

module.exports = ShareVerificationService;
