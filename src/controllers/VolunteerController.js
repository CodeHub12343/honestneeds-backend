const VolunteerProfile = require('../models/VolunteerProfile');
const VolunteerAssignment = require('../models/VolunteerAssignment');
const User = require('../models/User');
const VolunteerService = require('../services/VolunteerService');
const { winstonLogger } = require('../utils/logger');

/**
 * Volunteer Controller
 * Handles volunteer registration, profile management, assignments, and tracking
 */

/**
 * GET /volunteers
 * List all volunteers with optional filtering and sorting
 * Query params: type, minRating, sortBy(rating|hours|recent), skip, limit
 */
exports.listVolunteers = async (req, res) => {
  try {
    const { type, minRating = 0, sortBy = 'rating', skip = 0, limit = 20 } = req.query;

    // Build filter
    const filter = {
      status: 'active',
      deleted_at: null,
      rating: { $gte: minRating },
    };

    if (type) {
      filter.volunteering_type = type;
    }

    // Build sort
    let sortOption = { rating: -1, review_count: -1 };
    if (sortBy === 'hours') {
      sortOption = { total_hours: -1 };
    } else if (sortBy === 'recent') {
      sortOption = { joined_date: -1 };
    }

    const volunteers = await VolunteerProfile.find(filter)
      .sort(sortOption)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    // Remove sensitive fields
    const volunteers_display = volunteers.map((v) => ({
      id: v._id,
      user_id: v.user_id,
      bio: v.bio,
      volunteering_type: v.volunteering_type,
      skills: v.skills,
      total_hours: v.total_hours,
      rating: v.rating,
      review_count: v.review_count,
      badges: v.badges,
      joined_date: v.joined_date,
    }));

    const total = await VolunteerProfile.countDocuments(filter);

    return res.status(200).json({
      success: true,
      volunteers: volunteers_display,
      total,
      skip: parseInt(skip),
      limit: parseInt(limit),
    });
  } catch (error) {
    winstonLogger.error('Error listing volunteers', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to list volunteers',
      statusCode: 500,
    });
  }
};

/**
 * GET /volunteers/:id
 * Get volunteer detail with full profile
 */
exports.getVolunteerDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const volunteer = await VolunteerProfile.findById(id).lean();

    if (!volunteer || volunteer.deleted_at) {
      return res.status(404).json({
        success: false,
        message: 'Volunteer not found',
        statusCode: 404,
      });
    }

    // Get user info
    const user = await User.findById(volunteer.user_id).select('display_name profile_picture email location -password_hash').lean();

    return res.status(200).json({
      success: true,
      volunteer: {
        ...volunteer,
        user: user,
      },
    });
  } catch (error) {
    winstonLogger.error('Error getting volunteer detail', {
      error: error.message,
      volunteerId: req.params.id,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to get volunteer details',
      statusCode: 500,
    });
  }
};

/**
 * POST /volunteers
 * Register new volunteer profile
 * Body: { volunteering_type, bio, skills[], availablity: { days_per_week, hours_per_week } }
 */
exports.registerVolunteer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { volunteering_type, bio, skills = [], availability = {} } = req.body;

    // Validate required fields
    if (!volunteering_type) {
      return res.status(400).json({
        success: false,
        message: 'Volunteering type is required',
        statusCode: 400,
      });
    }

    // Check if volunteer already registered
    const existing = await VolunteerProfile.findByUserId(userId);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'User already registered as volunteer',
        statusCode: 409,
      });
    }

    // Check user is not blocked
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        statusCode: 404,
      });
    }

    if (user.blocked) {
      return res.status(403).json({
        success: false,
        message: 'Blocked users cannot register as volunteers',
        statusCode: 403,
      });
    }

    // Create volunteer profile
    const volunteerProfile = new VolunteerProfile({
      user_id: userId,
      volunteering_type,
      bio,
      skills: skills.slice(0, 10), // Max 10 skills
      availability: {
        days_per_week: availability.days_per_week || 0,
        hours_per_week: availability.hours_per_week || 0,
        flexible_schedule: availability.flexible_schedule !== false,
        preferred_times: availability.preferred_times || [],
      },
    });

    await volunteerProfile.save();

    winstonLogger.info('Volunteer registered', {
      userId,
      volunteering_type,
    });

    return res.status(201).json({
      success: true,
      volunteer: volunteerProfile,
      message: 'Volunteer profile created successfully',
    });
  } catch (error) {
    winstonLogger.error('Error registering volunteer', {
      error: error.message,
      userId: req.user.id,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to register as volunteer',
      statusCode: 500,
    });
  }
};

