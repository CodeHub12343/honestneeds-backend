/**
 * Stripe Webhook Routes
 * 
 * Handles Stripe webhook events:
 * - Payment succeeded/failed
 * - Charges refunded
 * - Disputes created
 * 
 * PCI Compliance:
 * ✅ Raw body required for signature verification
 * ✅ No sensitive card data in logs
 */

const express = require('express');
const router = express.Router();
const StripeService = require('../services/StripeService');
const PaymentProcessingService = require('../services/PaymentProcessingService');
const StripeWebhookHandler = require('../webhooks/StripeWebhookHandler');
const { winstonLogger } = require('../utils/logger');

/**
 * POST /webhooks/stripe
 * 
 * Stripe sends webhook events to this endpoint
 * Must use raw body for signature verification (don't use bodyParser.json())
 * 
 * Handled Events:
 * - payment_intent.succeeded
 * - payment_intent.payment_failed
 * - charge.refunded
 * - charge.dispute.created
 * 
 * @param {Object} req.body - Raw request body (string)
 * @param {string} req.headers['stripe-signature'] - Signature for verification
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      winstonLogger.warn('Webhook received without signature');
      return res.status(400).json({
        success: false,
        error: 'Missing stripe-signature header'
      });
    }

    // Verify webhook signature
    const event = StripeService.verifyWebhookSignature(req.body, signature);

    if (!event) {
      winstonLogger.warn('Invalid webhook signature');
      return res.status(400).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    winstonLogger.info('Received Stripe webhook', {
      eventType: event.type,
      eventId: event.id
    });

    // Process based on event type
    switch (event.type) {
      case 'checkout.session.completed':
        // Handle campaign boost purchases
        // StripeWebhookHandler sends its own response
        await StripeWebhookHandler.handleWebhook(req, res);
        return; // Don't send another response below
      case 'payment_intent.succeeded':
        await PaymentProcessingService.handlePaymentIntentWebhook(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await PaymentProcessingService.handlePaymentIntentWebhook(event.data.object);
        break;

      case 'charge.refunded':
        winstonLogger.info('Charge refunded', {
          chargeId: event.data.object.id,
          refunded: event.data.object.refunded
        });
        // Handle refund if needed
        break;

      case 'charge.dispute.created':
        winstonLogger.warn('Charge dispute created', {
          disputeId: event.data.object.id,
          chargeId: event.data.object.charge,
          reason: event.data.object.reason
        });
        // Alert admin, flag transaction
        break;

      default:
        winstonLogger.info('Unhandled webhook event type', {
          eventType: event.type,
          eventId: event.id
        });
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({
      received: true,
      eventId: event.id
    });
  } catch (error) {
    winstonLogger.error('Webhook processing error', {
      error: error.message,
      stack: error.stack
    });

    // Return 500 so Stripe retries
    res.status(500).json({
      error: 'Webhook processing failed'
    });
  }
});

/**
 * POST /webhooks/test
 * 
 * Test endpoint for development
 * Manually trigger webhook event handling
 * 
 * Body: {
 *   "type": "payment_intent.succeeded",
 *   "data": {
 *     "object": {
 *       "id": "pi_test123",
 *       "status": "succeeded",
 *       "amount": 50000,
 *       "customer": "cus_test123",
 *       "metadata": {
 *         "donationId": "507f...",
 *         "type": "donation"
 *       }
 *     }
 *   }
 * }
 */
router.post('/test', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Test webhook not available in production'
      });
    }

    const event = req.body;

    winstonLogger.info('Test webhook received', {
      eventType: event.type
    });

    // Process event
    if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      await PaymentProcessingService.handlePaymentIntentWebhook(event.data.object);
    }

    res.status(200).json({
      received: true,
      eventType: event.type
    });
  } catch (error) {
    winstonLogger.error('Test webhook error', {
      error: error.message
    });

    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;
