// Validate Stripe secret key
if (!process.env.STRIPE_API_KEY) {
  console.error('ERROR: STRIPE_API_KEY environment variable is not set');
  process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_API_KEY);
const CampaignBoost = require('../models/CampaignBoost');
const { winstonLogger } = require('../utils/logger');

/**
 * Stripe Payment Service for Campaign Boosts
 * Handles all Stripe operations for boost payments
 */

class StripeBoostService {
  /**
   * Define boost tiers with pricing and visibility weights
   * Must match frontend BOOST_TIERS in honestneed-frontend/utils/boostValidationSchemas.ts
   */
  static BOOST_TIERS = {
    free: {
      tier_name: 'Free Visibility',
      price_cents: 0,
      visibility_weight: 1,
      duration_days: 30,
      features: ['Basic visibility', '30-day duration', 'Limited support'],
    },
    basic: {
      tier_name: 'Basic Boost',
      price_cents: 999, // $9.99
      visibility_weight: 5,
      duration_days: 30,
      features: ['5x visibility multiplier', '30-day duration', 'Email support', 'Basic analytics'],
    },
    pro: {
      tier_name: 'Pro Boost',
      price_cents: 2499, // $24.99
      visibility_weight: 15,
      duration_days: 30,
      features: ['15x visibility multiplier', '30-day duration', 'Priority support', 'Advanced analytics', 'Trending badge'],
    },
    premium: {
      tier_name: 'Premium Boost',
      price_cents: 9999, // $99.99
      visibility_weight: 50,
      duration_days: 30,
      features: ['50x visibility multiplier', '30-day duration', '24/7 priority support', 'Full analytics suite', 'Priority badge', 'Featured placement'],
    },
  };

