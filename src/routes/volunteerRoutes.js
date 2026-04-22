/**
 * Volunteer Routes
 * API endpoints for volunteer management, assignments, and tracking
 *
 * VOLUNTEER OFFER ROUTES (New Peer-to-Peer Help System):
 * POST   /offers                              - Create volunteer offer
 * GET    /my-offers                           - Get current user's volunteer offers
 * GET    /offers/:offerId                     - Get volunteer offer detail
 * PATCH  /offers/:offerId/accept              - Accept volunteer offer (creator)
 * PATCH  /offers/:offerId/decline             - Decline volunteer offer (creator)
 * PATCH  /offers/:offerId/complete            - Complete volunteer offer (creator)
 * GET    /statistics                         - Volunteer statistics and platform metrics
 *
 * NOTE: Campaign-specific routes are in campaignRoutes.js:
 * GET    /campaigns/:id/volunteer-offers     - Get offers for campaign
 * GET    /campaigns/:id/volunteer-metrics    - Get volunteer metrics for campaign
 *
 * VOLUNTEER PROFILE ROUTES (Legacy Assignment System):
 * GET    /                        - List all volunteers with filtering
 * POST   /                        - Register new volunteer profile
 * GET    /:id                     - Get volunteer detail
 * PATCH  /:id                     - Update volunteer profile
 * POST   /:id/request-assignment  - Request assignment for a volunteer (creator initiates)
 * POST   /:id/accept              - Accept volunteer assignment
 * POST   /:id/complete            - Mark task as completed
 * GET    /:id/hours               - Get volunteer hours tracking
 * POST   /:id/review              - Add review to completed assignment
 */

const router = require('express').Router();
const volunteerController = require('../controllers/VolunteerController');
const volunteerOfferController = require('../controllers/VolunteerOfferController');
const { authMiddleware } = require('../middleware/authMiddleware');

/**
 * ===========================
 * STATISTICS ROUTE (must come before specific param routes)
 * ===========================
 */

/**
 * @route   GET /statistics
 * @desc    Get platform-wide volunteer statistics (covers both profiles and offers)
 * @access  Public
 * @returns {Object} { success, data: statistics }
 * @example
 * GET /api/volunteers/statistics
 * Response (200): {
 *   "success": true,
 *   "data": {
 *     "totalOffers": 156,
 *     "acceptedOffers": 98,
 *     "pendingOffers": 45,
 *     "completedOffers": 13,
 *     "averageHoursPerWeek": 12.5,
 *     "topSkillsNeeded": [
 *       { "skill": "construction", "demandCount": 23 }
 *     ]
 *   }
 * }
 */
router.get('/statistics', volunteerOfferController.getPlatformStatistics);

/**
 * ===========================
 * VOLUNTEER OFFER ROUTES (my-offers must come before param routes)
 * ===========================
 */

/**
 * @route   GET /my-offers
 * @desc    Get current volunteer's offers
 * @access  Private (authenticated users)
 * @query   {Number} page - Page number (1-based), default: 1
 * @query   {Number} limit - Items per page, default: 25
 * @query   {String} status - Filter by status (pending|accepted|declined|completed)
 * @returns {Object} { success, data: volunteeroffer[], pagination: {...} }
 * @example
 * GET /api/volunteers/my-offers?page=1&limit=10&status=pending
 * Response (200): {
 *   "success": true,
 *   "data": [{...}],
 *   "pagination": { "page": 1, "limit": 10, "total": 5 }
 * }
 */
router.get('/my-offers', authMiddleware, volunteerOfferController.getMyOffers);