/**
 * PATCH /volunteers/:id
 * Update volunteer profile
 * Body: { bio, skills, availability, certifications }
 */
exports.updateVolunteerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { bio, skills, availability, certifications } = req.body;

    const volunteer = await VolunteerProfile.findById(id);

    if (!volunteer || volunteer.deleted_at) {
      return res.status(404).json({
        success: false,
        message: 'Volunteer not found',
        statusCode: 404,
      });
    }

    // Verify ownership
    if (volunteer.user_id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this profile',
        statusCode: 403,
      });
    }

    // Update allowed fields
    if (bio !== undefined) volunteer.bio = bio;
    if (skills !== undefined) volunteer.skills = skills.slice(0, 10);
    if (availability !== undefined) {
      volunteer.availability = {
        ...volunteer.availability,
        ...availability,
      };
    }
    if (certifications !== undefined) {
      volunteer.certifications = certifications;
    }

    await volunteer.save();

    winstonLogger.info('Volunteer profile updated', {
      volunteerId: id,
      userId,
    });

    return res.status(200).json({
      success: true,
      volunteer,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    winstonLogger.error('Error updating volunteer profile', {
      error: error.message,
      volunteerId: req.params.id,
      userId: req.user.id,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      statusCode: 500,
    });
  }
};

/**
 * POST /volunteers/requests
 * Request a volunteer assignment from a campaign
 * Body: { volunteer_id, campaign_id, role, expected_hours }
 */
exports.requestAssignment = async (req, res) => {
  try {
    const { volunteer_id, campaign_id, role = 'general', expected_hours = 0 } = req.body;

    // Validate required fields
    if (!volunteer_id || !campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'Volunteer ID and Campaign ID are required',
        statusCode: 400,
      });
    }

    const volunteer = await VolunteerProfile.findById(volunteer_id);

    if (!volunteer || volunteer.deleted_at) {
      return res.status(404).json({
        success: false,
        message: 'Volunteer not found',
        statusCode: 404,
      });
    }

    if (!volunteer.isAvailable()) {
      return res.status(409).json({
        success: false,
        message: 'Volunteer is not currently available',
        statusCode: 409,
      });
    }

    // Create assignment record
    const assignment = {
      campaign_id,
      status: 'assigned',
      hours_logged: expected_hours,
      assigned_date: new Date(),
    };

    await volunteer.addAssignment(assignment);

    winstonLogger.info('Assignment requested', {
      volunteerId: volunteer_id,
      campaignId: campaign_id,
      role,
    });

    return res.status(201).json({
      success: true,
      message: 'Assignment request created',
      assignment,
    });
  } catch (error) {
    winstonLogger.error('Error requesting assignment', {
      error: error.message,
      volunteerId: req.body.volunteer_id,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to request assignment',
      statusCode: 500,
    });
  }
};

/**
 * POST /volunteers/:id/accept
 * Accept a volunteer assignment
 * Body: { assignment_index }
 */
exports.acceptAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { assignment_index = 0 } = req.body;

    const volunteer = await VolunteerProfile.findById(id);

    if (!volunteer || volunteer.deleted_at) {
      return res.status(404).json({
        success: false,
        message: 'Volunteer not found',
        statusCode: 404,
      });
    }

    // Verify ownership
    if (volunteer.user_id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to accept assignments for this volunteer',
        statusCode: 403,
      });
    }

    if (assignment_index < 0 || assignment_index >= volunteer.assignments.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment index',
        statusCode: 400,
      });
    }

    const assignment = volunteer.assignments[assignment_index];

    if (assignment.status !== 'assigned') {
      return res.status(409).json({
        success: false,
        message: `Cannot accept assignment with status: ${assignment.status}`,
        statusCode: 409,
      });
    }

    assignment.status = 'accepted';
    assignment.started_date = new Date();

    await volunteer.save();

    winstonLogger.info('Assignment accepted', {
      volunteerId: id,
      campaignId: assignment.campaign_id,
    });

    return res.status(200).json({
      success: true,
      message: 'Assignment accepted',
      assignment,
    });
  } catch (error) {
    winstonLogger.error('Error accepting assignment', {
      error: error.message,
      volunteerId: req.params.id,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to accept assignment',
      statusCode: 500,
    });
  }
};

