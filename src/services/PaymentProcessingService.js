/**
 * PaymentProcessingService
 * 
 * Orchestrates payment flows for donations, withdrawals, and other transactions
 * Connects PaymentMethod storage with actual Stripe charging
 * 
 * Handles:
 * - Donor payment processing
 * - Withdrawal payouts to creators
 * - Marketplace fee collection
 * - Refund processing
 */

const StripeService = require('./StripeService');
const PaymentMethod = require('../models/PaymentMethod');
const User = require('../models/User');
const Donation = require('../models/Donation');
const Transaction = require('../models/Transaction');
const ShareWithdrawal = require('../models/ShareWithdrawal');
const { winstonLogger } = require('../utils/logger');

class PaymentProcessingService {
  /**
   * Process donation payment
   * 
   * @param {Object} donationData - {donationId, userId, amount, paymentMethodId, campaignId}
   * @returns {Promise<Object>} {success, transactionId, paymentIntent, error}
   */
  async processDonationPayment(donationData) {
    const { donationId, userId, amount, paymentMethodId, campaignId } = donationData;

    try {
      winstonLogger.info('Processing donation payment', {
        donationId,
        userId,
        amount,
        paymentMethodId
      });

      // Validate donation amount (in cents)
      if (amount < 100 || amount > 999999900) {
        throw new Error('Donation amount must be between $1 and $9,999,999');
      }

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get payment method
      const paymentMethod = await PaymentMethod.findById(paymentMethodId);
      if (!paymentMethod || paymentMethod.user_id.toString() !== userId) {
        throw new Error('Payment method not found or not owned by user');
      }

      // Check if payment method is expired
      if (StripeService.isPaymentMethodExpired(paymentMethod)) {
        throw new Error('Payment method has expired');
      }

      // Get or create Stripe customer
      const stripeCustomer = await StripeService.getOrCreateStripeCustomer(userId, {
        email: user.email,
        name: user.displayName
      });

      // Create and confirm payment intent
      const paymentIntent = await StripeService.chargeCustomer(
        amount,
        stripeCustomer.id,
        paymentMethod.stripe_payment_method_id,
        {
          donationId,
          campaignId,
          userId,
          type: 'donation'
        }
      );

      // Create transaction record
      const transaction = await this._createTransaction({
        type: 'donation',
        userId,
        amount,
        status: paymentIntent.status === 'succeeded' ? 'completed' : 'pending',
        paymentMethodId,
        stripePaymentIntentId: paymentIntent.id,
        relatedTo: 'Donation',
        relatedId: donationId,
        metadata: {
          campaignId,
          paymentIntentStatus: paymentIntent.status
        }
      });

      // Update donation status
      await Donation.findByIdAndUpdate(donationId, {
        payment_status: paymentIntent.status === 'succeeded' ? 'completed' : 'pending',
        stripe_payment_intent_id: paymentIntent.id,
        transaction_id: transaction._id,
        updated_at: new Date()
      });

      // Record payment method usage
      paymentMethod.usage_count = (paymentMethod.usage_count || 0) + 1;
      paymentMethod.last_used = new Date();
      await paymentMethod.save();

      winstonLogger.info('Donation payment processed successfully', {
        donationId,
        transactionId: transaction._id,
        paymentIntentStatus: paymentIntent.status
      });

      return {
        success: true,
        transactionId: transaction._id,
        paymentIntent,
        status: paymentIntent.status
      };
    } catch (error) {
      winstonLogger.error('Failed to process donation payment', {
        donationId,
        userId,
        error: error.message
      });

      // Update donation status to failed
      if (donationId) {
        await Donation.findByIdAndUpdate(donationId, {
          payment_status: 'failed',
          error_message: error.message,
          updated_at: new Date()
        }).catch(err => winstonLogger.error('Failed to update donation', { error: err.message }));
      }

      return {
        success: false,
        error: error.message,
        code: error.code || 'PAYMENT_FAILED'
      };
    }
  }

