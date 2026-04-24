/**
 * Debug Routes - DEPRECATED
 * These routes are no longer needed since encryption was removed
 * Payment methods are now stored as plain text
 */

const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const { authMiddleware } = require('../middleware/authMiddleware');
const winstonLogger = require('../utils/winstonLogger');

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

/**
 * GET /debug/campaigns/image-urls
 * Diagnostic endpoint to check which campaigns have old vs new image URLs
 * Admin only
 */
router.get('/campaigns/image-urls', authMiddleware, async (req, res) => {
  try {
    // Admin only
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin only endpoint',
      });
    }

    // Find all campaigns with image_url
    const campaigns = await Campaign.find(
      { image_url: { $exists: true, $ne: null } },
      'title image_url image_public_id created_at status'
    )
      .limit(100)
      .lean();

    const analysis = {
      total: campaigns.length,
      cloudinaryUrls: 0,
      localFileUrls: 0,
      campaigns: campaigns.map((c) => {
        const isCloudinary = c.image_url?.includes('cloudinary') || c.image_url?.includes('res.cloudinary');
        const isLocalFile = c.image_url?.includes('/api/uploads/');

        if (isCloudinary) {
          analysis.cloudinaryUrls++;
        }
        if (isLocalFile) {
          analysis.localFileUrls++;
        }

        return {
          id: c._id,
          title: c.title,
          imageUrl: c.image_url?.substring(0, 80) + '...',
          type: isCloudinary ? 'Cloudinary' : isLocalFile ? 'Local File' : 'Other',
          hasPublicId: !!c.image_public_id,
          createdAt: c.created_at,
          status: c.status,
        };
      }),
    };

    winstonLogger.info('📊 Campaign image URL analysis', analysis);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    winstonLogger.error('Debug endpoint error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
