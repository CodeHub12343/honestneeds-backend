/**
 * Payout Service
 * Handles payout processing for campaign creators
 * 
 * Features:
 * - Initiates payouts when campaigns complete
 * - Processes payments via Stripe, PayPal, Bank Transfer
 * - Handles retries and error recovery
 * - Tracks payout status and audit trails
 */

const Payout = require('../models/Payout');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');

class PayoutService {
  // REMOVED (R-1 / F-8): initiatePayout() created a creator "payout" of donation
  // funds with a 20% platform fee on campaign completion. Invalid for the
  // MANUAL-payment model — donors pay creators directly, the platform never holds
  // donation money, so there is nothing to "pay out" and no 20% to take. The
  // platform's only claim is the per-donation fee on the fee-settlement ledger
  // (FeeTransaction / FeeTrackingService.getCreatorFeeStatement). Do not re-add.

  /**
   * Process pending payouts
   * Calls appropriate payment processor based on method
   *
   * @param {string} payoutId - Payout ID
   * @returns {Promise<object>} Processing result
   */
  static async processPayout(payoutId) {
    try {
      // Find payout
      const payout = await Payout.findById(payoutId).populate('creator_id');
      if (!payout) {
        throw new Error('Payout not found');
      }

      // Skip if not pending
      if (!payout.isPending()) {
        winstonLogger.warn('Skipping non-pending payout', {
          payout_id: payout.payout_id,
          status: payout.status,
        });
        return { success: false, reason: 'Payout not pending' };
      }

      // Mark as processing
      payout.markAsProcessing();
      await payout.save();

      // Manual model: automated escrow transfers (Stripe/PayPal/bank) are retired.
      // The platform never holds funds, so payouts are settled manually off-platform
      // (the canonical sharer-payout flow is CampaignPayoutController.markPayoutAsPaid).
      if (payout.payment_method && payout.payment_method !== 'manual') {
        winstonLogger.warn('Non-manual payout method rejected (automated transfers retired)', {
          payout_id: payout.payout_id,
          payment_method: payout.payment_method,
        });
        return {
          success: false,
          error_message: 'Automated transfers are retired. Settle this payout manually.',
          error_code: 'automated_transfers_retired',
        };
      }

      const result = await this._processManualPayout(payout);

      if (result.success) {
        payout.markAsCompleted(result.transaction_id, 'manual');
        await payout.save();

        winstonLogger.info('Manual payout completed', {
          payout_id: payout.payout_id,
          amount_cents: payout.payout_amount_cents,
          transaction_id: result.transaction_id,
        });

        await this._sendPayoutSuccessEmail(payout);
      } else {
        payout.markAsFailed(result.error_message, result.error_code);
        await payout.save();

        winstonLogger.error('Manual payout failed', {
          payout_id: payout.payout_id,
          error_message: result.error_message,
          error_code: result.error_code,
        });
      }

      return result;
    } catch (error) {
      winstonLogger.error('Error processing payout', {
        error: error.message,
        payoutId,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Process manual payout (off-platform settlement; the only supported method).
   * Automated escrow transfers (Stripe Connect / PayPal / ACH) were retired —
   * the platform never holds funds, so a "manual" payout just records that the
   * money was sent off-platform and stamps a reference.
   * @private
   */
  static async _processManualPayout(payout) {
    try {
      // For manual payouts, we just mark as completed with admin reference
      return {
        success: true,
        transaction_id: 'MANUAL-' + Date.now(),
        processor: 'manual',
      };
    } catch (error) {
      return {
        success: false,
        error_message: error.message,
        error_code: 'manual_payout_error',
      };
    }
  }

  /**
   * Send success email to creator
   * @private
   */
  static async _sendPayoutSuccessEmail(payout) {
    try {
      const emailService = require('./emailService');
      const campaign = await Campaign.findById(payout.campaign_id);
      const creator = await User.findById(payout.creator_id);

      await emailService.sendPayoutSuccess(creator, payout, campaign);
    } catch (error) {
      winstonLogger.error('Failed to send payout success email', {
        error: error.message,
        payoutId: payout.payout_id,
      });
    }
  }

  /**
   * Get payout by ID
   */
  static async getPayoutById(payoutId) {
    return Payout.findById(payoutId)
      .populate('creator_id', 'display_name email')
      .populate('campaign_id', 'campaign_id title');
  }

  /**
   * Get creator's payouts
   */
  static async getCreatorPayouts(creatorId, limit = 50) {
    return Payout.findByCreator(creatorId, limit);
  }

  /**
   * Get campaign's most recent payout
   */
  static async getCampaignPayout(campaignId) {
    return Payout.findByCampaign(campaignId);
  }

  /**
   * Create a payout request for sharer withdrawals (Feature 9)
   * Links sharer's payment method to withdrawal request
   * 
   * @param {Object} data - Payout request data
   * @param {string} data.userId - User requesting payout
   * @param {number} data.amountCents - Amount in cents
   * @param {string} data.paymentMethodId - PaymentMethod document ID
   * @returns {Promise<Object>} Created ShareWithdrawal record with payment details
   */
  /**
   * Split a payout amount across the campaigns whose CLEARED (approved) share
   * rewards the sharer is drawing from, so each campaign's creator can see and
   * pay their own slice (manual model). Allocates oldest-campaign-first against
   * each campaign's available balance (cleared minus amounts already
   * withdrawn/reserved by prior itemized withdrawals).
   * @returns {Promise<{campaign_withdrawals: Array, unallocated_cents: number}>}
   */
  static async allocateAcrossCampaigns(userId, amountCents) {
    const mongoose = require('mongoose');
    const Transaction = require('../models/Transaction');
    const ShareWithdrawal = require('../models/ShareWithdrawal');

    const uid =
      typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    // Claimable reward totals per campaign, oldest first. Trust-based: 'owed'
    // rewards are immediately claimable; legacy 'approved' (cleared from the old
    // 30-day hold) is still withdrawable.
    const clearedByCampaign = await Transaction.aggregate([
      {
        $match: {
          supporter_id: uid,
          transaction_type: 'share_reward',
          status: { $in: ['owed', 'approved'] },
        },
      },
      {
        $group: {
          _id: '$campaign_id',
          cleared: { $sum: '$amount_cents' },
          firstAt: { $min: '$created_at' },
        },
      },
      { $sort: { firstAt: 1 } },
    ]);

    // Already-SETTLED rewards per campaign ('paid'). H-2: settlement is
    // status-driven — when a creator pays, the underlying rewards flip
    // owed→paid and LEAVE the `cleared` pool above. So a completed withdrawal
    // that settled them must NOT be subtracted from `cleared` a second time.
    // We net completed-committed against `paid` below, exactly as
    // ShareService.getEarningsLedger does, so the payout gate and this
    // allocation always agree (previously they didn't → false 500 rejections).
    const paidAgg = await Transaction.aggregate([
      {
        $match: {
          supporter_id: uid,
          transaction_type: 'share_reward',
          status: 'paid',
        },
      },
      { $group: { _id: '$campaign_id', paid: { $sum: '$amount_cents' } } },
    ]);
    const paidByCampaign = {};
    paidAgg.forEach((r) => {
      if (r._id) paidByCampaign[r._id.toString()] = r.paid || 0;
    });

    // Per-campaign committed amounts from existing withdrawals, split by state:
    //   reserved  = in-flight (pending/processing)
    //   completed = settled records (netted against `paid` to catch only LEGACY
    //               pre-pivot withdrawals where rewards stayed 'approved')
    const existing = await ShareWithdrawal.find({
      user_id: uid,
      status: { $in: ['pending', 'processing', 'completed'] },
    }).select('campaign_withdrawals status');

    const reserved = {};
    const completedCommitted = {};
    existing.forEach((w) => {
      const bucket = w.status === 'completed' ? completedCommitted : reserved;
      (w.campaign_withdrawals || []).forEach((cw) => {
        if (!cw.campaign_id) return;
        const k = cw.campaign_id.toString();
        bucket[k] = (bucket[k] || 0) + (cw.amount_cents || 0);
      });
    });

    // Allocate oldest-campaign-first against each campaign's TRUE available:
    //   available = owed − reserved − max(0, completedCommitted − paid)
    let remaining = amountCents;
    let allocatable = 0;
    const campaign_withdrawals = [];
    for (const row of clearedByCampaign) {
      if (!row._id) continue; // skip rewards with no campaign attribution
      const k = row._id.toString();
      const legacyWithdrawn = Math.max(0, (completedCommitted[k] || 0) - (paidByCampaign[k] || 0));
      const available = Math.max(0, (row.cleared || 0) - (reserved[k] || 0) - legacyWithdrawn);
      if (available <= 0) continue;
      allocatable += available;
      if (remaining <= 0) continue; // keep summing allocatable, stop taking
      const take = Math.min(available, remaining);
      campaign_withdrawals.push({
        campaign_id: row._id,
        amount_cents: take,
        status: 'pending',
      });
      remaining -= take;
    }

    return {
      campaign_withdrawals,
      unallocated_cents: Math.max(0, remaining),
      allocatable_cents: allocatable,
    };
  }

  static async createPayoutRequest(data) {
    try {
      const { userId, amountCents, paymentMethodId } = data;
      const ShareWithdrawal = require('../models/ShareWithdrawal');
      const PaymentMethod = require('../models/PaymentMethod');
      const User = require('../models/User');

      winstonLogger.info('🔍 PayoutService.createPayoutRequest started', {
        userId,
        amountCents,
        paymentMethodId,
      });

      // Verify user exists
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get the payment method and ALL its details
      const paymentMethod = await PaymentMethod.findById(paymentMethodId);
      if (!paymentMethod) {
        throw new Error('Payment method not found');
      }

      // Verify payment method belongs to this user
      if (paymentMethod.user_id.toString() !== userId.toString()) {
        throw new Error('Payment method does not belong to this user');
      }

      // Generate unique withdrawal ID
      const withdrawalId = `WITHDRAWAL-${new Date().toISOString().split('T')[0]}-${Date.now()}`;

      // Extract payment details from payment method based on type
      let paymentDetails = {
        last4: null,
        accountHolder: null,
        accountType: null,
      };

      // Build payment_details based on payment method type
      if (paymentMethod.type === 'bank_transfer') {
        paymentDetails = {
          last4: paymentMethod.bank_account_last_four,
          accountHolder: paymentMethod.bank_account_holder,
          accountType: paymentMethod.bank_account_type,
        };
      } else if (paymentMethod.type === 'mobile_money') {
        paymentDetails = {
          last4: paymentMethod.mobile_number?.slice(-4) || null,
          accountHolder: null,
          accountType: paymentMethod.mobile_money_provider,
        };
      } else if (paymentMethod.type === 'stripe') {
        paymentDetails = {
          last4: paymentMethod.card_last_four,
          accountHolder: null,
          accountType: paymentMethod.card_brand,
        };
      }

      // Fix #1: itemize the payout per campaign so each creator can see & pay
      // their own slice, and so per-campaign reservation accounting is correct.
      const { campaign_withdrawals, unallocated_cents, allocatable_cents } =
        await PayoutService.allocateAcrossCampaigns(userId, amountCents);
      if (unallocated_cents > 0) {
        // H-2: this is a balance/business condition, not a server fault — surface
        // it as a typed 409 with the true claimable figure so the caller can show
        // a clean message that matches the dashboard.
        const err = new Error(
          `Insufficient claimable balance to cover this payout. You can currently claim $${(
            allocatable_cents / 100
          ).toFixed(2)}.`
        );
        err.code = 'INSUFFICIENT_ALLOCATABLE';
        err.statusCode = 409;
        err.allocatable_cents = allocatable_cents;
        throw err;
      }

      // Create the withdrawal record
      const withdrawal = await ShareWithdrawal.create({
        withdrawal_id: withdrawalId,
        user_id: userId,
        amount_requested: amountCents,
        campaign_withdrawals,
        payment_method_id: paymentMethodId,
        payment_type: paymentMethod.type,
        payment_details: paymentDetails,
        status: 'pending',
      });

      winstonLogger.info('✅ Withdrawal created successfully', {
        withdrawal_id: withdrawalId,
        user_id: userId,
        amount_cents: amountCents,
        payment_type: paymentMethod.type,
        payment_details: paymentDetails,
      });

      // Phase 5: notify each campaign's creator that a sharer is claiming a
      // payout they must settle directly. One notification per campaign slice.
      try {
        const Campaign = require('../models/Campaign');
        const NotificationDispatcher = require('./NotificationDispatcher');
        const sliceCampaignIds = campaign_withdrawals.map((cw) => cw.campaign_id);
        const camps = await Campaign.find({ _id: { $in: sliceCampaignIds } }).select('title creator_id');
        const campById = {};
        camps.forEach((c) => { campById[c._id.toString()] = c; });

        await Promise.all(
          campaign_withdrawals.map((cw) => {
            const camp = campById[cw.campaign_id?.toString()];
            if (!camp?.creator_id) return null;
            return NotificationDispatcher.notify({
              userId: camp.creator_id,
              type: 'payout_requested',
              data: {
                campaign_id: cw.campaign_id,
                campaign_title: camp.title,
                withdrawal_id: withdrawalId,
                slice_amount_cents: cw.amount_cents,
              },
              overrides: {
                title: '💰 New payout request',
                message: `A sharer requested a $${((cw.amount_cents || 0) / 100).toFixed(2)} payout for "${camp.title}". Pay them directly and mark it paid.`,
                action_url: `/sharers-payouts/${cw.campaign_id}`,
                icon_emoji: '💰',
                color: 'info',
              },
            });
          })
        );
      } catch (notifyErr) {
        // Notifications must never block a payout request.
        winstonLogger.error('⚠️ PayoutService: payout-request notification failed (non-fatal)', {
          error: notifyErr.message,
          withdrawal_id: withdrawalId,
        });
      }

      // Return withdrawal with full payment method details for response
      return {
        withdrawal_id: withdrawal.withdrawal_id,
        user_id: withdrawal.user_id,
        amount_requested: withdrawal.amount_requested,
        payment_method: {
          type: paymentMethod.type,
          // Include ALL payment method fields that will be needed in responses
          bank_account_holder: paymentMethod.bank_account_holder,
          bank_name: paymentMethod.bank_name,
          bank_account_type: paymentMethod.bank_account_type,
          bank_account_last_four: paymentMethod.bank_account_last_four,
          bank_routing_number_last_four: paymentMethod.bank_routing_number_last_four,
          mobile_number: paymentMethod.mobile_number,
          mobile_country_code: paymentMethod.mobile_country_code,
          mobile_money_provider: paymentMethod.mobile_money_provider,
          card_last_four: paymentMethod.card_last_four,
          card_brand: paymentMethod.card_brand,
          stripe_payment_method_id: paymentMethod.stripe_payment_method_id,
        },
        status: withdrawal.status,
        created_at: withdrawal.created_at,
      };
    } catch (error) {
      winstonLogger.error('❌ PayoutService.createPayoutRequest error', {
        error: error.message,
        stack: error.stack,
        data,
      });
      throw error;
    }
  }
}

module.exports = PayoutService;