  /**
   * Process withdrawal/payout to user
   * 
   * @param {Object} withdrawalData - {withdrawalId, userId, amount, method, bankAccountId}
   * @returns {Promise<Object>} {success, transferId, status, error}
   */
  async processWithdrawalPayout(withdrawalData) {
    const { withdrawalId, userId, amount, method, bankAccountId } = withdrawalData;

    try {
      winstonLogger.info('Processing withdrawal payout', {
        withdrawalId,
        userId,
        amount,
        method
      });

      // Validate amount
      if (amount < 100 || amount > 999999900) {
        throw new Error('Withdrawal amount must be between $1 and $9,999,999');
      }

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      let transferResult = {};

      // Route to appropriate payout method
      if (method === 'stripe') {
        transferResult = await this._processStripeConnect(userId, amount, user.email);
      } else if (method === 'bank') {
        transferResult = await this._processBankTransfer(userId, amount, bankAccountId);
      } else if (method === 'paypal') {
        transferResult = await this._processPayPalPayout(userId, amount, user.email);
      } else {
        throw new Error(`Unknown withdrawal method: ${method}`);
      }

      // Create transaction record
      const transaction = await this._createTransaction({
        type: 'withdrawal',
        userId,
        amount,
        status: 'pending', // Payout takes time to settle
        method,
        relatedTo: 'ShareWithdrawal',
        relatedId: withdrawalId,
        metadata: transferResult
      });

      // Update withdrawal record
      await ShareWithdrawal.findByIdAndUpdate(withdrawalId, {
        status: 'processing',
        transfer_id: transferResult.transferId,
        transaction_id: transaction._id,
        processed_at: new Date()
      });

      winstonLogger.info('Withdrawal payout initiated', {
        withdrawalId,
        transferId: transferResult.transferId,
        method
      });

      return {
        success: true,
        transferId: transferResult.transferId,
        status: 'processing',
        estimatedArrival: transferResult.estimatedArrival
      };
    } catch (error) {
      winstonLogger.error('Failed to process withdrawal payout', {
        withdrawalId,
        userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        code: error.code || 'PAYOUT_FAILED'
      };
    }
  }

  /**
   * Process refund of donation
   * 
   * @param {string} donationId - Donation ID
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} {success, refundId, amount}
   */
  async refundDonation(donationId, reason = 'requested_by_customer') {
    try {
      winstonLogger.info('Processing donation refund', { donationId, reason });

      // Get donation
      const donation = await Donation.findById(donationId);
      if (!donation) {
        throw new Error('Donation not found');
      }

      if (!donation.stripe_payment_intent_id) {
        throw new Error('No Stripe payment intent found for this donation');
      }

      // Create refund via Stripe
      const refund = await StripeService.createRefund(
        donation.stripe_payment_intent_id,
        donation.amount,
        reason
      );

      // Update donation status
      await Donation.findByIdAndUpdate(donationId, {
        payment_status: 'refunded',
        refund_id: refund.id,
        refund_amount: refund.amount,
        updated_at: new Date()
      });

      // Create transaction record
      const transaction = await this._createTransaction({
        type: 'refund',
        userId: donation.donor_id,
        amount: donation.amount,
        status: 'completed',
        relatedTo: 'Donation',
        relatedId: donationId,
        metadata: {
          refundId: refund.id,
          reason
        }
      });

      winstonLogger.info('Donation refunded successfully', {
        donationId,
        refundId: refund.id,
        amount: refund.amount
      });

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount
      };
    } catch (error) {
      winstonLogger.error('Failed to refund donation', {
        donationId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle payment intent webhook
   * 
   * @param {Object} paymentIntent - Stripe payment intent
   * @returns {Promise<void>}
   */
  async handlePaymentIntentWebhook(paymentIntent) {
    try {
      const { id, status, amount, customer, metadata } = paymentIntent;

      winstonLogger.info('Handling payment intent webhook', {
        intentId: id,
        status,
        amount
      });

      // Find transaction by Stripe payment intent ID
      const transaction = await Transaction.findOne({
        stripe_payment_intent_id: id
      });

      if (!transaction) {
        winstonLogger.warn('Transaction not found for payment intent', { intentId: id });
        return;
      }

      // Update transaction status
      let newStatus = 'pending';
      if (status === 'succeeded') {
        newStatus = 'completed';
      } else if (status === 'requires_action') {
        newStatus = 'requires_action';
      } else if (status === 'canceled') {
        newStatus = 'failed';
      }

      await Transaction.findByIdAndUpdate(transaction._id, {
        status: newStatus,
        updated_at: new Date()
      });

      // If donation, update donation status
      if (metadata?.type === 'donation' && metadata?.donationId) {
        await Donation.findByIdAndUpdate(metadata.donationId, {
          payment_status: newStatus,
          updated_at: new Date()
        });
      }

      winstonLogger.info('Updated transaction status for payment intent', {
        transactionId: transaction._id,
        intentId: id,
        newStatus
      });
    } catch (error) {
      winstonLogger.error('Failed to handle payment intent webhook', {
        error: error.message
      });
    }
  }

  /**
   * Get transaction history for payment method
   * 
   * @param {string} paymentMethodId - Payment method ID
   * @param {number} page - Page number
   * @param {number} limit - Results per page
   * @returns {Promise<Array>} Transaction history
   */
  async getPaymentMethodTransactionHistory(paymentMethodId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;

      const transactions = await Transaction.find({
        payment_method_id: paymentMethodId
      })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Transaction.countDocuments({
        payment_method_id: paymentMethodId
      });

      return {
        transactions,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      winstonLogger.error('Failed to get transaction history', {
        paymentMethodId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create transaction record (internal method)
   * @private
   */
  async _createTransaction(data) {
    try {
      const transaction = new Transaction({
        user_id: data.userId,
        type: data.type,
        amount: data.amount,
        status: data.status,
        payment_method_id: data.paymentMethodId,
        stripe_payment_intent_id: data.stripePaymentIntentId,
        related_to: data.relatedTo,
        related_id: data.relatedId,
        method: data.method,
        metadata: data.metadata,
        created_at: new Date(),
        updated_at: new Date()
      });

      await transaction.save();
      return transaction;
    } catch (error) {
      winstonLogger.error('Failed to create transaction record', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process Stripe Connect transfer
   * @private
   */
  async _processStripeConnect(userId, amount, email) {
    // TODO: Implement Stripe Connect for creator payouts
    // This requires Stripe Connect account setup
    return {
      transferId: `${userId}-${Date.now()}`,
      estimatedArrival: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 5 days
    };
  }

  /**
   * Process bank transfer
   * @private
   */
  async _processBankTransfer(userId, amount, bankAccountId) {
    // TODO: Implement ACH or international bank transfer
    // Could use Stripe ACH or third-party provider like Dwolla
    return {
      transferId: `ACH-${userId}-${Date.now()}`,
      estimatedArrival: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
    };
  }

  /**
   * Process PayPal payout
   * @private
   */
  async _processPayPalPayout(userId, amount, email) {
    // TODO: Implement PayPal API for payouts
    return {
      transferId: `PAYPAL-${userId}-${Date.now()}`,
      estimatedArrival: new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day
    };
  }
}

module.exports = new PaymentProcessingService();
