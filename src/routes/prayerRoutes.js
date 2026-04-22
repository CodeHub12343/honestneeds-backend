const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const PrayerService = require('../services/PrayerService');
const Prayer = require('../models/Prayer');
const Campaign = require('../models/Campaign');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');
const rbac = require('../middleware/rbac');
const winstonLogger = require('../utils/winstonLogger');
const cloudinaryService = require('../utils/cloudinaryService');
const {
  validatePrayerSubmission,
  validatePrayerApproval,
  validatePrayerReport,
} = require('../validators/prayerValidators');

// Configure multer for prayer media files (audio/video)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for audio/video
  },
  fileFilter: (req, file, cb) => {
    // Accept audio, video, and image files
    const allowedMimes = [
      'audio/mpeg',
      'audio/wav',
      'audio/webm',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/ogg',
      'audio/flac',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ];

    // Allow files from audio_file or video_file fields (bypass MIME check)
    const isAudioField = file.fieldname === 'audio_file';
    const isVideoField = file.fieldname === 'video_file';

    if (isAudioField || isVideoField || allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`), false);
    }
  },
});

/**
 * @route GET /campaigns/:campaignId/prayer-request
 * @desc Get campaign prayer request settings (public)
 * @access Public
 */
router.get('/campaigns/:campaignId/prayer-request', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await Campaign.findById(campaignId)
      .select('prayer_config prayer_metrics')
      .lean();

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    if (!campaign.prayer_config?.enabled) {
      return res.status(404).json({
        success: false,
        error: 'Prayer support not enabled for this campaign',
      });
    }

    res.json({
      success: true,
      data: {
        ...campaign.prayer_config,
        metrics: {
          total_prayers: campaign.prayer_metrics?.total_prayers || 0,
          prayers_today: campaign.prayer_metrics?.prayers_today || 0,
          progress_percentage: Math.min(
            Math.round(
              ((campaign.prayer_metrics?.total_prayers || 0) /
                (campaign.prayer_config?.prayer_goal || 100)) *
                100
            ),
            100
          ),
        },
      },
    });
  } catch (error) {
    winstonLogger.error(`Prayer request fetch error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch prayer request',
    });
  }
});

/**
 * @route GET /campaigns/:campaignId/prayers/metrics
 * @desc Get campaign prayer metrics
 * @access Public
 */
router.get('/campaigns/:campaignId/prayers/metrics', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const metrics = await PrayerService.getCampaignPrayerMetrics(campaignId);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    winstonLogger.error(`Prayer metrics error: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to fetch prayer metrics',
    });
  }
});

/**
 * @route GET /campaigns/:campaignId/prayers
 * @desc Get paginated campaign prayers
 * @access Public (only approved/public prayers) or Creator (all prayers)
 */
router.get('/campaigns/:campaignId/prayers', optionalAuthMiddleware, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // Verify campaign exists
    const campaign = await Campaign.findById(campaignId).select('creator_id').lean();
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    // Creator can see all prayers for their campaign
    const isCreator = req.user && campaign.creator_id.toString() === req.user.id;

    const result = await PrayerService.getCampaignPrayers(campaignId, {
      limit: Math.min(parseInt(limit) || 20, 100),
      offset: parseInt(offset) || 0,
      includePrivate: isCreator,
    });

    res.json({
      success: true,
      data: result.prayers,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    winstonLogger.error(`Get prayers error: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to fetch prayers',
    });
  }
});

/**
 * @route POST /campaigns/:campaignId/prayers
 * @desc Submit a new prayer
 * @access Public (with optional auth)
 */
