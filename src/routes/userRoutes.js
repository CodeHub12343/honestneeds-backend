/**
 * User Profile Routes
 * Handles user profile management, settings, and account management
 *
 * Routes:
 * - GET /users/:id - Get user profile (public/private)
 * - PATCH /users/:id - Update user profile (protected)
 * - POST /users/:id/avatar - Upload profile picture (protected, multipart)
 * - GET /users/:id/settings - Get user settings (protected)
 * - PATCH /users/:id/settings - Update user settings (protected)
 * - POST /users/:id/change-password - Change password (protected)
 * - DELETE /users/:id - Delete account (protected)
 */

const express = require('express');
const userController = require('../controllers/userController');
const profileController = require('../controllers/ProfileController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');
const { createUploadMiddleware } = require('../middleware/uploadMiddleware');

const router = express.Router();

// Avatar upload middleware (5MB max, avatars folder)
const avatarUploadMiddleware = createUploadMiddleware({
  folder: 'honestneed/avatars',
  maxFileSize: 5 * 1024 * 1024, // 5MB
});

// ──────────────────────────────────────────────────────────────────────
// Profile system (Level 1-4) — these MUST be declared before the generic
// `/:id` routes below so static segments aren't captured as an :id param.
// ──────────────────────────────────────────────────────────────────────

// Authenticated profile dashboard + setup/editing
router.get('/me/profile', authMiddleware, profileController.getMyDashboard);
router.patch('/me/profile', authMiddleware, profileController.updateMyProfile);
router.get('/me/profile/completion', authMiddleware, profileController.getMyCompletion);
router.get('/me/profile/strength', authMiddleware, profileController.getMyStrength);
router.get('/me/gamification', authMiddleware, profileController.getMyGamification);

// Username availability (auth optional so it works pre-registration and excludes self)
router.get('/username-available', optionalAuthMiddleware, profileController.checkUsername);

// XP leaderboard (public)
router.get('/leaderboard', profileController.getLeaderboard);

// Public profile by id or username (auth optional → richer view for owner)
router.get('/profile/:idOrUsername', optionalAuthMiddleware, profileController.getPublicProfile);

/**
 * GET /users/:id
 * Get user profile information
 * Public endpoint, but returns more info if authenticated as the user
 */
router.get('/:id', userController.getUserProfile);

/**
 * PATCH /users/:id
 * Update user profile information (displayName, phone, bio, location)
 * Protected - user can update own, admin can update any
 */
router.patch('/:id', authMiddleware, userController.updateUserProfile);

/**
 * POST /users/:id/avatar
 * Upload/update profile picture
 * Protected - multipart/form-data with 'avatar' field
 * Accepts: JPEG, PNG, GIF, WebP (max 5MB)
 */
router.post('/:id/avatar', authMiddleware, avatarUploadMiddleware, userController.uploadProfilePicture);

/**
 * GET /users/:id/settings
 * Get user settings/preferences
 * Protected - user can view own, admin can view any
 */
router.get('/:id/settings', authMiddleware, userController.getUserSettings);

/**
 * PATCH /users/:id/settings
 * Update user settings/preferences
 * Protected - user can update own, admin can update any
 */
router.patch('/:id/settings', authMiddleware, userController.updateSettings);

/**
 * POST /users/:id/change-password
 * Change user password
 * Protected - requires current password verification
 */
router.post('/:id/change-password', authMiddleware, userController.changePassword);

/**
 * DELETE /users/:id
 * Delete user account (soft delete)
 * Protected - user can delete own (requires password), admin can delete any
 */
router.delete('/:id', authMiddleware, userController.deleteAccount);

module.exports = router;