/**
 * @route   POST /offers
 * @desc    Create a new volunteer offer
 * @access  Private (authenticated users)
 * @body    {String} campaignId - Campaign ID, required
 * @body    {String} title - Offer title (5-200 chars), required
 * @body    {String} description - What they're offering to do (10-2000 chars), required
 * @body    {Array} skillsOffered - Skills offered (optional)
 * @body    {Object} availability - { startDate, endDate, hoursPerWeek }, required
 * @body    {String} contactMethod - 'email' | 'phone' | 'inApp', required
 * @body    {String} screenshotProof - Optional proof of volunteer experience
 * @returns {Object} { success, data: volunteeroffer, message }
 * @error   404 - Campaign not found
 * @error   409 - Already submitted offer for this campaign
 * @example
 * POST /api/volunteers/offers
 * {
 *   "campaignId": "camp_123",
 *   "title": "Construction Help",
 *   "description": "I can help with building repairs and construction work",
 *   "skillsOffered": [{ "name": "carpentry" }, { "name": "engineering" }],
 *   "availability": {
 *     "startDate": "2026-04-15T00:00:00Z",
 *     "endDate": "2026-05-15T00:00:00Z",
 *     "hoursPerWeek": 20
 *   },
 *   "contactMethod": "email"
 * }
 * Response (201): {
 *   "success": true,
 *   "data": { _id: "offer_456", volunteer_id: "user_789", status: "pending", ... },
 *   "message": "Volunteer offer created successfully"
 * }
 */
router.post('/offers', authMiddleware, volunteerOfferController.createOffer);

/**
 * @route   GET /offers/:offerId
 * @desc    Get volunteer offer details
 * @access  Public
 * @param   {String} offerId - Volunteer offer ID
 * @returns {Object} { success, data: volunteeroffer }
 * @error   404 - Offer not found
 * @example
 * GET /api/volunteers/offers/offer_456
 * Response (200): {
 *   "success": true,
 *   "data": {
 *     "_id": "offer_456",
 *     "volunteer_id": "user_789",
 *     "volunteerName": "Sarah",
 *     "volunteerEmail": "sarah@example.com",
 *     "campaign_id": "camp_123",
 *     "campaignTitle": "Emergency Shelter",
 *     "title": "Construction Help",
 *     "description": "I can help with building repairs",
 *     "skillsOffered": [{ "name": "carpentry" }],
 *     "availability": { "startDate": "2026-04-15", "endDate": "2026-05-15", "hoursPerWeek": 20 },
 *     "status": "pending",
 *     "createdAt": "2026-04-07T10:00:00Z"
 *   }
 * }
 */
router.get('/offers/:offerId', volunteerOfferController.getOfferDetail);

/**
 * @route   PATCH /offers/:offerId/accept
 * @desc    Accept volunteer offer (creator accepts)
 * @access  Private (authenticated - campaign creator only)
 * @param   {String} offerId - Volunteer offer ID
 * @body    {String} notes - Optional notes for the volunteer
 * @returns {Object} { success, data: volunteeroffer, message }
 * @error   403 - Not authorized to accept
 * @error   404 - Offer not found
 * @error   409 - Invalid offer status
 * @example
 * PATCH /api/volunteers/offers/offer_456/accept
 * {
 *   "notes": "Great! We'd love your help with the construction. Start date is Monday, April 15th."
 * }
 * Response (200): {
 *   "success": true,
 *   "data": { ..., "status": "accepted", "acceptedAt": "2026-04-07T11:00:00Z" },
 *   "message": "Volunteer offer accepted successfully"
 * }
 */
router.patch('/offers/:offerId/accept', authMiddleware, volunteerOfferController.acceptOffer);

/**
 * @route   PATCH /offers/:offerId/decline
 * @desc    Decline volunteer offer (creator declines)
 * @access  Private (authenticated - campaign creator only)
 * @param   {String} offerId - Volunteer offer ID
 * @body    {String} declineReason - Reason for declining (required)
 * @body    {String} notes - Optional feedback for the volunteer
 * @returns {Object} { success, data: volunteeroffer, message }
 * @error   403 - Not authorized to decline
 * @error   404 - Offer not found
 * @error   400 - Missing decline reason
 * @example
 * PATCH /api/volunteers/offers/offer_456/decline
 * {
 *   "declineReason": "We've already secured enough volunteer help",
 *   "notes": "Thanks for your interest! We'll reach out if we need more help in the future."
 * }
 * Response (200): {
 *   "success": true,
 *   "data": { ..., "status": "declined", "declineReason": "..." },
 *   "message": "Volunteer offer declined successfully"
 * }
 */