router.post(
  '/campaigns/:campaignId/prayers',
  optionalAuthMiddleware,
  upload.fields([
    { name: 'audio_file', maxCount: 1 },
    { name: 'video_file', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { campaignId } = req.params;
      const supporterId = req.user?.id || null;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent') || '';

      // Parse form data
      let prayerData = {
        type: req.body.type,
        is_anonymous: req.body.is_anonymous === 'true' || req.body.is_anonymous === true,
      };

      if (req.body.type === 'text') {
        prayerData.content = req.body.content;
      }

      // Validate prayer data
      try {
        prayerData = validatePrayerSubmission(prayerData);
      } catch (validationError) {
        return res.status(422).json({
          success: false,
          error: 'Validation failed',
          details: validationError.errors,
        });
      }

      // Handle audio/video upload
      const audioFile = req.files?.audio_file?.[0];
      const videoFile = req.files?.video_file?.[0];
      const file = audioFile || videoFile;

      if (file) {
        const prayerId = new mongoose.Types.ObjectId().toString();

        try {
          if (req.body.type === 'voice' && audioFile) {
            console.log('🙏 [Prayer Routes] Uploading audio to Cloudinary...');
            const audioResult = await cloudinaryService.uploadAudio(
              audioFile.buffer,
              campaignId,
              prayerId
            );
            prayerData.audio_url = audioResult.url;
            prayerData.audio_duration_seconds = audioResult.duration || parseInt(req.body.audio_duration_seconds) || 30;
            prayerData.cloudinary_public_id = audioResult.publicId;
            console.log('✅ [Prayer Routes] Audio uploaded successfully:', { url: audioResult.url });
          } else if (req.body.type === 'video' && videoFile) {
            console.log('🙏 [Prayer Routes] Uploading video to Cloudinary...');
            const videoResult = await cloudinaryService.uploadVideo(
              videoFile.buffer,
              campaignId,
              prayerId
            );
            prayerData.video_url = videoResult.url;
            prayerData.video_thumbnail_url = videoResult.thumbnailUrl;
            prayerData.video_duration_seconds = videoResult.duration || parseInt(req.body.video_duration_seconds) || 30;
            prayerData.cloudinary_public_id = videoResult.publicId;
            console.log('✅ [Prayer Routes] Video uploaded successfully:', { url: videoResult.url });
          }
        } catch (uploadError) {
          console.error('❌ [Prayer Routes] Media upload failed:', uploadError.message);
          return res.status(400).json({
            success: false,
            error: 'Failed to upload media file. Please try again.',
            details: uploadError.message,
          });
        }
      }

      // Create prayer
      const prayer = await PrayerService.createPrayer(
        campaignId,
        supporterId,
        prayerData,
        ipAddress,
        userAgent
      );

      res.status(201).json({
        success: true,
        data: prayer,
        message: 'Your prayer has been submitted successfully! 💌',
      });
    } catch (error) {
      winstonLogger.error(`Prayer submission error: ${error.message}`);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to submit prayer',
      });
    }
  }
);

/**
 * @route GET /campaigns/:campaignId/prayers/moderation-queue
 * @desc Get prayers pending moderation for campaign
 * @access Creator, Admin
 */
