const { logger } = require('../utils/logger');
const volunteerService = require('../services/volunteerService');
const {
  validateCreateVolunteerOffer,
  validateGetCampaignVolunteers,
  validateGetVolunteerOffer,
  validateAcceptVolunteerOffer,
  validateDeclineVolunteerOffer,
  validateCompleteVolunteerOffer,
  validateGetMyOffers,
  validateGetVolunteerMetrics,
  validateAddVolunteerReview,
  validateAddVolunteerFeedback,
} = require('../validators/volunteerValidators');

/**
 * POST /volunteers/offers
 * Create new volunteer offer
 */
exports.createOffer = async (req, res) => {
  try {
    const volunteerId = req.user.id;
    const validation = validateCreateVolunteerOffer(req.body);
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const offer = await volunteerService.createOffer(volunteerId, validation.data.campaignId, validation.data);
    const transformedOffer = volunteerService.transformOfferForAPI(offer);
    
    return res.status(201).json({
      success: true,
      data: transformedOffer,
      message: 'Volunteer offer created successfully',
    });
  } catch (error) {
    logger.error('Error creating volunteer offer', { error: error.message, userId: req.user.id });
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.code || 'ERROR',
      message: error.message,
      statusCode,
    });
  }
};

/**
 * GET /campaigns/:id/volunteer-offers
 * Get volunteer offers for a campaign
 */
exports.getCampaignOffers = async (req, res) => {
  try {
    const validation = validateGetCampaignVolunteers({
      campaignId: req.params.id,
      ...req.query,
    });
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const result = await volunteerService.getCampaignOffers(validation.data.campaignId, validation.data);
    const transformedData = result.data.map(offer => volunteerService.transformOfferForAPI(offer));
    
    return res.status(200).json({
      success: true,
      data: transformedData,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error getting campaign offers', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'ERROR',
      message: error.message,
      statusCode: 500,
    });
  }
};

/**
 * GET /volunteers/offers/:offerId
 * Get volunteer offer detail
 */
exports.getOfferDetail = async (req, res) => {
  try {
    const validation = validateGetVolunteerOffer({ offerId: req.params.offerId });
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const offer = await volunteerService.getOfferDetail(validation.data.offerId);
    const transformedOffer = volunteerService.transformOfferForAPI(offer);
    
    return res.status(200).json({
      success: true,
      data: transformedOffer,
    });
  } catch (error) {
    logger.error('Error getting offer detail', { error: error.message });
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.code || 'ERROR',
      message: error.message,
      statusCode,
    });
  }
};

/**
 * PATCH /volunteers/offers/:offerId/accept
 * Accept volunteer offer
 */
exports.acceptOffer = async (req, res) => {
  try {
    const validation = validateAcceptVolunteerOffer({ offerId: req.params.offerId, ...req.body });
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const offer = await volunteerService.acceptOffer(
      validation.data.offerId,
      req.user.id,
      validation.data.startDate ? new Date(validation.data.startDate) : new Date()
    );
    const transformedOffer = volunteerService.transformOfferForAPI(offer);
    
    return res.status(200).json({
      success: true,
      data: transformedOffer,
      message: 'Volunteer offer accepted successfully',
    });
  } catch (error) {
    logger.error('Error accepting offer', { error: error.message });
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.code || 'ERROR',
      message: error.message,
      statusCode,
    });
  }
};

/**
 * PATCH /volunteers/offers/:offerId/decline
 * Decline volunteer offer
 */
exports.declineOffer = async (req, res) => {
  try {
    const validation = validateDeclineVolunteerOffer({ offerId: req.params.offerId, ...req.body });
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const offer = await volunteerService.declineOffer(
      validation.data.offerId,
      req.user.id,
      validation.data.reason
    );
    const transformedOffer = volunteerService.transformOfferForAPI(offer);
    
    return res.status(200).json({
      success: true,
      data: transformedOffer,
      message: 'Volunteer offer declined successfully',
    });
  } catch (error) {
    logger.error('Error declining offer', { error: error.message });
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.code || 'ERROR',
      message: error.message,
      statusCode,
    });
  }
};

/**
 * PATCH /volunteers/offers/:offerId/complete
 * Complete volunteer offer
 */
exports.completeOffer = async (req, res) => {
  try {
    const validation = validateCompleteVolunteerOffer({ offerId: req.params.offerId, ...req.body });
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const offer = await volunteerService.completeOffer(
      validation.data.offerId,
      req.user.id,
      validation.data.actualHours,
      validation.data.completionNotes
    );
    const transformedOffer = volunteerService.transformOfferForAPI(offer);
    
    return res.status(200).json({
      success: true,
      data: transformedOffer,
      message: 'Volunteer offer completed successfully',
    });
  } catch (error) {
    logger.error('Error completing offer', { error: error.message });
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.code || 'ERROR',
      message: error.message,
      statusCode,
    });
  }
};

/**
 * GET /volunteers/my-offers
 * Get current user's volunteer offers
 */
exports.getMyOffers = async (req, res) => {
  try {
    const validation = validateGetMyOffers(req.query);
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const result = await volunteerService.getMyOffers(req.user.id, validation.data);
    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error getting my offers', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'ERROR',
      message: error.message,
      statusCode: 500,
    });
  }
};

/**
 * GET /campaigns/:id/volunteer-metrics
 * Get volunteer metrics for campaign
 */
exports.getVolunteerMetrics = async (req, res) => {
  try {
    const validation = validateGetVolunteerMetrics({ campaignId: req.params.id });
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const metrics = await volunteerService.getVolunteerMetrics(validation.data.campaignId);
    return res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Error getting volunteer metrics', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'ERROR',
      message: error.message,
      statusCode: 500,
    });
  }
};

/**
 * POST /volunteers/offers/:id/review
 * Add review to completed offer
 */
exports.addReview = async (req, res) => {
  try {
    const validation = validateAddVolunteerReview({ offerId: req.params.id, ...req.body });
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const offer = await volunteerService.addReview(
      validation.data.offerId,
      req.user.id,
      { rating: validation.data.rating, comment: validation.data.comment }
    );
    return res.status(200).json({
      success: true,
      data: offer,
      message: 'Review added successfully',
    });
  } catch (error) {
    logger.error('Error adding review', { error: error.message });
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.code || 'ERROR',
      message: error.message,
      statusCode,
    });
  }
};

/**
 * POST /volunteers/offers/:id/feedback
 * Add feedback to completed offer
 */
exports.addFeedback = async (req, res) => {
  try {
    const validation = validateAddVolunteerFeedback({ offerId: req.params.id, ...req.body });
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const offer = await volunteerService.addFeedback(
      validation.data.offerId,
      req.user.id,
      validation.data
    );
    return res.status(200).json({
      success: true,
      data: offer,
      message: 'Feedback added successfully',
    });
  } catch (error) {
    logger.error('Error adding feedback', { error: error.message });
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.code || 'ERROR',
      message: error.message,
      statusCode,
    });
  }
};

/**
 * GET /volunteers/statistics
 * Get platform volunteer statistics
 */
exports.getPlatformStatistics = async (req, res) => {
  try {
    const stats = await volunteerService.getPlatformStatistics();
    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting platform statistics', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'ERROR',
      message: error.message,
      statusCode: 500,
    });
  }
};
