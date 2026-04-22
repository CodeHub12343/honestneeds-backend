/**
 * Withdrawal Service
 * Manages withdrawal requests, payout processing, and payment processor integration
 * 
 * Supported Payment Methods:
 * - Stripe Connect (instant transfer to connected account)
 * - PayPal (instant via payout API)
 * - ACH/Bank Transfer (Dwolla, 1-3 business days)
 * - Mobile Money (M-Pesa, MTN, Airtel)
 */

const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const PaymentMethod = require('../models/PaymentMethod');
const Transaction = require('../models/Transaction');
const winstonLogger = require('../utils/winstonLogger');
const emailService = require('./emailService');
const WalletService = require('./WalletService');

class WithdrawalService {
  /**
   * Create withdrawal request
   * @param {string} userId - User ID
   * @param {object} data - { amount_cents, payment_method_id, notes }
   * @returns {Promise<object>} Created withdrawal record
   */
  static async requestWithdrawal(userId, data) {
    const { amount_cents, payment_method_id, notes } = data;

    try {
      // Validate user exists
      const user = await User.findById(userId).select('wallet email display_name');
      if (!user) {
        throw new Error('User not found');
      }

      // Validate amount
      if (!amount_cents || amount_cents < 500) {
        throw new Error('Minimum withdrawal is $5 (500 cents)');
      }

      // Check available balance
      const available = user.wallet?.available_cents || 0;
      if (amount_cents > available) {
        throw new Error(
          `Insufficient balance. Available: $${(available / 100).toFixed(2)}`
        );
      }

      // Check user is not blocked
      if (user.wallet?.is_blocked) {
        throw new Error(
          `Account blocked: ${user.wallet.block_reason || 'No details available'}`
        );
      }

      // Validate payment method exists and belongs to user
      const paymentMethod = await PaymentMethod.findById(payment_method_id);
      if (!paymentMethod || paymentMethod.user_id.toString() !== userId.toString()) {
        throw new Error('Invalid payment method');
      }

      // Create withdrawal request
      const withdrawal = await Withdrawal.create({
        user_id: userId,
        amount_cents,
        payment_method_id,
        status: 'requested',
        notes: notes || '',
        fee_cents: Math.round(amount_cents * 0.02), // 2% fee
        metadata: {
          user_email: user.email,
          user_name: user.display_name,
          payment_type: paymentMethod.type,
          currency: 'USD'
        }
      });

      // Reserve funds (move to pending_withdrawal)
      await WalletService.updateBalance(userId, {
        available_cents: -amount_cents,
        pending_withdrawal_cents: amount_cents
      });

      // Create transaction record
      await Transaction.create({
        user_id: userId,
        type: 'withdrawal_initiated',
        amount_cents,
        status: 'pending',
        withdrawal_id: withdrawal._id,
        description: `Withdrawal to ${paymentMethod.display_name}`
      });

      // Send email confirmation
      try {
        await emailService.sendWithdrawalConfirmation(user, withdrawal, paymentMethod);
      } catch (emailError) {
        winstonLogger.warn('Failed to send withdrawal confirmation email', {
          withdrawalId: withdrawal._id,
          error: emailError.message
        });
        // Don't throw - let withdrawal proceed even if email fails
      }

      winstonLogger.info('Withdrawal request created', {
        withdrawal_id: withdrawal._id,
        user_id: userId,
        amount_cents,
        payment_method_id
      });

      return withdrawal;
    } catch (error) {
      winstonLogger.error('Error requesting withdrawal', {
        error: error.message,
        userId,
        amount_cents
      });
      throw error;
    }
  }

