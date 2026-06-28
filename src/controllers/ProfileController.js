/**
 * Profile Controller
 *
 * HTTP layer for the multi-level profile system: profile dashboard, profile
 * setup/editing, completion meter, AI-style strength score, public profiles,
 * username availability, and gamification reads.
 */

const ProfileService = require('../services/ProfileService');
const GamificationService = require('../services/GamificationService');
const { validateProfileUpdate } = require('../validators/profileValidators');
const winstonLogger = require('../utils/winstonLogger');

/** Map a service error (with statusCode/code) to next(). */
function forward(next, error) {
  return next(error);
}

/**
 * GET /api/users/me/profile
 * Full profile dashboard for the authenticated user.
 */
exports.getMyDashboard = async (req, res, next) => {
  try {
    const data = await ProfileService.getDashboard(req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    winstonLogger.error('Error building profile dashboard', { userId: req.user?.id, error: error.message });
    forward(next, error);
  }
};

/**
 * PATCH /api/users/me/profile
 * Update profile setup fields (Level 1 + Level 4 + privacy).
 */
exports.updateMyProfile = async (req, res, next) => {
  try {
    const check = validateProfileUpdate(req.body);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: check.error } });
    }
    const data = await ProfileService.updateProfile(req.user.id, req.body);
    res.status(200).json({ success: true, message: 'Profile updated', data });
  } catch (error) {
    winstonLogger.error('Error updating profile', { userId: req.user?.id, error: error.message });
    forward(next, error);
  }
};

/**
 * GET /api/users/me/profile/completion
 * Completion meter + checklist only (lightweight).
 */
exports.getMyCompletion = async (req, res, next) => {
  try {
    const dashboard = await ProfileService.getDashboard(req.user.id);
    res.status(200).json({ success: true, data: dashboard.completion });
  } catch (error) {
    forward(next, error);
  }
};

/**
 * GET /api/users/me/profile/strength
 * AI-style profile strength score + prioritized suggestions.
 */
exports.getMyStrength = async (req, res, next) => {
  try {
    const data = await ProfileService.getProfileStrength(req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    forward(next, error);
  }
};

/**
 * GET /api/users/username-available?username=foo
 */
exports.checkUsername = async (req, res, next) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_USERNAME', message: 'username query param is required' } });
    }
    const excludeId = req.user?.id || null;
    const data = await ProfileService.checkUsername(username, excludeId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    forward(next, error);
  }
};

/**
 * GET /api/users/profile/:idOrUsername
 * Public profile view (respects privacy). Auth optional.
 */
exports.getPublicProfile = async (req, res, next) => {
  try {
    const viewerId = req.user?.id || null;
    const data = await ProfileService.getPublicProfile(req.params.idOrUsername, viewerId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    forward(next, error);
  }
};

/**
 * GET /api/users/me/gamification
 * Level/XP progress + badges for the authenticated user.
 */
exports.getMyGamification = async (req, res, next) => {
  try {
    const data = await GamificationService.getProgress(req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    forward(next, error);
  }
};

/**
 * GET /api/users/leaderboard?limit=20
 * XP leaderboard (public).
 */
exports.getLeaderboard = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const data = await GamificationService.getLeaderboard(limit);
    res.status(200).json({ success: true, data });
  } catch (error) {
    forward(next, error);
  }
};
