/**
 * Wallet Controller
 * Handles all wallet operations including balance management, transaction history,
 * payout status, and analytics
 */

const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const PaymentMethod = require('../models/PaymentMethod');
const { logger } = require('../utils/logger');

class WalletController {
  /**
   * Get current wallet balance
   * GET /wallet/balance
   */
  static async getBalance(req, res) {
    try {
      const userId = req.user.id;

      const wallet = await Wallet.findOne({ user_id: userId });
      if (!wallet) {
        return res.status(404).json({
          success: false,
          error: 'Wallet not found',
          code: 'WALLET_NOT_FOUND'
        });
      }

      res.json({
        success: true,
        balance: {
          balance_cents: wallet.balance_cents,
          available_cents: wallet.available_cents,
          pending_cents: wallet.pending_cents,
          reserved_cents: wallet.reserved_cents,
          total_earned_cents: wallet.total_earned_cents,
          total_withdrawn_cents: wallet.total_withdrawn_cents,
          currency: 'USD'
        }
      });
    } catch (error) {
      logger.error('Get balance error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get wallet balance',
        code: 'WALLET_ERROR'
      });
    }
  }

  /**
   * Get comprehensive wallet overview
   * GET /wallet/overview
   */
  static async getWalletOverview(req, res) {
    try {
      const userId = req.user.id;

      // Fetch wallet
      const wallet = await Wallet.findOne({ user_id: userId });
      if (!wallet) {
        return res.status(404).json({
          success: false,
          error: 'Wallet not found',
          code: 'WALLET_NOT_FOUND'
        });
      }

      // Get transaction counts
      const transactionStats = await Transaction.aggregate([
        { $match: { user_id: require('mongoose').Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            total_count: { $sum: 1 },
            total_earned: {
              $sum: {
                $cond: [
                  { $eq: ['$type', 'deposit'] },
                  '$amount_cents',
                  {
                    $cond: [{ $in: ['$type', ['reward', 'commission']] }, '$amount_cents', 0]
                  }
                ]
              }
            }
          }
        }
      ]);

      // Get withdrawal stats
      const withdrawalStats = await Withdrawal.aggregate([
        { $match: { user_id: require('mongoose').Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            total_withdrawn: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, '$amount_cents', 0]
              }
            },
            pending_amount: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['requested', 'processing']] },
                  '$amount_cents',
                  0
                ]
              }
            },
            withdrawal_count: { $sum: 1 }
          }
        }
      ]);

      const stats = transactionStats[0] || { total_count: 0, total_earned: 0 };
      const withdrawals = withdrawalStats[0] || { total_withdrawn: 0, pending_amount: 0 };

      res.json({
        success: true,
        overview: {
          balance_cents: wallet.balance_cents,
          available_cents: wallet.available_cents,
          pending_cents: wallet.pending_cents,
          total_earned_cents: wallet.total_earned_cents,
          total_withdrawn_cents: wallet.total_withdrawn_cents,
          transactions_count: stats.total_count,
          conversion_rate: wallet.conversion_rate || 0,
          pending_withdrawal_amount: withdrawals.pending_amount,
          withdrawal_count: withdrawals.withdrawal_count,
          account_health: this._calculateAccountHealth(wallet)
        }
      });
    } catch (error) {
      logger.error('Get wallet overview error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get wallet overview',
        code: 'WALLET_ERROR'
      });
    }
  }

  /**
   * Get transaction history with pagination
   * GET /wallet/transactions
   */
  static async getTransactionHistory(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      const type = req.query.type || 'all';

      const query = { user_id: userId };
      if (type !== 'all') {
        query.type = type;
      }

      const transactions = await Transaction.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Transaction.countDocuments(query);

      res.json({
        success: true,
        transactions: transactions.map((t) => ({
          id: t._id,
          type: t.type,
          amount: t.amount_cents / 100,
          description: t.description,
          status: t.status,
          reference: t.reference_type + ':' + t.reference_id,
          created_at: t.created_at
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Get transaction history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get transaction history',
        code: 'WALLET_ERROR'
      });
    }
  }

  /**
   * Get earnings summary by category
   * GET /wallet/earnings-summary
   */
  static async getEarningsSummary(req, res) {
    try {
      const userId = req.user.id;
      const period = req.query.period || 'all';

      const dateFilter = this._getDateFilter(period);
      const query = {
        user_id: require('mongoose').Types.ObjectId(userId),
        type: { $in: ['reward', 'commission', 'deposit'] },
        created_at: { $gte: dateFilter }
      };

      const earnings = await Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$type',
            total_cents: { $sum: '$amount_cents' },
            count: { $sum: 1 }
          }
        }
      ]);

      const summary = {
        total_earned: 0,
        by_source: {},
        period
      };

      earnings.forEach((e) => {
        summary.by_source[e._id] = {
          amount: e.total_cents / 100,
          transactions: e.count
        };
        summary.total_earned += e.total_cents / 100;
      });

      res.json({
        success: true,
        earnings_summary: summary
      });
    } catch (error) {
      logger.error('Get earnings summary error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get earnings summary',
        code: 'WALLET_ERROR'
      });
    }
  }

  /**
   * Get earnings by campaign
   * GET /wallet/earned-by-campaign
   */
  static async getEarnedByCampaign(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const campaigns = await Transaction.aggregate([
        {
          $match: {
            user_id: require('mongoose').Types.ObjectId(userId),
            reference_type: 'campaign'
          }
        },
        {
          $group: {
            _id: '$reference_id',
            total_earned_cents: { $sum: '$amount_cents' },
            transaction_count: { $sum: 1 },
            last_transaction: { $max: '$created_at' }
          }
        },
        { $sort: { total_earned_cents: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);

      const total = await Transaction.distinct('reference_id', {
        user_id: require('mongoose').Types.ObjectId(userId),
        reference_type: 'campaign'
      });

      res.json({
        success: true,
        campaigns: campaigns.map((c) => ({
          campaign_id: c._id,
          earned: c.total_earned_cents / 100,
          conversions: c.transaction_count,
          last_conversion: c.last_transaction
        })),
        pagination: {
          page,
          limit,
          total: total.length,
          pages: Math.ceil(total.length / limit)
        }
      });
    } catch (error) {
      logger.error('Get earned by campaign error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get campaign earnings',
        code: 'WALLET_ERROR'
      });
    }
  }

  /**
   * Get all campaigns user has earned rewards from
   * Used when requesting withdrawal to link to specific campaigns
   * GET /wallet/earning-campaigns
   */
  static async getEarningCampaigns(req, res) {
    try {
      const userId = req.user.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User authentication required',
        });
      }

      console.log(`📊 [WalletController] getEarningCampaigns for userId: ${userId}`);

      const ShareService = require('../services/ShareService');
      const campaigns = await ShareService.getUserCampaignEarnings(userId);

      console.log(`✅ [WalletController] Retrieved ${campaigns.length} campaigns with earnings`);

      return res.status(200).json({
        success: true,
        campaigns: campaigns
          .filter(c => c.available_cents > 0) // Only show campaigns with available balance
          .map(c => ({
            id: c.campaign_id,
            _id: c.campaign_id,
            title: c.campaign_title,
            earned_cents: c.earned_cents,
            withdrawn_cents: c.withdrawn_cents,
            reserved_cents: c.reserved_cents,
            available_cents: c.available_cents,
            available_dollars: (c.available_cents / 100).toFixed(2)
          }))
      });
    } catch (error) {
      console.error(`❌ [WalletController] getEarningCampaigns ERROR:`, error);
      logger.error('Get earning campaigns error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get earning campaigns',
        code: 'WALLET_ERROR'
      });
    }
  }

  /**
   * Get payout status
   * GET /payouts/status
   */
  static async getPayoutStatus(req, res) {
    try {
      const userId = req.user.id;

      const wallet = await Wallet.findOne({ user_id: userId });
      if (!wallet) {
        return res.status(404).json({
          success: false,
          error: 'Wallet not found'
        });
      }

      // Get next payout date based on schedule
      const nextPayoutDate = this._calculateNextPayoutDate(wallet.payout_schedule);

      // Get last payout
      const lastPayout = await Withdrawal.findOne({ user_id: userId, status: 'completed' })
        .sort({ completed_at: -1 });

      res.json({
        success: true,
        payout_status: {
          pending_amount: wallet.available_cents,
          next_payout_date: nextPayoutDate,
          last_payout_date: lastPayout?.completed_at || null,
          payout_schedule: wallet.payout_schedule || 'weekly',
          currency: 'USD'
        }
      });
    } catch (error) {
      logger.error('Get payout status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get payout status'
      });
    }
  }

  /**
   * Get payout schedule
   * GET /payouts/schedule
   */
  static async getPayoutSchedule(req, res) {
    try {
      const userId = req.user.id;

      const wallet = await Wallet.findOne({ user_id: userId });
      if (!wallet) {
        return res.status(404).json({
          success: false,
          error: 'Wallet not found'
        });
      }

      // Calculate next 5 payout dates
      const futurePayoutDates = this._calculateFuturePayoutDates(wallet.payout_schedule, 5);

      res.json({
        success: true,
        payout_schedule: {
          schedule_type: wallet.payout_schedule || 'weekly',
          next_payout_dates: futurePayoutDates,
          current_pending_amount: wallet.available_cents
        }
      });
    } catch (error) {
      logger.error('Get payout schedule error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get payout schedule'
      });
    }
  }

  /**
   * Get payout history
   * GET /payouts/history
   */
  static async getPayoutHistory(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const query = {
        user_id: userId,
        status: 'completed'
      };

      const payouts = await Withdrawal.find(query)
        .populate('payment_method_id', 'type display_name')
        .sort({ completed_at: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Withdrawal.countDocuments(query);

      res.json({
        success: true,
        payouts: payouts.map((p) => ({
          id: p._id,
          amount: p.net_payout_cents / 100,
          gross_amount: p.amount_cents / 100,
          fee: p.fee_cents / 100,
          date: p.completed_at,
          method: p.payment_method_id?.type,
          status: p.status,
          transaction_id: p.transaction_id
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Get payout history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get payout history'
      });
    }
  }

  /**
   * Change payout schedule
   * POST /payouts/change-schedule
   */
  static async changePayoutSchedule(req, res) {
    try {
      const userId = req.user.id;
      const { schedule_type } = req.body;

      if (!['weekly', 'bi-weekly', 'monthly', 'manual'].includes(schedule_type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid schedule type',
          code: 'INVALID_SCHEDULE'
        });
      }

      const wallet = await Wallet.findOneAndUpdate(
        { user_id: userId },
        { payout_schedule: schedule_type, updated_at: new Date() },
        { new: true }
      );

      const nextPayoutDate = this._calculateNextPayoutDate(schedule_type);

      res.json({
        success: true,
        update: {
          schedule_type,
          effective_date: new Date(),
          next_payout_date: nextPayoutDate
        }
      });

      logger.info(`User ${userId} changed payout schedule to ${schedule_type}`);
    } catch (error) {
      logger.error('Change payout schedule error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to change payout schedule'
      });
    }
  }

  /**
   * Request manual payout
   * POST /payouts/manual-request
   */
  static async requestManualPayout(req, res) {
    try {
      const userId = req.user.id;
      const { amount_cents, force_minimum } = req.body;

      const wallet = await Wallet.findOne({ user_id: userId });
      if (!wallet) {
        return res.status(404).json({
          success: false,
          error: 'Wallet not found'
        });
      }

      // Validate minimum
      const minimumWithdrawal = 500; // $5
      const withdrawAmount = amount_cents || wallet.available_cents;

      if (withdrawAmount < minimumWithdrawal && !force_minimum) {
        return res.status(400).json({
          success: false,
          error: 'Withdrawal amount below minimum',
          minimum_cents: minimumWithdrawal,
          current_available: wallet.available_cents
        });
      }

      if (withdrawAmount > wallet.available_cents) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient funds',
          requested: withdrawAmount,
          available: wallet.available_cents
        });
      }

      res.json({
        success: true,
        payout_request: {
          amount: withdrawAmount / 100,
          estimated_arrival: this._estimatePayoutArrival(),
          status: 'pending_payment_method_selection'
        }
      });
    } catch (error) {
      logger.error('Request manual payout error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to request manual payout'
      });
    }
  }

  /**
   * Get available rewards
   * GET /rewards
   */
  static async getAvailableRewards(req, res) {
    try {
      const userId = req.user.id;

      // For now, return empty array - would fetch from a Rewards collection
      // Future implementation would check:
      // - User's earned amount
      // - Referral bonuses
      // - Campaign milestones
      // - Loyalty rewards

      res.json({
        success: true,
        rewards: []
      });
    } catch (error) {
      logger.error('Get available rewards error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get available rewards'
      });
    }
  }

  /**
   * Get reward details
   * GET /rewards/:id/details
   */
  static async getRewardDetails(req, res) {
    try {
      const { id } = req.params;

      // Future implementation
      res.status(404).json({
        success: false,
        error: 'Reward not found'
      });
    } catch (error) {
      logger.error('Get reward details error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get reward details'
      });
    }
  }

  /**
   * Claim reward
   * POST /rewards/:id/claim
   */
  static async claimReward(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      // Future implementation
      res.status(404).json({
        success: false,
        error: 'Reward not found'
      });
    } catch (error) {
      logger.error('Claim reward error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to claim reward'
      });
    }
  }

  /**
   * Get wallet trends
   * GET /analytics/wallet-trends
   */
  static async getWalletTrends(req, res) {
    try {
      const userId = req.user.id;
      const period = req.query.period || 'month';

      const days = { week: 7, month: 30, quarter: 90, year: 365 }[period] || 30;
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - days);

      const transactions = await Transaction.find({
        user_id: userId,
        created_at: { $gte: dateFilter }
      }).sort({ created_at: 1 });

      const trends = this._aggregateTransactionTrends(transactions);

      res.json({
        success: true,
        trends
      });
    } catch (error) {
      logger.error('Get wallet trends error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get wallet trends'
      });
    }
  }

  /**
   * Get earnings breakdown
   * GET /analytics/earnings-breakdown
   */
  static async getEarningsBreakdown(req, res) {
    try {
      const userId = req.user.id;

      const breakdown = await Transaction.aggregate([
        {
          $match: {
            user_id: require('mongoose').Types.ObjectId(userId),
            type: { $in: ['reward', 'commission'] }
          }
        },
        {
          $group: {
            _id: '$type',
            total: { $sum: '$amount_cents' }
          }
        }
      ]);

      const total = breakdown.reduce((sum, b) => sum + b.total, 0);

      res.json({
        success: true,
        breakdown: breakdown.map((b) => ({
          category: b._id,
          amount: b.total / 100,
          percentage: total > 0 ? ((b.total / total) * 100).toFixed(2) : 0
        }))
      });
    } catch (error) {
      logger.error('Get earnings breakdown error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get earnings breakdown'
      });
    }
  }

  /**
   * Get conversion metrics
   * GET /analytics/conversion-metrics
   */
  static async getConversionMetrics(req, res) {
    try {
      const userId = req.user.id;

      res.json({
        success: true,
        metrics: {
          impressions: 0,
          clicks: 0,
          conversions: 0,
          conversion_rate: 0,
          avg_reward_per_conversion: 0
        }
      });
    } catch (error) {
      logger.error('Get conversion metrics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get conversion metrics'
      });
    }
  }

  /**
   * Get notification preferences
   * GET /notification-preferences
   */
  static async getNotificationPreferences(req, res) {
    try {
      const userId = req.user.id;

      const user = await User.findById(userId, 'notification_preferences');

      res.json({
        success: true,
        preferences: user?.notification_preferences || {
          email_on_payout: true,
          email_on_reward: true,
          email_on_withdrawal: true,
          sms_notifications: false
        }
      });
    } catch (error) {
      logger.error('Get notification preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get notification preferences'
      });
    }
  }

  /**
   * Update notification preferences
   * PUT /notification-preferences
   */
  static async updateNotificationPreferences(req, res) {
    try {
      const userId = req.user.id;
      const prefs = req.body;

      const user = await User.findByIdAndUpdate(
        userId,
        { notification_preferences: prefs },
        { new: true }
      );

      res.json({
        success: true,
        preferences: user.notification_preferences,
        confirmation: true
      });

      logger.info(`User ${userId} updated notification preferences`);
    } catch (error) {
      logger.error('Update notification preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update notification preferences'
      });
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  static _calculateAccountHealth(wallet) {
    // Simple health score based on balance and activity
    const healthScore = Math.min(100, (wallet.balance_cents / 100000) * 100);
    return healthScore > 50 ? 'good' : healthScore > 10 ? 'fair' : 'low';
  }

  static _getDateFilter(period) {
    const now = new Date();
    switch (period) {
      case 'week':
        now.setDate(now.getDate() - 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        now.setFullYear(now.getFullYear() - 1);
        break;
      default:
        return new Date(0); // All time
    }
    return now;
  }

  static _calculateNextPayoutDate(schedule) {
    const now = new Date();
    const nextDate = new Date(now);

    switch (schedule) {
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + (7 - nextDate.getDay()));
        break;
      case 'bi-weekly':
        nextDate.setDate(nextDate.getDate() + (14 - nextDate.getDay()));
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        nextDate.setDate(1);
        break;
      default:
        return null;
    }

    return nextDate;
  }

  static _calculateFuturePayoutDates(schedule, count) {
    const dates = [];
    let currentDate = new Date();

    for (let i = 0; i < count; i++) {
      dates.push(this._calculateNextPayoutDate(schedule));
      currentDate = dates[dates.length - 1];
    }

    return dates;
  }

  static _estimatePayoutArrival() {
    const date = new Date();
    date.setDate(date.getDate() + 3); // Estimate 3 business days
    return date;
  }

  static _aggregateTransactionTrends(transactions) {
    const trends = {};

    transactions.forEach((t) => {
      const dateKey = t.created_at.toISOString().split('T')[0];
      if (!trends[dateKey]) {
        trends[dateKey] = { earnings: 0, withdrawals: 0, date: dateKey };
      }

      if (['reward', 'commission', 'deposit'].includes(t.type)) {
        trends[dateKey].earnings += t.amount_cents;
      } else if (t.type === 'withdrawal') {
        trends[dateKey].withdrawals += t.amount_cents;
      }
    });

    return Object.values(trends);
  }
}

module.exports = WalletController;
