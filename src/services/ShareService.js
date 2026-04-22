/**
 * Share Service
 * Business logic for share recording, budget management, and rewards
 */

const { v4: uuidv4 } = require('uuid');
const { ShareRecord, ShareBudgetReload } = require('../models/Share');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const SweepstakesService = require('./SweepstakesService');
const winstonLogger = require('../utils/winstonLogger');
const { EventEmitter } = require('events');

const shareEventEmitter = new EventEmitter();
const VALID_CHANNELS = ['email', 'facebook', 'twitter', 'instagram', 'linkedin', 'sms', 'whatsapp', 'telegram', 'reddit', 'tiktok', 'other'];
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in ms
const RATE_LIMIT_MAX = 10; // 10 shares per IP per campaign per hour
const SWEEPSTAKES_ENTRIES_PER_SHARE = 0.5;
const PLATFORM_FEE_PERCENTAGE = 0.2; // 20%

class ShareService {
  /**
   * Generate unique share ID with format: SHARE-YYYY-XXXXXX
   * @returns {string} - Generated share ID
   */
  static generateShareId() {
    const year = new Date().getFullYear();
    const suffix = uuidv4().substring(0, 6).toUpperCase();
    return `SHARE-${year}-${suffix}`;
  }

  /**
   * Generate referral code for tracking
   * @returns {string} - Referral code
   */
  static generateReferralCode() {
    return uuidv4().substring(0, 8).toUpperCase();
  }