  /**
   * Create Stripe Checkout Session for boost purchase
   *
   * @param {string} campaignId - Campaign ID
   * @param {string} creatorId - Creator user ID
   * @param {string} tier - Boost tier (free, basic, pro, premium)
   * @param {string} baseUrl - Base URL for redirects
   * @param {string} creatorEmail - Creator email address for Stripe
   * @returns {Object} Session data with checkout URL
   */
  static async createCheckoutSession(campaignId, creatorId, tier, baseUrl, creatorEmail) {
    try {
      const tierData = this.BOOST_TIERS[tier];

      if (!tierData) {
        throw new Error(`Invalid boost tier: ${tier}`);
      }

      // Free tier doesn't need Stripe
      if (tier === 'free') {
        return {
          tier,
          isFree: true,
          message: 'Free boost created successfully',
        };
      }

      // Existing Stripe Session for this campaign/tier
      const existingBoost = await CampaignBoost.findOne({
        campaign_id: campaignId,
        tier: tier,
        payment_status: 'pending',
      });

      if (existingBoost) {
        return {
          checkout_session_id: existingBoost.stripe_session_id,
          checkout_url: `${baseUrl}/checkout/${existingBoost.stripe_session_id}`,
        };
      }

      // Create line item
      const lineItems = [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: tierData.tier_name,
              description: `Get ${tierData.visibility_weight}x visibility for your campaign for ${tierData.duration_days} days`,
              metadata: {
                campaign_id: campaignId,
                tier: tier,
              },
            },
            unit_amount: tierData.price_cents,
          },
          quantity: 1,
        },
      ];

      // Create Stripe session
      // Create Stripe session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${baseUrl}/campaigns/${campaignId}?boost_status=success`,
        cancel_url: `${baseUrl}/campaigns/${campaignId}?boost_status=cancelled`,
        customer_email: creatorEmail, // Use actual email address for customer
        metadata: {
          campaign_id: campaignId,
          creator_id: creatorId,
          tier: tier,
          type: 'campaign_boost',
        },
      });

      winstonLogger.info('Stripe checkout session created', {
        sessionId: session.id,
        campaignId,
        tier,
        amount: tierData.price_cents,
      });

      return {
        checkout_session_id: session.id,
        checkout_url: session.url,
        tier,
      };
    } catch (error) {
      console.error('[StripeBoostService] Error in createCheckoutSession:', {
        message: error?.message,
        type: error?.type,
        code: error?.code,
        param: error?.param,
        statusCode: error?.statusCode,
        fullError: JSON.stringify(error, null, 2),
      });

      winstonLogger.error('Error creating checkout session in StripeBoostService', {
        message: error?.message,
        stack: error?.stack,
        campaignId,
        tier,
        errorType: error?.type,
        errorCode: error?.code,
        statusCode: error?.statusCode,
        param: error?.param,
      });
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events for boost payments
   *
   * @param {Object} event - Stripe event object
   * @returns {Object} Processing result
   */
  static async handleWebhookEvent(event) {
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          return await this.handleCheckoutCompleted(event.data.object);

        case 'payment_intent.succeeded':
          return await this.handlePaymentSucceeded(event.data.object);

        case 'payment_intent.payment_failed':
          return await this.handlePaymentFailed(event.data.object);

        case 'charge.refunded':
          return await this.handleRefund(event.data.object);

        default:
          winstonLogger.info('Unhandled webhook event', { eventType: event.type });
          return { success: true, message: 'Event noted but not processed' };
      }
    } catch (error) {
      winstonLogger.error('Error handling webhook event', {
        error: error.message,
        stack: error.stack,
        eventType: event.type,
      });
      throw error;
    }
  }

  /**
   * Process successful checkout
   *
   * @param {Object} session - Stripe session object
   * @returns {Object} Result
   */
  static async handleCheckoutCompleted(session) {
    try {
      const { campaign_id, creator_id, tier } = session.metadata;

      if (!campaign_id || !tier) {
        throw new Error('Missing metadata in session');
      }

      const tierData = this.BOOST_TIERS[tier];
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + tierData.duration_days);

      // Create or update boost record
      let boost = await CampaignBoost.findOne({
        campaign_id,
        stripe_session_id: session.id,
      });

      if (!boost) {
        boost = new CampaignBoost({
          campaign_id,
          creator_id,
          tier,
          visibility_weight: tierData.visibility_weight,
          price_cents: tierData.price_cents,
          duration_days: tierData.duration_days,
          end_date: endDate,
          stripe_payment_id: session.payment_intent,
          stripe_session_id: session.id,
          stripe_customer_id: session.customer,
          payment_status: 'completed',
          is_active: true,
        });
      } else {
        boost.payment_status = 'completed';
        boost.is_active = true;
        boost.stripe_payment_id = session.payment_intent;
      }

      await boost.save();

      winstonLogger.info('Boost payment completed', {
        boostId: boost._id,
        campaignId: campaign_id,
        tier,
        amount: tierData.price_cents,
      });

      return {
        success: true,
        boost_id: boost._id,
        message: 'Boost activated successfully',
      };
    } catch (error) {
      winstonLogger.error('Error handling checkout completion', {
        error: error.message,
        stack: error.stack,
        errorType: error.type,
      });
      throw error;
    }
  }

  /**
   * Process successful payment
   *
   * @param {Object} paymentIntent - Stripe payment intent
   * @returns {Object} Result
   */
  static async handlePaymentSucceeded(paymentIntent) {
    try {
      const sessionId = paymentIntent.metadata?.stripe_session_id;

      if (sessionId) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        return await this.handleCheckoutCompleted(session);
      }

      return { success: true, message: 'Payment succeeded' };
    } catch (error) {
      winstonLogger.error('Error handling payment success', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process failed payment
   *
   * @param {Object} paymentIntent - Stripe payment intent
   * @returns {Object} Result
   */
  static async handlePaymentFailed(paymentIntent) {
    try {
      const { campaign_id } = paymentIntent.metadata || {};

      if (campaign_id) {
        await CampaignBoost.updateOne(
          {
            campaign_id,
            stripe_payment_id: paymentIntent.id,
          },
          {
            payment_status: 'failed',
            is_active: false,
          }
        );

        winstonLogger.warn('Boost payment failed', {
          campaignId: campaign_id,
          paymentIntentId: paymentIntent.id,
        });
      }

      return { success: true, message: 'Payment failure recorded' };
    } catch (error) {
      winstonLogger.error('Error handling payment failure', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process refund
   *
   * @param {Object} charge - Stripe charge object
   * @returns {Object} Result
   */
  static async handleRefund(charge) {
    try {
      const boost = await CampaignBoost.findOne({
        stripe_payment_id: charge.payment_intent,
      });

      if (boost) {
        boost.is_active = false;
        boost.payment_status = 'cancelled';
        boost.cancelled_at = new Date();
        boost.cancellation_reason = 'refunded';
        await boost.save();

        winstonLogger.info('Boost refunded and deactivated', {
          boostId: boost._id,
          campaignId: boost.campaign_id,
        });
      }

      return { success: true, message: 'Refund processed' };
    } catch (error) {
      winstonLogger.error('Error handling refund', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Retrieve boost session status
   *
   * @param {string} sessionId - Stripe session ID
   * @returns {Object} Session status
   */
  static async getSessionStatus(sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return {
        payment_status: session.payment_status,
        customer_email: session.customer_email,
        amount_total: session.amount_total,
        created: new Date(session.created * 1000),
      };
    } catch (error) {
      winstonLogger.error('Error retrieving session status', {
        error: error.message,
        sessionId,
      });
      throw error;
    }
  }

  /**
   * Create payment intent for manual payment method
   *
   * @param {number} amountCents - Amount in cents
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Payment intent
   */
  static async createPaymentIntent(amountCents, metadata = {}) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        payment_method_types: ['card'],
        metadata: {
          type: 'campaign_boost',
          ...metadata,
        },
      });

      return {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
      };
    } catch (error) {
      winstonLogger.error('Error creating payment intent', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * List boost tier options
   *
   * @returns {Array} Available boost tiers
   */
  static getBoostTiers() {
    return Object.entries(this.BOOST_TIERS).map(([key, value]) => ({
      id: key,
      name: value.tier_name,
      price: value.price_cents / 100,
      visibility_multiplier: value.visibility_weight,
      duration_days: value.duration_days,
      features: value.features,
    }));
  }
}

module.exports = StripeBoostService;
