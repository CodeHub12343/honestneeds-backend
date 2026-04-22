/**
 * Debug Routes - DEPRECATED
 * These routes are no longer needed since encryption was removed
 * Payment methods are now stored as plain text
 */

const express = require('express');
const router = express.Router();

/**
 * Deprecated encryption endpoint - returns 410 Gone
 */
router.put('/fix-campaign-payment-methods/:campaignId', (req, res) => {
  res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Payment methods are now stored as plain text and do not require encryption fixes.',
    note: 'Please recreate or update the campaign with new payment method details.',
  });
});

module.exports = router;