  /**
   * Check rate limit: 10 shares per campaign per IP per hour
   * @param {string} campaignId - Campaign ID
   * @param {string} ipAddress - IP address
   * @returns {Promise<boolean>} - True if under limit, false if exceeded
   */
  static async checkRateLimit(campaignId, ipAddress) {
    try {
      const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW);

      const recentShares = await ShareRecord.countDocuments({
        campaign_id: campaignId,
        ip_address: ipAddress,
        created_at: { $gte: oneHourAgo },
      });

      return recentShares < RATE_LIMIT_MAX;
    } catch (error) {
      winstonLogger.error('Error checking rate limit', {
        error: error.message,
        campaignId,
        ipAddress,
      });
      // Default to allowing on error to not block users
      return true;
    }
  }

  /**
   * Record a social share (core method)
   * @param {Object} params - Parameters object
   * @param {string} params.campaignId - Campaign MongoDB ID
   * @param {string} params.supporterId - Supporter User MongoDB ID
   * @param {string} params.channel - Share channel (email, facebook, etc.)
   * @param {string} params.ipAddress - IP address of sharer
   * @param {string} params.userAgent - User agent string
   * @param {Object} params.location - Location object {country, region, city}
   * @returns {Promise<Object>} - Share result with ShareID, isPaid, rewardAmount
   */
  static async recordShare(params) {
    const { campaignId, supporterId, channel, ipAddress, userAgent, location } = params;

    try {
      // Validate channel
      if (!VALID_CHANNELS.includes(channel)) {
        throw {
          code: 'INVALID_CHANNEL',
          message: `Invalid channel: ${channel}. Valid channels are: ${VALID_CHANNELS.join(', ')}`,
          statusCode: 400,
        };
      }

      // Fetch campaign
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist',
          statusCode: 404,
        };
      }

      // Verify campaign is active
      if (campaign.status !== 'active') {
        throw {
          code: 'CAMPAIGN_NOT_ACTIVE',
          message: `Campaign is ${campaign.status}, shares are not accepted`,
          statusCode: 409,
        };
      }

      // Check rate limit
      const rateLimitOk = await this.checkRateLimit(campaignId, ipAddress);
      if (!rateLimitOk) {
        throw {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many shares from this IP. Maximum 10 per hour.',
          statusCode: 429,
        };
      }

      // Fetch supporter
      const supporter = await User.findById(supporterId);
      if (!supporter) {
        throw {
          code: 'SUPPORTER_NOT_FOUND',
          message: 'Supporter does not exist',
          statusCode: 404,
        };
      }

      // Get share config from campaign
      const shareConfig = campaign.share_config || {
        is_paid_sharing_active: false,
        current_budget_remaining: 0,
        amount_per_share: 0,
      };

      winstonLogger.info('📊 ShareService.recordShare: Share config retrieved', {
        campaign_id: campaignId,
        share_config: {
          is_paid_sharing_active: shareConfig.is_paid_sharing_active,
          total_budget: shareConfig.total_budget,
          current_budget_remaining: shareConfig.current_budget_remaining,
          amount_per_share: shareConfig.amount_per_share,
          share_channels: shareConfig.share_channels,
        },
      });

      // Determine if this share will be paid
      let isPaid = false;
      let rewardAmount = 0;

      winstonLogger.info('📊 ShareService.recordShare: Checking reward eligibility', {
        campaign_id: campaignId,
        is_paid_sharing_active: shareConfig.is_paid_sharing_active,
        current_budget_remaining: shareConfig.current_budget_remaining,
        amount_per_share: shareConfig.amount_per_share,
        condition_1_active: shareConfig.is_paid_sharing_active,
        condition_2_budget: shareConfig.current_budget_remaining >= shareConfig.amount_per_share,
      });

      if (shareConfig.is_paid_sharing_active && shareConfig.current_budget_remaining >= shareConfig.amount_per_share) {
        isPaid = true;
        rewardAmount = shareConfig.amount_per_share;

        winstonLogger.info('✅ ShareService.recordShare: Share will be PAID', {
          campaign_id: campaignId,
          supporter_id: supporterId,
          isPaid: true,
          rewardAmount: rewardAmount,
          rewardInDollars: rewardAmount / 100,
        });
      } else {
        winstonLogger.info('📊 ShareService.recordShare: Share will NOT be paid (free)', {
          campaign_id: campaignId,
          supporter_id: supporterId,
          isPaid: false,
          reason:
            !shareConfig.is_paid_sharing_active
              ? 'Paid sharing is not active'
              : 'Insufficient budget remaining',
          is_paid_sharing_active: shareConfig.is_paid_sharing_active,
          budget_remaining: shareConfig.current_budget_remaining,
          amount_needed: shareConfig.amount_per_share,
        });
      }

      // Generate share record
      const shareId = this.generateShareId();
      const referralCode = this.generateReferralCode();

      const shareRecord = new ShareRecord({
        share_id: shareId,
        campaign_id: campaignId,
        supporter_id: supporterId,
        channel,
        referral_code: referralCode,
        is_paid: isPaid,
        reward_amount: rewardAmount,
        status: 'completed', // Honor system
        ip_address: ipAddress,
        user_agent: userAgent,
        location: location || {},
        sweepstakes_entries_awarded: SWEEPSTAKES_ENTRIES_PER_SHARE,
      });

      await shareRecord.save();

      // ===== UPDATE CAMPAIGN METRICS (COMPREHENSIVE) =====
      // Update top-level share_count AND nested metrics with all tracking
      if (!campaign.metrics) {
        campaign.metrics = {};
      }
      
      // Track total shares
      campaign.metrics.total_shares = (campaign.metrics.total_shares || 0) + 1;
      campaign.share_count = (campaign.share_count || 0) + 1; // 🔴 CRITICAL: Also update top-level field
      
      // Track paid vs free split
      if (isPaid) {
        campaign.metrics.shares_paid = (campaign.metrics.shares_paid || 0) + 1;
        winstonLogger.info('✅ Share recorded as PAID', {
          campaignId,
          shareId,
          rewardAmount: rewardAmount / 100,
        });
      } else {
        campaign.metrics.shares_free = (campaign.metrics.shares_free || 0) + 1;
        winstonLogger.info('✅ Share recorded as FREE', {
          campaignId,
          shareId,
        });
      }
      
      // Track by channel
      if (!campaign.metrics.shares_by_channel) {
        campaign.metrics.shares_by_channel = {};
      }
      campaign.metrics.shares_by_channel[channel] = (campaign.metrics.shares_by_channel[channel] || 0) + 1;

      // Update budget if paid share
      if (isPaid) {
        shareConfig.current_budget_remaining -= rewardAmount;

        // Auto-disable if budget depleted
        if (shareConfig.current_budget_remaining <= 0) {
          shareConfig.is_paid_sharing_active = false;
          shareConfig.current_budget_remaining = 0;
          shareConfig.amount_per_share = 0;

          // Notify creator
          shareEventEmitter.emit('share:budget_depleted', {
            campaignId,
            creatorId: campaign.creator_id,
            message: `Paid share budget has been depleted for campaign ${campaign.campaign_id}`,
          });

          winstonLogger.info('Paid share budget auto-disabled', {
            campaignId,
            campaignTitle: campaign.title,
          });
        }

        campaign.share_config = shareConfig;
      }

      // Update trending score (simple: +1 per share)
      if (!campaign.metrics.trending_score) {
        campaign.metrics.trending_score = 0;
      }
      campaign.metrics.trending_score += 1;
      
      // Update last metrics update timestamp
      campaign.metrics.last_metrics_update = new Date();

      winstonLogger.info('📊 Campaign metrics updated', {
        campaignId,
        metrics: {
          share_count: campaign.share_count,
          total_shares: campaign.metrics.total_shares,
          shares_paid: campaign.metrics.shares_paid,
          shares_free: campaign.metrics.shares_free,
          shares_by_channel: campaign.metrics.shares_by_channel,
        }
      });

      await campaign.save();

      // ===== UPDATE CAMPAIGN SHARING GOALS =====
      // Update sharing_reach goals with share count
      // This is CRITICAL: Users see sharing progress only through updated goals
      try {
        const sharingGoalUpdate = await Campaign.findByIdAndUpdate(
          campaignId,
          [
            {
              $set: {
                goals: {
                  $map: {
                    input: '$goals',
                    as: 'goal',
                    in: {
                      $cond: [
                        { $eq: ['$$goal.goal_type', 'sharing_reach'] },
                        {
                          goal_type: '$$goal.goal_type',
                          goal_name: '$$goal.goal_name',
                          target_amount: '$$goal.target_amount',
                          current_amount: {
                            $add: [
                              { $ifNull: ['$$goal.current_amount', 0] },
                              1
                            ]
                          },
                        },
                        '$$goal'
                      ]
                    }
                  }
                },
                updated_at: new Date()
              }
            }
          ],
          { new: true }
        );

        if (sharingGoalUpdate && sharingGoalUpdate.goals) {
          const sharingGoals = sharingGoalUpdate.goals.filter(g => g.goal_type === 'sharing_reach');
          sharingGoals.forEach(goal => {
            console.info(`[GOAL UPDATE] Campaign sharing progress: ${goal.goal_name}`, {
              campaignId,
              goalType: 'sharing_reach',
              progress: `${goal.current_amount}/${goal.target_amount} shares`,
              channel,
              timestamp: new Date().toISOString()
            });
          });
        }
      } catch (goalError) {
        // Log but don't fail - goal update is important but secondary to the share recording
        console.warn('[ERROR] Campaign sharing goal update failed', {
          campaignId,
          error: goalError.message,
          channel,
          timestamp: new Date().toISOString()
        });
      }

      // Sweepstakes entry recording disabled - using new simplified sweepstakes system
      // No entries are tracked for shares anymore

      // Emit share recorded event
      shareEventEmitter.emit('share:recorded', {
        shareId,
        campaignId,
        supporterId,
        isPaid,
        rewardAmount,
      });

      // If paid, emit notification event
      if (isPaid) {
        shareEventEmitter.emit('share:reward_notification', {
          supporterId,
          shareId,
          rewardAmount,
          channel,
          campaignTitle: campaign.title,
        });
      }

      winstonLogger.info('Share recorded successfully', {
        shareId,
        campaignId,
        isPaid,
        rewardAmount,
      });

      return {
        success: true,
        shareId,
        isPaid,
        rewardAmount,
        referralCode: `?ref=${referralCode}`,
        message: isPaid ? `Share recorded! You earned $${(rewardAmount / 100).toFixed(2)}` : 'Share recorded successfully!',
      };
    } catch (error) {
      winstonLogger.error('Error recording share', {
        error: error.message,
        campaignId,
        supporterId,
        channel,
      });

      throw error;
    }
  }

  /**
   * Request share budget reload
   * @param {Object} params - Parameters object
   * @param {string} params.campaignId - Campaign ID
   * @param {string} params.creatorId - Creator User ID
   * @param {number} params.amount - Amount in cents
   * @param {string} params.paymentMethod - Payment method
   * @returns {Promise<Object>} - Reload request result
   */
  static async requestShareBudgetReload(params) {
    const { campaignId, creatorId, amount, paymentMethod } = params;

    try {
      // Validate amount in cents: min $10 (1000 cents), max $1M
      if (amount < 1000 || amount > 100000000) {
        throw {
          code: 'INVALID_RELOAD_AMOUNT',
          message: 'Reload amount must be between $10 and $1,000,000',
          statusCode: 400,
        };
      }

      // Fetch campaign
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist',
          statusCode: 404,
        };
      }

      // Verify creator owns campaign
      if (campaign.creator_id.toString() !== creatorId.toString()) {
        throw {
          code: 'UNAUTHORIZED',
          message: 'Only campaign creator can request budget reload',
          statusCode: 403,
        };
      }

      // Calculate platform fee (20%)
      const platformFee = Math.round(amount * PLATFORM_FEE_PERCENTAGE);
      const netAmount = amount - platformFee;

      // Generate reload ID
      const reloadId = `RELOAD-${new Date().getFullYear()}-${uuidv4().substring(0, 8).toUpperCase()}`;

      // Create reload request
      const reloadRequest = new ShareBudgetReload({
        reload_id: reloadId,
        campaign_id: campaignId,
        creator_id: creatorId,
        requested_amount: amount,
        gross_amount: amount,
        platform_fee: platformFee,
        net_amount: netAmount,
        status: 'pending',
        payment_method: paymentMethod,
      });

      await reloadRequest.save();

      // Emit event for admin notification
      shareEventEmitter.emit('share:reload_requested', {
        reloadId,
        campaignId,
        creatorId,
        amount,
        netAmount,
        platformFee,
      });

      winstonLogger.info('Share budget reload requested', {
        reloadId,
        campaignId,
        amount,
        netAmount,
      });

      return {
        success: true,
        reloadId,
        requestedAmount: amount,
        platformFee,
        netAmount,
        status: 'pending',
        message: 'Reload request submitted. Admin will verify within 24 hours.',
      };
    } catch (error) {
      winstonLogger.error('Error requesting budget reload', {
        error: error.message,
        campaignId,
        creatorId,
        amount,
      });

      throw error;
    }
  }

  /**
   * Admin: Verify and approve budget reload
   * @param {Object} params - Parameters object
   * @param {string} params.reloadId - Reload request ID
   * @param {string} params.adminId - Admin User ID
   * @returns {Promise<Object>} - Approval result
   */
  static async verifyShareBudgetReload(params) {
    const { reloadId, adminId } = params;

    try {
      // Fetch reload request
      const reload = await ShareBudgetReload.findOne({ reload_id: reloadId });
      if (!reload) {
        throw {
          code: 'RELOAD_NOT_FOUND',
          message: 'Reload request does not exist',
          statusCode: 404,
        };
      }

      // Verify status is pending
      if (reload.status !== 'pending') {
        throw {
          code: 'INVALID_RELOAD_STATUS',
          message: `Reload is ${reload.status}, can only approve pending requests`,
          statusCode: 409,
        };
      }

      // Update reload status
      reload.status = 'approved';
      reload.verified_by = adminId;
      reload.verified_at = new Date();
      await reload.save();

      // Add amount to campaign share budget
      const campaign = await Campaign.findById(reload.campaign_id);
      if (!campaign) {
        throw {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found',
          statusCode: 404,
        };
      }

      // Ensure share_config exists
      if (!campaign.share_config) {
        campaign.share_config = {
          is_paid_sharing_active: false,
          current_budget_remaining: 0,
          amount_per_share: 0,
          total_budget_allocated: 0,
        };
      }

      // Add net amount to budget
      campaign.share_config.current_budget_remaining += reload.net_amount;
      campaign.share_config.total_budget_allocated = (campaign.share_config.total_budget_allocated || 0) + reload.gross_amount;

      // Re-enable paid sharing if it was disabled
      if (campaign.share_config.current_budget_remaining > 0 && campaign.share_config.amount_per_share > 0) {
        campaign.share_config.is_paid_sharing_active = true;
      }

      await campaign.save();

      // Emit event
      shareEventEmitter.emit('share:budget_reloaded', {
        reloadId,
        campaignId: reload.campaign_id,
        creatorId: reload.creator_id,
        amount: reload.net_amount,
      });

      winstonLogger.info('Share budget reload approved', {
        reloadId,
        amount: reload.net_amount,
        campaignId: reload.campaign_id,
      });

      return {
        success: true,
        reloadId,
        status: 'approved',
        amountAdded: reload.net_amount,
        newBudgetRemaining: campaign.share_config.current_budget_remaining,
        message: `Budget reload of $${(reload.net_amount / 100).toFixed(2)} approved and added to campaign budget`,
      };
    } catch (error) {
      winstonLogger.error('Error approving budget reload', {
        error: error.message,
        reloadId,
        adminId,
      });

      throw error;
    }
  }

  /**
   * Admin: Reject budget reload
   * @param {Object} params - Parameters object
   * @param {string} params.reloadId - Reload request ID
   * @param {string} params.adminId - Admin User ID
   * @param {string} params.reason - Rejection reason
   * @returns {Promise<Object>} - Rejection result
   */
  static async rejectShareBudgetReload(params) {
    const { reloadId, adminId, reason } = params;

    try {
      // Fetch reload request
      const reload = await ShareBudgetReload.findOne({ reload_id: reloadId });
      if (!reload) {
        throw {
          code: 'RELOAD_NOT_FOUND',
          message: 'Reload request does not exist',
          statusCode: 404,
        };
      }

      // Verify status is pending
      if (reload.status !== 'pending') {
        throw {
          code: 'INVALID_RELOAD_STATUS',
          message: `Reload is ${reload.status}, can only reject pending requests`,
          statusCode: 409,
        };
      }

      // Update reload status
      reload.status = 'rejected';
      reload.verified_by = adminId;
      reload.verified_at = new Date();
      reload.rejection_reason = reason || 'No reason provided';
      await reload.save();

      // Emit event
      shareEventEmitter.emit('share:reload_rejected', {
        reloadId,
        campaignId: reload.campaign_id,
        creatorId: reload.creator_id,
        reason: reload.rejection_reason,
      });

      winstonLogger.info('Share budget reload rejected', {
        reloadId,
        reason: reload.rejection_reason,
      });

      return {
        success: true,
        reloadId,
        status: 'rejected',
        reason: reload.rejection_reason,
        message: 'Reload request rejected',
      };
    } catch (error) {
      winstonLogger.error('Error rejecting budget reload', {
        error: error.message,
        reloadId,
        adminId,
      });

      throw error;
    }
  }

  /**
   * Get all shares for a campaign
   * @param {string} campaignId - Campaign ID
   * @param {Object} options - Query options {page, limit}
   * @returns {Promise<Object>} - Paginated shares
   */
  static async getSharesByCampaign(campaignId, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      const shares = await ShareRecord.find({ campaign_id: campaignId })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('supporter_id', 'name email');

      const total = await ShareRecord.countDocuments({ campaign_id: campaignId });

      return {
        success: true,
        data: shares,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      winstonLogger.error('Error fetching shares for campaign', {
        error: error.message,
        campaignId,
      });

      throw error;
    }
  }

  /**
   * Get all shares created by a supporter
   * @param {string} supporterId - Supporter User ID
   * @param {Object} options - Query options {page, limit}
   * @returns {Promise<Object>} - Paginated shares
   */
  static async getSharesBySupporter(supporterId, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      const shares = await ShareRecord.find({ supporter_id: supporterId })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('campaign_id', 'title');

      const total = await ShareRecord.countDocuments({ supporter_id: supporterId });

      return {
        shares: shares.map(s => ({
          shareId: s.share_id,
          campaignId: s.campaign_id?._id?.toString() || s.campaign_id?.toString() || '',
          campaignTitle: s.campaign_id?.title || 'Unknown Campaign',
          channel: s.channel,
          is_paid: s.is_paid,
          reward_amount: s.reward_amount,
          status: s.status,
          createdAt: s.created_at?.toISOString() || s.createdAt?.toISOString() || new Date().toISOString()
        })),
        total,
        page,
        limit
      };
    } catch (error) {
      winstonLogger.error('Error getting shares by supporter', {
        error: error.message
      });
      throw {
        statusCode: 500,
        message: 'Failed to retrieve shares',
        error: error.message
      };
    }
  }

  /**
   * Track QR code scan and award sweepstakes entries
   * 
   * QR Code Scan Flow:
   * 1. User scans QR code linked to campaign
   * 2. Verify campaign exists and is active
   * 3. Record scan in QRCodeScan model
   * 4. Award +1 sweepstakes entry to user for this period
   * 5. Return scan result with sweepstakes confirmation
   * 
   * @param {Object} params - Parameters object
   * @param {string} params.campaignId - Campaign ID to link scan to
   * @param {string} params.userId - User ID who scanned (optional for anonymous tracking)
   * @param {string} params.ipAddress - IP address of scanner
   * @param {string} params.userAgent - User agent string
   * @param {Object} params.location - Location data {country, region, city}
   * @param {string} params.qrCodeId - QR Code ID (optional, for specific QR tracking)
   * @returns {Promise<Object>} Scan result with sweepstakes entry status
   * 
   * Example:
   *   const result = await shareService.trackQRScan({
   *     campaignId: '507f1f77bcf86cd799439011',
   *     userId: '507f1f77bcf86cd799439012',
   *     ipAddress: '192.168.1.1',
   *     userAgent: 'Mozilla/5.0...',
   *     location: { country: 'US', region: 'CA', city: 'SF' },
   *     qrCodeId: '507f1f77bcf86cd799439013'
   *   });
   *   
   *   // Response:
   *   // {
   *   //   scanId: 'SCAN-2026-ABC123',
   *   //   success: true,
   *   //   campaignId: '507f1f77bcf86cd799439011',
   *   //   sweepstakesEntry: {
   *   //     awarded: true,
   *   //     entryCount: 1,
   *   //     totalEntries: 45,
   *   //     period: '2026-04'
   *   //   }
   *   // }
   */
  static async trackQRScan(params) {
    const { campaignId, userId, ipAddress, userAgent, location, qrCodeId } = params;

    try {
      // Validate campaign exists and is active
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist',
          statusCode: 404,
        };
      }

      if (campaign.status !== 'active') {
        throw {
          code: 'CAMPAIGN_NOT_ACTIVE',
          message: `Campaign is ${campaign.status}, QR scans are not being accepted`,
          statusCode: 409,
        };
      }

      // If user ID provided, validate user exists
      let user = null;
      if (userId) {
        user = await User.findById(userId);
        if (!user) {
          throw {
            code: 'USER_NOT_FOUND',
            message: 'User does not exist',
            statusCode: 404,
          };
        }
      }

      // Record the QR scan in database
      const QRCodeScan = require('../models/QRCodeScan');
      const scanId = `SCAN-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const scanRecord = new QRCodeScan({
        scan_id: scanId,
        qr_code_id: qrCodeId || null,
        campaign_id: campaignId,
        user_id: userId || null,
        ip_address: ipAddress,
        user_agent: userAgent,
        location: location || {},
        scanned_at: new Date(),
        device_type: this.detectDeviceType(userAgent),
        referrer: null,
      });

      await scanRecord.save();

      winstonLogger.info('✅ QR scan recorded', {
        scanId,
        campaignId,
        userId: userId || 'anonymous',
        qrCodeId,
      });

      // Award sweepstakes entry if user is authenticated
      let sweepstakesResult = {
        awarded: false,
        entryCount: 0,
        totalEntries: 0,
        period: null,
      };

      // Sweepstakes entry recording disabled - using new simplified sweepstakes system
      // QR scans no longer award entries
      /*
      if (userId) {
        try {
          const SweepstakesService = require('./SweepstakesService');
          const sweepstakesService = new SweepstakesService();

          const sweepstakesResult_raw = await sweepstakesService.addEntry(
            userId,
            'qr_scan',
            { campaignId },
            User
          );

          sweepstakesResult = {
            awarded: sweepstakesResult_raw.success !== false,
            entryCount: 1,
            totalEntries: sweepstakesResult_raw.totalEntries || sweepstakesResult_raw.entryCount,
            period: SweepstakesSubmission.getCurrentDrawingPeriod(),
          };

          winstonLogger.info('✅ Sweepstakes entry awarded to QR scanner', {
            userId,
            campaignId,
            scanId,
            sweepstakesEntries: sweepstakesResult.totalEntries,
            period: sweepstakesResult.period,
          });
        } catch (sweepstakesError) {
          winstonLogger.warn('⚠️ Could not award sweepstakes entry on QR scan', {
            userId,
            campaignId,
            scanId,
            error: sweepstakesError.message,
          });
          // Don't fail the QR scan if sweepstakes fails
        }
      }
      */

      // Update campaign QR scan metrics
      if (!campaign.metrics) {
        campaign.metrics = {};
      }

      campaign.metrics.total_qr_scans = (campaign.metrics.total_qr_scans || 0) + 1;
      if (userId) {
        campaign.metrics.authenticated_qr_scans = (campaign.metrics.authenticated_qr_scans || 0) + 1;
      } else {
        campaign.metrics.anonymous_qr_scans = (campaign.metrics.anonymous_qr_scans || 0) + 1;
      }

      // Track by QR code if specified
      if (qrCodeId) {
        if (!campaign.metrics.scans_by_qr) {
          campaign.metrics.scans_by_qr = {};
        }
        campaign.metrics.scans_by_qr[qrCodeId] = (campaign.metrics.scans_by_qr[qrCodeId] || 0) + 1;
      }

      campaign.metrics.last_metrics_update = new Date();
      await campaign.save();

      return {
        scanId,
        success: true,
        campaignId,
        userId: userId || null,
        qrCodeId: qrCodeId || null,
        sweepstakesEntry: sweepstakesResult,
        message: userId
          ? 'QR scan tracked and sweepstakes entry awarded'
          : 'QR scan tracked (anonymous)',
      };
    } catch (error) {
      winstonLogger.error('❌ Error tracking QR scan', {
        error: error.message,
        campaignId,
        userId: userId || 'anonymous',
      });

      throw error;
    }
  }

  /**
   * Detect device type from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} Device type (mobile, tablet, desktop)
   */
  static detectDeviceType(userAgent) {
    if (!userAgent) return 'unknown';

    if (/mobile|android/i.test(userAgent)) return 'mobile';
    if (/ipad|tablet/i.test(userAgent)) return 'tablet';
    return 'desktop';
  }

  /**
   * Get user's earnings from shares
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Earnings breakdown
   */
  static async getUserEarnings(userId) {
    try {
      const shares = await ShareRecord.find({ 
        supporter_id: userId,
        is_paid: true,
        status: 'completed'
      });

      const totalEarnings = shares.reduce((sum, s) => sum + s.reward_amount, 0);
      
      // Get withdrawal history
      const ShareWithdrawal = require('../models/ShareWithdrawal');
      const withdrawals = await ShareWithdrawal.find({ user_id: userId });
      const withdrawnAmount = withdrawals.reduce((sum, w) => sum + (w.status === 'completed' ? w.amount_cents : 0), 0);
      
      const pendingAmount = totalEarnings - withdrawnAmount;
      const availableAmount = pendingAmount;

      // Breakdown by platform
      const byPlatform = {};
      shares.forEach(s => {
        if (!byPlatform[s.channel]) {
          byPlatform[s.channel] = { shares: 0, earnings: 0 };
        }
        byPlatform[s.channel].shares += 1;
        byPlatform[s.channel].earnings += s.reward_amount;
      });

      return {
        success: true,
        data: {
          total: totalEarnings,
          withdrawn: withdrawnAmount,
          pending: pendingAmount,
          available: availableAmount,
          byPlatform
        }
      };
    } catch (error) {
      winstonLogger.error('Error getting user earnings', {
        error: error.message,
        userId
      });
      throw {
        statusCode: 500,
        message: 'Failed to retrieve earnings',
        error: error.message
      };
    }
  }

  /**
   * Get leaderboard of top sharers
   * @param {Object} options - Query options {limit, timeframe}
   * @returns {Promise<Object>} - Leaderboard data
   */
  static async getLeaderboard(options = {}) {
    try {
      const { limit = 10, timeframe = 'all' } = options;

      const matchStage = { is_paid: true, status: 'completed' };
      if (timeframe === 'month') {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        matchStage.created_at = { $gte: monthAgo };
      } else if (timeframe === 'week') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        matchStage.created_at = { $gte: weekAgo };
      }

      const leaderboard = await ShareRecord.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$supporter_id',
            totalEarnings: { $sum: '$reward_amount' },
            shareCount: { $sum: 1 }
          }
        },
        { $sort: { totalEarnings: -1 } },
        { $limit: parseInt(limit) },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        }
      ]);

      return {
        success: true,
        data: {
          leaderboard: leaderboard.map((item, index) => ({
            rank: index + 1,
            userId: item._id,
            userName: item.user[0]?.display_name || 'Anonymous',
            totalEarnings: item.totalEarnings,
            shareCount: item.shareCount
          })),
          timeframe
        }
      };
    } catch (error) {
      winstonLogger.error('Error getting leaderboard', {
        error: error.message
      });
      throw {
        statusCode: 500,
        message: 'Failed to retrieve leaderboard',
        error: error.message
      };
    }
  }

  /**
   * Generate unique referral link for a user
   * @param {string} userId - User ID
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>} - Referral link data
   */
  static async generateReferralLink(userId, campaignId) {
    try {
      const referralCode = this.generateReferralCode();
      
      const shareRecord = new ShareRecord({
        share_id: this.generateShareId(),
        campaign_id: campaignId,
        supporter_id: userId,
        channel: 'referral_link',
        referral_code: referralCode,
        status: 'completed'
      });

      await shareRecord.save();

      const baseUrl = process.env.FRONTEND_BASE_URL || 'https://honestneed.com';
      const referralLink = `${baseUrl}/campaigns/${campaignId}?ref=${referralCode}`;

      return {
        success: true,
        data: {
          referralCode,
          referralLink,
          shareId: shareRecord._id
        }
      };
    } catch (error) {
      winstonLogger.error('Error generating referral link', {
        error: error.message,
        userId,
        campaignId
      });
      throw {
        statusCode: 500,
        message: 'Failed to generate referral link',
        error: error.message
      };
    }
  }

  /**
   * Track multiple share events in bulk
   * @param {string} userId - User ID
   * @param {Array} events - Array of share events
   * @returns {Promise<Object>} - Bulk tracking result
   */
  static async bulkTrackShareEvents(userId, events) {
    try {
      const results = [];
      
      for (const event of events) {
        const { campaignId, channel, timestamp } = event;
        
        const shareRecord = new ShareRecord({
          share_id: this.generateShareId(),
          campaign_id: campaignId,
          supporter_id: userId,
          channel,
          status: 'completed',
          created_at: timestamp || new Date()
        });

        await shareRecord.save();
        results.push({
          shareId: shareRecord._id,
          campaign: campaignId,
          channel,
          status: 'recorded'
        });
      }

      return {
        success: true,
        data: {
          tracked: results.length,
          results
        }
      };
    } catch (error) {
      winstonLogger.error('Error bulk tracking shares', {
        error: error.message,
        userId
      });
      throw {
        statusCode: 500,
        message: 'Failed to track shares in bulk',
        error: error.message
      };
    }
  }

  /**
   * Get detailed share information
   * @param {string} shareId - Share record ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} - Detailed share data
   */
  static async getShareDetails(shareId, userId, isAdmin = false) {
    try {
      const share = await ShareRecord.findById(shareId)
        .populate('campaign_id', 'title goal_amount status')
        .populate('supporter_id', 'display_name email');

      if (!share) {
        throw {
          statusCode: 404,
          message: 'Share not found'
        };
      }

      // Check authorization: owner or admin
      if (share.supporter_id._id.toString() !== userId && !isAdmin) {
        throw {
          statusCode: 403,
          message: 'Unauthorized to view this share'
        };
      }

      // Get conversion tracking
      const ReferralTracking = require('../models/ReferralTracking');
      const referrals = await ReferralTracking.countDocuments({
        referral_code: share.referral_code
      });

      return {
        success: true,
        data: {
          id: share._id,
          shareId: share.share_id,
          campaign: share.campaign_id,
          sharer: {
            id: share.supporter_id._id,
            name: share.supporter_id.display_name,
            email: share.supporter_id.email
          },
          channel: share.channel,
          rewardAmount: share.reward_amount,
          status: share.status,
          referralCode: share.referral_code,
          conversions: referrals,
          conversionRate: referrals > 0 ? (referrals / 100).toFixed(2) : '0.00',
          createdAt: share.created_at,
          sweepstakesEntries: share.sweepstakes_entries_awarded
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a share record
   * @param {string} shareId - Share record ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} - Deletion result
   */
  static async deleteShare(shareId, userId) {
    try {
      const share = await ShareRecord.findById(shareId);

      if (!share) {
        throw {
          statusCode: 404,
          message: 'Share not found'
        };
      }

      // Check authorization: owner only
      if (share.supporter_id.toString() !== userId) {
        throw {
          statusCode: 403,
          message: 'Only share owner can delete'
        };
      }

      // Prevent deletion if paid
      if (share.is_paid) {
        throw {
          statusCode: 400,
          message: 'Cannot delete a paid share'
        };
      }

      await ShareRecord.deleteOne({ _id: shareId });

      winstonLogger.info('Share deleted', {
        shareId,
        userId
      });

      return {
        success: true,
        message: 'Share deleted successfully'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get performance stats by platform
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Platform performance data
   */
  static async getPlatformPerformance(userId) {
    try {
      const shares = await ShareRecord.find({ supporter_id: userId });

      const byPlatform = {};
      shares.forEach(s => {
        if (!byPlatform[s.channel]) {
          byPlatform[s.channel] = {
            platform: s.channel,
            shares: 0,
            earnings: 0,
            avgEarning: 0,
            successRate: 0
          };
        }
        byPlatform[s.channel].shares += 1;
        byPlatform[s.channel].earnings += s.reward_amount || 0;
      });

      // Calculate averages and success rates
      for (const platform in byPlatform) {
        const data = byPlatform[platform];
        data.avgEarning = data.shares > 0 ? Math.round(data.earnings / data.shares) : 0;
        data.successRate = data.shares > 0 ? Math.round((data.earnings / (data.shares * 100)) * 100) : 0;
      }

      return {
        success: true,
        data: {
          platforms: Object.values(byPlatform),
          totalEarnings: shares.reduce((sum, s) => sum + (s.reward_amount || 0), 0),
          totalShares: shares.length
        }
      };
    } catch (error) {
      winstonLogger.error('Error getting platform performance', {
        error: error.message,
        userId
      });
      throw {
        statusCode: 500,
        message: 'Failed to retrieve platform performance',
        error: error.message
      };
    }
  }

  /**
   * Get share history for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Share history
   */
  static async getShareHistory(userId, options = {}) {
    try {
      const { page = 1, limit = 20, startDate, endDate } = options;
      const skip = (page - 1) * limit;

      const query = { supporter_id: userId };
      if (startDate || endDate) {
        query.created_at = {};
        if (startDate) query.created_at.$gte = new Date(startDate);
        if (endDate) query.created_at.$lte = new Date(endDate);
      }

      const shares = await ShareRecord.find(query)
        .populate('campaign_id', 'title status')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await ShareRecord.countDocuments(query);

      const earnings = shares.reduce((sum, s) => sum + (s.reward_amount || 0), 0);

      return {
        success: true,
        data: {
          events: shares.map(s => ({
            id: s._id,
            shareId: s.share_id,
            campaign: s.campaign_id.title,
            channel: s.channel,
            earned: s.reward_amount,
            status: s.status,
            date: s.created_at
          })),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          },
          summary: {
            totalEarnings: earnings,
            eventCount: shares.length
          }
        }
      };
    } catch (error) {
      winstonLogger.error('Error getting share history', {
        error: error.message,
        userId
      });
      throw {
        statusCode: 500,
        message: 'Failed to retrieve share history',
        error: error.message
      };
    }
  }

  /**
   * Process share withdrawal request
   * @param {string} userId - User ID
   * @param {number} amountCents - Amount in cents
   * @param {string} method - Withdrawal method (stripe, bank, paypal)
   * @returns {Promise<Object>} - Withdrawal request data
   */
  static async processWithdrawal(userId, amountCents, method) {
    try {
      // Verify user has sufficient earnings
      const earnings = await this.getUserEarnings(userId);
      if (earnings.data.available < amountCents) {
        throw {
          statusCode: 400,
          message: 'Insufficient earnings for withdrawal',
          available: earnings.data.available
        };
      }

      // Create withdrawal record
      const ShareWithdrawal = require('../models/ShareWithdrawal');
      const withdrawal = new ShareWithdrawal({
        withdrawal_id: `WD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user_id: userId,
        amount_cents: amountCents,
        method,
        status: 'pending',
        requested_at: new Date()
      });

      await withdrawal.save();

      winstonLogger.info('Withdrawal requested', {
        withdrawalId: withdrawal._id,
        userId,
        amountCents,
        method
      });

      return {
        success: true,
        data: {
          withdrawalId: withdrawal._id,
          amount: amountCents,
          method,
          status: 'pending',
          requestedAt: withdrawal.requested_at,
          expectedProcessing: '3-5 business days'
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get balance for a specific campaign (campaign-specific withdrawal system)
   * @param {String} userId - User MongoDB ID
   * @param {String} campaignId - Campaign MongoDB ID
   * @returns {Promise<Object>} - { campaign_id, campaign_title, earned_cents, withdrawn_cents, available_cents }
   */
  static async getUserBalanceByCampaign(userId, campaignId) {
    try {
      console.log(`\n🎯 [ShareService] getUserBalanceByCampaign: userId=${userId}, campaignId=${campaignId}`);

      // Get campaign details
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Query earnings from this campaign only
      const shares = await ShareRecord.find({
        supporter_id: userId,
        campaign_id: campaignId,
        is_paid: true,
        status: 'completed'
      });

      console.log(`📊 [ShareService] Found ${shares.length} shares from campaign ${campaignId}`);

      const totalEarned = shares.reduce((sum, s) => sum + (s.reward_amount || 0), 0);
      console.log(`💰 [ShareService] Total earned from campaign: ${totalEarned} cents ($${(totalEarned / 100).toFixed(2)})`);

      // Get withdrawals for this campaign only
      const ShareWithdrawal = require('../models/ShareWithdrawal');
      const withdrawals = await ShareWithdrawal.find({
        user_id: userId,
        'campaign_withdrawals.campaign_id': campaignId
      });

      console.log(`🏦 [ShareService] Found ${withdrawals.length} withdrawals touching this campaign`);

      // Calculate amount withdrawn from THIS campaign
      const withdrawn = withdrawals.reduce((sum, w) => {
        const campaignWithdrawal = w.campaign_withdrawals.find(
          cw => cw.campaign_id.toString() === campaignId.toString()
        );
        return sum + (w.status === 'completed' && campaignWithdrawal ? campaignWithdrawal.amount_cents : 0);
      }, 0);

      console.log(`✅ [ShareService] Withdrawn from this campaign: ${withdrawn} cents ($${(withdrawn / 100).toFixed(2)})`);

      // Calculate reserved (pending/processing withdrawals)
      const reserved = withdrawals.reduce((sum, w) => {
        const campaignWithdrawal = w.campaign_withdrawals.find(
          cw => cw.campaign_id.toString() === campaignId.toString()
        );
        return sum + (['pending', 'processing'].includes(w.status) && campaignWithdrawal ? campaignWithdrawal.amount_cents : 0);
      }, 0);

      console.log(`⏳ [ShareService] Reserved from this campaign: ${reserved} cents ($${(reserved / 100).toFixed(2)})`);

      const available = Math.max(0, totalEarned - withdrawn - reserved);

      return {
        campaign_id: campaignId,
        campaign_title: campaign.title,
        earned_cents: totalEarned,
        withdrawn_cents: withdrawn,
        reserved_cents: reserved,
        available_cents: available
      };
    } catch (error) {
      console.error(`❌ [ShareService] Error getting balance by campaign:`, error);
      winstonLogger.error('Error getting balance by campaign', {
        error: error.message,
        userId,
        campaignId
      });
      throw error;
    }
  }

  /**
   * Get all campaigns with earnings for a user (for withdrawal modal)
   * Returns campaigns grouped by available balance
   */
  static async getUserCampaignEarnings(userId) {
    try {
      console.log(`\n📋 [ShareService] getUserCampaignEarnings for userId: ${userId}`);

      // Get all campaigns this user has earned from
      const shares = await ShareRecord.find({
        supporter_id: userId,
        is_paid: true,
        status: 'completed'
      }).populate('campaign_id');

      console.log(`📊 [ShareService] Found ${shares.length} earning records`);

      // Group by campaign
      const campaignEarnings = {};
      shares.forEach(share => {
        if (share.campaign_id) {
          const campaignId = share.campaign_id._id.toString();
          if (!campaignEarnings[campaignId]) {
            campaignEarnings[campaignId] = {
              campaign_id: share.campaign_id._id,
              campaign_title: share.campaign_id.title,
              earned_cents: 0
            };
          }
          campaignEarnings[campaignId].earned_cents += share.reward_amount || 0;
        }
      });

      const campaigns = Object.values(campaignEarnings);
      console.log(`🎯 [ShareService] Grouped into ${campaigns.length} campaigns with earnings`);

      // Get withdrawal data for all campaigns
      const ShareWithdrawal = require('../models/ShareWithdrawal');
      const withdrawals = await ShareWithdrawal.find({ user_id: userId });

      // Calculate available for each campaign
      const campaignBalances = campaigns.map(campaign => {
        const withdrawn = withdrawals.reduce((sum, w) => {
          const cw = w.campaign_withdrawals.find(
            x => x.campaign_id.toString() === campaign.campaign_id.toString()
          );
          return sum + (w.status === 'completed' && cw ? cw.amount_cents : 0);
        }, 0);

        const reserved = withdrawals.reduce((sum, w) => {
          const cw = w.campaign_withdrawals.find(
            x => x.campaign_id.toString() === campaign.campaign_id.toString()
          );
          return sum + (['pending', 'processing'].includes(w.status) && cw ? cw.amount_cents : 0);
        }, 0);

        return {
          ...campaign,
          withdrawn_cents: withdrawn,
          reserved_cents: reserved,
          available_cents: Math.max(0, campaign.earned_cents - withdrawn - reserved)
        };
      });

      console.log(`✨ [ShareService] Final campaign balances:`, 
        campaignBalances.map(c => ({ title: c.campaign_title, available: c.available_cents }))
      );

      return campaignBalances;
    } catch (error) {
      console.error(`❌ [ShareService] Error getting campaign earnings:`, error);
      winstonLogger.error('Error getting campaign earnings', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get available earnings for withdrawal (wallet-style response)
   * @param {String} userId - User MongoDB ID
   * @returns {Promise<Object>} - { available_cents, pending_cents, reserved_cents, total_earned_cents }
   */
  static async getUserAvailableEarnings(userId) {
    try {
      console.log(`\n🔍 [ShareService] Starting getUserAvailableEarnings for userId: ${userId}`);
      
      // Query completed and paid shares
      const shares = await ShareRecord.find({
        supporter_id: userId,
        is_paid: true,
        status: 'completed'
      });

      console.log(`📊 [ShareService] Found ${shares.length} completed paid shares`);
      shares.forEach((s, idx) => {
        console.log(`   Share ${idx + 1}: reward_amount=${s.reward_amount}, status=${s.status}, is_paid=${s.is_paid}`);
      });

      const totalEarned = shares.reduce((sum, s) => sum + (s.reward_amount || 0), 0);
      console.log(`💰 [ShareService] Total earned: ${totalEarned} cents ($${(totalEarned / 100).toFixed(2)})`);

      // Get withdrawal history to calculate available vs withdrawn
      const ShareWithdrawal = require('../models/ShareWithdrawal');
      const withdrawals = await ShareWithdrawal.find({ user_id: userId });
      
      console.log(`🏦 [ShareService] Found ${withdrawals.length} total withdrawals`);
      withdrawals.forEach((w, idx) => {
        console.log(`   Withdrawal ${idx + 1}: withdrawal_id=${w.withdrawal_id}, amount_requested=${w.amount_requested}, status=${w.status}`);
      });
      
      // Calculate amounts
      const withdrawn = withdrawals.reduce((sum, w) => sum + (w.status === 'completed' ? (w.amount_requested || 0) : 0), 0);
      console.log(`✅ [ShareService] Completed withdrawals total: ${withdrawn} cents ($${(withdrawn / 100).toFixed(2)})`);
      
      // Reserve pending and processing withdrawals (not yet paid to user)
      // Valid statuses per ShareWithdrawal schema: pending, processing, completed, failed, cancelled
      const reserved = withdrawals.reduce((sum, w) => 
        sum + (['pending', 'processing'].includes(w.status) ? (w.amount_requested || 0) : 0), 0
      );
      console.log(`⏳ [ShareService] Reserved (pending/processing) withdrawals total: ${reserved} cents ($${(reserved / 100).toFixed(2)})`);
      
      const available = totalEarned - withdrawn - reserved;
      console.log(`\n📈 [ShareService] CALCULATION: ${totalEarned} - ${withdrawn} - ${reserved} = ${available} cents`);
      console.log(`✨ [ShareService] Final available (max 0): ${Math.max(0, available)} cents ($${(Math.max(0, available) / 100).toFixed(2)})\n`);

      return {
        available_cents: Math.max(0, available),
        pending_cents: 0, // No pending status in current implementation
        reserved_cents: reserved,
        total_earned_cents: totalEarned
      };
    } catch (error) {
      console.error(`❌ [ShareService] Error getting available earnings:`, error);
      winstonLogger.error('Error getting available earnings', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
}

module.exports = ShareService;
