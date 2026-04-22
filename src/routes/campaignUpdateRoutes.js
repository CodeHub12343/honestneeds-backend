/**
 * Campaign Update Routes
 * RESTful API endpoints for campaign progress updates
 * 
 * Routes:
 * - POST /campaigns/:campaignId/updates - Create update
 * - GET /campaigns/:campaignId/updates - List updates
 * - GET /campaigns/:campaignId/updates/:updateId - Get single update
 * - PATCH /campaigns/:campaignId/updates/:updateId - Edit update
 * - DELETE /campaigns/:campaignId/updates/:updateId - Delete update
 * - POST /campaigns/:campaignId/updates/:updateId/engagement - Record engagement
 */

const express = require('express');
const router = express.Router({ mergeParams: true }); // Merge parameters from parent router
const CampaignUpdateController = require('../controllers/campaignUpdateController');
const campaignUpdateValidators = require('../validators/campaignUpdateValidators');
const { authMiddleware } = require('../middleware/authMiddleware');

/**
 * Middleware to handle parameter naming
 * Maps parent router's "id" parameter to "campaignId" for controller compatibility
 */
router.use((req, res, next) => {
  if (req.params.id && !req.params.campaignId) {
    req.params.campaignId = req.params.id;
  }
  next();
});

/**
 * POST /campaigns/:campaignId/updates
 * Create a new campaign update
 * 
 * Params: campaignId (MongoDB _id)
 * Body: { title, content, media_urls?, update_type?, sentiment? }
 * Response: 201 Created with update object
 * Auth: Required (must be campaign creator)
 */
router.post(
  '/',
  authMiddleware,
  async (req, res, next) => {
    // Validate request
    const { error, value } = campaignUpdateValidators.createUpdateSchema.validate(req.body, {
      abortEarly: false,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }

    req.body = value;
    next();
  },
  CampaignUpdateController.createUpdate
);

/**
 * GET /campaigns/:campaignId/updates
 * List campaign updates with pagination
 * 
 * Params: campaignId (MongoDB _id)
 * Query: page?, limit?, sort? ('newest'|'oldest'|'most_viewed'|'most_shared'), type?, status?
 * Response: 200 OK with { updates, pagination }
 * Auth: Not required
 */
router.get(
  '/',
  async (req, res, next) => {
    // Validate query parameters
    const { error, value } = campaignUpdateValidators.listUpdatesQuerySchema.validate(
      req.query,
      { abortEarly: false }
    );

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: error.details.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }

    req.query = value;
    next();
  },
  CampaignUpdateController.listUpdates
);

/**
 * GET /campaigns/:campaignId/updates/:updateId
 * Get single campaign update
 * 
 * Params: campaignId (MongoDB _id), updateId (MongoDB _id)
 * Response: 200 OK with update object
 * Auth: Not required
 */
router.get('/:updateId', CampaignUpdateController.getUpdate);

/**
 * PATCH /campaigns/:campaignId/updates/:updateId
 * Update (edit) campaign update
 * 
 * Params: campaignId (MongoDB _id), updateId (MongoDB _id)
 * Body: Partial update { title?, content?, media_urls?, update_type?, sentiment?, status? }
 * Response: 200 OK with updated update object
 * Auth: Required (must be update creator)
 */
router.patch(
  '/:updateId',
  authMiddleware,
  async (req, res, next) => {
    // Validate request
    const { error, value } = campaignUpdateValidators.updateUpdateSchema.validate(req.body, {
      abortEarly: false,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }

    req.body = value;
    next();
  },
  CampaignUpdateController.updateUpdate
);

/**
 * DELETE /campaigns/:campaignId/updates/:updateId
 * Delete campaign update (soft delete)
 * 
 * Params: campaignId (MongoDB _id), updateId (MongoDB _id)
 * Response: 204 No Content
 * Auth: Required (must be update creator)
 */
router.delete('/:updateId', authMiddleware, CampaignUpdateController.deleteUpdate);

/**
 * POST /campaigns/:campaignId/updates/:updateId/engagement
 * Record user engagement with update (view, share, like, comment)
 * 
 * Params: campaignId (MongoDB _id), updateId (MongoDB _id)
 * Body: { action: 'view'|'share'|'like'|'comment', comment_text? }
 * Response: 200 OK with engagement recorded
 * Auth: Not required
 */
router.post(
  '/:updateId/engagement',
  async (req, res, next) => {
    // Validate request
    const { error, value } = campaignUpdateValidators.interactionSchema.validate(req.body, {
      abortEarly: false,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }

    req.body = value;
    next();
  },
  CampaignUpdateController.recordEngagement
);

module.exports = router;
