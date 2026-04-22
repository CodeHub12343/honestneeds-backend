/**
 * Authentication Routes
 * All routes related to user authentication
 */

const express = require('express');
const authController = require('../controllers/authController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * Public Routes (no authentication required)
 */

/**
 * POST /auth/register
 * Register new user account
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePassword123!",
 *   "displayName": "John Doe"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "User registered successfully",
 *   "data": {
 *     "user": { id, email, displayName, role, verified, createdAt },
 *     "accessToken": "...",
 *     "refreshToken": "..."
 *   }
 * }
 */
router.post('/register', authController.register);

/**
 * POST /auth/login
 * Login user with email and password
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePassword123!"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "User logged in successfully",
 *   "data": {
 *     "user": { id, email, displayName, role, verified, lastLogin, loginCount },
 *     "accessToken": "...",
 *     "refreshToken": "..."
 *   }
 * }
 */
router.post('/login', authController.login);

/**
 * POST /auth/check-email
 * Check if email exists (for registration form validation)
 * 
 * Request body:
 * {
 *   "email": "user@example.com"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "exists": false,
 *     "email": "user@example.com"
 *   }
 * }
 */
router.post('/check-email', authController.checkEmailExists);

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 * 
 * Request body:
 * {
 *   "refreshToken": "..."
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Access token refreshed successfully",
 *   "data": {
 *     "accessToken": "..."
 *   }
 * }
 */
router.post('/refresh', authController.refreshAccessToken);

/**
 * POST /auth/request-password-reset
 * Request password reset email
 * Sends email with password reset link to user
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "resetUrl": "https://app.example.com/reset-password"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "If an account exists with this email, a password reset link will be sent"
 * }
 */
router.post('/request-password-reset', authController.requestPasswordReset);

/**
 * GET /auth/verify-reset-token/:token
 * Verify password reset token is valid and not expired
 * Called when user clicks reset link from email
 * 
 * URL params:
 * {
 *   "token": "reset-token-from-email"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Reset token is valid",
 *   "data": {
 *     "valid": true,
 *     "email": "user@example.com",
 *     "expiresAt": "2024-04-06T12:30:45.123Z"
 *   }
 * }
 */
router.get('/verify-reset-token/:token', authController.verifyResetToken);

/**
 * POST /auth/reset-password
 * Reset user password using reset token
 * 
 * Request body:
 * {
 *   "token": "reset-token-from-email",
 *   "password": "NewSecurePassword123!"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Password reset successfully. You can now login with your new password."
 * }
 */
router.post('/reset-password', authController.resetPassword);

/**
 * Protected Routes (authentication required)
 */

/**
 * GET /auth/me
 * Get current user profile
 * Requires: Authorization header with Bearer token
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Current user retrieved successfully",
 *   "data": {
 *     "user": { ...user object }
 *   }
 * }
 */
router.get('/me', authMiddleware, authController.getCurrentUser);

/**
 * PUT /auth/profile
 * Update current user profile
 * Requires: Authorization header with Bearer token
 * 
 * Request body (all fields optional):
 * {
 *   "display_name": "New Name",
 *   "phone": "+1234567890",
 *   "avatar_url": "https://...",
 *   "bio": "User biography",
 *   "location": {
 *     "latitude": 40.7128,
 *     "longitude": -74.0060,
 *     "city": "New York",
 *     "country": "USA"
 *   },
 *   "preferences": {
 *     "email_notifications": true,
 *     "marketing_emails": false,
 *     "newsletter": true
 *   }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Profile updated successfully",
 *   "data": {
 *     "user": { ...updated user object }
 *   }
 * }
 */
router.put('/profile', authMiddleware, authController.updateProfile);

/**
 * POST /auth/change-password
 * Change user password
 * Requires: Authorization header with Bearer token
 * 
 * Request body:
 * {
 *   "currentPassword": "OldPassword123!",
 *   "newPassword": "NewPassword456!"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Password changed successfully"
 * }
 */
router.post('/change-password', authMiddleware, authController.changePassword);

/**
 * DELETE /auth/account
 * Delete user account (soft delete)
 * Requires: Authorization header with Bearer token
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Account deleted successfully"
 * }
 */
router.delete('/account', authMiddleware, authController.deleteAccount);

/**
 * POST /auth/logout
 * Logout user
 * Requires: Authorization header with Bearer token
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Logged out successfully"
 * }
 */
router.post('/logout', optionalAuthMiddleware, authController.logout);

module.exports = router;
