/**
 * Share Service
 * Business logic for share recording, budget management, and rewards
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { ShareRecord, ShareBudgetReload } = require('../models/Share');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const SweepstakesService = require('./SweepstakesService');
const winstonLogger = require('../utils/winstonLogger');
const EventBus = require('../events/EventBus');
const { EventEmitter } = require('events');

const shareEventEmitter = new EventEmitter();
const VALID_CHANNELS = ['email', 'facebook', 'twitter', 'instagram', 'linkedin', 'sms', 'whatsapp', 'telegram', 'reddit', 'tiktok', 'other'];
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in ms
const RATE_LIMIT_MAX = 10; // 10 shares per IP per campaign per hour
const SWEEPSTAKES_ENTRIES_PER_SHARE = 0.5;
// Trust-based model (2026-06-22): Share-to-Earn budget top-ups are INSTANT and
// FEE-FREE. The former 20% reload fee (feeEngine.SHARE_RELOAD_FEE_RATE) no longer
// applies to share budgets.
// Single source of truth for the minimum withdrawal/payout threshold ($5) —
// unified with WithdrawalController's /wallet/withdrawals minimum.
const MIN_WITHDRAWAL_CENTS = 500;

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
        committed_budget_remaining: 0,
        amount_per_share: 0,
      };

      winstonLogger.info('📊 ShareService.recordShare: Share config retrieved', {
        campaign_id: campaignId,
        share_config: {
          is_paid_sharing_active: shareConfig.is_paid_sharing_active,
          total_budget: shareConfig.total_budget,
          committed_budget_remaining: shareConfig.committed_budget_remaining,
          amount_per_share: shareConfig.amount_per_share,
          share_channels: shareConfig.share_channels,
        },
      });

      // ===== REWARD MODEL: per-verified-conversion only =====
      // A share is NEVER paid at share time. Recording a share only generates the
      // tracking link (referral_code). Rewards (and budget deductions) happen exactly
      // once, later, when a referred donation converts — see
      // ShareRewardService.processShareConversion(). This prevents the previous
      // double-pay / double budget-deduction bug.
      const isPaid = false;
      const rewardAmount = 0;

      winstonLogger.info('📊 ShareService.recordShare: Recording share (reward deferred to conversion)', {
        campaign_id: campaignId,
        supporter_id: supporterId,
        is_paid_sharing_active: shareConfig.is_paid_sharing_active,
        amount_per_share: shareConfig.amount_per_share,
      });

      // ===== DAILY SHARE-LIMIT GATING (client rule, 2026-06) =====
      // A user earns a tip from only ONE reward-eligible share per campaign per
      // UTC day (plus any creator-approved extra-share grants). Over-quota shares
      // are still recorded — they just don't pay out again (reward_eligible:false),
      // so people can keep sharing for free without draining the reward pool.
      // evaluateForRecord also atomically CONSUMES an approved grant when this
      // eligible share is beyond the base 1/day allowance.
      const ShareGrantService = require('./ShareGrantService');
      const eligibility = await ShareGrantService.evaluateForRecord(campaignId, supporterId);

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
        reward_eligible: eligibility.reward_eligible,
        extra_share_grant_id: eligibility.consumed_grant_id || null,
        status: 'completed', // Honor system
        ip_address: ipAddress,
        user_agent: userAgent,
        location: location || {},
        sweepstakes_entries_awarded: SWEEPSTAKES_ENTRIES_PER_SHARE,
      });

      await shareRecord.save();

      // Link the consumed grant back to the share it unlocked (audit trail).
      if (eligibility.consumed_grant_id) {
        try {
          const ShareGrant = require('../models/ShareGrant');
          await ShareGrant.updateOne(
            { _id: eligibility.consumed_grant_id },
            { $set: { consumed_share_id: shareRecord._id } }
          );
        } catch (linkErr) {
          winstonLogger.error('Failed to link consumed share grant (non-fatal)', { error: linkErr.message });
        }
      }

      // ===== UPDATE CAMPAIGN METRICS (COMPREHENSIVE) =====
      // Update top-level share_count AND nested metrics with all tracking
      if (!campaign.metrics) {
        campaign.metrics = {};
      }
      
      // Track total shares
      campaign.metrics.total_shares = (campaign.metrics.total_shares || 0) + 1;
      campaign.share_count = (campaign.share_count || 0) + 1; // 🔴 CRITICAL: Also update top-level field
      
      // Shares are recorded as free engagement; budget is only touched on conversion.
      campaign.metrics.shares_free = (campaign.metrics.shares_free || 0) + 1;

      // Track by channel
      if (!campaign.metrics.shares_by_channel) {
        campaign.metrics.shares_by_channel = {};
      }
      campaign.metrics.shares_by_channel[channel] = (campaign.metrics.shares_by_channel[channel] || 0) + 1;

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

      // Bridge to the global EventBus so the gamification subsystem
      // (XP, missions, streaks, golden tickets, viral, challenges) can react.
      // Best-effort: a listener failure must never affect share recording.
      try {
        EventBus.emit('share:recorded', {
          userId: supporterId,
          sharer_id: supporterId,
          campaign_id: campaignId,
          share_id: shareId,
          is_paid: isPaid,
        });
      } catch (busError) {
        winstonLogger.error('Failed to bridge share:recorded to EventBus', { error: busError.message });
      }

      // Attribute the share to an active boost (powers the boost dashboard's
      // "Engagement" stat). Best-effort — never fail a share over tracking.
      try {
        const CampaignBoost = require('../models/CampaignBoost');
        await CampaignBoost.recordBoostEvent(campaignId, 'engagement');
      } catch (boostErr) {
        winstonLogger.warn('recordShare: boost engagement tracking failed (non-fatal)', {
          error: boostErr.message,
          campaignId,
        });
      }

      winstonLogger.info('Share recorded successfully', {
        shareId,
        campaignId,
        isPaid,
        rewardAmount,
      });

      // Post-share daily-limit snapshot for the UI.
      const usedAfter = eligibility.status.reward_eligible_used + (eligibility.reward_eligible ? 1 : 0);
      const remainingAfter = Math.max(0, eligibility.status.quota - usedAfter);
      const shareLimit = {
        reward_eligible: eligibility.reward_eligible,
        used_today: usedAfter,
        quota_today: eligibility.status.quota,
        remaining_reward_shares: remainingAfter,
        // True once today's tip-eligible allowance is used up — the cue for the
        // frontend to offer "Request another share" to the creator.
        can_request_more: remainingAfter === 0,
      };

      const message = eligibility.reward_eligible
        ? 'Share recorded! Earn a tip when someone donates through your link.'
        : 'Shared for free! You’ve used today’s tip-eligible share for this campaign. Ask the creator to share again for a tip, or keep sharing for free.';

      return {
        success: true,
        shareId,
        isPaid,
        rewardAmount,
        rewardEligible: eligibility.reward_eligible,
        shareLimit,
        referralCode: `?ref=${referralCode}`,
        message,
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
          message: 'Only campaign creator can top up the share budget',
          statusCode: 403,
        };
      }

      // Trust-based model: NO platform fee, NO admin verification. The full
      // amount tops up the declared reward pool INSTANTLY and re-activates paid
      // sharing if it now covers a reward.
      const config = campaign.share_config || {};
      const reloadId = `RELOAD-${new Date().getFullYear()}-${uuidv4().substring(0, 8).toUpperCase()}`;

      // Apply the top-up to the declared pool + liability counter.
      config.total_budget = (config.total_budget || 0) + amount;
      const committedTotal = config.committed_total || 0;
      config.committed_budget_remaining = Math.max(0, config.total_budget - committedTotal);

      // Re-activate paid sharing if the pool now covers at least one reward.
      if (
        (config.amount_per_share || 0) > 0 &&
        config.committed_budget_remaining >= config.amount_per_share
      ) {
        config.is_paid_sharing_active = true;
      }
      config.last_config_update = new Date();
      campaign.share_config = config;
      await campaign.save();

      // Audit trail: record an already-approved, fee-free top-up.
      const reloadRequest = new ShareBudgetReload({
        reload_id: reloadId,
        campaign_id: campaignId,
        creator_id: creatorId,
        requested_amount: amount,
        gross_amount: amount,
        platform_fee: 0,
        net_amount: amount,
        status: 'approved',
        verified_by: creatorId,
        verified_at: new Date(),
        payment_method: paymentMethod,
      });

      await reloadRequest.save();

      // Emit event (budget changed). No admin-notification event — nothing to approve.
      shareEventEmitter.emit('share:budget_reloaded', {
        reloadId,
        campaignId,
        creatorId,
        amount,
      });

      winstonLogger.info('Share budget topped up (trust-based, instant, no fee)', {
        reloadId,
        campaignId,
        amount,
        newBudgetRemaining: config.committed_budget_remaining,
        isPaidSharingActive: config.is_paid_sharing_active,
      });

      return {
        success: true,
        reloadId,
        requestedAmount: amount,
        platformFee: 0,
        netAmount: amount,
        status: 'approved',
        newBudgetRemaining: config.committed_budget_remaining,
        isPaidSharingActive: config.is_paid_sharing_active,
        message: `Share budget topped up by $${(amount / 100).toFixed(2)}. Rewards are live immediately.`,
      };
    } catch (error) {
      winstonLogger.error('Error topping up share budget', {
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
    // DEPRECATED (trust-based model, 2026-06-22): budget top-ups now apply
    // INSTANTLY and fee-free via requestShareBudgetReload — there is nothing for
    // an admin to verify. Kept as a 410 so legacy admin clients get a clear
    // signal instead of silently succeeding.
    const { reloadId } = params;
    winstonLogger.warn('Deprecated verifyShareBudgetReload called (reloads are now instant)', {
      reloadId,
    });
    throw {
      code: 'ENDPOINT_DEPRECATED',
      message:
        'Budget reloads are now instant and fee-free; admin verification has been removed.',
      statusCode: 410,
    };
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
    // DEPRECATED (trust-based model, 2026-06-22): there are no pending reloads to
    // reject — top-ups apply instantly via requestShareBudgetReload.
    const { reloadId } = params;
    winstonLogger.warn('Deprecated rejectShareBudgetReload called (reloads are now instant)', {
      reloadId,
    });
    throw {
      code: 'ENDPOINT_DEPRECATED',
      message:
        'Budget reloads are now instant and fee-free; admin rejection has been removed.',
      statusCode: 410,
    };
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
      // SINGLE SOURCE OF TRUTH: the share_reward Transaction ledger.
      // Trust-based: owed = claimable now, paid = settled by creator. Legacy
      // pending_hold/approved retained for back-compat; rejected excluded.
      const ledger = await this.getEarningsLedger(userId);

      // Breakdown by channel from the underlying reward records (informational only)
      const rewardTx = await Transaction.find({
        supporter_id: userId,
        transaction_type: 'share_reward',
        status: { $in: ['owed', 'paid', 'pending_hold', 'approved'] },
      }).populate('related_share_id', 'channel');

      const byPlatform = {};
      rewardTx.forEach((tx) => {
        const channel = tx.related_share_id?.channel || 'other';
        if (!byPlatform[channel]) {
          byPlatform[channel] = { shares: 0, earnings: 0 };
        }
        byPlatform[channel].shares += 1;
        byPlatform[channel].earnings += tx.amount_cents || 0;
      });

      return {
        success: true,
        data: {
          total: ledger.total_earned_cents,
          withdrawn: ledger.withdrawn_cents,
          pending: ledger.pending_cents,
          available: ledger.available_cents,
          // Cleared (passed hold) earnings available for payout
          verified_earnings_cents: ledger.available_cents,
          byPlatform,
        },
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
   * Get share statistics for a campaign (shares, clicks, conversions, earnings).
   * @param {string} campaignId
   * @returns {Promise<Object>}
   */
  static async getShareStats(campaignId) {
    try {
      const agg = await ShareRecord.aggregate([
        { $match: { campaign_id: new mongoose.Types.ObjectId(campaignId) } },
        {
          $group: {
            _id: null,
            totalShares: { $sum: 1 },
            totalClicks: { $sum: { $ifNull: ['$clicks', 0] } },
            totalConversions: { $sum: { $ifNull: ['$conversions', 0] } },
            uniqueSharers: { $addToSet: '$supporter_id' },
          },
        },
      ]);

      const stats = agg[0] || { totalShares: 0, totalClicks: 0, totalConversions: 0, uniqueSharers: [] };

      // Rewards accrued for this campaign (owed + paid + legacy)
      const rewardAgg = await Transaction.aggregate([
        {
          $match: {
            campaign_id: new mongoose.Types.ObjectId(campaignId),
            transaction_type: 'share_reward',
            status: { $in: ['owed', 'paid', 'pending_hold', 'approved'] },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount_cents' }, count: { $sum: 1 } } },
      ]);

      return {
        campaignId,
        totalShares: stats.totalShares,
        totalClicks: stats.totalClicks,
        totalConversions: stats.totalConversions,
        uniqueSharers: stats.uniqueSharers.length,
        conversionRate: stats.totalClicks > 0
          ? ((stats.totalConversions / stats.totalClicks) * 100).toFixed(2)
          : '0.00',
        totalRewardsCents: rewardAgg[0]?.total || 0,
        rewardCount: rewardAgg[0]?.count || 0,
      };
    } catch (error) {
      winstonLogger.error('Error getting share stats', { error: error.message, campaignId });
      throw { statusCode: 500, message: 'Failed to retrieve share stats', error: error.message };
    }
  }

  /**
   * Get comprehensive share metrics for a campaign.
   * @param {string} campaignId
   * @param {Object} options - { timeframe, includeBreakdown }
   * @returns {Promise<Object>}
   */
  static async getShareMetrics(campaignId, options = {}) {
    try {
      const { includeBreakdown = true } = options;
      const stats = await this.getShareStats(campaignId);

      let breakdown = null;
      if (includeBreakdown) {
        const byChannel = await ShareRecord.aggregate([
          { $match: { campaign_id: new mongoose.Types.ObjectId(campaignId) } },
          {
            $group: {
              _id: '$channel',
              shares: { $sum: 1 },
              clicks: { $sum: { $ifNull: ['$clicks', 0] } },
              conversions: { $sum: { $ifNull: ['$conversions', 0] } },
            },
          },
          { $sort: { shares: -1 } },
        ]);
        breakdown = byChannel.map((c) => ({ channel: c._id, ...c, _id: undefined }));
      }

      return { ...stats, breakdown };
    } catch (error) {
      winstonLogger.error('Error getting share metrics', { error: error.message, campaignId });
      throw { statusCode: 500, message: 'Failed to retrieve share metrics', error: error.message };
    }
  }

  /**
   * Record a click on a referral link (by referral code / token).
   * Fire-and-forget friendly: increments click counters quickly.
   * @param {Object} params - { token, ipAddress, userAgent, location, referrer, userId }
   * @returns {Promise<Object>}
   */
  static async recordReferralClick(params) {
    const { token, ipAddress, userAgent } = params;
    try {
      if (!token) {
        throw { statusCode: 400, code: 'MISSING_TOKEN', message: 'Referral token is required' };
      }

      const share = await ShareRecord.findOneAndUpdate(
        { referral_code: token },
        {
          $inc: { clicks: 1 },
          $set: { last_clicked_at: new Date() },
        },
        { new: true }
      );

      if (!share) {
        return { recorded: false, reason: 'Referral code not found' };
      }

      winstonLogger.info('🔗 Referral click recorded', {
        token,
        shareId: share.share_id,
        clicks: share.clicks,
        ipAddress,
        userAgent,
      });

      return {
        recorded: true,
        shareId: share.share_id,
        campaignId: share.campaign_id,
        clicks: share.clicks,
      };
    } catch (error) {
      winstonLogger.error('Error recording referral click', { error: error.message, token });
      throw error.statusCode ? error : { statusCode: 500, message: 'Failed to record referral click', error: error.message };
    }
  }

  /**
   * List a user's shares with pagination + filtering.
   * @param {string} userId
   * @param {Object} options - { page, limit, campaignId, platform, sortBy, sortOrder }
   * @returns {Promise<Object>}
   */
  static async listUserShares(userId, options = {}) {
    try {
      const { page = 1, limit = 20, campaignId, platform, sortBy = 'created_at', sortOrder = 'desc' } = options;
      const skip = (page - 1) * limit;

      const query = { supporter_id: userId };
      if (campaignId) query.campaign_id = campaignId;
      if (platform) query.channel = platform;

      const sortField = sortBy === 'createdAt' ? 'created_at' : sortBy;
      const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };

      const shares = await ShareRecord.find(query)
        .populate('campaign_id', 'title status')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      const total = await ShareRecord.countDocuments(query);

      return {
        data: shares.map((s) => ({
          id: s._id,
          shareId: s.share_id,
          campaignId: s.campaign_id?._id || s.campaign_id,
          campaignTitle: s.campaign_id?.title || 'Unknown Campaign',
          channel: s.channel,
          clicks: s.clicks || 0,
          conversions: s.conversions || 0,
          referralCode: s.referral_code,
          status: s.status,
          createdAt: s.created_at,
        })),
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      };
    } catch (error) {
      winstonLogger.error('Error listing user shares', { error: error.message, userId });
      throw { statusCode: 500, message: 'Failed to list user shares', error: error.message };
    }
  }

  /**
   * Platform-wide share statistics, grouped by channel.
   * @param {Object} options - { timeframe, groupBy, minShares }
   * @returns {Promise<Object>}
   */
  static async getPlatformShareStats(options = {}) {
    try {
      const { timeframe = 'month', minShares = 0 } = options;

      const match = {};
      if (timeframe === 'month') {
        match.created_at = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
      } else if (timeframe === 'week') {
        match.created_at = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
      }

      const byChannel = await ShareRecord.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$channel',
            shares: { $sum: 1 },
            clicks: { $sum: { $ifNull: ['$clicks', 0] } },
            conversions: { $sum: { $ifNull: ['$conversions', 0] } },
          },
        },
        { $match: { shares: { $gte: minShares } } },
        { $sort: { shares: -1 } },
      ]);

      const totals = byChannel.reduce(
        (acc, c) => {
          acc.shares += c.shares;
          acc.clicks += c.clicks;
          acc.conversions += c.conversions;
          return acc;
        },
        { shares: 0, clicks: 0, conversions: 0 }
      );

      return {
        timeframe,
        totals,
        byChannel: byChannel.map((c) => ({ channel: c._id, shares: c.shares, clicks: c.clicks, conversions: c.conversions })),
      };
    } catch (error) {
      winstonLogger.error('Error getting platform share stats', { error: error.message });
      throw { statusCode: 500, message: 'Failed to retrieve platform share stats', error: error.message };
    }
  }

  /**
   * Get a user's referral history (shares that have a referral code), with click/conversion data.
   * @param {string} userId
   * @param {Object} options - { page, limit, campaignId, status, minClicks }
   * @returns {Promise<Object>}
   */
  static async getReferralHistory(userId, options = {}) {
    try {
      const { page = 1, limit = 20, campaignId, minClicks = 0 } = options;
      const skip = (page - 1) * limit;

      const query = { supporter_id: userId, referral_code: { $exists: true, $ne: null } };
      if (campaignId) query.campaign_id = campaignId;
      if (minClicks > 0) query.clicks = { $gte: minClicks };

      const shares = await ShareRecord.find(query)
        .populate('campaign_id', 'title status')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await ShareRecord.countDocuments(query);

      return {
        data: shares.map((s) => ({
          shareId: s.share_id,
          campaignId: s.campaign_id?._id || s.campaign_id,
          campaignTitle: s.campaign_id?.title || 'Unknown Campaign',
          referralCode: s.referral_code,
          clicks: s.clicks || 0,
          conversions: s.conversions || 0,
          channel: s.channel,
          createdAt: s.created_at,
        })),
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      };
    } catch (error) {
      winstonLogger.error('Error getting referral history', { error: error.message, userId });
      throw { statusCode: 500, message: 'Failed to retrieve referral history', error: error.message };
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

      // Map legacy method names to the schema's payment_type enum
      const paymentTypeMap = { bank: 'bank_transfer', bank_transfer: 'bank_transfer', stripe: 'stripe', paypal: 'paypal', mobile_money: 'mobile_money' };
      const paymentType = paymentTypeMap[method] || 'bank_transfer';

      // Create withdrawal record (field names per ShareWithdrawal schema)
      const ShareWithdrawal = require('../models/ShareWithdrawal');
      const withdrawal = new ShareWithdrawal({
        withdrawal_id: `WD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user_id: userId,
        amount_requested: amountCents,
        payment_type: paymentType,
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
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const ledger = await this.getEarningsLedger(userId, campaignId);

      return {
        campaign_id: campaignId,
        campaign_title: campaign.title,
        earned_cents: ledger.total_earned_cents,
        withdrawn_cents: ledger.withdrawn_cents,
        reserved_cents: ledger.reserved_cents,
        available_cents: ledger.available_cents,
      };
    } catch (error) {
      winstonLogger.error('Error getting balance by campaign', {
        error: error.message,
        userId,
        campaignId,
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
      // Group the share_reward ledger by campaign
      const rewardTx = await Transaction.find({
        supporter_id: userId,
        transaction_type: 'share_reward',
        status: { $in: ['owed', 'paid', 'pending_hold', 'approved'] },
      }).populate('campaign_id', 'title');

      const campaignIds = [
        ...new Set(
          rewardTx
            .map((tx) => tx.campaign_id?._id?.toString())
            .filter(Boolean)
        ),
      ];

      const titleById = {};
      rewardTx.forEach((tx) => {
        if (tx.campaign_id?._id) {
          titleById[tx.campaign_id._id.toString()] = tx.campaign_id.title;
        }
      });

      // Build per-campaign balances using the shared ledger helper
      const campaignBalances = await Promise.all(
        campaignIds.map(async (campaignId) => {
          const ledger = await this.getEarningsLedger(userId, campaignId);
          return {
            campaign_id: campaignId,
            campaign_title: titleById[campaignId] || 'Campaign',
            earned_cents: ledger.total_earned_cents,
            withdrawn_cents: ledger.withdrawn_cents,
            reserved_cents: ledger.reserved_cents,
            available_cents: ledger.available_cents,
          };
        })
      );

      return campaignBalances;
    } catch (error) {
      winstonLogger.error('Error getting campaign earnings', {
        error: error.message,
        userId,
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
      const ledger = await this.getEarningsLedger(userId);
      return {
        available_cents: ledger.available_cents,
        pending_cents: ledger.pending_cents,
        reserved_cents: ledger.reserved_cents,
        total_earned_cents: ledger.total_earned_cents,
      };
    } catch (error) {
      winstonLogger.error('Error getting available earnings', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Build the Sharer Rewards dashboard payload (summary + reward lists).
   * Shape matches the frontend `app/dashboard/share-rewards/page.tsx` contract.
   * @param {String} userId
   * @returns {Promise<Object>}
   */
  static async getSharerRewardsDashboard(userId) {
    const ledger = await this.getEarningsLedger(userId);

    const rewardTx = await Transaction.find({
      supporter_id: userId,
      transaction_type: 'share_reward',
      status: { $in: ['owed', 'paid', 'pending_hold', 'approved'] },
    })
      .populate('campaign_id', 'title')
      .sort({ created_at: -1 });

    const now = Date.now();
    // Trust-based status → dashboard bucket:
    //   owed / approved(legacy) → 'verified' (claimable now)
    //   paid                    → 'paid'     (settled by creator)
    //   pending_hold(legacy)    → 'pending_verification' (still on hold)
    const toBucket = (status) => {
      if (status === 'paid') return 'paid';
      if (status === 'pending_hold') return 'pending_verification';
      return 'verified'; // owed + legacy approved
    };
    const toReward = (tx) => {
      const holdUntil = tx.hold_until_date ? new Date(tx.hold_until_date) : null;
      const daysRemaining = holdUntil
        ? Math.max(0, Math.ceil((holdUntil.getTime() - now) / (1000 * 60 * 60 * 24)))
        : 0;
      return {
        _id: tx._id,
        reward_id: tx._id.toString(),
        campaign_id: tx.campaign_id?._id || tx.campaign_id,
        campaign_name: tx.campaign_id?.title || 'Campaign',
        amount_cents: tx.amount_cents || 0,
        status: toBucket(tx.status),
        hold_until_date: tx.hold_until_date || null,
        hold_days_remaining: daysRemaining,
        verified_at: tx.approved_at || tx.created_at || null,
        earned_at: tx.created_at,
      };
    };

    const rewards = rewardTx.map(toReward);
    const verifiedRewards = rewards.filter((r) => r.status === 'verified');
    const pendingRewards = rewards.filter((r) => r.status === 'pending_verification');

    return {
      sharer_id: userId,
      summary: {
        total_earned_cents: ledger.total_earned_cents,
        verified_cents: ledger.available_cents,
        pending_cents: ledger.pending_cents,
        total_reward_count: rewards.length,
        verified_count: verifiedRewards.length,
        pending_count: pendingRewards.length,
        can_request_payout: ledger.available_cents >= MIN_WITHDRAWAL_CENTS,
        total_available_for_payout: ledger.available_cents,
      },
      rewards,
      verified_rewards: verifiedRewards,
      pending_rewards: pendingRewards,
    };
  }

  /**
   * Compute a user's share-reward earnings ledger from the authoritative
   * share_reward Transaction records, reconciled against ShareWithdrawal history.
   *
   * Trust-based model (2026-06-22): rewards are 'owed' (claimable immediately,
   * no hold) until the creator settles them directly, flipping them to 'paid'.
   * Legacy escrow statuses are mapped for back-compat: 'pending_hold' → pending,
   * 'approved' → owed/claimable.
   *
   * - pending_cents:   legacy rewards still on a 30-day hold ('pending_hold')
   * - cleared_cents:   owed/claimable rewards ('owed' + legacy 'approved')
   * - paid_cents:      rewards the creator has settled ('paid')
   * - withdrawn_cents: completed withdrawal records (reporting)
   * - reserved_cents:  withdrawals in flight (pending/processing)
   * - available_cents: owed − in-flight − legacy-already-withdrawn (never negative)
   *
   * @param {String} userId
   * @param {String} [campaignId] - optional: scope the ledger to a single campaign
   * @returns {Promise<Object>}
   */
  static async getEarningsLedger(userId, campaignId = null) {
    const ShareWithdrawal = require('../models/ShareWithdrawal');

    const txQuery = {
      supporter_id: userId,
      transaction_type: 'share_reward',
      status: { $in: ['owed', 'paid', 'pending_hold', 'approved'] },
    };
    if (campaignId) txQuery.campaign_id = campaignId;

    const rewardTx = await Transaction.find(txQuery).select('amount_cents status');

    let pending = 0; // legacy on-hold
    let owed = 0; // claimable now (owed + legacy approved)
    let paid = 0; // settled by creator
    rewardTx.forEach((tx) => {
      const amt = tx.amount_cents || 0;
      if (tx.status === 'pending_hold') pending += amt;
      else if (tx.status === 'owed' || tx.status === 'approved') owed += amt;
      else if (tx.status === 'paid') paid += amt;
    });

    const withdrawals = await ShareWithdrawal.find({ user_id: userId });

    const sumWithdrawals = (statuses) =>
      withdrawals.reduce((sum, w) => {
        if (!statuses.includes(w.status)) return sum;
        if (campaignId) {
          // Campaign-scoped: only count the portion attributed to this campaign
          const cw = (w.campaign_withdrawals || []).find(
            (x) => x.campaign_id?.toString() === campaignId.toString()
          );
          return sum + (cw ? cw.amount_cents : 0);
        }
        return sum + (w.amount_requested || 0);
      }, 0);

    const completed = sumWithdrawals(['completed']);
    const reserved = sumWithdrawals(['pending', 'processing']);

    // Settlement is status-driven: a settled reward leaves the owed bucket
    // (→ 'paid'), so completed withdrawals are NOT subtracted from owed again.
    // The (completed − paid) term only catches LEGACY withdrawals that completed
    // before the pivot (when rewards stayed 'approved' rather than flipping to
    // 'paid'); for new data paid ≥ completed so it contributes 0.
    const legacyWithdrawn = Math.max(0, completed - paid);
    const available = Math.max(0, owed - reserved - legacyWithdrawn);

    return {
      total_earned_cents: pending + owed + paid,
      pending_cents: pending,
      cleared_cents: owed,
      paid_cents: paid,
      withdrawn_cents: completed,
      reserved_cents: reserved,
      available_cents: available,
    };
  }
}

module.exports = ShareService;
