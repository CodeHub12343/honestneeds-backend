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
   * Must match frontend BOOST_TIERS in utils/boostValidationSchemas.ts
   * Only two plans are offered: Free ($0) and Pro ($20).
   */
  static BOOST_TIERS = {
    free: {
      tier_name: 'Free Visibility',
      price_cents: 0,
      visibility_weight: 1,
      duration_days: 30,
      features: ['Standard placement', '30-day duration', '1x visibility'],
    },
    pro: {
      tier_name: 'Campaign Boost',
      price_cents: 2000, // $20.00
      visibility_weight: 10,
      duration_days: 30,
      features: ['10x visibility multiplier', '30-day duration', 'Featured placement', 'Priority support', 'Boost analytics'],
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
   * Log a boost purchase lifecycle event.
   * Called by the live webhook handler (StripeWebhookHandler) after a boost is
   * activated. Kept intentionally lightweight and non-throwing: an event-log
   * failure must never break boost activation.
   *
   * @param {string} boostId - CampaignBoost id
   * @param {string} creatorId - Creator user id
   * @param {string} campaignId - Campaign id
   * @param {string} tier - Boost tier
   * @param {string} eventName - Event name (e.g. 'payment_completed')
   */
  static async logBoostPurchaseEvent(boostId, creatorId, campaignId, tier, eventName) {
    winstonLogger.info('Boost purchase event', {
      event: eventName,
      boostId,
      creatorId,
      campaignId,
      tier,
      timestamp: new Date().toISOString(),
    });
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
