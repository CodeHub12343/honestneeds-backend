const { nanoid } = require('nanoid');
const mongoose = require('mongoose');
const Prayer = require('../models/Prayer');
const Campaign = require('../models/Campaign');
const PrayerAnalytics = require('../models/PrayerAnalytics');
const { logger } = require('../utils/logger');
const EventBus = require('../events/EventBus');

// Profanity list - in production, use external API
const PROFANITY_LIST = [
  'badword1',
  'badword2',
  // Add more words as needed or use a profanity library
];

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map();

class PrayerService {
  /**
   * Create a new prayer
   * @param {string} campaignId - Campaign ID
   * @param {string} supporterId - Supporter ID (can be null for anonymous)
   * @param {object} prayerData - Prayer data { type, content, audio_url, video_url, is_anonymous }
   * @param {string} ipAddress - IP address for spam detection
   * @param {object} userAgent - User agent for spam detection
   * @returns {Promise<object>} Created prayer
   */
  static async createPrayer(campaignId, supporterId, prayerData, ipAddress, userAgent = '') {
    try {
      logger.info(`🙏 Creating prayer for campaign ${campaignId}`);

      // 1. Verify campaign exists and prayer feature enabled
      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      if (!campaign.prayer_config?.enabled) {
        throw new Error('Prayer support not enabled for this campaign');
      }

      // 2. Check setting permissions based on prayer type
      const { type } = prayerData;
      const prayerSettings = campaign.prayer_config.settings;

      if (type === 'text' && !prayerSettings.allow_text_prayers) {
        throw new Error('Text prayers are not allowed for this campaign');
      }
      if (type === 'voice' && !prayerSettings.allow_voice_prayers) {
        throw new Error('Voice prayers are not allowed for this campaign');
      }
      if (type === 'video' && !prayerSettings.allow_video_prayers) {
        throw new Error('Video prayers are not allowed for this campaign');
      }

      // 3. Check spam/rate limit (max 10 prayers per user per day per campaign)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const prayersToday = await Prayer.countDocuments({
        campaign_id: campaignId,
        supporter_id: supporterId,
        created_at: { $gte: today },
        is_deleted: false,
      });

      if (prayersToday >= 10) {
        throw new Error('Rate limit: Maximum 10 prayers per day per campaign');
      }

      // 4. Check for duplicate submission (same user/IP within 10 seconds)
      const recentPrayer = await Prayer.findOne({
        campaign_id: campaignId,
        $or: [
          { supporter_id: supporterId },
          { ip_address: ipAddress },
        ],
        created_at: { $gte: new Date(Date.now() - 10000) },
        is_deleted: false,
      });

      if (recentPrayer) {
        throw new Error('Please wait before submitting another prayer');
      }

      // 5. Validate and potentially flag prayer content
      let flaggedReason = null;

      if (prayerData.type === 'text') {
        if (!prayerData.content || prayerData.content.trim().length === 0) {
          throw new Error('Prayer content cannot be empty');
        }
        if (prayerData.content.length > 1000) {
          throw new Error('Prayer content exceeds maximum 1000 characters');
        }

        // Check for profanity
        if (this.checkProfanity(prayerData.content)) {
          flaggedReason = 'profanity_detected';
          logger.warn(`⚠️ Profanity detected in prayer for campaign ${campaignId}`);
        }

        // Check for spam patterns
        if (this.isSpam(prayerData.content)) {
          flaggedReason = 'spam_pattern';
          logger.warn(`⚠️ Spam pattern detected in prayer for campaign ${campaignId}`);
        }
      }

      // 6. Determine visibility based on settings
      let visibility = 'private';
      if (prayerSettings.prayers_public && prayerData.type === 'tap') {
        // Taps are always public
        visibility = 'public';
      } else if (prayerSettings.prayers_public && !prayerSettings.require_approval) {
        // Auto-public if no approval needed
        visibility = 'public';
      }