/**
 * POST /volunteers/:id/complete
 * Mark assignment as completed with hours logged
 * Body: { assignment_index, hours_completed, notes }
 */
exports.completeTask = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { assignment_index = 0, hours_completed = 0, notes = '' } = req.body;

    if (hours_completed <= 0 || hours_completed > 24) {
      return res.status(400).json({
        success: false,
        message: 'Hours must be between 0 and 24',
        statusCode: 400,
      });
    }

    const volunteer = await VolunteerProfile.findById(id);

    if (!volunteer || volunteer.deleted_at) {
      return res.status(404).json({
        success: false,
        message: 'Volunteer not found',
        statusCode: 404,
      });
    }

    // Verify ownership
    if (volunteer.user_id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to complete tasks for this volunteer',
        statusCode: 403,
      });
    }

    if (assignment_index < 0 || assignment_index >= volunteer.assignments.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment index',
        statusCode: 400,
      });
    }

    const assignment = volunteer.assignments[assignment_index];

    if (assignment.status !== 'accepted' && assignment.status !== 'in_progress') {
      return res.status(409).json({
        success: false,
        message: `Cannot complete assignment with status: ${assignment.status}`,
        statusCode: 409,
      });
    }

    assignment.status = 'completed';
    assignment.hours_logged = hours_completed;
    assignment.completed_date = new Date();

    // Update volunteer stats
    volunteer.total_hours += hours_completed;
    volunteer.total_assignments += 1;

    await volunteer.save();

    winstonLogger.info('Task completed', {
      volunteerId: id,
      hoursLogged: hours_completed,
      campaignId: assignment.campaign_id,
    });

    return res.status(200).json({
      success: true,
      message: 'Task completed successfully',
      assignment,
      volunteer_stats: {
        total_hours: volunteer.total_hours,
        total_assignments: volunteer.total_assignments,
      },
    });
  } catch (error) {
    winstonLogger.error('Error completing task', {
      error: error.message,
      volunteerId: req.params.id,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to complete task',
      statusCode: 500,
    });
  }
};

/**
 * GET /volunteers/:id/hours
 * Get volunteer's hours in a time period
 * Query params: startDate, endDate
 */
exports.getVolunteerHours = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const volunteer = await VolunteerProfile.findById(id).lean();

    if (!volunteer || volunteer.deleted_at) {
      return res.status(404).json({
        success: false,
        message: 'Volunteer not found',
        statusCode: 404,
      });
    }

    // Calculate hours in period
    let hoursInPeriod = volunteer.total_hours; // Default: all-time

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start) || isNaN(end)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format',
          statusCode: 400,
        });
      }

      // Create VolunteerProfile instance to use method
      const volunteerInstance = new VolunteerProfile(volunteer);
      hoursInPeriod = volunteerInstance.getHoursInPeriod(start, end);
    }

    return res.status(200).json({
      success: true,
      volunteer_id: id,
      hours_all_time: volunteer.total_hours,
      hours_in_period: hoursInPeriod,
      total_assignments: volunteer.total_assignments,
      assignments_breakdown: {
        completed: volunteer.assignments.filter((a) => a.status === 'completed').length,
        in_progress: volunteer.assignments.filter((a) => a.status === 'in_progress').length,
        assigned: volunteer.assignments.filter((a) => a.status === 'assigned').length,
      },
    });
  } catch (error) {
    winstonLogger.error('Error getting volunteer hours', {
      error: error.message,
      volunteerId: req.params.id,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to get volunteer hours',
      statusCode: 500,
    });
  }
};

/**
 * GET /volunteers/statistics
 * Get platform-wide volunteer statistics
 */
exports.getVolunteerStatistics = async (req, res) => {
  try {
    const statistics = await VolunteerService.getVolunteerStatistics();

    return res.status(200).json({
      success: true,
      statistics,
    });
  } catch (error) {
    winstonLogger.error('Error getting volunteer statistics', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: {
        code: 'STATISTICS_ERROR',
        message: 'Failed to get volunteer statistics',
      },
      statusCode: 500,
    });
  }
};

