/**
 * Withdrawal Controller
 * Handles withdrawal requests, confirmations, cancellations, and status tracking
 * Integrates with payment processors (Stripe, PayPal, ACH)
 */

const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
const Wallet = require('../models/Wallet');
const PaymentMethod = require('../models/PaymentMethod');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { ShareRecord } = require('../models/Share');
const ShareWithdrawal = require('../models/ShareWithdrawal');
const StripeService = require('../services/StripeService');
const paymentService = require('../services/paymentService');
const emailService = require('../services/emailService');
const { logger } = require('../utils/logger');

class WithdrawalController {
  /**
   * Get withdrawal history
   * GET /withdrawals
   */
  static async getWithdrawalHistory(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const status = req.query.status || 'all';
      const skip = (page - 1) * limit;

      const query = { user_id: userId };
      if (status !== 'all') {
        query.status = status;
      }

      const withdrawals = await Withdrawal.find(query)
        .populate('payment_method_id', 'type display_name last_four')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Withdrawal.countDocuments(query);

      // Calculate stats
      const stats = await Withdrawal.aggregate([
        { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
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
            failed_count: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            }
          }
        }
      ]);

      const summaryStats = stats[0] || {
        total_withdrawn: 0,
        pending_amount: 0,
        failed_count: 0
      };

      res.json({
        success: true,
        withdrawals: withdrawals.map((w) => ({
          id: w._id,
          amount: w.amount_cents / 100,
          net_payout: w.net_payout_cents / 100,
          fee: w.fee_cents / 100,
          status: w.status,
          payment_method: {
            type: w.payment_method_id?.type,
            display_name: w.payment_method_id?.display_name,
            last_four: w.payment_method_id?.last_four
          },
          created_at: w.created_at,
          completed_at: w.completed_at,
          error: w.error_message
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        stats: {
          total_withdrawn: summaryStats.total_withdrawn / 100,
          pending_amount: summaryStats.pending_amount / 100,
          failed_count: summaryStats.failed_count
        }
      });
    } catch (error) {
      logger.error('Get withdrawal history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get withdrawal history',
        code: 'WITHDRAWAL_ERROR'
      });
    }
  }

  /**
   * Get withdrawal details
   * GET /withdrawals/:id
   */
  static async getWithdrawalDetails(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const withdrawal = await Withdrawal.findOne({ _id: id, user_id: userId })
        .populate('payment_method_id')
        .populate('user_id', 'email name');

      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          error: 'Withdrawal not found',
          code: 'WITHDRAWAL_NOT_FOUND'
        });
      }

      res.json({
        success: true,
        withdrawal: WithdrawalController._formatWithdrawal(withdrawal)
      });
    } catch (error) {
      logger.error('Get withdrawal details error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get withdrawal details'
      });
    }
  }

  /**
   * Request a new withdrawal
   * POST /withdrawals
   * Body: {
   *   amount_cents: number (cents),
   *   payment_method_id: string (MongoDB ID),
   *   notes: string (optional),
   *   campaign_ids: string[] (optional - which campaigns this was earned from)
   * }
   */
  static async requestWithdrawal(req, res) {
    try {
      const userId = req.user.id;
      const { amount_cents, payment_method_id, campaign_id, notes } = req.body;

      // Validate input
      if (!amount_cents || !payment_method_id || !campaign_id) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: amount_cents, payment_method_id, campaign_id',
          code: 'INVALID_INPUT'
        });
      }

      // Validate amount
      const minimumWithdrawal = 500; // $5
      if (amount_cents < minimumWithdrawal) {
        return res.status(400).json({
          success: false,
          error: `Withdrawal minimum is $${minimumWithdrawal / 100}`,
          minimum_cents: minimumWithdrawal,
          code: 'AMOUNT_TOO_LOW'
        });
      }

      // Check campaign-specific balance using new method
      const ShareService = require('../services/ShareService');
      const mongoose = require('mongoose');
      const campaignObjectId = new mongoose.Types.ObjectId(campaign_id);

      let campaignBalance;
      try {
        campaignBalance = await ShareService.getUserBalanceByCampaign(userId, campaignObjectId);
        console.log(`\n💳 [WithdrawalController] Campaign balance for ${campaignBalance.campaign_title}:`, {
          earned: campaignBalance.earned_cents,
          withdrawn: campaignBalance.withdrawn_cents,
          reserved: campaignBalance.reserved_cents,
          available: campaignBalance.available_cents
        });
      } catch (error) {
        console.error('❌ [WithdrawalController] Error getting campaign balance:', error);
        return res.status(400).json({
          success: false,
          error: 'Campaign not found or no earnings in this campaign',
          code: 'CAMPAIGN_NOT_FOUND'
        });
      }

      // Validate campaign has sufficient balance
      if (campaignBalance.available_cents < amount_cents) {
        console.log(`❌ [WithdrawalController] Insufficient funds in campaign: requested ${amount_cents} but available ${campaignBalance.available_cents}`);
        return res.status(400).json({
          success: false,
          error: 'Insufficient funds in this campaign',
          campaign_id,
          campaign_title: campaignBalance.campaign_title,
          available_cents: campaignBalance.available_cents,
          requested_cents: amount_cents,
          code: 'INSUFFICIENT_FUNDS'
        });
      }

      // Verify payment method exists and belongs to user
      const paymentMethod = await PaymentMethod.findOne({
        _id: payment_method_id,
        user_id: userId
      });

      if (!paymentMethod) {
        return res.status(404).json({
          success: false,
          error: 'Payment method not found',
          code: 'PAYMENT_METHOD_NOT_FOUND'
        });
      }

      // Accept both 'active' and 'pending_verification' statuses
      if (!['active', 'pending_verification'].includes(paymentMethod.status)) {
        return res.status(400).json({
          success: false,
          error: 'Payment method is not available for withdrawals',
          status: paymentMethod.status,
          code: 'PAYMENT_METHOD_UNAVAILABLE'
        });
      }

      // Check withdrawal limits
      const limitCheck = await WithdrawalController._checkWithdrawalLimits(userId, amount_cents);
      if (!limitCheck.allowed) {
        return res.status(400).json({
          success: false,
          error: limitCheck.message,
          code: 'LIMIT_EXCEEDED'
        });
      }

      // Get user info for metadata
      const user = await User.findById(userId, 'email name');

      // Get wallet for updating reserved funds
      let wallet = await Wallet.findOne({ user_id: userId });
      if (!wallet) {
        wallet = new Wallet({ user_id: userId });
        await wallet.save();
      }

      // Calculate fees (2% default, varies by payment method)
      const feeCents = WithdrawalController._calculateFee(amount_cents, paymentMethod.type);
      const netPayoutCents = amount_cents - feeCents;

      // Generate unique withdrawal ID (string format: WD_timestamp_random)
      const withdrawalId = `WD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create withdrawal request with campaign_withdrawals breakdown
      // This withdrawal is specifically from one campaign
      const withdrawal = new ShareWithdrawal({
        withdrawal_id: withdrawalId,
        user_id: userId,
        amount_requested: amount_cents,  // Schema field name
        processing_fee: feeCents,        // Schema field name
        amount_paid: netPayoutCents,     // Schema field name (filled when completed)
        payment_method_id,
        payment_type: paymentMethod.type, // Direct field (not in metadata)
        status: 'pending',               // Schema enum: pending/processing/completed/failed/cancelled
        campaign_withdrawals: [
          {
            campaign_id: campaignObjectId,
            amount_cents: amount_cents
          }
        ],  // Campaign-specific breakdown
        payment_details: {
          last4: paymentMethod.last_four || '',
          accountHolder: paymentMethod.account_holder_name || '',
          accountType: paymentMethod.account_type || ''
        },
        admin_notes: notes ? `User notes: ${notes}` : null
      });

      await withdrawal.save();
      console.log(`✅ [WithdrawalController] Withdrawal saved: ${withdrawalId}`);
      console.log(`   Campaign: ${campaignBalance.campaign_title}`);
      console.log(`   Amount: ${amount_cents} cents ($${(amount_cents / 100).toFixed(2)})`);
      console.log(`   Campaign withdrawals: ${withdrawal.campaign_withdrawals.length}`);

      // Reserve funds in wallet (aggregate across all campaigns)
      // This wallet system acts as a fallback/aggregate view
      console.log(`\n💰 [WithdrawalController] WALLET UPDATE:`);
      console.log(`   Before: available=${wallet.available_cents}, reserved=${wallet.reserved_cents}`);
      
      // Re-sync wallet available from all campaigns (campaign-specific system is source of truth)
      const allCampaignEarnings = await ShareService.getUserCampaignEarnings(userId);
      const totalAvailableCents = allCampaignEarnings.reduce((sum, c) => sum + c.available_cents, 0);
      
      wallet.available_cents = totalAvailableCents;
      console.log(`   After sync: available=${wallet.available_cents}`);
      
      wallet.reserved_cents += amount_cents;
      wallet.available_cents -= amount_cents;
      console.log(`   After reserve: available=${wallet.available_cents}, reserved=${wallet.reserved_cents}`);
      
      await wallet.save();
      console.log(`   ✅ Wallet saved\n`);

      res.status(201).json({
        success: true,
        withdrawal: {
          id: withdrawal.withdrawal_id,  // Use withdrawal_id string, not MongoDB _id
          campaign_id: campaignBalance.campaign_id,
          campaign_title: campaignBalance.campaign_title,
          amount: withdrawal.amount_requested / 100,
          net_payout: withdrawal.amount_paid / 100,
          fee: withdrawal.processing_fee / 100,
          status: withdrawal.status,
          payment_method: {
            type: paymentMethod.type,
            display_name: paymentMethod.display_name
          },
          estimated_time: WithdrawalController._estimateProcessingTime(paymentMethod.type),
          created_at: withdrawal.requested_at
        },
        confirmation_required: false
      });

      logger.info(
        `Withdrawal requested: ${withdrawal.withdrawal_id} for user ${userId}, campaign ${campaignBalance.campaign_title}, amount ${amount_cents}`
      );

      // Send confirmation email asynchronously (non-blocking)
      if (emailService && typeof emailService.sendWithdrawalConfirmation === 'function') {
        emailService.sendWithdrawalConfirmation(user.email, {
          campaign: campaignBalance.campaign_title,
          amount: amount_cents / 100,
          net_payout: netPayoutCents / 100,
          payment_method: paymentMethod.display_name,
          withdrawal_id: withdrawal.withdrawal_id
        }).catch(emailError => {
          logger.warn('Failed to send withdrawal confirmation email:', emailError?.message || emailError);
        });
      }
    } catch (error) {
      logger.error('Request withdrawal error:', error?.message || error);
      console.error('Full withdrawal error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to request withdrawal',
        details: error?.message || 'Unknown error'
      });
    }
  }

  /**
   * Confirm withdrawal request
   * POST /withdrawals/:id/confirm
   */
  static async confirmWithdrawal(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { verification_code } = req.body;

      const withdrawal = await Withdrawal.findOne({ _id: id, user_id: userId })
        .populate('payment_method_id')
        .populate('user_id', 'email name');

      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          error: 'Withdrawal not found'
        });
      }

      if (withdrawal.status !== 'requested') {
        return res.status(400).json({
          success: false,
          error: 'Withdrawal cannot be confirmed in current state',
          current_status: withdrawal.status,
          code: 'INVALID_STATE'
        });
      }

      // Mark as processing
      withdrawal.markAsProcessing();
      await withdrawal.save();

      // Process the withdrawal asynchronously
      WithdrawalController._processWithdrawalAsync(withdrawal, withdrawal.payment_method_id).catch((err) => {
        logger.error('Async withdrawal processing error:', err);
      });

      res.json({
        success: true,
        withdrawal: {
          id: withdrawal._id,
          status: withdrawal.status,
          processing_at: withdrawal.processing_started_at
        },
        confirmation: {
          method: 'email_notification',
          timestamp: new Date()
        }
      });

      logger.info(`Withdrawal confirmed: ${withdrawal._id} for user ${userId}`);
    } catch (error) {
      logger.error('Confirm withdrawal error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to confirm withdrawal'
      });
    }
  }

  /**
   * Cancel withdrawal
   * POST /withdrawals/:id/cancel
   */
  static async cancelWithdrawal(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const withdrawal = await Withdrawal.findOne({ _id: id, user_id: userId });

      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          error: 'Withdrawal not found'
        });
      }

      // Can only cancel if in requested or pending_retry state
      if (!['requested', 'pending_retry'].includes(withdrawal.status)) {
        return res.status(400).json({
          success: false,
          error: 'Withdrawal cannot be cancelled in current state',
          current_status: withdrawal.status,
          code: 'INVALID_STATE'
        });
      }

      // Refund reserved amount back to wallet
      const wallet = await Wallet.findOne({ user_id: userId });
      wallet.reserved_cents -= withdrawal.amount_cents;
      wallet.available_cents += withdrawal.amount_cents;
      await wallet.save();

      // Update withdrawal
      withdrawal.status = 'cancelled';
      withdrawal.updated_at = new Date();
      await withdrawal.save();

      res.json({
        success: true,
        withdrawal: {
          id: withdrawal._id,
          status: 'cancelled'
        },
        refund: {
          amount_cents: withdrawal.amount_cents,
          to_wallet: true
        }
      });

      logger.info(`Withdrawal cancelled: ${withdrawal._id} for user ${userId}`);
    } catch (error) {
      logger.error('Cancel withdrawal error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel withdrawal'
      });
    }
  }

  /**
   * Check withdrawal limits
   * GET /withdrawals/check-limits
   */
  static async checkWithdrawalLimits(req, res) {
    try {
      const userId = req.user.id;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      // Get today's withdrawals
      const todayWithdrawals = await Withdrawal.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            created_at: { $gte: today },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount_cents' }
          }
        }
      ]);

      // Get this month's withdrawals
      const monthWithdrawals = await Withdrawal.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            created_at: { $gte: thisMonth },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount_cents' }
          }
        }
      ]);

      const dailyLimit = 50000; // $500
      const monthlyLimit = 500000; // $5000

      const usedToday = todayWithdrawals[0]?.total || 0;
      const usedThisMonth = monthWithdrawals[0]?.total || 0;

      res.json({
        success: true,
        limits: {
          daily_limit: dailyLimit / 100,
          monthly_limit: monthlyLimit / 100,
          used_today: usedToday / 100,
          used_this_month: usedThisMonth / 100,
          remaining_today: (dailyLimit - usedToday) / 100,
          remaining_this_month: (monthlyLimit - usedThisMonth) / 100
        }
      });
    } catch (error) {
      logger.error('Check withdrawal limits error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check withdrawal limits'
      });
    }
  }

  /**
   * Retry failed withdrawal
   * POST /withdrawals/:id/retry
   */
  static async retryWithdrawal(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const withdrawal = await Withdrawal.findOne({ _id: id, user_id: userId })
        .populate('payment_method_id');

      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          error: 'Withdrawal not found'
        });
      }

      if (!withdrawal.canRetry()) {
        return res.status(400).json({
          success: false,
          error: 'Withdrawal cannot be retried',
          current_status: withdrawal.status,
          retry_count: withdrawal.retry_count,
          code: 'CANNOT_RETRY'
        });
      }

      // Increment retry count and update status
      withdrawal.retry_count += 1;
      withdrawal.status = 'processing';
      withdrawal.processing_started_at = new Date();
      await withdrawal.save();

      // Process withdrawal again
      WithdrawalController._processWithdrawalAsync(withdrawal, withdrawal.payment_method_id).catch((err) => {
        logger.error('Async withdrawal retry error:', err);
      });

      res.json({
        success: true,
        withdrawal: {
          id: withdrawal._id,
          status: withdrawal.status,
          retry_count: withdrawal.retry_count
        }
      });

      logger.info(`Withdrawal retry initiated: ${withdrawal._id} for user ${userId}`);
    } catch (error) {
      logger.error('Retry withdrawal error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retry withdrawal'
      });
    }
  }

  /**
   * Get withdrawal statistics
   * GET /withdrawals/stats
   */
  static async getWithdrawalStats(req, res) {
    try {
      const userId = req.user.id;

      const stats = await Withdrawal.getUserStats(userId);

      res.json({
        success: true,
        stats: {
          total_withdrawals: stats.total_requested_usd + stats.total_completed_usd,
          total_completed: stats.total_completed_usd,
          completed_count: stats.completed_count,
          failed_count: stats.failed_count,
          completion_rate:
            stats.completed_count + stats.failed_count > 0
              ? (
                  (stats.completed_count / (stats.completed_count + stats.failed_count)) *
                  100
                ).toFixed(2)
              : 0,
          average_processing_time_hours: stats.average_processing_time_hours || 0
        }
      });
    } catch (error) {
      logger.error('Get withdrawal stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get withdrawal statistics'
      });
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  static _formatWithdrawal(withdrawal) {
    return {
      id: withdrawal._id,
      amount: withdrawal.amount_cents / 100,
      net_payout: withdrawal.net_payout_cents / 100,
      fee: withdrawal.fee_cents / 100,
      status: withdrawal.status,
      payment_method: {
        type: withdrawal.payment_method_id?.type,
        display_name: withdrawal.payment_method_id?.display_name
      },
      transaction_id: withdrawal.transaction_id,
      created_at: withdrawal.created_at,
      completed_at: withdrawal.completed_at,
      error: {
        message: withdrawal.error_message,
        code: withdrawal.error_code
      },
      retry_count: withdrawal.retry_count,
      next_retry_at: withdrawal.next_retry_at
    };
  }

  static async _checkWithdrawalLimits(userId, requestedAmount) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyTotal = await Withdrawal.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          created_at: { $gte: today },
          status: { $in: ['processing', 'completed'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount_cents' }
        }
      }
    ]);

    const dailyLimit = 50000; // $500
    const usedToday = dailyTotal[0]?.total || 0;

    if (usedToday + requestedAmount > dailyLimit) {
      return {
        allowed: false,
        message: `Daily limit exceeded. Remaining today: $${(dailyLimit - usedToday) / 100}`
      };
    }

    return { allowed: true };
  }

  static _calculateFee(amountCents, paymentType) {
    // Different fees for different payment types
    const feePercentages = {
      stripe: 0.029, // 2.9%
      paypal: 0.029,
      ach: 0.01, // 1%
      mobile_money: 0.02 // 2%
    };

    const percentage = feePercentages[paymentType] || 0.02; // Default 2%
    return Math.round(amountCents * percentage);
  }

  static _estimateProcessingTime(paymentType) {
    const estimateMap = {
      stripe: '2-3 business days',
      paypal: '1-2 business days',
      ach: '3-5 business days',
      mobile_money: '1-2 minutes'
    };

    return estimateMap[paymentType] || '2-3 business days';
  }

  static async _processWithdrawalAsync(withdrawal, paymentMethod) {
    try {
      logger.info(`Starting withdrawal processing: ${withdrawal._id}`);

      // Route to appropriate payment processor
      let result;
      switch (paymentMethod.type) {
        case 'stripe':
          result = await StripeService.processWithdrawal(withdrawal, paymentMethod);
          break;
        case 'paypal':
          // result = await PayPalService.processWithdrawal(withdrawal, paymentMethod);
          result = { transaction_id: 'PAYPAL_TXN_' + Date.now() }; // Placeholder
          break;
        case 'ach':
          // result = await ACHService.processWithdrawal(withdrawal, paymentMethod);
          result = { transaction_id: 'ACH_TXN_' + Date.now() }; // Placeholder
          break;
        default:
          throw new Error(`Unknown payment type: ${paymentMethod.type}`);
      }

      // Mark as completed
      withdrawal.markAsCompleted(result.transaction_id);
      await withdrawal.save();

      // Deduct from reserved and update wallet
      const wallet = await Wallet.findOne({ user_id: withdrawal.user_id });
      wallet.reserved_cents -= withdrawal.amount_cents;
      wallet.total_withdrawn_cents += withdrawal.amount_cents;
      await wallet.save();

      // Log transaction
      await Transaction.create({
        user_id: withdrawal.user_id,
        type: 'withdrawal',
        amount_cents: -withdrawal.amount_cents,
        description: `Withdrawal to ${paymentMethod.type}`,
        status: 'completed',
        reference_type: 'withdrawal',
        reference_id: withdrawal._id
      });

      logger.info(`Withdrawal processed successfully: ${withdrawal._id}`);

      // Send notification email
      const user = await User.findById(withdrawal.user_id, 'email name');
      await EmailService.sendWithdrawalCompleted(user.email, {
        amount: withdrawal.net_payout_cents / 100,
        payment_method: paymentMethod.display_name,
        withdrawal_id: withdrawal._id,
        transaction_id: result.transaction_id
      });
    } catch (error) {
      logger.error(`Withdrawal processing failed: ${withdrawal._id}`, error);

      // Mark as failed or pending retry
      withdrawal.retry_count += 1;

      if (withdrawal.retry_count >= 5) {
        withdrawal.status = 'failed';
        withdrawal.error_message = error.message;
        withdrawal.error_code = error.code || 'UNKNOWN_ERROR';

        // Refund reserved amount
        const wallet = await Wallet.findOne({ user_id: withdrawal.user_id });
        wallet.reserved_cents -= withdrawal.amount_cents;
        wallet.available_cents += withdrawal.amount_cents;
        await wallet.save();

        logger.warn(
          `Withdrawal marked as failed after ${withdrawal.retry_count} retries: ${withdrawal._id}`
        );

        // Send failure notification
        const user = await User.findById(withdrawal.user_id, 'email');
        await EmailService.sendWithdrawalFailed(user.email, {
          amount: withdrawal.amount_cents / 100,
          error: withdrawal.error_message,
          withdrawal_id: withdrawal._id
        });
      } else {
        // Schedule retry
        withdrawal.status = 'pending_retry';
        const nextRetryDate = new Date();
        nextRetryDate.setMinutes(nextRetryDate.getMinutes() + 30 * withdrawal.retry_count); // Exponential backoff
        withdrawal.next_retry_at = nextRetryDate;
        withdrawal.error_message = error.message;
        withdrawal.error_code = error.code;

        logger.info(
          `Withdrawal scheduled for retry at ${nextRetryDate}: ${withdrawal._id}`,
          error
        );
      }

      await withdrawal.save();
    }
  }
}

module.exports = WithdrawalController;
