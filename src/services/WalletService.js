/**
 * Wallet Service
 * Manages user wallet balances, transactions, and balance calculations
 * 
 * Wallet Structure:
 * - pending_hold_cents: Rewards in 30-day anti-fraud hold
 * - available_cents: Ready to withdraw
 * - pending_withdrawal_cents: In-transit to bank
 * - blocked_cents: Frozen due to fraud/chargeback
 * - lifetime_earned_cents: Total lifetime earnings
 * - lifetime_withdrawn_cents: Total payouts received
 */

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const winstonLogger = require('../utils/winstonLogger');

class WalletService {
  /**
   * Get user's complete wallet breakdown
   * @param {string} userId - User ID
   * @returns {Promise<object>} Wallet with all balance categories
   */
  static async getUserWallet(userId) {
    try {
      const user = await User.findById(userId).select(
        'wallet email display_name'
      );
      if (!user) {
        throw new Error('User not found');
      }

      const wallet = user.wallet || {};
      return {
        pending_hold_cents: wallet.pending_hold_cents || 0,
        available_cents: wallet.available_cents || 0,
        pending_withdrawal_cents: wallet.pending_withdrawal_cents || 0,
        blocked_cents: wallet.blocked_cents || 0,
        lifetime_earned_cents: wallet.lifetime_earned_cents || 0,
        lifetime_withdrawn_cents: wallet.lifetime_withdrawn_cents || 0,
        lifetime_refunded_cents: wallet.lifetime_refunded_cents || 0,
        total_balance_cents:
          (wallet.pending_hold_cents || 0) +
          (wallet.available_cents || 0) +
          (wallet.pending_withdrawal_cents || 0),
        is_blocked: wallet.is_blocked || false,
        block_reason: wallet.block_reason || null
      };
    } catch (error) {
      winstonLogger.error('Error getting user wallet', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get dashboard overview with aggregated data
   * @param {string} userId - User ID
   * @returns {Promise<object>} Dashboard data
   */
  static async getDashboardOverview(userId) {
    try {
      const wallet = await this.getUserWallet(userId);
      
      // Get recent transactions
      const recentTransactions = await Transaction.find({
        user_id: userId,
        type: { $in: ['share_reward', 'hold_release', 'withdrawal_initiated'] }
      })
        .sort({ created_at: -1 })
        .limit(10)
        .lean();

      // Get this month earnings
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyStats = await Transaction.aggregate([
        {
          $match: {
            user_id: { $eq: require('mongoose').Types.ObjectId(userId) },
            created_at: { $gte: startOfMonth },
            type: 'share_reward'
          }
        },
        {
          $group: {
            _id: null,
            earned_cents: { $sum: '$amount_cents' },
            shares_count: { $sum: 1 },
            conversions_count: {
              $sum: { $cond: ['$conversion_status', 1, 0] }
            }
          }
        }
      ]);

      return {
        wallet,
        recent_transactions: recentTransactions.map(tx => ({
          _id: tx._id,
          type: tx.type,
          amount_cents: tx.amount_cents,
          description: this._getTransactionDescription(tx),
          created_at: tx.created_at,
          status: tx.status
        })),
        earnings_this_month: monthlyStats[0] || {
          earned_cents: 0,
          shares_count: 0,
          conversions_count: 0
        }
      };
    } catch (error) {
      winstonLogger.error('Error getting dashboard overview', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get transaction history with pagination
   * @param {string} userId - User ID
   * @param {object} filters - Pagination and filter options
   * @returns {Promise<object>} Transactions and pagination info
   */
  static async getTransactionHistory(userId, filters = {}) {
    try {
      const limit = filters.limit || 50;
      const skip = filters.skip || 0;
      const type = filters.type || null;

      const query = { user_id: userId };
      if (type) query.type = type;

      const total = await Transaction.countDocuments(query);
      const transactions = await Transaction.find(query)
        .sort({ created_at: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      return {
        transactions: transactions.map(tx => ({
          _id: tx._id,
          type: tx.type,
          amount_cents: tx.amount_cents,
          description: this._getTransactionDescription(tx),
          status: tx.status,
          created_at: tx.created_at,
          share_id: tx.share_id || null,
          campaign_id: tx.campaign_id || null
        })),
        total,
        limit,
        skip,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      winstonLogger.error('Error getting transaction history', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get payout history with status tracking
   * @param {string} userId - User ID
   * @param {object} options - Pagination options
   * @returns {Promise<object>} Payout records and pagination
   */
  static async getPayoutHistory(userId, options = {}) {
    try {
      const page = options.page || 1;
      const limit = options.limit || 10;
      const skip = (page - 1) * limit;

      const total = await Withdrawal.countDocuments({ user_id: userId });
      const payouts = await Withdrawal.find({ user_id: userId })
        .sort({ created_at: -1 })
        .limit(limit)
        .skip(skip)
        .populate('payment_method_id', 'type display_name')
        .lean();

      return {
        payouts: payouts.map(p => ({
          _id: p._id,
          amount_cents: p.amount_cents,
          net_payout_cents: p.net_payout_cents,
          fee_cents: p.fee_cents,
          status: p.status,
          type: p.payment_method_id?.type || 'unknown',
          display_name: p.payment_method_id?.display_name || 'Unknown',
          transaction_id: p.transaction_id || null,
          created_at: p.created_at,
          completed_at: p.completed_at || null,
          error_message: p.error_message || null
        })),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      winstonLogger.error('Error getting payout history', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Update user balance (atomic operation)
   * @param {string} userId - User ID
   * @param {object} updates - Balance updates { balance_type: amount_cents }
   * @returns {Promise<object>} Updated wallet
   */
  static async updateBalance(userId, updates) {
    try {
      const incUpdates = {};
      
      // Build MongoDB $inc operation
      Object.entries(updates).forEach(([key, value]) => {
        if (key.includes('.')) {
          incUpdates[`wallet.${key}`] = value;
        } else {
          incUpdates[`wallet.${key}`] = value;
        }
      });

      const result = await User.findByIdAndUpdate(
        userId,
        { $inc: incUpdates },
        { new: true, select: 'wallet' }
      );

      return result.wallet;
    } catch (error) {
      winstonLogger.error('Error updating user balance', {
        error: error.message,
        userId,
        updates
      });
      throw error;
    }
  }

  /**
   * Get monthly earnings breakdown
   * @param {string} userId - User ID
   * @param {number} months - Number of months to include (default 12)
   * @returns {Promise<array>} Monthly earnings data
   */
  static async getMonthlyEarnings(userId, months = 12) {
    try {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);

      const earnings = await Transaction.aggregate([
        {
          $match: {
            user_id: { $eq: require('mongoose').Types.ObjectId(userId) },
            created_at: { $gte: startDate },
            type: 'share_reward'
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$created_at' },
              month: { $month: '$created_at' }
            },
            total_cents: { $sum: '$amount_cents' },
            shares_count: { $sum: 1 },
            conversions_count: {
              $sum: { $cond: ['$conversion_status', 1, 0] }
            }
          }
        },
        {
          $sort: { '_id.year': -1, '_id.month': -1 }
        }
      ]);

      return earnings.map(e => ({
        year: e._id.year,
        month: e._id.month,
        month_name: new Date(e._id.year, e._id.month - 1).toLocaleString(
          'default',
          { month: 'short' }
        ),
        total_cents: e.total_cents,
        shares_count: e.shares_count,
        conversions_count: e.conversions_count
      }));
    } catch (error) {
      winstonLogger.error('Error getting monthly earnings', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Check if user can withdraw (not blocked, has balance)
   * @param {string} userId - User ID
   * @returns {Promise<object>} Withdrawal eligibility status
   */
  static async checkWithdrawalEligibility(userId) {
    try {
      const user = await User.findById(userId).select('wallet');
      const wallet = user.wallet || {};

      return {
        can_withdraw: !wallet.is_blocked && (wallet.available_cents || 0) >= 500,
        available_cents: wallet.available_cents || 0,
        blocked: wallet.is_blocked || false,
        block_reason: wallet.block_reason || null,
        minimum_cents: 500
      };
    } catch (error) {
      winstonLogger.error('Error checking withdrawal eligibility', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get transaction description for display
   * @private
   */
  static _getTransactionDescription(transaction) {
    const typeMap = {
      share_reward: 'Share Reward Earned',
      hold_released: 'Hold Period Completed',
      hold_expired: 'Hold Expired',
      withdrawal_initiated: 'Withdrawal Requested',
      withdrawal_completed: 'Withdrawal Completed',
      withdrawal_failed: 'Withdrawal Failed',
      refund: 'Refund',
      donation_reward: 'Donation Reward',
      bonus: 'Bonus'
    };

    return typeMap[transaction.type] || 'Transaction';
  }

  /**
   * Export wallet data for tax purposes
   * @param {string} userId - User ID
   * @param {number} year - Tax year
   * @returns {Promise<object>} Formatted for tax reporting
   */
  static async exportForTaxReporting(userId, year) {
    try {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year + 1, 0, 1);

      const transactions = await Transaction.find({
        user_id: userId,
        created_at: { $gte: startOfYear, $lt: endOfYear }
      })
        .sort({ created_at: 1 })
        .lean();

      const totalEarned = transactions
        .filter(t => t.type === 'share_reward')
        .reduce((sum, t) => sum + t.amount_cents, 0);

      const totalWithdrawn = transactions
        .filter(t => t.type === 'withdrawal_completed')
        .reduce((sum, t) => sum + t.amount_cents, 0);

      return {
        tax_year: year,
        total_earned_cents: totalEarned,
        total_earned_usd: (totalEarned / 100).toFixed(2),
        total_withdrawn_cents: totalWithdrawn,
        total_withdrawn_usd: (totalWithdrawn / 100).toFixed(2),
        transactions: transactions
          .filter(t =>
            ['share_reward', 'withdrawal_completed', 'donation_reward'].includes(
              t.type
            )
          )
          .map(t => ({
            date: t.created_at.toISOString().split('T')[0],
            type: t.type,
            amount_usd: (t.amount_cents / 100).toFixed(2),
            reference: t.reference_id || t._id.toString()
          })),
        report_generated_at: new Date().toISOString(),
        note: 'For informational purposes. See official 1099 form for tax filing.'
      };
    } catch (error) {
      winstonLogger.error('Error exporting tax data', {
        error: error.message,
        userId,
        year
      });
      throw error;
    }
  }
}

module.exports = WalletService;