/**
 * POST /volunteers/:id/request-assignment
 * Request volunteer assignment from campaign (creator initiates)
 * Body: { title, description, required_skills[], estimated_hours, start_date, deadline }
 */
exports.createAssignmentRequest = async (req, res) => {
  try {
    const { id: volunteerId } = req.params;
    const creatorId = req.user.id;
    const {
      title,
      description,
      required_skills = [],
      estimated_hours,
      start_date,
      deadline,
      campaign_id,
    } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Campaign ID is required',
          details: { campaign_id: 'Campaign ID is required' },
        },
        statusCode: 400,
      });
    }

    const assignment = await VolunteerService.createAssignment({
      volunteer_id: volunteerId,
      campaign_id,
      creator_id: creatorId,
      title,
      description,
      required_skills,
      estimated_hours,
      start_date: new Date(start_date),
      deadline: new Date(deadline),
    });

    return res.status(201).json({
      success: true,
      assignment: {
        id: assignment._id,
        volunteer_id: assignment.volunteer_id,
        campaign_id: assignment.campaign_id,
        title: assignment.title,
        status: assignment.status,
        estimated_hours: assignment.estimated_hours,
        start_date: assignment.start_date,
        deadline: assignment.deadline,
      },
      message: 'Assignment request created successfully',
    });
  } catch (error) {
    winstonLogger.error('Error creating assignment request', {
      error: error.message,
      volunteerId: req.params.id,
      creatorId: req.user.id,
    });

    let statusCode = 500;
    let errorCode = 'ASSIGNMENT_ERROR';
    let message = 'Failed to create assignment request';

    if (error.message.includes('Volunteer not found')) {
      statusCode = 404;
      errorCode = 'VOLUNTEER_NOT_FOUND';
      message = 'Volunteer not found';
    } else if (error.message.includes('not available')) {
      statusCode = 409;
      errorCode = 'VOLUNTEER_UNAVAILABLE';
      message = error.message;
    } else if (error.message.includes('Campaign not found')) {
      statusCode = 404;
      errorCode = 'CAMPAIGN_NOT_FOUND';
      message = 'Campaign not found';
    }

    return res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
      },
      statusCode,
    });
  }
};

/**
 * POST /volunteers/:id/accept
 * Accept volunteer assignment (volunteer accepts)
 * Body: { assignment_id }
 */
exports.acceptAssignmentNew = async (req, res) => {
  try {
    const { id: volunteerId } = req.params;
    const { assignment_id: assignmentId } = req.body;
    const userId = req.user.id;

    // Verify user owns this volunteer profile
    const volunteer = await VolunteerProfile.findById(volunteerId);
    if (!volunteer || volunteer.user_id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to accept assignments for this volunteer',
        },
        statusCode: 403,
      });
    }

    const assignment = await VolunteerService.acceptAssignment(assignmentId, volunteerId);

    return res.status(200).json({
      success: true,
      assignment: {
        id: assignment._id,
        status: assignment.status,
        accepted_at: assignment.timestamps_detailed.accepted_at,
        start_date: assignment.start_date,
        deadline: assignment.deadline,
      },
      message: 'Assignment accepted successfully',
    });
  } catch (error) {
    winstonLogger.error('Error accepting assignment', {
      error: error.message,
      volunteerId: req.params.id,
      assignmentId: req.body.assignment_id,
    });

    let statusCode = 500;
    let errorCode = 'ASSIGNMENT_ERROR';
    let message = 'Failed to accept assignment';

    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'ASSIGNMENT_NOT_FOUND';
      message = 'Assignment not found';
    } else if (error.message.includes('Cannot accept')) {
      statusCode = 409;
      errorCode = 'INVALID_STATUS';
      message = error.message;
    } else if (error.message.includes('Unauthorized')) {
      statusCode = 403;
      errorCode = 'UNAUTHORIZED';
      message = error.message;
    }

    return res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
      },
      statusCode,
    });
  }
};

/**
 * POST /volunteers/:id/complete
 * Complete assignment with hours and notes
 * Body: { assignment_id, hours, notes }
 */