router.patch('/offers/:offerId/decline', authMiddleware, volunteerOfferController.declineOffer);

/**
 * @route   PATCH /offers/:offerId/complete
 * @desc    Mark volunteer offer as completed
 * @access  Private (authenticated - campaign creator only)
 * @param   {String} offerId - Volunteer offer ID
 * @body    {Number} actualHours - Actual hours worked (optional)
 * @body    {String} completionNotes - Notes about volunteer work (optional)
 * @returns {Object} { success, data: volunteeroffer, message }
 * @error   403 - Not authorized to complete
 * @error   404 - Offer not found
 * @error   409 - Offer not in accepted status
 * @example
 * PATCH /api/volunteers/offers/offer_456/complete
 * {
 *   "actualHours": 18.5,
 *   "completionNotes": "Sarah completed all construction tasks on schedule and did excellent work!"
 * }
 * Response (200): {
 *   "success": true,
 *   "data": { ..., "status": "completed", "actual_hours_completed": 18.5 },
 *   "message": "Volunteer offer completed successfully"
 * }
 */
router.patch('/offers/:offerId/complete', authMiddleware, volunteerOfferController.completeOffer);

/**
 * @route   POST /
 * @desc    Register new volunteer profile (auth required)
 * @access  Private
 * @body    {String} volunteering_type - 'community_support' | 'fundraising_help' | 'direct_assistance'
 * @body    {String} bio - Self-introduction (max 500 chars), optional
 * @body    {String[]} skills - Array of skills (max 10), optional
 * @body    {Object} availability - { days_per_week, hours_per_week, flexible_schedule, preferred_times }, optional
 * @body    {Object[]} certifications - Professional certifications with name, issuer, dates, optional
 * @returns {Object} { success, volunteer, message }
 * @error   409 - User already registered as volunteer
 * @error   403 - Blocked users cannot register
 * @example
 * POST /api/volunteers
 * {
 *   "volunteering_type": "community_support",
 *   "bio": "Experienced teacher interested in helping underprivileged",
 *   "skills": ["teaching", "mentoring", "english"],
 *   "availability": {
 *     "days_per_week": 3,
 *     "hours_per_week": 12,
 *     "flexible_schedule": true,
 *     "preferred_times": ["weekend", "evening"]
 *   }
 * }
 * Response (201): {
 *   "success": true,
 *   "volunteer": {
 *     "_id": "volunteer_123",
 *     "user_id": "user_456",
 *     "volunteering_type": "community_support",
 *     "status": "active",
 *     "total_hours": 0,
 *     "rating": 0
 *   },
 *   "message": "Volunteer profile created successfully"
 * }
 */
router.post('/', authMiddleware, volunteerController.registerVolunteer);

/**
 * @route   GET /:id
 * @desc    Get volunteer profile details with user information
 * @access  Public
 * @param   {String} id - Volunteer profile ID
 * @returns {Object} { success, volunteer: { ...profile, user: {...} } }
 * @error   404 - Volunteer not found
 * @example
 * GET /api/volunteers/volunteer_123
 * Response (200): {
 *   "success": true,
 *   "volunteer": {
 *     "_id": "volunteer_123",
 *     "user_id": "user_456",
 *     "bio": "...",
 *     "skills": ["teaching", "mentoring"],
 *     "total_hours": 120,
 *     "rating": 4.8,
 *     "user": {
 *       "display_name": "John Doe",
 *       "email": "john@example.com",
 *       "profile_picture": "url..."
 *     }
 *   }
 * }
 */
router.get('/:id', volunteerController.getVolunteerDetail);