      // 7. Determine status based on approval setting and flags
      let status = 'submitted';
      if (flaggedReason && !prayerSettings.require_approval) {
        status = 'flagged';
      } else if (!prayerSettings.require_approval && !flaggedReason) {
        status = 'approved';
      }

      // 8. Create prayer document
      const prayer = new Prayer({
        prayer_id: `prayer_${nanoid(12)}`,
        campaign_id: new mongoose.Types.ObjectId(campaignId),
        supporter_id: supporterId ? new mongoose.Types.ObjectId(supporterId) : null,
        type: prayerData.type,
        content: prayerData.content || undefined,
        audio_url: prayerData.audio_url,
        audio_duration_seconds: prayerData.audio_duration_seconds,
        video_url: prayerData.video_url,
        video_thumbnail_url: prayerData.video_thumbnail_url,
        video_duration_seconds: prayerData.video_duration_seconds,
        is_anonymous: prayerData.is_anonymous || false,
        visibility,
        status,
        flagged_reason: flaggedReason,
        ip_address: ipAddress,
        user_agent: userAgent,
        creator_id: campaign.creator_id,
        campaign_title: campaign.title,
        supporter_name: prayerData.is_anonymous ? null : 'Anonymous',
      });

      await prayer.save();
      logger.info(`✅ Prayer created: ${prayer.prayer_id}`);

      // 9. Update campaign metrics (denormalized for performance)
      await Campaign.updateOne(
        { _id: campaignId },
        {
          $inc: { 'prayer_metrics.total_prayers': 1 },
          $addToSet: { 'prayer_metrics.unique_supporters_prayed': supporterId },
          $set: { 'prayer_metrics.updated_at': new Date() },
        }
      );

      // 10. Update daily analytics
      await this.incrementDailyAnalytics(campaignId, prayerData.type);

      // 11. Emit event for notifications and webhooks
      EventBus.emit('prayer:created', {
        prayer_id: prayer.prayer_id,
        campaign_id: campaignId,
        creator_id: campaign.creator_id,
        supporter_id: supporterId,
        type: prayerData.type,
        status,
        flagged: !!flaggedReason,
      });