exports.completeTaskNew = async (req, res) => {
  try {
    const { id: volunteerId } = req.params;
    const { assignment_id: assignmentId, hours, notes } = req.body;
    const userId = req.user.id;

    // Verify user owns this volunteer profile
    const volunteer = await VolunteerProfile.findById(volunteerId);
    if (!volunteer || volunteer.user_id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to complete assignments for this volunteer',
        },
        statusCode: 403,
      });
    }

    const assignment = await VolunteerService.completeAssignment(
      assignmentId,
      volunteerId,
      hours,
      notes
    );

    return res.status(200).json({
      success: true,
      assignment: {
        id: assignment._id,
        status: assignment.status,
        actual_hours: assignment.actual_hours,
        completed_at: assignment.timestamps_detailed.completed_at,
      },
      volunteer_stats: {
        total_hours: volunteer.total_hours + hours,
        total_assignments: volunteer.total_assignments + 1,
      },
      message: 'Assignment completed successfully',
    });
  } catch (error) {
    winstonLogger.error('Error completing assignment', {
      error: error.message,
      volunteerId: req.params.id,
      assignmentId: req.body.assignment_id,
    });

    let statusCode = 500;
    let errorCode = 'ASSIGNMENT_ERROR';
    let message = 'Failed to complete assignment';

    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'ASSIGNMENT_NOT_FOUND';
      message = 'Assignment not found';
    } else if (error.message.includes('Cannot complete')) {
      statusCode = 409;
      errorCode = 'INVALID_STATUS';
      message = error.message;
    } else if (error.message.includes('negative')) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = error.message;
    } else if (error.message.includes('Unauthorized')) {
      statusCode = 403;
      errorCode = 'UNAUTHORIZED';
      message = error.message;
    }

    return res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
      },
      statusCode,
    });
  }
};

/**
 * POST /volunteers/:id/review
 * Add review to completed assignment (creator reviews volunteer)
 * Body: { assignment_id, rating, comment }
 */
exports.addAssignmentReview = async (req, res) => {
  try {
    const { id: volunteerId } = req.params;
    const { assignment_id: assignmentId, rating, comment } = req.body;
    const creatorId = req.user.id;

    const assignment = await VolunteerService.addAssignmentReview(
      assignmentId,
      creatorId,
      rating,
      comment
    );

    return res.status(200).json({
      success: true,
      review: {
        assignment_id: assignment._id,
        rating: assignment.review.rating,
        comment: assignment.review.comment,
        reviewed_at: assignment.review.reviewed_at,
      },
      message: 'Review added successfully',
    });
  } catch (error) {
    winstonLogger.error('Error adding review', {
      error: error.message,
      volunteerId: req.params.id,
      assignmentId: req.body.assignment_id,
    });

    let statusCode = 500;
    let errorCode = 'REVIEW_ERROR';
    let message = 'Failed to add review';

    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'ASSIGNMENT_NOT_FOUND';
      message = 'Assignment not found';
    } else if (error.message.includes('Can only review')) {
      statusCode = 409;
      errorCode = 'INVALID_STATUS';
      message = error.message;
    } else if (error.message.includes('Unauthorized')) {
      statusCode = 403;
      errorCode = 'UNAUTHORIZED';
      message = error.message;
    }

    return res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
      },
      statusCode,
    });
  }
};

/**
 * GET /volunteers/:id/hours
 * Get volunteer hours summary for period
 * Query params: period (all|year|month|week)
 */
exports.getVolunteerHoursNew = async (req, res) => {
  try {
    const { id: volunteerId } = req.params;
    const { period = 'all' } = req.query;

    const hoursSummary = await VolunteerService.getVolunteerHours(volunteerId, period);

    return res.status(200).json({
      success: true,
      ...hoursSummary,
    });
  } catch (error) {
    winstonLogger.error('Error getting volunteer hours', {
      error: error.message,
      volunteerId: req.params.id,
    });

    let statusCode = 500;
    let errorCode = 'HOURS_ERROR';
    let message = 'Failed to get volunteer hours';

    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'VOLUNTEER_NOT_FOUND';
      message = 'Volunteer not found';
    }

    return res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
      },
      statusCode,
    });
  }
};