  /**
   * Process all pending withdrawals (called by cron job)
   * @returns {Promise<object>} Processing results summary
   */
  static async processPendingWithdrawals() {
    try {
      const pending = await Withdrawal.find({ status: 'requested' })
        .populate('payment_method_id')
        .populate('user_id');

      const results = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: []
      };

      for (const withdrawal of pending) {
        try {
          await this.processWithdrawal(withdrawal);
          results.succeeded++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            withdrawal_id: withdrawal._id,
            error: error.message
          });
        }
        results.processed++;
      }

      winstonLogger.info('Pending withdrawals processing complete', results);
      return results;
    } catch (error) {
      winstonLogger.error('Error processing pending withdrawals', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process single withdrawal
   * @param {object} withdrawal - Withdrawal document
   * @returns {Promise<object>} Updated withdrawal
   */
  static async processWithdrawal(withdrawal) {
    try {
      // Mark as processing
      withdrawal.status = 'processing';
      withdrawal.processing_started_at = new Date();
      await withdrawal.save();

      // Get payment method
      const paymentMethod = await PaymentMethod.findById(
        withdrawal.payment_method_id
      );

      if (!paymentMethod) {
        throw new Error('Payment method not found');
      }

      // Route to appropriate processor
      let result;
      switch (paymentMethod.type) {
        case 'stripe':
          result = await this._processStripeTransfer(withdrawal, paymentMethod);
          break;
        case 'bank_transfer':
          result = await this._processACHTransfer(withdrawal, paymentMethod);
          break;
        case 'paypal':
          result = await this._processPayPalTransfer(withdrawal, paymentMethod);
          break;
        case 'mobile_money':
          result = await this._processMobileMoneyTransfer(withdrawal, paymentMethod);
          break;
        default:
          throw new Error(`Unsupported payment method: ${paymentMethod.type}`);
      }

      if (result.success) {
        // Success path - mark as completed
        withdrawal.status = 'completed';
        withdrawal.transaction_id = result.transaction_id;
        withdrawal.completed_at = new Date();
        await withdrawal.save();

        // Update user balance
        await WalletService.updateBalance(withdrawal.user_id, {
          pending_withdrawal_cents: -withdrawal.amount_cents,
          lifetime_withdrawn_cents: withdrawal.amount_cents
        });

        // Update transaction
        await Transaction.findOneAndUpdate(
          { withdrawal_id: withdrawal._id },
          { status: 'completed', transaction_id: result.transaction_id }
        );

        // Send success email
        const user = await User.findById(withdrawal.user_id);
        try {
          await emailService.sendWithdrawalSuccessEmail(user, withdrawal, result);
        } catch (emailError) {
          winstonLogger.warn('Failed to send withdrawal success email', {
            withdrawalId: withdrawal._id,
            error: emailError.message
          });
        }

        winstonLogger.info('Withdrawal completed successfully', {
          withdrawal_id: withdrawal._id,
          amount_cents: withdrawal.amount_cents,
          transaction_id: result.transaction_id
        });
      } else {
        // Failure path - check if retriable
        if (withdrawal.canRetry()) {
          withdrawal.status = 'pending_retry';
          withdrawal.retry_count = (withdrawal.retry_count || 0) + 1;
          withdrawal.next_retry_at = this._calculateBackoffTime(
            withdrawal.retry_count
          );
          withdrawal.error_message = result.error_message;
          withdrawal.error_code = result.error_code;
          await withdrawal.save();

          winstonLogger.warn('Withdrawal scheduled for retry', {
            withdrawal_id: withdrawal._id,
            retry_count: withdrawal.retry_count,
            next_retry_at: withdrawal.next_retry_at,
            error: result.error_message
          });

          // Send retry email
          const user = await User.findById(withdrawal.user_id);
          try {
            await emailService.sendWithdrawalRetryEmail(user, withdrawal);
          } catch (emailError) {
            winstonLogger.warn('Failed to send withdrawal retry email', {
              withdrawalId: withdrawal._id
            });
          }
        } else {
          // Max retries exceeded - return funds to available balance
          withdrawal.status = 'failed';
          withdrawal.error_message = result.error_message;
          withdrawal.error_code = result.error_code;
          await withdrawal.save();

          // Return funds to available balance
          await WalletService.updateBalance(withdrawal.user_id, {
            pending_withdrawal_cents: -withdrawal.amount_cents,
            available_cents: withdrawal.amount_cents
          });

          winstonLogger.error('Withdrawal failed permanently', {
            withdrawal_id: withdrawal._id,
            retry_count: withdrawal.retry_count,
            error: result.error_message
          });

          // Send permanent failure email
          const user = await User.findById(withdrawal.user_id);
          try {
            await emailService.sendWithdrawalFailureEmail(user, withdrawal);
          } catch (emailError) {
            winstonLogger.warn('Failed to send withdrawal failure email', {
              withdrawalId: withdrawal._id
            });
          }

          // Alert admin
          try {
            await emailService.alertAdminWithdrawalFailure(withdrawal);
          } catch (emailError) {
            winstonLogger.warn('Failed to send admin alert', {
              withdrawalId: withdrawal._id
            });
          }
        }
      }

      return withdrawal;
    } catch (error) {
      winstonLogger.error('Error processing withdrawal', {
        error: error.message,
        withdrawalId: withdrawal._id
      });
      throw error;
    }
  }

  /**
   * Process failed withdrawals for retry
   * @returns {Promise<object>} Retry results
   */
  static async processFailedWithdrawalsForRetry() {
    try {
      const now = new Date();
      const ready = await Withdrawal.find({
        status: 'pending_retry',
        next_retry_at: { $lte: now }
      })
        .populate('payment_method_id')
        .populate('user_id')
        .limit(100);

      const results = { count: ready.length, succeeded: 0, failed: 0 };

      for (const withdrawal of ready) {
        try {
          await this.processWithdrawal(withdrawal);
          results.succeeded++;
        } catch (error) {
          results.failed++;
          winstonLogger.error('Withdrawal retry failed', {
            withdrawalId: withdrawal._id,
            error: error.message
          });
        }
      }

      winstonLogger.info('Withdrawal retry processing complete', results);
      return results;
    } catch (error) {
      winstonLogger.error('Error processing withdrawal retries', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process Stripe Connect transfer
   * @private
   */
  static async _processStripeTransfer(withdrawal, paymentMethod) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_API_KEY);

      // Get user's Stripe Connect account
      const user = await User.findById(withdrawal.user_id);
      if (!user?.stripe_connect_account_id) {
        throw new Error('User has no Stripe Connect account configured');
      }

      // Create transfer
      const transfer = await stripe.transfers.create({
        amount: withdrawal.amount_cents,
        currency: 'usd',
        destination: user.stripe_connect_account_id,
        description: `HonestNeed payout request ${withdrawal._id}`,
        metadata: {
          withdrawal_id: withdrawal._id.toString(),
          user_id: user._id.toString()
        }
      });

      return {
        success: true,
        transaction_id: transfer.id,
        processor: 'stripe',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      winstonLogger.error('Stripe transfer failed', {
        error: error.message,
        withdrawalId: withdrawal._id
      });

      return {
        success: false,
        error_message: error.message,
        error_code: this._mapStripeError(error)
      };
    }
  }

  /**
   * Process ACH bank transfer
   * @private
   */
  static async _processACHTransfer(withdrawal, paymentMethod) {
    try {
      // Use Dwolla for ACH transfers
      const Client = require('dwolla-v2').Client;
      const dwollaClient = new Client({
        environment: process.env.DWOLLA_ENVIRONMENT || 'sandbox',
        key: process.env.DWOLLA_KEY,
        secret: process.env.DWOLLA_SECRET
      });

      // Get access token
      const appToken = await dwollaClient.auth.client();

      // Create transfer
      const transfer = await appToken.post('transfers', {
        _links: {
          source: {
            href: paymentMethod.dwolla_account_url
          },
          destination: {
            href: process.env.DWOLLA_MASTER_ACCOUNT_URL
          }
        },
        amount: {
          currency: 'USD',
          value: (withdrawal.amount_cents / 100).toFixed(2)
        },
        metadata: {
          withdrawal_id: withdrawal._id.toString()
        }
      });

      return {
        success: true,
        transaction_id: transfer.id,
        processor: 'dwolla',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      winstonLogger.error('ACH transfer failed', {
        error: error.message,
        withdrawalId: withdrawal._id
      });

      return {
        success: false,
        error_message: error.message,
        error_code: 'ACH_ERROR'
      };
    }
  }

  /**
   * Process PayPal payout
   * @private
   */
  static async _processPayPalTransfer(withdrawal, paymentMethod) {
    try {
      const { client_id, client_secret } = this._getPayPalCredentials();
      const axios = require('axios');

      // Get access token
      const tokenResponse = await axios.post(
        'https://api.paypal.com/v1/oauth2/token',
        'grant_type=client_credentials',
        {
          auth: { username: client_id, password: client_secret },
          headers: { 'Accept': 'application/json' }
        }
      );

      const accessToken = tokenResponse.data.access_token;

      // Create payout
      const payoutResponse = await axios.post(
        'https://api.paypal.com/v1/payments/payouts',
        {
          sender_batch_header: {
            sender_batch_id: `withdrawal-${withdrawal._id}-${Date.now()}`,
            email_subject: 'You have received a payout from HonestNeed'
          },
          items: [
            {
              recipient_type: 'EMAIL',
              amount: {
                value: (withdrawal.amount_cents / 100).toFixed(2),
                currency: 'USD'
              },
              description: 'HonestNeed payout',
              sender_item_id: withdrawal._id.toString(),
              receiver: paymentMethod.paypal_email
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: payoutResponse.status === 201,
        transaction_id: payoutResponse.data.batch_header.payout_batch_id,
        processor: 'paypal',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      winstonLogger.error('PayPal transfer failed', {
        error: error.message,
        withdrawalId: withdrawal._id
      });

      return {
        success: false,
        error_message: error.message,
        error_code: 'PAYPAL_ERROR'
      };
    }
  }

  /**
   * Process mobile money transfer
   * @private
   */
  static async _processMobileMoneyTransfer(withdrawal, paymentMethod) {
    const provider = paymentMethod.mobile_money_provider;

    try {
      if (provider === 'mpesa') {
        return await this._processMPesa(withdrawal, paymentMethod);
      } else if (provider === 'mtn_money') {
        return await this._processMTNMoney(withdrawal, paymentMethod);
      } else if (provider === 'airtel_money') {
        return await this._processAirtelMoney(withdrawal, paymentMethod);
      } else {
        throw new Error(`Unsupported mobile money provider: ${provider}`);
      }
    } catch (error) {
      winstonLogger.error('Mobile money transfer failed', {
        error: error.message,
        withdrawalId: withdrawal._id,
        provider
      });

      return {
        success: false,
        error_message: error.message,
        error_code: `${provider.toUpperCase()}_ERROR`
      };
    }
  }

  /**
   * Calculate exponential backoff for retries
   * @private
   */
  static _calculateBackoffTime(retryCount) {
    const baseMinutes = 60;
    const delayMinutes = baseMinutes * Math.pow(2, retryCount - 1);
    const maxDelay = 24 * 60; // max 24 hours
    const actualDelay = Math.min(delayMinutes, maxDelay);
    return new Date(Date.now() + actualDelay * 60 * 1000);
  }

  /**
   * Map Stripe errors to standardized error codes
   * @private
   */
  static _mapStripeError(error) {
    if (error.code === 'resource_missing') {
      return 'STRIPE_ACCOUNT_NOT_FOUND';
    } else if (error.code === 'invalid_request_error') {
      return 'STRIPE_INVALID_REQUEST';
    } else if (error.message?.includes('Insufficient')) {
      return 'INSUFFICIENT_ACCOUNT_BALANCE';
    } else {
      return 'STRIPE_ERROR';
    }
  }

  /**
   * Get PayPal credentials from environment
   * @private
   */
  static _getPayPalCredentials() {
    const sandbox = process.env.PAYPAL_MODE === 'sandbox';
    return {
      client_id: process.env.PAYPAL_CLIENT_ID,
      client_secret: process.env.PAYPAL_CLIENT_SECRET,
      env: sandbox ? 'sandbox' : 'production'
    };
  }
}

module.exports = WithdrawalService;
