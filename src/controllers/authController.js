/**
 * Authentication Controller
 * Handles auth-related HTTP requests
 */

const crypto = require('crypto');
const userService = require('../services/userService');
const { logger } = require('../utils/logger');
const { generateToken } = require('../utils/jwt');
const { hashPassword, verifyPassword } = require('../utils/passwordUtils');
const { sendPasswordResetEmail } = require('../utils/emailService');
const {
  validatePasswordResetRequest,
  validatePasswordReset,
  normalizeEmail,
} = require('../utils/validation');

/**
 * POST /auth/register
 * Register new user
 */
const register = async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;

    logger.info('📝 Register Handler: Processing registration request', {
      email,
      displayName,
      method: req.method,
      path: req.path,
    });

    const result = await userService.register({
      email,
      password,
      displayName,
    });

    logger.info('✅ Register Handler: User registered successfully', {
      userId: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      tokenGenerated: !!result.accessToken,
      tokenLength: result.accessToken ? result.accessToken.length : 0,
      tokenPreview: result.accessToken ? result.accessToken.substring(0, 50) + '...' : 'none',
    });

    logger.debug('📦 Register Handler: Response data being sent', {
      userData: result.user,
      tokenPreview: result.accessToken ? result.accessToken.substring(0, 30) + '...' : 'none',
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: result.user,
        token: result.accessToken,
      },
    });
  } catch (error) {
    logger.error('❌ Register Handler: Registration failed', {
      email: req.body.email,
      errorMessage: error.message,
      errorCode: error.code,
      statusCode: error.statusCode,
    });
    next(error);
  }
};

/**
 * POST /auth/login
 * Login user
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    logger.info('🔐 Login Handler: Processing login request', {
      email,
      method: req.method,
      path: req.path,
    });

    const result = await userService.login({
      email,
      password,
    });

    logger.info('✅ Login Handler: User authenticated successfully', {
      userId: result.user.id,
      email: result.user.email,
      tokenGenerated: !!result.accessToken,
      tokenLength: result.accessToken ? result.accessToken.length : 0,
      tokenPreview: result.accessToken ? result.accessToken.substring(0, 50) + '...' : 'none',
    });

    logger.debug('📦 Login Handler: Response data being sent', {
      userData: result.user,
      tokenPreview: result.accessToken ? result.accessToken.substring(0, 30) + '...' : 'none',
    });

    res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      data: {
        user: result.user,
        token: result.accessToken,
      },
    });
  } catch (error) {
    logger.error('❌ Login Handler: Login failed', {
      email: req.body.email,
      errorMessage: error.message,
      errorCode: error.code,
      statusCode: error.statusCode,
    });
    next(error);
  }
};

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      const error = new Error('Refresh token is required');
      error.statusCode = 400;
      error.code = 'MISSING_REFRESH_TOKEN';
      throw error;
    }

    // Verify refresh token
    const { verifyToken } = require('../utils/jwt');
    const decoded = verifyToken(refreshToken);

    if (decoded.type !== 'refresh') {
      const error = new Error('Invalid token type');
      error.statusCode = 401;
      error.code = 'INVALID_TOKEN_TYPE';
      throw error;
    }

    // Get user to verify they still exist and get their roles
    const userResult = await userService.getUserById(decoded.userId);

    // Generate new access token
    const newAccessToken = generateToken(
      decoded.userId,
      userResult.user.role ? [userResult.user.role] : ['user'],
      '24h'
    );

    logger.info('Access token refreshed', {
      userId: decoded.userId,
    });

    res.status(200).json({
      success: true,
      message: 'Access token refreshed successfully',
      data: {
        accessToken: newAccessToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /auth/me
 * Get current user profile
 */
