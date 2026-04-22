const AdminPrayerService = require('../services/AdminPrayerService')
const ProfanityService = require('../services/ProfanityService')
const { logger } = require('../utils/logger')

/**
 * Admin Prayer Controller
 * Handles admin operations for prayer moderation, blocking, and analytics
 */
class AdminPrayerController {
  /**
   * GET /admin/prayers/moderation-queue
   * Get prayers pending moderation with filters
   */
  static async getModerationQueue(req, res) {
    try {
      const {
        status = [],
        report_count_min = 0,
        sortBy = 'created_at',
        sortOrder = -1,
        limit = 50,
        offset = 0,
        campaignId,
        creatorId,
        dateFrom,
        dateTo,
      } = req.query

      logger.info('📋 [Admin] Fetching moderation queue', { status, report_count_min })

      const result = await AdminPrayerService.getModerationQueue({
        status: Array.isArray(status) ? status : [status].filter(Boolean),
        report_count_min: parseInt(report_count_min) || 0,
        sortBy,
        sortOrder: parseInt(sortOrder) || -1,
        limit: Math.min(parseInt(limit) || 50, 200),
        offset: parseInt(offset) || 0,
        campaignId,
        creatorId,
        dateFrom,
        dateTo,
      })

      return res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error) {
      logger.error(`❌ [Admin] getModerationQueue error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }

  /**
   * POST /admin/prayers/bulk-approve
   * Bulk approve prayers
   */
  static async bulkApprovePrayers(req, res) {
    try {
      const { prayerIds } = req.body
      const adminId = req.user.id

      if (!Array.isArray(prayerIds) || prayerIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'prayerIds must be a non-empty array',
        })
      }

      logger.info(`✅ [Admin] Bulk approving ${prayerIds.length} prayers`)

      const result = await AdminPrayerService.bulkApprovePrayers(prayerIds, adminId)

      return res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error) {
      logger.error(`❌ [Admin] bulkApprovePrayers error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }

  /**
   * POST /admin/prayers/bulk-reject
   * Bulk reject prayers with reason
   */
  static async bulkRejectPrayers(req, res) {
    try {
      const { prayerIds, reason } = req.body
      const adminId = req.user.id

      if (!Array.isArray(prayerIds) || prayerIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'prayerIds must be a non-empty array',
        })
      }

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'reason is required',
        })
      }

      logger.info(`❌ [Admin] Bulk rejecting ${prayerIds.length} prayers`)

      const result = await AdminPrayerService.bulkRejectPrayers(
        prayerIds,
        reason,
        adminId
      )

      return res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error) {
      logger.error(`❌ [Admin] bulkRejectPrayers error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }

  /**
   * POST /admin/prayers/bulk-flag
   * Flag prayers for manual review
   */
  static async bulkFlagPrayers(req, res) {
    try {
      const { prayerIds, reason } = req.body

      if (!Array.isArray(prayerIds) || prayerIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'prayerIds must be a non-empty array',
        })
      }

      logger.info(`🚩 [Admin] Bulk flagging ${prayerIds.length} prayers`)

      const result = await AdminPrayerService.bulkFlagPrayers(prayerIds, reason)

      return res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error) {
      logger.error(`❌ [Admin] bulkFlagPrayers error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }

  /**
   * GET /admin/prayers/spam-detection
   * Get spam detection dashboard data
   */
  static async getSpamDetectionData(req, res) {
    try {
      logger.info('📊 [Admin] Fetching spam detection data')

      const data = await AdminPrayerService.getSpamDetectionData()

      return res.status(200).json({
        success: true,
        data,
      })
    } catch (error) {
      logger.error(`❌ [Admin] getSpamDetectionData error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }

  /**
   * POST /admin/users/:userId/block-prayer
   * Block user from submitting prayers
   */
  static async blockUserFromPrayers(req, res) {
    try {
      const { userId } = req.params
      const { reason, durationDays = 30 } = req.body

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'reason is required',
        })
      }

      logger.info(`🚫 [Admin] Blocking user ${userId} from prayers`)

      const result = await AdminPrayerService.blockUser(
        userId,
        reason,
        parseInt(durationDays) || 30
      )

      return res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error) {
      logger.error(`❌ [Admin] blockUserFromPrayers error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }

  /**
   * DELETE /admin/users/:userId/unblock-prayer
   * Unblock user from prayers
   */
  static async unblockUserFromPrayers(req, res) {
    try {
      const { userId } = req.params

      logger.info(`✅ [Admin] Unblocking user ${userId}`)

      const result = await AdminPrayerService.unblockUser(userId)

      return res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error) {
      logger.error(`❌ [Admin] unblockUserFromPrayers error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }

  /**
   * GET /admin/prayers/compliance-report
   * Get compliance report
   */
  static async getComplianceReport(req, res) {
    try {
      const { dateRange = 'week' } = req.query

      logger.info(`📋 [Admin] Generating compliance report`)

      const report = await AdminPrayerService.getComplianceReport(dateRange)

      return res.status(200).json({
        success: true,
        data: report,
      })
    } catch (error) {
      logger.error(`❌ [Admin] getComplianceReport error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }

  /**
   * GET /admin/prayers/export
   * Export prayers for compliance
   */
  static async exportPrayers(req, res) {
    try {
      const { dateRange = 'month', format = 'json' } = req.query

      if (!['json', 'csv'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Must be json or csv',
        })
      }

      logger.info(`📤 [Admin] Exporting prayers (${format})`)

      const result = await AdminPrayerService.exportPrayersForCompliance(
        dateRange,
        format
      )

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv')
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="prayers-${new Date().toISOString().split('T')[0]}.csv"`
        )
        return res.send(result.data)
      }

      return res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error) {
      logger.error(`❌ [Admin] exportPrayers error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }

  /**
   * GET /admin/prayers/analytics
   * Get prayer analytics
   */
  static async getPrayerAnalytics(req, res) {
    try {
      logger.info('📊 [Admin] Fetching prayer analytics')

      // Aggregate statistics from prayers
      const analytics = await AdminPrayerService.getComplianceReport('month')

      // Add additional metrics
      const enriched = {
        ...analytics,
        totalMonthly: analytics.total?.[0]?.count || 0,
        statusBreakdown: analytics.byStatus || [],
        typeBreakdown: analytics.byType || [],
        flagReasons: analytics.flagged || [],
      }

      return res.status(200).json({
        success: true,
        data: enriched,
      })
    } catch (error) {
      logger.error(`❌ [Admin] getPrayerAnalytics error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }

  /**
   * POST /admin/prayers/check-profanity
   * Check content for profanity (testing endpoint)
   */
  static async checkProfanity(req, res) {
    try {
      const { content } = req.body

      if (!content) {
        return res.status(400).json({
          success: false,
          error: 'content is required',
        })
      }

      logger.info('🔍 [Admin] Checking content for profanity')

      const profanityResult = await ProfanityService.checkProfanity(content)
      const severity = ProfanityService.getSeverityScore(content, profanityResult)
      const recommendation = ProfanityService.getRecommendation(
        profanityResult,
        severity
      )

      return res.status(200).json({
        success: true,
        data: {
          profanityResult,
          severity,
          recommendation,
        },
      })
    } catch (error) {
      logger.error(`❌ [Admin] checkProfanity error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }
}

module.exports = AdminPrayerController
