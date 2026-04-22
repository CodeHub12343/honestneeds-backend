const stripe = require('stripe')(process.env.STRIPE_API_KEY);
const CampaignBoost = require('../models/CampaignBoost');
const Campaign = require('../models/Campaign');
const StripeBoostService = require('../services/StripeBoostService');
const { winstonLogger } = require('../utils/logger');

/**
 * Stripe Webhook Handler for Campaign Boosts
 * Processes payment events from Stripe
 */

class StripeWebhookHandler {
  /**
   * Main webhook handler - processes Stripe events
   */
  async handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      winstonLogger.warn('Stripe webhook secret not configured');
      return res.status(400).json({
        success: false,
        message: 'Webhook secret not configured',
      });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (error) {
      winstonLogger.error('Webhook signature verification failed', {
        error: error.message,
      });

      return res.status(400).json({
        success: false,
        message: `Webhook error: ${error.message}`,
      });
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'charge.succeeded':
        await this.handleChargeSucceeded(event.data.object);
        break;

      case 'charge.failed':
        await this.handleChargeFailed(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;

      default:
        winstonLogger.debug('Unhandled event type', { type: event.type });
    }

    // Acknowledge receipt of webhook
    return res.json({ received: true });
  }

  /**
   * Handle successful checkout session
   */
  async handleCheckoutSessionCompleted(session) {
    try {
      winstonLogger.info('Processing checkout.session.completed webhook', {
        sessionId: session.id,
        paymentStatus: session.payment_status,
      });

      // Extract metadata
      const metadata = session.metadata || {};
      const { campaign_id, creator_id, tier } = metadata;

      if (!campaign_id || !creator_id) {
        winstonLogger.warn('Missing metadata in checkout session', {
          sessionId: session.id,
          metadata,
        });
        return;
      }

      // Only process if payment was successful
      if (session.payment_status !== 'paid') {
        winstonLogger.warn('Checkout session payment not completed', {
          sessionId: session.id,
          paymentStatus: session.payment_status,
        });
        return;
      }

      // Get tier data
      const tierData = StripeBoostService.BOOST_TIERS[tier];
      if (!tierData) {
        winstonLogger.error('Invalid boost tier in session', {
          sessionId: session.id,
          tier,
        });
        return;
      }

      // Check if boost already exists (idempotency)
      const existingBoost = await CampaignBoost.findOne({
        stripe_session_id: session.id,
      });

      if (existingBoost) {
        winstonLogger.info('Boost already processed for this session', {
          sessionId: session.id,
          boostId: existingBoost._id,
        });
        return;
      }

      // Calculate end date
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + tierData.duration_days);

      // Create boost record
      const boost = new CampaignBoost({
        campaign_id: campaign_id,
        creator_id: creator_id,
        tier: tier,
        visibility_weight: tierData.visibility_weight,
        price_cents: tierData.price_cents,
        duration_days: tierData.duration_days,
        start_date: startDate,
        end_date: endDate,
        payment_status: 'completed',
        stripe_session_id: session.id,
        stripe_customer_id: session.customer,
        is_active: true,
      });

      await boost.save();

      winstonLogger.info('Boost created from webhook', {
        boostId: boost._id,
        campaignId: campaign_id,
        tier,
        amount: tierData.price_cents,
      });

      // Update campaign with boost tier and active status
      await Campaign.findByIdAndUpdate(campaign_id, {
        last_boost_date: new Date(),
        current_boost_tier: tier,
        is_boosted: true,
      });

      winstonLogger.info('Campaign updated with boost activation', {
        campaignId: campaign_id,
        boostTier: tier,
        boostExpiresAt: endDate,
      });

      // Log success event
      await StripeBoostService.logBoostPurchaseEvent(
        boost._id,
        creator_id,
        campaign_id,
        tier,
        'payment_completed'
      );
    } catch (error) {
      winstonLogger.error('Error handling checkout.session.completed webhook', {
        error: error.message,
        sessionId: session.id,
      });
    }
  }

  /**
   * Handle successful charge
   */
  async handleChargeSucceeded(charge) {
    try {
      winstonLogger.debug('Processing charge.succeeded webhook', {
        chargeId: charge.id,
        amount: charge.amount,
        currency: charge.currency,
      });

      // Update boost payment record if associated
      if (charge.metadata && charge.metadata.boost_id) {
        await CampaignBoost.findByIdAndUpdate(charge.metadata.boost_id, {
          stripe_charge_id: charge.id,
          payment_status: 'completed',
        });

        winstonLogger.info('Boost payment confirmed', {
          boostId: charge.metadata.boost_id,
          chargeId: charge.id,
        });
      }
    } catch (error) {
      winstonLogger.error('Error handling charge.succeeded webhook', {
        error: error.message,
        chargeId: charge.id,
      });
    }
  }

  /**
   * Handle failed charge
   */
  async handleChargeFailed(charge) {
    try {
      winstonLogger.warn('Processing charge.failed webhook', {
        chargeId: charge.id,
        failureCode: charge.failure_code,
        failureMessage: charge.failure_message,
      });

      // Mark boost as failed if associated
      if (charge.metadata && charge.metadata.boost_id) {
        await CampaignBoost.findByIdAndUpdate(charge.metadata.boost_id, {
          payment_status: 'failed',
          stripe_charge_id: charge.id,
          payment_error_message: charge.failure_message,
        });

        winstonLogger.warn('Boost payment failed', {
          boostId: charge.metadata.boost_id,
          chargeId: charge.id,
          reason: charge.failure_message,
        });
      }
    } catch (error) {
      winstonLogger.error('Error handling charge.failed webhook', {
        error: error.message,
        chargeId: charge.id,
      });
    }
  }

  /**
   * Handle subscription deleted (recurring/renewal failure)
   */
  async handleSubscriptionDeleted(subscription) {
    try {
      winstonLogger.warn('Processing customer.subscription.deleted webhook', {
        subscriptionId: subscription.id,
      });

      // Find and deactivate associated boost
      if (subscription.metadata && subscription.metadata.boost_id) {
        await CampaignBoost.findByIdAndUpdate(subscription.metadata.boost_id, {
          is_active: false,
          renewal_failed: true,
        });

        winstonLogger.info('Boost subscription cancelled', {
          boostId: subscription.metadata.boost_id,
          subscriptionId: subscription.id,
        });
      }
    } catch (error) {
      winstonLogger.error('Error handling subscription.deleted webhook', {
        error: error.message,
        subscriptionId: subscription.id,
      });
    }
  }
}

module.exports = new StripeWebhookHandler();