const getCurrentUser = async (req, res, next) => {
  try {
    if (!req.user) {
      const error = new Error('User not authenticated');
      error.statusCode = 401;
      error.code = 'NOT_AUTHENTICATED';
      throw error;
    }

    const result = await userService.getUserById(req.user.id);

    logger.debug('Get current user endpoint called', {
      userId: req.user.id,
    });

    res.status(200).json({
      success: true,
      message: 'Current user retrieved successfully',
      data: {
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /auth/profile
 * Update user profile
 */
const updateProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      const error = new Error('User not authenticated');
      error.statusCode = 401;
      error.code = 'NOT_AUTHENTICATED';
      throw error;
    }

    const result = await userService.updateProfile(req.user.id, req.body);

    logger.info('User profile updated via endpoint', {
      userId: req.user.id,
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/change-password
 * Change user password
 */
const changePassword = async (req, res, next) => {
  try {
    if (!req.user) {
      const error = new Error('User not authenticated');
      error.statusCode = 401;
      error.code = 'NOT_AUTHENTICATED';
      throw error;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      const error = new Error('Current password and new password are required');
      error.statusCode = 400;
      error.code = 'MISSING_PASSWORD_FIELDS';
      throw error;
    }

    const result = await userService.changePassword(
      req.user.id,
      currentPassword,
      newPassword
    );

    logger.info('User password changed via endpoint', {
      userId: req.user.id,
    });

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /auth/account
 * Delete user account (soft delete)
 */
const deleteAccount = async (req, res, next) => {
  try {
    if (!req.user) {
      const error = new Error('User not authenticated');
      error.statusCode = 401;
      error.code = 'NOT_AUTHENTICATED';
      throw error;
    }

    const result = await userService.deleteAccount(req.user.id);

    logger.info('User account deleted via endpoint', {
      userId: req.user.id,
    });

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/logout
 * Logout user - invalidates tokens and clears session
 * Optionally stores token in blacklist for instant revocation
 */
const logout = async (req, res, next) => {
  try {
    // If user is authenticated, log the logout and optionally blacklist token
    if (req.user) {
      // Get the token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      // Store token in blacklist if present (optional, for instant revocation)
      if (token) {
        const TokenBlacklist = require('../models/TokenBlacklist');
        
        // Extract expiration time from token
        const { verifyToken } = require('../utils/jwt');
        try {
          const decoded = verifyToken(token);
          if (decoded && decoded.exp) {
            // Store token in blacklist with expiration
            await TokenBlacklist.create({
              token: token.substring(0, 50), // Store token hash for privacy
              user_id: req.user.id,
              expires_at: new Date(decoded.exp * 1000),
            });
          }
        } catch (tokenError) {
          // Token parsing error - still allow logout
          logger.warn('Could not extract token details for blacklist', {
            userId: req.user.id,
            error: tokenError.message,
          });
        }
      }

      logger.info('User logged out successfully', {
        userId: req.user.id,
        email: req.user.email,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      data: {
        loggedOut: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/request-password-reset
 * Request password reset email
 * Generates reset token and sends email with reset link
 */
const requestPasswordReset = async (req, res, next) => {
  try {
    // Validate input
    const validation = validatePasswordResetRequest(req.body);
    if (!validation.success) {
      const error = new Error('Validation failed');
      error.statusCode = 400;
      error.code = 'VALIDATION_FAILED';
      error.details = validation.errors;
      throw error;
    }

    const { email, resetUrl } = validation.data;

    // Find user by email
    const User = require('../models/User');
    const user = await User.findOne({ email });

    // For security, don't reveal if user exists
    if (!user) {
      logger.info('Password reset requested for non-existent email', { email });
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a password reset link will be sent',
      });
    }

    // Generate secure random token (32 bytes = 256-bit)
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash token for storage in database
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set expiry to 24 hours from now
    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Save token and expiry to user
    user.password_reset_token = hashedToken;
    user.password_reset_expires = expiryDate;
    await user.save();

    // Send email with reset link
    try {
      await sendPasswordResetEmail(email, resetToken, resetUrl);
    } catch (emailError) {
      // Clear reset token if email fails
      user.password_reset_token = null;
      user.password_reset_expires = null;
      await user.save();

      logger.error('Failed to send password reset email', {
        userId: user._id,
        email,
        error: emailError.message,
      });

      const error = new Error('Failed to send password reset email. Please try again later.');
      error.statusCode = 500;
      error.code = 'EMAIL_SEND_FAILED';
      throw error;
    }

    logger.info('Password reset email sent', {
      userId: user._id,
      email,
    });

    res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email. Link expires in 24 hours.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /auth/verify-reset-token/:token
 * Verify password reset token is valid and not expired
 */
const verifyResetToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token || !token.trim()) {
      const error = new Error('Reset token is required');
      error.statusCode = 400;
      error.code = 'INVALID_INPUT';
      throw error;
    }

    // Hash the provided token to match database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const User = require('../models/User');
    const user = await User.findOne({
      password_reset_token: hashedToken,
      password_reset_expires: { $gt: new Date() },
    });

    if (!user) {
      const error = new Error('Reset token is invalid or expired');
      error.statusCode = 400;
      error.code = 'INVALID_TOKEN';
      throw error;
    }

    logger.info('Password reset token verified', {
      userId: user._id,
      email: user.email,
    });

    res.status(200).json({
      success: true,
      message: 'Reset token is valid',
      data: {
        valid: true,
        email: user.email,
        expiresAt: user.password_reset_expires,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/reset-password
 * Reset user password using reset token
 */
const resetPassword = async (req, res, next) => {
  try {
    // Validate input
    const validation = validatePasswordReset(req.body);
    if (!validation.success) {
      const error = new Error('Validation failed');
      error.statusCode = 400;
      error.code = 'VALIDATION_FAILED';
      error.details = validation.errors;
      throw error;
    }

    const { token, password } = validation.data;

    // Hash the provided token to match database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const User = require('../models/User');
    const user = await User.findOne({
      password_reset_token: hashedToken,
      password_reset_expires: { $gt: new Date() },
    });

    if (!user) {
      const error = new Error('Reset token is invalid or expired. Please request a new password reset.');
      error.statusCode = 400;
      error.code = 'INVALID_TOKEN';
      throw error;
    }

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update user password and clear reset token
    user.password_hash = hashedPassword;
    user.password_reset_token = null;
    user.password_reset_expires = null;
    await user.save();

    logger.info('User password reset successfully', {
      userId: user._id,
      email: user.email,
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/check-email
 * Check if email exists
 * Used by frontend for email availability check during registration
 */
const checkEmailExists = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      const error = new Error('Email is required');
      error.statusCode = 400;
      error.code = 'MISSING_EMAIL';
      throw error;
    }

    const result = await userService.checkEmailExists(email);

    res.status(200).json({
      success: true,
      data: {
        exists: result,
        email: email.toLowerCase(),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshAccessToken,
  getCurrentUser,
  updateProfile,
  changePassword,
  deleteAccount,
  logout,
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
  checkEmailExists,
};
