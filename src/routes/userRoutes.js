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
const { authMiddleware } = require('../middleware/authMiddleware');
const { uploadMiddleware } = require('../middleware/uploadMiddleware');

const router = express.Router();

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
router.post('/:id/avatar', authMiddleware, uploadMiddleware.single('avatar'), userController.uploadProfilePicture);

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