router.get(
  '/campaigns/:campaignId/prayers/moderation-queue',
  authMiddleware,
  async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { status = 'submitted', limit = 20, offset = 0 } = req.query;

      const result = await PrayerService.getCreatorModerationQueue(
        campaignId,
        req.user.id,
        {
          status,
          limit: Math.min(parseInt(limit) || 20, 100),
          offset: parseInt(offset) || 0,
        }
      );

      res.json({
        success: true,
        data: result.prayers,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
      });
    } catch (error) {
      winstonLogger.error(`Moderation queue error: ${error.message}`);
      res.status(error.message.includes('Unauthorized') ? 403 : 400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * @route PUT /prayers/:prayerId/approve
 * @desc Approve a prayer
 * @access Creator, Admin
 */
router.put('/prayers/:prayerId/approve', authMiddleware, async (req, res) => {
  try {
    const { prayerId } = req.params;

    const prayer = await PrayerService.approvePrayer(prayerId, req.user.id);

    res.json({
      success: true,
      data: prayer,
      message: 'Prayer approved successfully ✅',
    });
  } catch (error) {
    winstonLogger.error(`Prayer approval error: ${error.message}`);
    res.status(error.message.includes('Unauthorized') ? 403 : 400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route PUT /prayers/:prayerId/reject
 * @desc Reject a prayer
 * @access Creator, Admin
 */
router.put('/prayers/:prayerId/reject', authMiddleware, async (req, res) => {
  try {
    const { prayerId } = req.params;
    const { reason } = req.body;

    const prayer = await PrayerService.rejectPrayer(prayerId, req.user.id, reason);

    res.json({
      success: true,
      data: prayer,
      message: 'Prayer rejected successfully ❌',
    });
  } catch (error) {
    winstonLogger.error(`Prayer rejection error: ${error.message}`);
    res.status(error.message.includes('Unauthorized') ? 403 : 400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /prayers/:prayerId/report
 * @desc Report a prayer for moderation
 * @access Public (optional auth)
 */
router.post('/prayers/:prayerId/report', optionalAuthMiddleware, async (req, res) => {
  try {
    const { prayerId } = req.params;
    const { reason, details } = req.body;
    const reporterUserId = req.user?.id || null;

    // Validate report
    try {
      validatePrayerReport({ reason, details });
    } catch (validationError) {
      return res.status(422).json({
        success: false,
        error: 'Validation failed',
        details: validationError.errors,
      });
    }

    const prayer = await PrayerService.reportPrayer(
      prayerId,
      reporterUserId,
      reason,
      details
    );

    res.json({
      success: true,
      data: prayer,
      message: 'Thank you for reporting. Our team will review this prayer.',
    });
  } catch (error) {
    winstonLogger.error(`Prayer report error: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route DELETE /prayers/:prayerId
 * @desc Delete (soft delete) a prayer
 * @access Prayer creator, Campaign creator
 */
router.delete('/prayers/:prayerId', authMiddleware, async (req, res) => {
  try {
    const { prayerId } = req.params;

    const prayer = await PrayerService.softDeletePrayer(prayerId, req.user.id);

    res.json({
      success: true,
      data: prayer,
      message: 'Prayer deleted successfully',
    });
  } catch (error) {
    winstonLogger.error(`Prayer deletion error: ${error.message}`);
    res.status(error.message.includes('Unauthorized') ? 403 : 400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /campaigns/:campaignId/prayers/analytics
 * @desc Get detailed prayer analytics for campaign
 * @access Creator only
 */
router.get(
  '/campaigns/:campaignId/prayers/analytics',
  authMiddleware,
  async (req, res) => {
    try {
      const { campaignId } = req.params;

      // Verify campaign ownership
      const campaign = await Campaign.findById(campaignId)
        .select('creator_id')
        .lean();

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
        });
      }

      if (campaign.creator_id.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      // Get comprehensive metrics
      const metrics = await PrayerService.getCampaignPrayerMetrics(campaignId);

      // Get moderation stats
      const moderationQueue = await PrayerService.getCreatorModerationQueue(
        campaignId,
        req.user.id,
        { limit: 1 }
      );

      const flaggedPrayers = await Prayer.countDocuments({
        campaign_id: new mongoose.Types.ObjectId(campaignId),
        status: 'flagged',
        is_deleted: false,
      });

      const rejectedPrayers = await Prayer.countDocuments({
        campaign_id: new mongoose.Types.ObjectId(campaignId),
        status: 'rejected',
        is_deleted: false,
      });

      res.json({
        success: true,
        data: {
          ...metrics,
          moderation_stats: {
            pending_approval: moderationQueue.total,
            flagged: flaggedPrayers,
            rejected: rejectedPrayers,
          },
        },
      });
    } catch (error) {
      winstonLogger.error(`Prayer analytics error: ${error.message}`);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * @route GET /admin/prayers/moderation-dashboard
 * @desc Get global prayer moderation queue
 * @access Admin only
 */
router.get(
  '/admin/prayers/moderation-dashboard',
  authMiddleware,
  rbac.requireAdmin,
  async (req, res) => {
    try {
      const { status = 'flagged', limit = 20, offset = 0 } = req.query;

      const result = await PrayerService.getAdminModerationQueue({
        status,
        limit: Math.min(parseInt(limit) || 20, 100),
        offset: parseInt(offset) || 0,
      });

      res.json({
        success: true,
        data: result.prayers,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
      });
    } catch (error) {
      winstonLogger.error(`Admin moderation dashboard error: ${error.message}`);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * @route PUT /admin/prayers/:prayerId/status
 * @desc Update prayer status (admin only)
 * @access Admin only
 */
router.put(
  '/admin/prayers/:prayerId/status',
  authMiddleware,
  rbac.requireAdmin,
  async (req, res) => {
    try {
      const { prayerId } = req.params;
      const { status, reason } = req.body;

      const prayer = await Prayer.findOne({ prayer_id: prayerId });
      if (!prayer) {
        return res.status(404).json({
          success: false,
          error: 'Prayer not found',
        });
      }

      if (status === 'approved') {
        prayer.status = 'approved';
        prayer.visibility = 'public';
        prayer.approved_at = new Date();
      } else if (status === 'rejected') {
        prayer.status = 'rejected';
        prayer.visibility = 'private';
      } else if (status === 'flagged') {
        prayer.status = 'flagged';
      }

      await prayer.save();

      winstonLogger.info(`Admin updated prayer status: ${prayerId} -> ${status}`);

      res.json({
        success: true,
        data: prayer.toObject(),
        message: `Prayer status updated to ${status}`,
      });
    } catch (error) {
      winstonLogger.error(`Admin prayer status update error: ${error.message}`);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

module.exports = router;