/**
 * @route   PATCH /:id
 * @desc    Update volunteer profile (bio, skills, availability, certifications)
 * @access  Private (volunteer owner only)
 * @param   {String} id - Volunteer profile ID
 * @body    {String} bio - Updated bio, optional
 * @body    {String[]} skills - Updated skills array, optional
 * @body    {Object} availability - Updated availability, optional
 * @body    {Object[]} certifications - Updated certifications, optional
 * @returns {Object} { success, volunteer, message }
 * @error   403 - Not authorized to update this profile
 * @error   404 - Volunteer not found
 * @example
 * PATCH /api/volunteers/volunteer_123
 * {
 *   "skills": ["teaching", "mentoring", "public_speaking"],
 *   "availability": {
 *     "hours_per_week": 15
 *   }
 * }
 * Response (200): {
 *   "success": true,
 *   "volunteer": { ... },
 *   "message": "Profile updated successfully"
 * }
 */
router.patch('/:id', authMiddleware, volunteerController.updateVolunteerProfile);

/**
 * @route   POST /:id/request-assignment
 * @desc    Create assignment request for a volunteer (creator initiates)
 * @access  Private (creator/campaign owner)
 * @param   {String} id - Volunteer profile ID
 * @body    {String} campaign_id - Campaign ID, required
 * @body    {String} title - Assignment title (5-200 chars), required
 * @body    {String} description - Assignment description (10-2000 chars), required
 * @body    {String[]} required_skills - Skills needed (max 10), optional
 * @body    {Number} estimated_hours - Expected time (0.5-200), required
 * @body    {Date} start_date - Assignment start date, required
 * @body    {Date} deadline - Task completion deadline, required
 * @returns {Object} { success, assignment, message }
 * @error   404 - Volunteer or campaign not found
 * @error   409 - Volunteer not available
 * @example
 * POST /api/volunteers/volunteer_123/request-assignment
 * {
 *   "campaign_id": "campaign_456",
 *   "title": "Social Media Marketing Coordinator",
 *   "description": "Help promote the campaign on social media platforms",
 *   "required_skills": ["social_media", "marketing"],
 *   "estimated_hours": 20,
 *   "start_date": "2026-04-15",
 *   "deadline": "2026-04-30"
 * }
 * Response (201): {
 *   "success": true,
 *   "assignment": {
 *     "id": "assign_789",
 *     "status": "requested",
 *     "estimated_hours": 20
 *   },
 *   "message": "Assignment request created successfully"
 * }
 */
router.post('/:id/request-assignment', authMiddleware, volunteerController.createAssignmentRequest);

/**
 * @route   POST /:id/accept
 * @desc    Accept volunteer assignment (volunteer accepts)
 * @access  Private (volunteer owner only)
 * @param   {String} id - Volunteer profile ID
 * @body    {String} assignment_id - Assignment ID to accept, required
 * @returns {Object} { success, assignment, message }
 * @error   403 - Not authorized to accept
 * @error   404 - Assignment not found
 * @error   409 - Cannot accept (invalid status)
 * @example
 * POST /api/volunteers/volunteer_123/accept
 * {
 *   "assignment_id": "assign_789"
 * }
 * Response (200): {
 *   "success": true,
 *   "assignment": {
 *     "id": "assign_789",
 *     "status": "accepted",
 *     "accepted_at": "2026-04-10T10:30:00Z"
 *   },
 *   "message": "Assignment accepted successfully"
 * }
 */
router.post('/:id/accept', authMiddleware, volunteerController.acceptAssignmentNew);

