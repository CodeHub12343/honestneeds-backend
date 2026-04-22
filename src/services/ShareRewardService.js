/**
 * Share Reward Service
 * Handles conversion attribution pipeline
 * Links share events to donations and creates hold transactions
 *
 * Flow:
 * 1. Supporter clicks share link with referral code
 * 2. Supporter donates to campaign
 * 3. Donation is verified by admin
 * 4. ShareRewardService.processShareConversion() is called
 * 5. Reward is created as pending_hold transaction (30-day hold)
 * 6. After 30 days, reward moves to approved/available balance
 */

const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const Share = require('../models/Share');
const User = require('../models/User');
const ReferralTracking = require('../models/ReferralTracking');
const winstonLogger = require('../utils/winstonLogger');

class ShareRewardService {
  /**
   * Process share conversion
   * Called when a supporter who came from a share link completes a donation
   *
   * @param {Object} params - Conversion parameters
   * @param {ObjectId} params.campaignId - Campaign ID
   * @param {ObjectId} params.donationTransactionId - The donation transaction ID
   * @param {string} params.referralCode - The referral code from share link
   * @param {number} params.amountCents - Donation amount in cents
   * @param {ObjectId} params.supporterId - Supporter ID (who made the donation)
   * @param {string} params.paymentMethod - Payment method used
   * @returns {Promise<Object>} Result with reward details
   */
  static async processShareConversion(params) {
    const {
      campaignId,
      donationTransactionId,
      referralCode,
      amountCents,
      supporterId,
      paymentMethod
    } = params;

    try {
      winstonLogger.info('🔄 ShareRewardService.processShareConversion: Starting conversion processing', {
        campaignId,
        donationTransactionId,
        referralCode,
        amountCents,
        supporterId,
        paymentMethod,
        amountDollars: (amountCents / 100).toFixed(2),
      });

      // ===== STEP 1: Validate Share Record =====

      // Find share record by referral code
      const shareRecord = await Share.findOne({ referral_code: referralCode });

      if (!shareRecord) {
        winstonLogger.warn('⚠️ ShareRewardService: Share record not found for referral code', {
          referralCode,
          campaignId,
        });
        // Not a fatal error - just no reward
        return {
          success: true,
          reward_created: false,
          reason: 'Share record not found - no reward eligible',
        };
      }

      winstonLogger.info('✅ ShareRewardService: Share record found', {
        shareId: shareRecord.share_id,
        supporterId: shareRecord.supporter_id,
        channel: shareRecord.channel,
        isPaid: shareRecord.is_paid,
      });

      // ===== STEP 2: Verify Share Eligibility =====

      // Check if share record belongs to correct campaign
      if (shareRecord.campaign_id.toString() !== campaignId.toString()) {
        winstonLogger.warn('⚠️ ShareRewardService: Share record campaign mismatch', {
          shareRecordCampaignId: shareRecord.campaign_id,
          donationCampaignId: campaignId,
          referralCode,
        });
        return {
          success: true,
          reward_created: false,
          reason: 'Share record belongs to different campaign',
        };
      }

      // Check if share already has conversions (prevent double-counting)
      if (!shareRecord.conversions) {
        shareRecord.conversions = 0;
      }

      // ===== STEP 3: Get Campaign & Verify Share Config =====

      const campaign = await Campaign.findById(campaignId);

      if (!campaign) {
        winstonLogger.error('❌ ShareRewardService: Campaign not found', {
          campaignId,
          referralCode,
        });
        return {
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign associated with share not found',
        };
      }

      // Verify campaign is sharing type
      if (campaign.campaign_type !== 'sharing') {
        winstonLogger.warn('⚠️ ShareRewardService: Campaign is not sharing type', {
          campaignId,
          campaignType: campaign.campaign_type,
          referralCode,
        });
        return {
          success: true,
          reward_created: false,
          reason: 'Campaign is not a sharing campaign',
        };
      }

      // Get share config
      const shareConfig = campaign.share_config || {
        is_paid_sharing_active: false,
        current_budget_remaining: 0,
        amount_per_share: 0,
      };

      winstonLogger.info('📊 ShareRewardService: Campaign share config retrieved', {
        campaignId,
        shareConfig: {
          is_paid_sharing_active: shareConfig.is_paid_sharing_active,
          total_budget: shareConfig.total_budget,
          current_budget_remaining: shareConfig.current_budget_remaining,
          amount_per_share: shareConfig.amount_per_share,
        },
      });

      // ===== STEP 4: Verify Eligibility & Calculate Reward =====

      // Check if paid sharing is active
      if (!shareConfig.is_paid_sharing_active) {
        winstonLogger.info('📊 ShareRewardService: Paid sharing not active', {
          campaignId,
          referralCode,
          is_paid_sharing_active: false,
        });
        return {
          success: true,
          reward_created: false,
          reason: 'Paid sharing is not active for this campaign',
        };
      }

      // Check if budget remaining is sufficient
      if (shareConfig.current_budget_remaining < shareConfig.amount_per_share) {
        winstonLogger.info('📊 ShareRewardService: Insufficient budget for reward', {
          campaignId,
          referralCode,
          current_budget_remaining: shareConfig.current_budget_remaining,
          amount_per_share: shareConfig.amount_per_share,
        });
        return {
          success: true,
          reward_created: false,
          reason: 'Campaign budget exhausted',
        };
      }

      // ===== ANTI-FRAUD CHECKS =====

      // Check 1: Donation amount vs reward amount
      // Donation should be at least 10x the reward (to prevent artificially low donations)
      const minDonationAmount = shareConfig.amount_per_share * 10;
      if (amountCents < minDonationAmount) {
        winstonLogger.warn('⚠️ ShareRewardService: Fraud check - donation too small vs reward', {
          campaignId,
          referralCode,
          donationAmount: amountCents,
          rewardAmount: shareConfig.amount_per_share,
          minRequired: minDonationAmount,
        });
        return {
          success: true,
          reward_created: false,
          reason: 'Donation amount too small relative to reward (fraud protection)',
        };
      }

      // Check 2: Account age verification
      const sharer = await User.findById(shareRecord.supporter_id);
      if (sharer) {
        const accountAgeMs = Date.now() - sharer.created_at.getTime();
        const accountAgeHours = accountAgeMs / (1000 * 60 * 60);

        if (accountAgeHours < 24) {
          winstonLogger.warn('⚠️ ShareRewardService: Fraud check - account too new', {
            campaignId,
            supporterId: shareRecord.supporter_id,
            accountAgeHours: accountAgeHours.toFixed(1),
          });
          return {
            success: true,
            reward_created: false,
            reason: 'Sharer account too new (fraud protection)',
          };
        }
      }

      // ===== STEP 5: Create Reward Transaction =====

      winstonLogger.info('💰 ShareRewardService: Creating reward transaction', {
        campaignId,
        supporterId: shareRecord.supporter_id,
        rewardAmount: shareConfig.amount_per_share,
        rewardDollars: (shareConfig.amount_per_share / 100).toFixed(2),
      });

      // Calculate hold until date (30 days from now)
      const holdUntilDate = new Date();
      holdUntilDate.setDate(holdUntilDate.getDate() + 30);

      const rewardTransaction = new Transaction({
        campaign_id: campaignId,
        supporter_id: shareRecord.supporter_id,
        creator_id: campaign.creator_id,
        transaction_type: 'share_reward',
        amount_cents: shareConfig.amount_per_share,
        platform_fee_cents: 0, // No platform fee on rewards
        net_amount_cents: shareConfig.amount_per_share,
        payment_method: 'internal_wallet', // Reward deposited to internal wallet
        status: 'pending_hold', // NEW STATUS for 30-day hold
        hold_until_date: holdUntilDate,
        hold_reason: 'Standard 30-day hold for share rewards (fraud verification)',
        related_donation_id: donationTransactionId,
        related_share_id: shareRecord._id,
        ip_address: shareRecord.ip_address,
        device_info: shareRecord.device_info,
        notes: [
          {
            timestamp: new Date(),
            note: `Reward for share via ${shareRecord.channel} - ${shareConfig.amount_per_share / 100} USD`,
            created_by: null, // System
          },
        ],
      });

      await rewardTransaction.save();

      winstonLogger.info('✅ ShareRewardService: Reward transaction created', {
        transactionId: rewardTransaction._id,
        rewardAmount: shareConfig.amount_per_share,
        holdUntilDate: holdUntilDate.toISOString(),
        status: 'pending_hold',
      });

      // ===== STEP 6: Update Share Record & ReferralTracking =====

      // Track that this share converted
      shareRecord.conversions = (shareRecord.conversions || 0) + 1;
      if (!shareRecord.conversion_ids) {
        shareRecord.conversion_ids = [];
      }
      shareRecord.conversion_ids.push(donationTransactionId);

      // Mark as converted
      if (!shareRecord.conversion_reward_ids) {
        shareRecord.conversion_reward_ids = [];
      }
      shareRecord.conversion_reward_ids.push(rewardTransaction._id);

      shareRecord.conversion_date = new Date();
      await shareRecord.save();

      winstonLogger.info('✅ ShareRewardService: Share record updated with conversion', {
        shareId: shareRecord.share_id,
        conversions: shareRecord.conversions,
        conversionRewardId: rewardTransaction._id,
      });

      // ✅ NEW: Record conversion in ReferralTracking for analytics
      try {
        let referralTracking = await ReferralTracking.findOne({
          share_id: shareRecord._id,
          campaign_id: campaignId,
          referrer_id: shareRecord.supporter_id,
        });

        if (!referralTracking) {
          // Create new referral tracking if doesn't exist
          referralTracking = new ReferralTracking({
            tracking_id: `RT-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
            campaign_id: campaignId,
            share_id: shareRecord._id,
            referrer_id: shareRecord.supporter_id,
            referral_visits: [],
            conversions: [],
            total_visits: 0,
            total_conversions: 0,
            total_conversion_amount: 0,
            conversion_rate: 0,
            is_active: true,
          });
        }

        // Add conversion to tracking
        referralTracking.conversions.push({
          converted_by_id: supporterId, // The person who donated
          donation_id: donationTransactionId,
          donation_amount: amountCents,
          converted_at: new Date(),
          reward_pending: true,
          reward_amount: shareConfig.amount_per_share,
        });

        referralTracking.total_conversions += 1;
        referralTracking.total_conversion_amount += amountCents;

        // Update conversion rate
        if (referralTracking.total_visits > 0) {
          referralTracking.conversion_rate = 
            (referralTracking.total_conversions / referralTracking.total_visits) * 100;
        }

        referralTracking.markModified('conversions');
        await referralTracking.save();

        winstonLogger.info('✅ ShareRewardService: ReferralTracking updated with conversion', {
          trackingId: referralTracking.tracking_id,
          totalConversions: referralTracking.total_conversions,
          totalConversionAmount: referralTracking.total_conversion_amount,
          conversionRate: referralTracking.conversion_rate.toFixed(2),
        });
      } catch (error) {
        winstonLogger.error('⚠️ ShareRewardService: Error updating ReferralTracking', {
          error: error.message,
          campaignId,
          shareId: shareRecord._id,
        });
        // Don't fail the conversion if tracking fails
      }

      // ===== STEP 7: Update Campaign Metrics & Budget =====

      // Deduct from share config budget
      shareConfig.current_budget_remaining -= shareConfig.amount_per_share;
      shareConfig.last_config_update = new Date();

      // Auto-disable if budget depleted
      if (shareConfig.current_budget_remaining <= 0) {
        shareConfig.is_paid_sharing_active = false;
        shareConfig.current_budget_remaining = 0;

        winstonLogger.info('⚠️ ShareRewardService: Share budget depleted - disabling paid sharing', {
          campaignId,
          totalBudget: shareConfig.total_budget,
          spentAmount: shareConfig.total_budget - shareConfig.current_budget_remaining,
        });
      }

      // Update campaign metrics
      const updatedCampaign = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          share_config: shareConfig,
          $inc: {
            'metrics.shares_paid': 1,
            'metrics.conversions_from_shares': 1,
            'metrics.total_share_rewards_pending': shareConfig.amount_per_share,
          },
          $push: {
            'metrics.share_reward_transactions': {
              reward_transaction_id: rewardTransaction._id,
              amount_cents: shareConfig.amount_per_share,
              hold_until_date: holdUntilDate,
              created_at: new Date(),
            },
          },
        },
        { new: true }
      );

      winstonLogger.info('✅ ShareRewardService: Campaign metrics and budget updated', {
        campaignId,
        newBudgetRemaining: shareConfig.current_budget_remaining,
        isPaidSharingActive: shareConfig.is_paid_sharing_active,
      });

      // ===== STEP 8: Emit Events =====

      // Emit event for logging service, notifications, etc.
      const event = {
        event_type: 'share_conversion',
        timestamp: new Date(),
        campaign_id: campaignId,
        campaign_name: campaign.title,
        sharer_id: shareRecord.supporter_id,
        donor_id: supporterId,
        share_id: shareRecord.share_id,
        share_channel: shareRecord.channel,
        donation_amount: amountCents,
        reward_amount: shareConfig.amount_per_share,
        transaction_id: rewardTransaction._id,
        reward_status: 'pending_hold',
        hold_until_date: holdUntilDate.toISOString(),
      };

      winstonLogger.info('📢 ShareRewardService: Emitting conversion event', event);

      // ===== RETURN SUCCESS =====

      return {
        success: true,
        reward_created: true,
        data: {
          transaction_id: rewardTransaction._id,
          amount_cents: shareConfig.amount_per_share,
          amount_dollars: (shareConfig.amount_per_share / 100).toFixed(2),
          status: 'pending_hold',
          hold_until_date: holdUntilDate.toISOString(),
          hold_days_remaining: 30,
          share_id: shareRecord.share_id,
          channel: shareRecord.channel,
        },
        message: `Share reward of $${(shareConfig.amount_per_share / 100).toFixed(2)} created. Subject to 30-day hold for fraud verification.`,
      };
    } catch (error) {
      winstonLogger.error('❌ ShareRewardService.processShareConversion error', {
        error: error.message,
        stack: error.stack,
        campaignId: params.campaignId,
        referralCode: params.referralCode,
      });

      return {
        success: false,
        error: 'SHARE_REWARD_PROCESSING_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Get share conversion statistics for a campaign
   * @param {ObjectId} campaignId - Campaign ID
   * @returns {Promise<Object>} Conversion stats
   */
  static async getConversionStats(campaignId) {
    try {
      const shares = await Share.find({ campaign_id: campaignId });

      const totalShares = shares.length;
      const sharesWithConversions = shares.filter((s) => s.conversions && s.conversions > 0)
        .length;
      const totalConversions = shares.reduce((sum, s) => sum + (s.conversions || 0), 0);
      const conversionRate = totalShares > 0 ? (totalConversions / totalShares) * 100 : 0;

      // By platform
      const byChannel = {};
      shares.forEach((s) => {
        if (!byChannel[s.channel]) {
          byChannel[s.channel] = { shares: 0, conversions: 0 };
        }
        byChannel[s.channel].shares += 1;
        byChannel[s.channel].conversions += s.conversions || 0;
      });

      return {
        success: true,
        data: {
          total_shares: totalShares,
          shares_with_conversions: sharesWithConversions,
          total_conversions: totalConversions,
          conversion_rate_percent: conversionRate.toFixed(2),
          by_channel: byChannel,
        },
      };
    } catch (error) {
      winstonLogger.error('ShareRewardService.getConversionStats error', {
        error: error.message,
        campaignId,
      });
      return {
        success: false,
        error: 'STATS_RETRIEVAL_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Get pending rewards for a user (30-day hold)
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object>} List of pending rewards
   */
  static async getPendingRewards(userId) {
    try {
      const pendingRewards = await Transaction.find({
        supporter_id: userId,
        transaction_type: 'share_reward',
        status: 'pending_hold',
      }).populate(['campaign_id', 'related_share_id']);

      // Calculate days remaining on each hold
      const now = new Date();
      const rewards = pendingRewards.map((tx) => {
        const daysRemaining = Math.max(
          0,
          Math.ceil((tx.hold_until_date - now) / (1000 * 60 * 60 * 24))
        );
        return {
          transaction_id: tx._id,
          amount_cents: tx.amount_cents,
          amount_dollars: (tx.amount_cents / 100).toFixed(2),
          campaign: tx.campaign_id.title,
          channel: tx.related_share_id?.channel,
          created_at: tx.created_at,
          hold_until_date: tx.hold_until_date,
          days_remaining: daysRemaining,
        };
      });

      return {
        success: true,
        data: {
          pending_rewards: rewards,
          total_pending_cents: rewards.reduce((sum, r) => sum + r.amount_cents, 0),
          total_pending_dollars: (
            rewards.reduce((sum, r) => sum + r.amount_cents, 0) / 100
          ).toFixed(2),
        },
      };
    } catch (error) {
      winstonLogger.error('ShareRewardService.getPendingRewards error', {
        error: error.message,
        userId,
      });
      return {
        success: false,
        error: 'PENDING_REWARDS_ERROR',
        message: error.message,
      };
    }
  }
}

module.exports = ShareRewardService;
