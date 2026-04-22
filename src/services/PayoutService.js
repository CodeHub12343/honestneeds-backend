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
  /**
   * Initiate a payout when campaign completes
   * Creates Payout record and triggers processing
   *
   * @param {string} campaignId - Campaign ID
   * @param {object} creatorId - Creator user ID
   * @returns {Promise<object>} Created Payout record
   */
  static async initiatePayout(campaignId, creatorId) {
    try {
      // Find campaign
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Verify creator matches
      if (campaign.creator_id.toString() !== creatorId.toString()) {
        throw new Error('Creator mismatch');
      }

      // Calculate amounts
      const totalRaisedCents = campaign.total_donation_amount_cents || 0;
      const platformFeeCents = Math.round(totalRaisedCents * 0.2); // 20% platform fee
      const payoutAmountCents = totalRaisedCents - platformFeeCents;

      // Get creator info for audit trail
      const creator = await User.findById(creatorId);
      if (!creator) {
        throw new Error('Creator user not found');
      }

      // Generate payout ID
      const payoutId = `PAYOUT-${new Date().toISOString().split('T')[0]}-${Date.now()}`;

      // Determine payment method (use creator's preferred method or default)
      const paymentMethod = creator.preferred_payout_method || 'stripe';

      // Create payout record
      const payout = await Payout.create({
        payout_id: payoutId,
        campaign_id: campaign._id,
        campaign_ref_id: campaign.campaign_id,
        creator_id: creatorId,
        total_raised_cents: totalRaisedCents,
        platform_fee_cents: platformFeeCents,
        payout_amount_cents: payoutAmountCents,
        payment_method: paymentMethod,
        status: 'initiated',
        metadata: {
          campaign_title: campaign.title,
          creator_name: creator.display_name,
          creator_email: creator.email,
          total_donations_count: campaign.total_donations || 0,
        },
      });

      payout.addNote('created', 'Payout initiated from campaign completion');
      await payout.save();

      winstonLogger.info('Payout initiated', {
        payout_id: payout.payout_id,
        campaign_id: campaign.campaign_id,
        creator_id: creatorId,
        amount_cents: payoutAmountCents,
        payment_method: paymentMethod,
      });

      return payout;
    } catch (error) {
      winstonLogger.error('Error initiating payout', {
        error: error.message,
        campaignId,
        creatorId,
        stack: error.stack,
      });
      throw error;
    }
  }

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

      // Route to appropriate processor
      let result;
      switch (payout.payment_method) {
        case 'stripe':
          result = await this._processStripeTransfer(payout);
          break;
        case 'paypal':
          result = await this._processPayPalTransfer(payout);
          break;
        case 'bank_transfer':
          result = await this._processBankTransfer(payout);
          break;
        case 'manual':
          result = await this._processManualPayout(payout);
          break;
        default:
          throw new Error(`Unsupported payment method: ${payout.payment_method}`);
      }

      if (result.success) {
        payout.markAsCompleted(result.transaction_id, payout.payment_method);
        await payout.save();

        winstonLogger.info('Payout completed successfully', {
          payout_id: payout.payout_id,
          amount_cents: payout.payout_amount_cents,
          transaction_id: result.transaction_id,
        });

        // Send success email to creator
        await this._sendPayoutSuccessEmail(payout);
      } else {
        // Handle failure
        payout.markAsFailed(result.error_message, result.error_code);

        // Schedule retry if retriable
        if (payout.canRetry()) {
          payout.scheduleRetry(60); // Retry in 60 minutes
        }

        await payout.save();

        winstonLogger.error('Payout processing failed', {
          payout_id: payout.payout_id,
          error_message: result.error_message,
          error_code: result.error_code,
          retry_count: payout.retry_count,
          will_retry: payout.canRetry(),
        });

        // Send failure email to creator and admin
        await this._sendPayoutFailureEmail(payout);
        await this._alertAdminPayoutFailure(payout);
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
   * Process Stripe Connect transfer
   * @private
   */
  static async _processStripeTransfer(payout) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_API_KEY);

      // Get creator's Stripe Connect account
      const creator = await User.findById(payout.creator_id._id || payout.creator_id);
      if (!creator?.stripe_connect_account_id) {
        throw new Error('Creator has no Stripe Connect account');
      }

      // Create transfer
      const transfer = await stripe.transfers.create({
        amount: payout.payout_amount_cents,
        currency: 'usd',
        destination: creator.stripe_connect_account_id,
        description: `HonestNeed creator payout for campaign: ${payout.metadata.campaign_title}`,
        metadata: {
          payout_id: payout.payout_id,
          campaign_id: payout.campaign_ref_id,
        },
      });

      // Store Stripe details
      payout.stripe_transfer_id = transfer.id;
      payout.stripe_account_id = creator.stripe_connect_account_id;

      return {
        success: true,
        transaction_id: transfer.id,
        processor: 'stripe',
        amount: transfer.amount,
        currency: transfer.currency,
      };
    } catch (error) {
      winstonLogger.error('Stripe transfer failed', {
        error: error.message,
        payoutId: payout.payout_id,
      });

      return {
        success: false,
        error_message: error.message,
        error_code: this._mapStripeError(error),
      };
    }
  }

  /**
   * Process PayPal payout
   * @private
   */
  static async _processPayPalTransfer(payout) {
    try {
      const paypalSdk = require('@paypal/checkout-server-sdk');

      // Get PayPal environment
      const environment = process.env.NODE_ENV === 'production'
        ? new paypalSdk.core.LiveEnvironment(
          process.env.PAYPAL_CLIENT_ID,
          process.env.PAYPAL_CLIENT_SECRET
        )
        : new paypalSdk.core.SandboxEnvironment(
          process.env.PAYPAL_CLIENT_ID,
          process.env.PAYPAL_CLIENT_SECRET
        );

      const client = new paypalSdk.core.PayPalHttpClient(environment);

      // Get creator's PayPal email
      const creator = await User.findById(payout.creator_id._id || payout.creator_id);
      if (!creator?.paypal_email) {
        throw new Error('Creator has no PayPal email on file');
      }

      // Create batch payout
      // Note: Simplified - in production, use Payouts API
      throw new Error('PayPal payouts not yet implemented - contact admin');
    } catch (error) {
      winstonLogger.error('PayPal transfer failed', {
        error: error.message,
        payoutId: payout.payout_id,
      });

      return {
        success: false,
        error_message: error.message,
        error_code: 'paypal_not_implemented',
      };
    }
  }

  /**
   * Process ACH bank transfer
   * @private
   */
  static async _processBankTransfer(payout) {
    try {
      // Integration with ACH provider (e.g., Stripe ACH, Plaid)
      throw new Error('Bank transfers not yet implemented - contact admin');
    } catch (error) {
      winstonLogger.error('Bank transfer failed', {
        error: error.message,
        payoutId: payout.payout_id,
      });

      return {
        success: false,
        error_message: error.message,
        error_code: 'bank_transfer_not_implemented',
      };
    }
  }

  /**
   * Process manual payout (for admin entry)
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
   * Process all pending payouts
   * Called by scheduled job
   *
   * @returns {Promise<object>} Processing summary
   */
  static async processPendingPayouts() {
    try {
      const pending = await Payout.findPending();
      winstonLogger.info('Processing pending payouts', { count: pending.length });

      const results = {
        total: pending.length,
        successful: 0,
        failed: 0,
        errors: [],
      };

      for (const payout of pending) {
        try {
          const result = await this.processPayout(payout._id);
          if (result.success) {
            results.successful += 1;
          } else {
            results.failed += 1;
          }
        } catch (error) {
          results.failed += 1;
          results.errors.push({
            payout_id: payout.payout_id,
            error: error.message,
          });
        }
      }

      winstonLogger.info('Pending payouts processing complete', results);
      return results;
    } catch (error) {
      winstonLogger.error('Error processing pending payouts', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Process failed payouts eligible for retry
   * Called by scheduled job
   *
   * @returns {Promise<object>} Retry summary
   */
  static async processFailedPayoutsForRetry() {
    try {
      const failedForRetry = await Payout.findFailedForRetry();
      winstonLogger.info('Processing failed payouts for retry', {
        count: failedForRetry.length,
      });

      const results = {
        total: failedForRetry.length,
        retried: 0,
        errors: [],
      };

      for (const payout of failedForRetry) {
        try {
          // Reset to initiated for retry
          payout.status = 'initiated';
          await payout.save();

          const result = await this.processPayout(payout._id);
          results.retried += 1;
        } catch (error) {
          results.errors.push({
            payout_id: payout.payout_id,
            error: error.message,
          });
        }
      }

      winstonLogger.info('Failed payouts retry processing complete', results);
      return results;
    } catch (error) {
      winstonLogger.error('Error processing failed payouts for retry', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
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
   * Send failure email to creator
   * @private
   */
  static async _sendPayoutFailureEmail(payout) {
    try {
      const emailService = require('./emailService');
      const campaign = await Campaign.findById(payout.campaign_id);
      const creator = await User.findById(payout.creator_id);

      await emailService.sendPayoutFailure(creator, payout, campaign);
    } catch (error) {
      winstonLogger.error('Failed to send payout failure email', {
        error: error.message,
        payoutId: payout.payout_id,
      });
    }
  }

  /**
   * Alert admin of payout failure
   * @private
   */
  static async _alertAdminPayoutFailure(payout) {
    try {
      const emailService = require('./emailService');
      await emailService.alertAdminPayoutFailure(payout);
    } catch (error) {
      winstonLogger.error('Failed to alert admin of payout failure', {
        error: error.message,
        payoutId: payout.payout_id,
      });
    }
  }

  /**
   * Map Stripe errors to error codes
   * @private
   */
  static _mapStripeError(error) {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('invalid_account')) return 'invalid_account';
    if (message.includes('insufficient')) return 'insufficient_balance';
    if (message.includes('restricted')) return 'account_restricted';
    if (message.includes('limit')) return 'transfer_limit';
    if (message.includes('rate')) return 'rate_limit';
    if (message.includes('amount')) return 'invalid_amount';

    return 'processing_error';
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

      // Create the withdrawal record
      const withdrawal = await ShareWithdrawal.create({
        withdrawal_id: withdrawalId,
        user_id: userId,
        amount_requested: amountCents,
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