/**
 * @route   POST /:id/complete
 * @desc    Mark assignment as completed with hours logged
 * @access  Private (volunteer owner only)
 * @param   {String} id - Volunteer profile ID
 * @body    {String} assignment_id - Assignment ID to complete, required
 * @body    {Number} hours - Hours worked (0-300), required
 * @body    {String} notes - Completion notes (max 1000 chars), optional
 * @returns {Object} { success, assignment, volunteer_stats, message }
 * @error   403 - Not authorized
 * @error   404 - Assignment not found
 * @error   409 - Cannot complete (invalid status)
 * @example
 * POST /api/volunteers/volunteer_123/complete
 * {
 *   "assignment_id": "assign_789",
 *   "hours": 18.5,
 *   "notes": "Successfully posted 15 times across platforms with great engagement"
 * }
 * Response (200): {
 *   "success": true,
 *   "assignment": {
 *     "id": "assign_789",
 *     "status": "completed",
 *     "actual_hours": 18.5
 *   },
 *   "volunteer_stats": {
 *     "total_hours": 156,
 *     "total_assignments": 8
 *   },
 *   "message": "Assignment completed successfully"
 * }
 */
router.post('/:id/complete', authMiddleware, volunteerController.completeTaskNew);

/**
 * @route   GET /:id/hours
 * @desc    Get volunteer hours summary and breakdown by campaign
 * @access  Private (volunteer owner and admins)
 * @param   {String} id - Volunteer profile ID
 * @query   {String} period - 'all' (default) | 'year' | 'month' | 'week'
 * @returns {Object} { volunteer_id, total_hours, hours_in_period, breakdown[], ... }
 * @error   404 - Volunteer not found
 * @example
 * GET /api/volunteers/volunteer_123/hours?period=month
 * Response (200): {
 *   "volunteer_id": "volunteer_123",
 *   "total_hours": 156,
 *   "hours_in_period": 42,
 *   "period": "month",
 *   "completed_assignments": 8,
 *   "average_hours_per_assignment": "19.5",
 *   "on_time_rate": "87.50%",
 *   "breakdown": [
 *     {
 *       "campaign_id": "camp_456",
 *       "hours": 42,
 *       "assignments": 2
 *     }
 *   ]
 * }
 */
router.get('/:id/hours', authMiddleware, volunteerController.getVolunteerHoursNew);

/**
 * @route   POST /:id/review
 * @desc    Add review to completed assignment (creator reviews volunteer work)
 * @access  Private (assignment creator only)
 * @param   {String} id - Volunteer profile ID
 * @body    {String} assignment_id - Completed assignment ID, required
 * @body    {Number} rating - Rating (1-5), required
 * @body    {String} comment - Review comment (max 500 chars), optional
 * @returns {Object} { success, review, message }
 * @error   403 - Not authorized (not creator)
 * @error   404 - Assignment not found
 * @error   409 - Cannot review (not completed)
 * @example
 * POST /api/volunteers/volunteer_123/review
 * {
 *   "assignment_id": "assign_789",
 *   "rating": 5,
 *   "comment": "Excellent work! Very professional and delivered ahead of schedule."
 * }
 * Response (200): {
 *   "success": true,
 *   "review": {
 *     "assignment_id": "assign_789",
 *     "rating": 5,
 *     "comment": "Excellent work!...",
 *     "reviewed_at": "2026-04-25T14:20:00Z"
 *   },
 *   "message": "Review added successfully"
 * }
 */
router.post('/:id/review', authMiddleware, volunteerController.addAssignmentReview);

/**
 * ===========================
 * VOLUNTEER PROFILE ROUTES (legacy system)
 * ===========================
 * Supporting existing volunteer profile management
 */

/**
 * @route   GET /
 * @desc    List all volunteers with optional filtering and sorting
 * @access  Public
 * @query   type - volunteer type filter (community_support|fundraising_help|direct_assistance)
 * @query   minRating - minimum rating filter (0-5), default: 0
 * @query   sortBy - 'rating' | 'hours' | 'recent' (default: 'rating')
 * @query   skip - pagination offset (default: 0)
 * @query   limit - results per page (default: 20)
 * @returns {Object} { success, volunteers[], total, skip, limit }
 * @example
 * GET /api/volunteers?type=community_support&minRating=4&limit=10
 * Response: {
 *   "success": true,
 *   "volunteers": [{...}],
 *   "total": 45
 * }
 */
router.get('/', volunteerController.listVolunteers);

module.exports = router;
