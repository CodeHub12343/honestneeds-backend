/**
 * User Service
 * Handles user registration, login, and profile management
 */

const User = require('../models/User');
const { logger } = require('../utils/logger');
const { generateToken, generateRefreshToken } = require('../utils/jwt');
const { hashPassword } = require('../utils/passwordUtils');
const { validateRegistration, validateLogin, normalizeEmail } = require('../utils/validation');

/**
 * Register new user
 * @param {object} userData - User registration data
 * @param {string} userData.email - User email
 * @param {string} userData.password - Plain text password
 * @param {string} userData.displayName - Display name
 * @returns {Promise<object>} User object with tokens
 * @throws {Error} If registration fails
 */
const register = async (userData) => {
  try {
    // Validate input
    const validation = validateRegistration(userData);

    if (!validation.success) {
      const error = new Error('Validation failed');
      error.statusCode = 422;
      error.code = 'VALIDATION_ERROR';
      error.details = validation.errors;
      throw error;
    }

    const { email, password, displayName } = validation.data;

    // Check if user already exists
    const existingUser = await User.findOne({
      email,
      deleted_at: null,
    });

    if (existingUser) {
      logger.warn('Registration attempt with existing email', { email });

      const error = new Error('A user with this email already exists');
      error.statusCode = 409;
      error.code = 'EMAIL_EXISTS';
      throw error;
    }

    // Create new user
    const newUser = new User({
      email,
      password_hash: password, // Will be hashed in pre-save hook
      display_name: displayName,
      role: 'creator', // Default role - users can create campaigns by default
      verified: true, // Temporarily disabled email verification - set to true for immediate access
    });

    // Save user (password will be hashed automatically)
    await newUser.save();

    logger.info('User registered successfully', {
      userId: newUser._id,
      email,
    });

    // Generate tokens
    const accessToken = generateToken(
      newUser._id.toString(),
      [newUser.role],
      '24h'
    );

    const refreshToken = generateRefreshToken(newUser._id.toString());

    // Return user with tokens (excluding sensitive fields)
    return {
      success: true,
      user: {
        id: newUser._id,
        email: newUser.email,
        displayName: newUser.display_name,
        role: newUser.role,
        verified: newUser.verified,
        createdAt: newUser.created_at,
      },
      accessToken,
      refreshToken,
    };
  } catch (error) {
    logger.error('User registration failed:', {
      message: error.message,
      code: error.code,
    });

    throw error;
  }
};

/**
 * Login user
 * @param {object} credentials - Login credentials
 * @param {string} credentials.email - User email
 * @param {string} credentials.password - Plain text password
 * @returns {Promise<object>} User object with tokens
 * @throws {Error} If login fails
 */
const login = async (credentials) => {
  try {
    // Validate input
    const validation = validateLogin(credentials);

    if (!validation.success) {
      const error = new Error('Validation failed');
      error.statusCode = 422;
      error.code = 'VALIDATION_ERROR';
      error.details = validation.errors;
      throw error;
    }

    const { email, password } = validation.data;

    // Find user by email
    const user = await User.findOne({
      email,
      deleted_at: null,
    });

    if (!user) {
      logger.warn('Login attempt with non-existent email', { email });

      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      logger.warn('Login attempt with invalid password', {
        userId: user._id,
        email,
      });

      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Update last login
    await user.updateLastLogin();

    logger.info('User logged in successfully', {
      userId: user._id,
      email,
    });

    // Generate tokens
    const accessToken = generateToken(
      user._id.toString(),
      [user.role],
      '24h'
    );

    const refreshToken = generateRefreshToken(user._id.toString());

    // Return user with tokens
    return {
      success: true,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        verified: user.verified,
        lastLogin: user.last_login,
        loginCount: user.login_count,
      },
      accessToken,
      refreshToken,
    };
  } catch (error) {
    logger.error('User login failed:', {
      message: error.message,
      code: error.code,
    });

    throw error;
  }
};

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<object>} User object
 * @throws {Error} If user not found
 */
const getUserById = async (userId) => {
  try {
    const user = await User.findOne({
      _id: userId,
      deleted_at: null,
    });

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    return {
      success: true,
      user: user.toJSON(),
    };
  } catch (error) {
    logger.error('Get user failed:', {
      userId,
      message: error.message,
    });

    throw error;
  }
};

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated user object
 * @throws {Error} If update fails
 */
const updateProfile = async (userId, updates) => {
  try {
    // White-list allowed update fields
    const allowedFields = [
      'display_name',
      'phone',
      'avatar_url',
      'bio',
      'location',
      'preferences',
    ];

    const filteredUpdates = {};
    Object.keys(updates).forEach((key) => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    const user = await User.findByIdAndUpdate(
      userId,
      filteredUpdates,
      { new: true, runValidators: true }
    );

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    logger.info('User profile updated', {
      userId,
      updatedFields: Object.keys(filteredUpdates),
    });

    return {
      success: true,
      user: user.toJSON(),
    };
  } catch (error) {
    logger.error('Update profile failed:', {
      userId,
      message: error.message,
    });

    throw error;
  }
};

/**
 * Change user password
 * @param {string} userId - User ID
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<object>} Success message
 * @throws {Error} If change fails
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  try {
    // Find user
    const user = await User.findById(userId);

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      const error = new Error('Current password is incorrect');
      error.statusCode = 401;
      error.code = 'INVALID_CURRENT_PASSWORD';
      throw error;
    }

    // Update password
    user.password_hash = newPassword;
    await user.save();

    logger.info('User password changed', { userId });

    return {
      success: true,
      message: 'Password changed successfully',
    };
  } catch (error) {
    logger.error('Change password failed:', {
      userId,
      message: error.message,
    });

    throw error;
  }
};

/**
 * Soft delete user account
 * @param {string} userId - User ID
 * @returns {Promise<object>} Success message
 * @throws {Error} If deletion fails
 */
const deleteAccount = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    await user.softDelete();

    logger.info('User account deleted', { userId });

    return {
      success: true,
      message: 'Account deleted successfully',
    };
  } catch (error) {
    logger.error('Delete account failed:', {
      userId,
      message: error.message,
    });

    throw error;
  }
};

/**
 * Check if email exists
 * @param {string} email - Email to check
 * @returns {Promise<boolean>} True if email already exists
 */
const checkEmailExists = async (email) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({
      email: normalizedEmail,
      deleted_at: null,
    });

    return !!user;
  } catch (error) {
    logger.error('Error checking email existence:', {
      message: error.message,
    });
    throw error;
  }
};

module.exports = {
  register,
  login,
  getUserById,
  updateProfile,
  changePassword,
  deleteAccount,
  checkEmailExists,
};
