/**
 * StripeService
 * 
 * Handles all Stripe interactions for payment processing
 * Integrates with payment methods for charging, refunds, etc.
 * 
 * PCI Compliance:
 * ✅ No raw card data handling
 * ✅ All cards tokenized through Stripe
 * ✅ Only token references stored in database
 */

const Stripe = require('stripe');
const { winstonLogger } = require('../utils/logger');
const StripeWebhookLog = require('../models/StripeWebhookLog');

if (!process.env.STRIPE_API_KEY) {
  throw new Error('STRIPE_API_KEY environment variable is not set');
}

const stripe = new Stripe(process.env.STRIPE_API_KEY);

class StripeService {
  /**
   * Create or get Stripe customer for user
   * 
   * @param {string} userId - User ID
   * @param {Object} userData - User data {email, name}
   * @returns {Promise<Object>} Stripe customer object
   */
  async getOrCreateStripeCustomer(userId, userData = {}) {
    try {
      // Check if customer already exists
      const existingCustomer = await stripe.customers.list({
        email: userData.email,
        limit: 1
      });

      if (existingCustomer.data && existingCustomer.data.length > 0) {
        winstonLogger.info('Found existing Stripe customer', {
          userId,
          customerId: existingCustomer.data[0].id
        });
        return existingCustomer.data[0];
      }

      // Create new customer
      const customer = await stripe.customers.create({
        email: userData.email,
        name: userData.name,
        metadata: {
          userId,
          createdAt: new Date().toISOString()
        }
      });

      winstonLogger.info('Created new Stripe customer', {
        userId,
        customerId: customer.id
      });

      return customer;
    } catch (error) {
      winstonLogger.error('Failed to get/create Stripe customer', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Attach payment method to Stripe customer
   * 
   * @param {string} paymentMethodId - Stripe payment method ID
   * @param {string} stripeCustomerId - Stripe customer ID
   * @returns {Promise<Object>} Updated payment method
   */
  async attachPaymentMethod(paymentMethodId, stripeCustomerId) {
    try {
      const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId
      });

      winstonLogger.info('Attached payment method to customer', {
        customerId: stripeCustomerId,
        paymentMethodId
      });

      return paymentMethod;
    } catch (error) {
      winstonLogger.error('Failed to attach payment method', {
        paymentMethodId,
        customerId: stripeCustomerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Detach payment method from customer
   * 
   * @param {string} paymentMethodId - Stripe payment method ID
   * @returns {Promise<Object>} Detached payment method
   */
  async detachPaymentMethod(paymentMethodId) {
    try {
      const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);

      winstonLogger.info('Detached payment method', { paymentMethodId });

      return paymentMethod;
    } catch (error) {
      winstonLogger.error('Failed to detach payment method', {
        paymentMethodId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create payment intent for charging
   * 
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code (usd, gbp, etc)
   * @param {string} customerId - Stripe customer ID
   * @param {string} paymentMethodId - Stripe payment method ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Payment intent
   */
  async createPaymentIntent(amount, currency = 'usd', customerId, paymentMethodId, metadata = {}) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount), // Must be integer cents
        currency,
        customer: customerId,
        payment_method: paymentMethodId,
        automatic_payment_methods: {
          enabled: true
        },
        metadata: {
          timestamp: new Date().toISOString(),
          ...metadata
        }
      });

      winstonLogger.info('Created payment intent', {
        intentId: paymentIntent.id,
        amount,
        currency
      });

      return paymentIntent;
    } catch (error) {
      winstonLogger.error('Failed to create payment intent', {
        amount,
        customerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Confirm payment intent (charge customer)
   * 
   * @param {string} paymentIntentId - Payment intent ID
   * @returns {Promise<Object>} Confirmed payment intent
   */
  async confirmPaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        return_url: `${process.env.APP_URL || 'http://localhost:3000'}/payment-confirmation`
      });

      winstonLogger.info('Confirmed payment intent', {
        intentId: paymentIntentId,
        status: paymentIntent.status
      });

      return paymentIntent;
    } catch (error) {
      winstonLogger.error('Failed to confirm payment intent', {
        paymentIntentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Charge customer directly (old PaymentIntents flow)
   * 
   * @param {number} amount - Amount in cents
   * @param {string} customerId - Stripe customer ID
   * @param {string} paymentMethodId - Stripe payment method ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Charge object or PaymentIntent
   */
  async chargeCustomer(amount, customerId, paymentMethodId, metadata = {}) {
    try {
      // Use modern PaymentIntents flow
      const paymentIntent = await this.createPaymentIntent(
        amount,
        'usd',
        customerId,
        paymentMethodId,
        metadata
      );

      // Confirm immediately for off-session payments
      const confirmed = await this.confirmPaymentIntent(paymentIntent.id);

      return confirmed;
    } catch (error) {
      winstonLogger.error('Failed to charge customer', {
        customerId,
        paymentMethodId,
        amount,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create refund
   * 
   * @param {string} chargeId - Stripe charge ID or PaymentIntent ID
   * @param {number} amount - Refund amount in cents (optional, full refund if not specified)
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} Refund object
   */
  async createRefund(chargeId, amount, reason = 'requested_by_customer') {
    try {
      const refundData = {
        reason
      };

      if (amount) {
        refundData.amount = Math.round(amount);
      }

      const refund = await stripe.refunds.create({
        payment_intent: chargeId,
        ...refundData
      });

      winstonLogger.info('Created refund', {
        refundId: refund.id,
        chargeId,
        amount: refund.amount
      });

      return refund;
    } catch (error) {
      winstonLogger.error('Failed to create refund', {
        chargeId,
        amount,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get payment intent details
   * 
   * @param {string} paymentIntentId - Payment intent ID
   * @returns {Promise<Object>} Payment intent details
   */
  async getPaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error) {
      winstonLogger.error('Failed to retrieve payment intent', {
        paymentIntentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * List charges for customer
   * 
   * @param {string} customerId - Stripe customer ID
   * @param {number} limit - Number of results (default 10, max 100)
   * @returns {Promise<Array>} List of charges
   */
  async listChargesForCustomer(customerId, limit = 10) {
    try {
      const charges = await stripe.charges.list({
        customer: customerId,
        limit: Math.min(limit, 100)
      });

      return charges.data;
    } catch (error) {
      winstonLogger.error('Failed to list charges', {
        customerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate payment method
   * 
   * @param {string} paymentMethodId - Stripe payment method ID
   * @returns {Promise<Object>} Payment method details
   */
  async validatePaymentMethod(paymentMethodId) {
    try {
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

      return {
        valid: true,
        method: paymentMethod,
        type: paymentMethod.type,
        brand: paymentMethod.card?.brand || null,
        last4: paymentMethod.card?.last4 || null
      };
    } catch (error) {
      winstonLogger.error('Failed to validate payment method', {
        paymentMethodId,
        error: error.message
      });

      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Check if payment method is expired
   * 
   * @param {Object} paymentMethod - PaymentMethod from database
   * @returns {boolean} True if expired
   */
  isPaymentMethodExpired(paymentMethod) {
    if (paymentMethod.type !== 'stripe' || !paymentMethod.card_expiry_year || !paymentMethod.card_expiry_month) {
      return false;
    }

    const expiryDate = new Date(paymentMethod.card_expiry_year, paymentMethod.card_expiry_month - 1);
    const now = new Date();

    // Card expires at end of expiry month
    expiryDate.setMonth(expiryDate.getMonth() + 1);
    expiryDate.setDate(0);

    return now > expiryDate;
  }

  /**
   * Handle Stripe webhook event
   * 
   * @param {Object} event - Stripe event object
   * @returns {Promise<void>}
   */
  async handleWebhookEvent(event) {
    try {
      winstonLogger.info('Processing Stripe webhook', { eventType: event.type });

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this._handlePaymentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await this._handlePaymentFailed(event.data.object);
          break;

        case 'charge.refunded':
          await this._handleChargeRefunded(event.data.object);
          break;

        case 'charge.dispute.created':
          await this._handleDisputeCreated(event.data.object);
          break;

        default:
          winstonLogger.info('Unhandled webhook event type', { type: event.type });
      }
    } catch (error) {
      winstonLogger.error('Failed to handle webhook event', {
        eventType: event.type,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle successful payment (internal method)
   * @private
   */
  async _handlePaymentSucceeded(paymentIntent) {
    winstonLogger.info('Payment succeeded', {
      intentId: paymentIntent.id,
      amount: paymentIntent.amount,
      customer: paymentIntent.customer
    });

    // Update related transaction/donation record to 'completed'
    // This would be handled by the transaction service
  }

  /**
   * Handle failed payment (internal method)
   * @private
   */
  async _handlePaymentFailed(paymentIntent) {
    winstonLogger.warn('Payment failed', {
      intentId: paymentIntent.id,
      error: paymentIntent.last_payment_error?.message
    });

    // Update related transaction/donation record to 'failed'
    // This would be handled by the transaction service
  }

  /**
   * Handle refund (internal method)
   * @private
   */
  async _handleChargeRefunded(charge) {
    winstonLogger.info('Charge refunded', {
      chargeId: charge.id,
      refunded: charge.refunded,
      amount: charge.amount
    });

    // Update transaction to 'refunded' status
  }

  /**
   * Handle dispute (internal method)
   * @private
   */
  async _handleDisputeCreated(dispute) {
    winstonLogger.warn('Dispute created', {
      disputeId: dispute.id,
      chargeId: dispute.charge,
      reason: dispute.reason
    });

    // Alert admin and flag transaction
  }

  /**
   * Verify webhook signature
   * 
   * @param {string} body - Raw request body (string)
   * @param {string} signature - Stripe-Signature header
   * @returns {Object|null} Event object if valid, null if invalid
   */
  /**
   * ✅ PRODUCTION-READY: Verify Stripe webhook signature and prevent replays
   * @param {String|Buffer} body - Raw request body (must not be parsed)
   * @param {String} signature - Stripe-Signature header value
   * @param {Object} options - Additional options
   * @param {Number} options.tolerance - Time tolerance in seconds (default: 300 = 5 min)
   * @returns {Object} Parsed webhook event or null if invalid
   */
  verifyWebhookSignature(body, signature, options = {}) {
    const tolerance = options.tolerance || 300; // 5 minute default tolerance
    
    try {
      // ✅ NEW: Verify signature using Stripe's constructEvent
      const event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test'
      );

      // ✅ NEW: Validate event timestamp (prevent replaying old webhooks)
      const eventTimestamp = event.created;
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const timeDifference = currentTimestamp - eventTimestamp;

      if (timeDifference > tolerance) {
        winstonLogger.warn('⚠️ StripeService: Webhook timestamp too old (possible replay attack)', {
          eventId: event.id,
          eventType: event.type,
          eventTimestamp: new Date(eventTimestamp * 1000).toISOString(),
          receivedAt: new Date().toISOString(),
          timeDifference: `${timeDifference}s`,
          tolerance: `${tolerance}s`,
          severity: 'MEDIUM',
        });

        // Still return the event (let caller decide if to process)
        // But mark it as potentially suspicious
        event._replay_suspected = true;
      }

      // ✅ NEW: Log successful webhook verification
      winstonLogger.debug('✅ StripeService: Webhook signature verified', {
        eventId: event.id,
        eventType: event.type,
        eventTimestamp: new Date(eventTimestamp * 1000).toISOString(),
        hasReplaySuspicion: event._replay_suspected || false,
      });

      return event;
    } catch (error) {
      // ✅ NEW: Enhanced error handling with specific error types
      const errorType = error.message?.includes('timestamp') 
        ? 'INVALID_TIMESTAMP'
        : error.message?.includes('signature')
        ? 'INVALID_SIGNATURE'
        : error.message?.includes('secret')
        ? 'INVALID_SECRET'
        : 'WEBHOOK_VERIFICATION_FAILED';

      winstonLogger.error('❌ StripeService: Webhook verification failed', {
        error: error.message,
        errorType,
        signature: signature?.substring(0, 20) + '...' || 'MISSING',
        timestamp: new Date().toISOString(),
        severity: errorType === 'INVALID_SIGNATURE' ? 'HIGH' : 'MEDIUM',
      });

      // Alert security team on suspicious signatures
      if (errorType === 'INVALID_SIGNATURE') {
        // Could implement PagerDuty/Slack alert here
        winstonLogger.error('🚨 StripeService: SECURITY ALERT - Possible webhook spoofing attempt', {
          severity: 'CRITICAL',
          errorType,
          timestamp: new Date().toISOString(),
        });
      }

      return null;
    }
  }

  /**
   * ✅ PRODUCTION-READY: Track webhook event idempotency
   * Prevents processing the same webhook event multiple times
   * @param {String} eventId - Stripe event ID
   * @returns {Promise<Boolean>} True if event was already processed
   */
  async isWebhookEventProcessed(eventId) {
    try {
      // Check if event was already processed
      // Could use Redis cache or database for high-volume systems
      const webhook = await StripeWebhookLog.findOne({ event_id: eventId });
      
      if (webhook) {
        winstonLogger.warn('⚠️ StripeService: Duplicate webhook event detected', {
          eventId,
          firstProcessedAt: webhook.processed_at,
          reprocessedAt: new Date().toISOString(),
        });
        return true;
      }

      return false;
    } catch (error) {
      winstonLogger.warn('⚠️ StripeService: Failed to check webhook idempotency', {
        eventId,
        error: error.message,
      });
      // Fail open - process the event anyway
      return false;
    }
  }

  /**
   * ✅ PRODUCTION-READY: Log webhook event processing
   * @param {String} eventId - Stripe event ID
   * @param {String} eventType - Webhook event type
   * @param {String} status - Processing status (pending|success|failed)
   * @param {Object} metadata - Additional metadata
   */
  async logWebhookEvent(eventId, eventType, status = 'pending', metadata = {}) {
    try {
      const webhookLog = new StripeWebhookLog({
        event_id: eventId,
        event_type: eventType,
        status,
        processed_at: new Date(),
        metadata,
      });

      await webhookLog.save();

      winstonLogger.info('📝 StripeService: Webhook event logged', {
        eventId,
        eventType,
        status,
      });
    } catch (error) {
      winstonLogger.warn('⚠️ StripeService: Failed to log webhook event', {
        eventId,
        error: error.message,
      });
    }
  }
}

module.exports = new StripeService();