      return prayer.toObject();
    } catch (error) {
      logger.error(`❌ PrayerService.createPrayer error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Approve a prayer for public display
   * @param {string} prayerId - Prayer ID
   * @param {string} userId - User ID (must be campaign creator)
   * @returns {Promise<object>} Updated prayer
   */
  static async approvePrayer(prayerId, userId) {
    try {
      logger.info(`✅ Approving prayer ${prayerId}`);

      const prayer = await Prayer.findOne({ prayer_id: prayerId });
      if (!prayer) {
        throw new Error('Prayer not found');
      }

      // Verify user is campaign creator or admin
      const campaign = await Campaign.findById(prayer.campaign_id).lean();
      const isCreator = campaign.creator_id.toString() === userId;
      const isAdmin = await this.isUserAdmin(userId); // Implement based on your auth system

      if (!isCreator && !isAdmin) {
        throw new Error('Unauthorized to approve this prayer');
      }

      // Update prayer
      prayer.status = 'approved';
      prayer.approved_at = new Date();
      prayer.flagged_reason = null;

      // Set visibility based on campaign setting
      if (campaign.prayer_config.settings.prayers_public) {
        prayer.visibility = 'public';
      } else {
        prayer.visibility = 'creator_only';
      }

      await prayer.save();
      logger.info(`✅ Prayer approved: ${prayerId}`);

      // Emit event
      EventBus.emit('prayer:approved', {
        prayer_id: prayerId,
        campaign_id: campaign._id,
        creator_id: campaign.creator_id,
      });

      return prayer.toObject();
    } catch (error) {
      logger.error(`❌ PrayerService.approvePrayer error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reject a prayer
   * @param {string} prayerId - Prayer ID
   * @param {string} userId - User ID (must be campaign creator)
   * @param {string} reason - Reason for rejection
   * @returns {Promise<object>} Updated prayer
   */
  static async rejectPrayer(prayerId, userId, reason = '') {
    try {
      logger.info(`❌ Rejecting prayer ${prayerId}`);

      const prayer = await Prayer.findOne({ prayer_id: prayerId });
      if (!prayer) {
        throw new Error('Prayer not found');
      }

      // Verify user is campaign creator
      const campaign = await Campaign.findById(prayer.campaign_id).lean();
      if (campaign.creator_id.toString() !== userId) {
        throw new Error('Unauthorized to reject this prayer');
      }

      // Update prayer
      prayer.status = 'rejected';
      prayer.rejected_at = new Date();
      prayer.visibility = 'private';
      await prayer.save();

      logger.info(`❌ Prayer rejected: ${prayerId}`);

      // Emit event
      EventBus.emit('prayer:rejected', {
        prayer_id: prayerId,
        campaign_id: campaign._id,
        creator_id: campaign.creator_id,
        reason,
      });

      return prayer.toObject();
    } catch (error) {
      logger.error(`❌ PrayerService.rejectPrayer error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Report a prayer for moderation
   * @param {string} prayerId - Prayer ID
   * @param {string} reporterUserId - Reporter user ID (can be null for anonymous)
   * @param {string} reason - Reason for report
   * @param {string} details - Additional details
   * @returns {Promise<object>} Updated prayer
   */
  static async reportPrayer(prayerId, reporterUserId, reason, details = '') {
    try {
      logger.info(`🚩 Prayer reported: ${prayerId}`);

      const prayer = await Prayer.findOne({ prayer_id: prayerId });
      if (!prayer) {
        throw new Error('Prayer not found');
      }

      // Prevent duplicate reports from same user
      const existingReport = prayer.reported_by.find(
        report => report.user_id?.toString() === reporterUserId
      );

      if (existingReport) {
        throw new Error('You have already reported this prayer');
      }

      // Add report
      prayer.reported_by.push({
        user_id: reporterUserId ? new mongoose.Types.ObjectId(reporterUserId) : null,
        reason,
        reported_at: new Date(),
      });
      prayer.report_count += 1;

      // Auto-flag if 3+ reports
      if (prayer.report_count >= 3 && prayer.status !== 'flagged') {
        prayer.status = 'flagged';
        prayer.flagged_reason = 'user_reported';
      }

      // Auto-hide from public if 5+ reports
      if (prayer.report_count >= 5 && prayer.visibility !== 'private') {
        prayer.visibility = 'private';
      }

      await prayer.save();
      logger.info(`🚩 Prayer flagged for review: ${prayerId} (${prayer.report_count} reports)`);

      // Emit event for admin dashboard
      EventBus.emit('prayer:reported', {
        prayer_id: prayerId,
        report_count: prayer.report_count,
        reason,
        auto_flagged: prayer.report_count >= 3,
      });

      return prayer.toObject();
    } catch (error) {
      logger.error(`❌ PrayerService.reportPrayer error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Soft delete a prayer (GDPR compliant)
   * @param {string} prayerId - Prayer ID
   * @param {string} userId - User ID (must be prayer creator or campaign creator)
   * @param {string} reason - Reason for deletion
   * @returns {Promise<object>} Updated prayer
   */
  static async softDeletePrayer(prayerId, userId, reason = 'user_requested') {
    try {
      logger.info(`🗑️ Soft deleting prayer: ${prayerId}`);

      const prayer = await Prayer.findOne({ prayer_id: prayerId });
      if (!prayer) {
        throw new Error('Prayer not found');
      }

      // Check authorization
      const isSupporter = prayer.supporter_id?.toString() === userId;
      const campaign = await Campaign.findById(prayer.campaign_id).lean();
      const isCreator = campaign.creator_id.toString() === userId;

      if (!isSupporter && !isCreator) {
        throw new Error('Unauthorized to delete this prayer');
      }

      // Soft delete
      prayer.is_deleted = true;
      prayer.content = undefined; // Remove sensitive content
      prayer.audio_url = undefined;
      prayer.video_url = undefined;
      prayer.supporter_id = undefined;
      await prayer.save();

      logger.info(`✅ Prayer deleted: ${prayerId}`);

      // Emit event
      EventBus.emit('prayer:deleted', {
        prayer_id: prayerId,
        campaign_id: campaign._id,
        reason,
      });

      return prayer.toObject();
    } catch (error) {
      logger.error(`❌ PrayerService.softDeletePrayer error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get campaign prayer metrics
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<object>} Prayer metrics
   */
  static async getCampaignPrayerMetrics(campaignId) {
    try {
      logger.info(`📊 Getting prayer metrics for campaign ${campaignId}`);

      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Use UTC midnight for today's date
      const today = new Date();
      const utcMidnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));

      // Count prayers by type
      const typeBreakdown = await Prayer.countByType(campaignId);

      const breakdown = {
        tap: 0,
        text: 0,
        voice: 0,
        video: 0,
      };

      typeBreakdown.forEach(item => {
        breakdown[item._id] = item.count;
      });

      // Count prayers today (using UTC midnight)
      const prayersToday = await Prayer.countDocuments({
        campaign_id: campaignId,
        created_at: { $gte: utcMidnight },
        is_deleted: false,
      });

      // Get daily trend
      const dailyTrend = await PrayerAnalytics.getDailyTrend(campaignId, 30);

      // Get denormalized total from campaign
      let totalPrayers = campaign.prayer_metrics?.total_prayers || 0;
      
      // Sync fallback: if denormalized count seems wrong, recalculate from Prayer collection
      // This handles campaigns created before prayer_metrics schema was added
      const actualPrayerCount = await Prayer.countDocuments({
        campaign_id: campaignId,
        is_deleted: false,
      });
      
      if (actualPrayerCount > totalPrayers) {
        totalPrayers = actualPrayerCount;
        logger.info(`🔄 Synced prayer count: denormalized=${campaign.prayer_metrics?.total_prayers} actual=${actualPrayerCount}`);
      }
      
      const prayerGoal = campaign.prayer_config?.prayer_goal || 100;

      return {
        total_prayers: totalPrayers,
        prayers_today: prayersToday,
        prayer_goal: prayerGoal,
        progress_percentage: Math.min(Math.round((totalPrayers / prayerGoal) * 100), 100),
        breakdown_by_type: breakdown,
        daily_trend: dailyTrend?.map(day => {
          // Ensure proper date formatting - the date is stored as UTC midnight
          // Format as YYYY-MM-DD by calculating the date components
          const dateObj = new Date(day.date);
          const year = dateObj.getUTCFullYear();
          const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
          const date = String(dateObj.getUTCDate()).padStart(2, '0');
          const formattedDate = `${year}-${month}-${date}`;
          
          return {
            date: formattedDate,
            count: day.prayers_submitted_today || 0,
          };
        }) || [],
        unique_supporters: campaign.prayer_metrics?.unique_supporters_prayed?.length || 0,
        prayer_config_enabled: campaign.prayer_config?.enabled || false,
      };
    } catch (error) {
      logger.error(`❌ PrayerService.getCampaignPrayerMetrics error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get campaign prayers (public)
   * @param {string} campaignId - Campaign ID
   * @param {object} options - { limit, offset, includePrivate }
   * @returns {Promise<{prayers: array, total: number}>}
   */
  static async getCampaignPrayers(campaignId, options = {}) {
    try {
      const { limit = 20, offset = 0, includePrivate = false } = options;

      const query = {
        campaign_id: new mongoose.Types.ObjectId(campaignId),
        is_deleted: false,
      };

      if (!includePrivate) {
        query.status = 'approved';
        query.visibility = 'public';
      }

      const prayers = await Prayer.find(query)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .select('-ip_address -user_agent -reported_by') // Remove PII
        .lean();

      const total = await Prayer.countDocuments(query);

      return {
        prayers: prayers.map(p => ({
          ...p,
          supporter_name: p.is_anonymous ? 'Anonymous' : p.supporter_name || 'Anonymous',
        })),
        total,
        limit,
        offset,
      };
    } catch (error) {
      logger.error(`❌ PrayerService.getCampaignPrayers error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get moderation queue for creator
   * @param {string} campaignId - Campaign ID
   * @param {string} userId - User ID (must be campaign creator)
   * @param {object} options - { limit, offset, status }
   * @returns {Promise<{prayers: array, total: number}>}
   */
  static async getCreatorModerationQueue(campaignId, userId, options = {}) {
    try {
      logger.info(`📋 Getting moderation queue for campaign ${campaignId}`);

      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) throw new Error('Campaign not found');

      if (campaign.creator_id.toString() !== userId) {
        throw new Error('Unauthorized');
      }

      const { limit = 20, offset = 0, status = 'submitted' } = options;

      const query = {
        campaign_id: new mongoose.Types.ObjectId(campaignId),
        status,
        is_deleted: false,
      };

      const prayers = await Prayer.find(query)
        .sort({ created_at: -1, report_count: -1 })
        .skip(offset)
        .limit(limit)
        .select('-ip_address -user_agent')
        .lean();

      const total = await Prayer.countDocuments(query);

      return {
        prayers,
        total,
        limit,
        offset,
      };
    } catch (error) {
      logger.error(`❌ PrayerService.getCreatorModerationQueue error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get admin moderation queue (global)
   * @param {object} options - { limit, offset, status }
   * @returns {Promise<{prayers: array, total: number}>}
   */
  static async getAdminModerationQueue(options = {}) {
    try {
      logger.info(`📋 Getting global moderation queue`);

      const { limit = 20, offset = 0, status = 'flagged' } = options;

      const query = {
        is_deleted: false,
      };

      if (status !== 'all') {
        query.status = status;
      }

      const prayers = await Prayer.getModerationQueue({
        limit,
        offset,
        status: status === 'all' ? undefined : status,
      });

      const total = await Prayer.countDocuments(query);

      return {
        prayers,
        total,
        limit,
        offset,
      };
    } catch (error) {
      logger.error(`❌ PrayerService.getAdminModerationQueue error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if text contains profanity
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  static checkProfanity(text) {
    if (!text) return false;

    const lowerText = text.toLowerCase();
    return PROFANITY_LIST.some(word => lowerText.includes(word));

    // In production, use external API like:
    // return await ProfanityService.check(text);
  }

  /**
   * Check if text is spam
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  static isSpam(text) {
    if (!text) return false;

    // Check for excessive URLs
    const urlCount = (text.match(/https?:\/\//g) || []).length;
    if (urlCount > 2) return true;

    // Check for repeated characters
    if (/(.)\1{9,}/.test(text)) return true;

    // Check for excessive caps
    const capsCount = (text.match(/[A-Z]/g) || []).length;
    if (capsCount / text.length > 0.5 && text.length > 10) return true;

    return false;
  }

  /**
   * Increment daily analytics
   * @param {string} campaignId - Campaign ID
   * @param {string} prayerType - Prayer type
   * @private
   */
  static async incrementDailyAnalytics(campaignId, prayerType) {
    try {
      const analytics = await PrayerAnalytics.getOrCreateForToday(campaignId);

      const updateData = {
        $inc: { prayers_submitted_today: 1 },
      };

      // Increment type-specific counter
      if (prayerType === 'tap') updateData.$inc.tap_prayers_today = 1;
      else if (prayerType === 'text') updateData.$inc.text_prayers_today = 1;
      else if (prayerType === 'voice') updateData.$inc.voice_prayers_today = 1;
      else if (prayerType === 'video') updateData.$inc.video_prayers_today = 1;

      await PrayerAnalytics.updateOne(
        { _id: analytics._id },
        updateData
      );
    } catch (error) {
      logger.error(`⚠️ Error incrementing daily analytics: ${error.message}`);
      // Don't throw - this is not critical
    }
  }

  /**
   * Check if user is admin
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   * @private
   */
  static async isUserAdmin(userId) {
    try {
      const User = require('../models/User');
      const user = await User.findById(userId).lean();
      return user?.role === 'admin';
    } catch {
      return false;
    }
  }
}

module.exports = PrayerService;
