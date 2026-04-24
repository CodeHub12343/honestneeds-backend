/**
 * User Profile Controller
 * Handles user profile management, settings, password changes, and account deletion
 *
 * Endpoints:
 * - GET /users/:id - Get user profile
 * - PATCH /users/:id - Update user profile
 * - POST /users/:id/avatar - Upload profile picture
 * - GET /users/:id/settings - Get user settings
 * - PATCH /users/:id/settings - Update user settings
 * - POST /users/:id/change-password - Change password
 * - DELETE /users/:id - Delete account (soft delete)
 */

const User = require('../models/User');
const { hashPassword, verifyPassword } = require('../utils/passwordUtils');
const winstonLogger = require('../utils/winstonLogger');
const fs = require('fs');
const path = require('path');

/**
 * GET /users/:id
 * Get user profile information
 * Public endpoint with optional authentication for privacy control
 *
 * @param {Object} req - Express request
 * @param {string} req.params.id - User ID
 * @param {Object} req.user - Current authenticated user (optional)
 * @returns {Object} User profile data
 */
exports.getUserProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUser = req.user; // May be undefined for public access

    // Validate user ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      const error = new Error('Invalid user ID format');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      return next(error);
    }

    // Fetch user
    const user = await User.findById(id).select('-password_hash -verification_token -password_reset_token');

    // Handle not found
    if (!user || user.deleted_at) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      return next(error);
    }

    // Check if user is blocked (can't see blocked user profiles unless you're admin)
    if (user.blocked && (!currentUser || currentUser.role !== 'admin')) {
      const error = new Error('This user account is no longer available');
      error.statusCode = 404;
      error.code = 'USER_BLOCKED';
      return next(error);
    }

    // Public view: exclude sensitive fields
    if (!currentUser || currentUser.id !== id) {
      return res.status(200).json({
        success: true,
        data: {
          id: user._id,
          displayName: user.display_name,
          bio: user.bio,
          avatarUrl: user.avatar_url,
          location: {
            city: user.location?.city,
            country: user.location?.country,
          },
          stats: user.stats,
          role: user.role === 'creator' ? 'creator' : 'user', // Hide admin roles
          verified: user.verified,
        },
      });
    }

    // Private view (own profile): include additional fields
    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        displayName: user.display_name,
        phone: user.phone,
        bio: user.bio,
        avatarUrl: user.avatar_url,
        location: user.location,
        stats: user.stats,
        role: user.role,
        verified: user.verified,
        verificationStatus: user.verification_status,
        preferences: user.preferences,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        stripeCustomerId: user.stripe_customer_id ? user.stripe_customer_id.substring(0, 10) + '***' : null,
      },
    });
  } catch (error) {
    winstonLogger.error('Error fetching user profile', {
      userId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * PATCH /users/:id
 * Update user profile information
 * Protected endpoint - user can only update own profile, admin can update any
 *
 * @param {Object} req - Express request
 * @param {string} req.params.id - User ID to update
 * @param {Object} req.body - Profile fields to update
 * @param {string} req.body.displayName - New display name (optional)
 * @param {string} req.body.phone - Phone number (optional)
 * @param {string} req.body.bio - Bio/about section (optional, max 2000 chars)
 * @param {Object} req.body.location - Location object (optional)
 * @param {Object} req.user - Current authenticated user
 * @returns {Object} Updated user profile
 */
exports.updateUserProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { displayName, phone, bio, location } = req.body;
    const currentUser = req.user;

    // Check authentication
    if (!currentUser) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      error.code = 'NOT_AUTHENTICATED';
      return next(error);
    }

    // Validate user ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      const error = new Error('Invalid user ID format');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      return next(error);
    }

    // Authorization: user can update own profile, admin can update any
    if (currentUser.id !== id && currentUser.role !== 'admin') {
      const error = new Error('Unauthorized - you can only update your own profile');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      return next(error);
    }

    // Fetch existing user
    const user = await User.findById(id);

    if (!user || user.deleted_at) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      return next(error);
    }

    // Validate fields
    const updates = {};

    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.length < 2 || displayName.length > 100) {
        const error = new Error('Display name must be 2-100 characters');
        error.statusCode = 400;
        error.code = 'INVALID_DISPLAY_NAME';
        return next(error);
      }
      updates.display_name = displayName.trim();
    }

    if (phone !== undefined) {
      if (phone && typeof phone === 'string') {
        if (!/^[+]?[\d\s\-().]+$/.test(phone) || phone.length > 30) {
          const error = new Error('Invalid phone number format');
          error.statusCode = 400;
          error.code = 'INVALID_PHONE';
          return next(error);
        }
        updates.phone = phone.trim();
      } else if (phone === null || phone === '') {
        updates.phone = null;
      }
    }

    if (bio !== undefined) {
      if (typeof bio !== 'string' || bio.length > 2000) {
        const error = new Error('Bio must not exceed 2000 characters');
        error.statusCode = 400;
        error.code = 'INVALID_BIO';
        return next(error);
      }
      updates.bio = bio.trim();
    }

    if (location !== undefined) {
      if (typeof location === 'object' && location !== null) {
        const { city, country, address, latitude, longitude } = location;
        updates.location = {};
        if (city) updates.location.city = city;
        if (country) updates.location.country = country;
        if (address) updates.location.address = address;
        if (latitude && longitude) {
          updates.location.coordinates = {
            type: 'Point',
            coordinates: [longitude, latitude], // GeoJSON: [longitude, latitude]
          };
        }
        // Preserve existing location fields if not updated
        if (!updates.location.city && user.location?.city) updates.location.city = user.location.city;
        if (!updates.location.country && user.location?.country) updates.location.country = user.location.country;
        if (!updates.location.address && user.location?.address) updates.location.address = user.location.address;
        if (!updates.location.coordinates && user.location?.coordinates) {
          updates.location.coordinates = user.location.coordinates;
        }
      }
    }

    // Check if any updates provided
    if (Object.keys(updates).length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No changes to update',
        data: user.toJSON(),
      });
    }

    // Apply updates
    Object.assign(user, updates);
    user.updated_at = new Date();

    // Save updated user
    const updatedUser = await user.save();

    winstonLogger.info('User profile updated', {
      userId: currentUser.id,
      targetUserId: id,
      updatedFields: Object.keys(updates),
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser.toJSON(),
    });
  } catch (error) {
    winstonLogger.error('Error updating user profile', {
      userId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * POST /users/:id/avatar
 * Upload or update user profile picture
 * Protected endpoint - multipart/form-data
 * Accepts single image file in 'avatar' field
 *
 * @param {Object} req - Express request
 * @param {string} req.params.id - User ID
 * @param {File} req.file.avatar - Image file (max 5MB)
 * @param {Object} req.user - Current authenticated user
 * @returns {Object} Updated profile with new avatar URL
 */
exports.uploadProfilePicture = async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const uploadedFile = req.file;

    // Check authentication
    if (!currentUser) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      error.code = 'NOT_AUTHENTICATED';
      return next(error);
    }

    // Validate user ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      const error = new Error('Invalid user ID format');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      return next(error);
    }

    // Authorization: user can update own avatar, admin can update any
    if (currentUser.id !== id && currentUser.role !== 'admin') {
      const error = new Error('Unauthorized - you can only update your own avatar');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      return next(error);
    }

    // Check if file provided
    if (!uploadedFile) {
      const error = new Error('No file provided. Please upload an image file.');
      error.statusCode = 400;
      error.code = 'NO_FILE_PROVIDED';
      return next(error);
    }

    // ✅ CLOUDINARY: New format includes image_url instead of path
    // Validate that Cloudinary upload succeeded
    if (!uploadedFile.image_url) {
      const error = new Error('File upload to Cloudinary failed');
      error.statusCode = 500;
      error.code = 'CLOUDINARY_UPLOAD_FAILED';
      return next(error);
    }

    // Validate file type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(uploadedFile.mimetype)) {
      const error = new Error('Invalid file type. Allowed: JPEG, PNG, GIF, WebP');
      error.statusCode = 400;
      error.code = 'INVALID_FILE_TYPE';
      return next(error);
    }

    // Validate file size (5MB max for avatars)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (uploadedFile.size > maxSize) {
      const error = new Error('File size exceeds 5MB limit');
      error.statusCode = 400;
      error.code = 'FILE_TOO_LARGE';
      return next(error);
    }

    // Fetch existing user
    const user = await User.findById(id);

    if (!user || user.deleted_at) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      return next(error);
    }

    // ✅ CLOUDINARY: Delete old avatar if it exists
    // Old avatars stored as URLs or local paths; new ones are Cloudinary URLs
    if (user.avatar_url && user.avatar_public_id) {
      try {
        const { deleteFromCloudinary } = require('../utils/cloudinaryUpload');
        await deleteFromCloudinary(user.avatar_public_id);
        winstonLogger.info('Old Cloudinary avatar deleted', {
          userId: id,
          publicId: user.avatar_public_id,
        });
      } catch (err) {
        winstonLogger.warn('Could not delete old Cloudinary avatar', {
          userId: id,
          publicId: user.avatar_public_id,
          error: err.message,
        });
      }
    }

    // ✅ CLOUDINARY: Set new avatar URL (from Cloudinary)
    user.avatar_url = uploadedFile.image_url;
    user.avatar_public_id = uploadedFile.image_public_id; // Store for future deletion
    user.updated_at = new Date();

    // Save updated user
    const updatedUser = await user.save();

    winstonLogger.info('User avatar updated', {
      userId: currentUser.id,
      targetUserId: id,
      avatarUrl: uploadedFile.image_url.substring(0, 100),
      publicId: uploadedFile.image_public_id,
    });

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully',
      user: {
        id: updatedUser._id,
        avatar_url: updatedUser.avatar_url,
      },
    });
  } catch (error) {
    winstonLogger.error('Profile picture upload error', {
      error: error.message,
      userId: req.params?.id,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * GET /users/:id/settings
 * Get user settings/preferences
 * Protected endpoint - user can only view own settings, admin can view any
 *
 * @param {Object} req - Express request
 * @param {string} req.params.id - User ID
 * @param {Object} req.user - Current authenticated user
 * @returns {Object} User settings and preferences
 */
exports.getUserSettings = async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // Check authentication
    if (!currentUser) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      error.code = 'NOT_AUTHENTICATED';
      return next(error);
    }

    // Validate user ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      const error = new Error('Invalid user ID format');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      return next(error);
    }

    // Authorization: user can view own settings, admin can view any
    if (currentUser.id !== id && currentUser.role !== 'admin') {
      const error = new Error('Unauthorized - you can only view your own settings');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      return next(error);
    }

    // Fetch user
    const user = await User.findById(id).select('preferences created_at');

    if (!user || user.deleted_at) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      return next(error);
    }

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        preferences: {
          emailNotifications: user.preferences?.email_notifications ?? true,
          marketingEmails: user.preferences?.marketing_emails ?? false,
          newsletter: user.preferences?.newsletter ?? false,
        },
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    winstonLogger.error('Error fetching user settings', {
      userId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * PATCH /users/:id/settings
 * Update user settings/preferences
 * Protected endpoint - user can only update own settings, admin can update any
 *
 * @param {Object} req - Express request
 * @param {string} req.params.id - User ID
 * @param {Object} req.body - Settings to update
 * @param {boolean} req.body.emailNotifications - Enable email notifications (optional)
 * @param {boolean} req.body.marketingEmails - Enable marketing emails (optional)
 * @param {boolean} req.body.newsletter - Enable newsletter (optional)
 * @param {Object} req.user - Current authenticated user
 * @returns {Object} Updated settings
 */
exports.updateSettings = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { emailNotifications, marketingEmails, newsletter } = req.body;
    const currentUser = req.user;

    // Check authentication
    if (!currentUser) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      error.code = 'NOT_AUTHENTICATED';
      return next(error);
    }

    // Validate user ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      const error = new Error('Invalid user ID format');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      return next(error);
    }

    // Authorization: user can update own settings, admin can update any
    if (currentUser.id !== id && currentUser.role !== 'admin') {
      const error = new Error('Unauthorized - you can only update your own settings');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      return next(error);
    }

    // Fetch user
    const user = await User.findById(id);

    if (!user || user.deleted_at) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      return next(error);
    }

    // Update settings with validation
    const updates = {};

    if (emailNotifications !== undefined) {
      if (typeof emailNotifications !== 'boolean') {
        const error = new Error('emailNotifications must be a boolean');
        error.statusCode = 400;
        error.code = 'INVALID_EMAIL_NOTIFICATIONS';
        return next(error);
      }
      updates['preferences.email_notifications'] = emailNotifications;
    }

    if (marketingEmails !== undefined) {
      if (typeof marketingEmails !== 'boolean') {
        const error = new Error('marketingEmails must be a boolean');
        error.statusCode = 400;
        error.code = 'INVALID_MARKETING_EMAILS';
        return next(error);
      }
      updates['preferences.marketing_emails'] = marketingEmails;
    }

    if (newsletter !== undefined) {
      if (typeof newsletter !== 'boolean') {
        const error = new Error('newsletter must be a boolean');
        error.statusCode = 400;
        error.code = 'INVALID_NEWSLETTER';
        return next(error);
      }
      updates['preferences.newsletter'] = newsletter;
    }

    // Check if any updates provided
    if (Object.keys(updates).length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No changes to update',
        data: {
          preferences: {
            emailNotifications: user.preferences?.email_notifications ?? true,
            marketingEmails: user.preferences?.marketing_emails ?? false,
            newsletter: user.preferences?.newsletter ?? false,
          },
        },
      });
    }

    // Apply updates
    if (updates['preferences.email_notifications'] !== undefined) {
      user.preferences.email_notifications = updates['preferences.email_notifications'];
    }
    if (updates['preferences.marketing_emails'] !== undefined) {
      user.preferences.marketing_emails = updates['preferences.marketing_emails'];
    }
    if (updates['preferences.newsletter'] !== undefined) {
      user.preferences.newsletter = updates['preferences.newsletter'];
    }

    user.updated_at = new Date();
    const updatedUser = await user.save();

    winstonLogger.info('User settings updated', {
      userId: currentUser.id,
      targetUserId: id,
    });

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        preferences: {
          emailNotifications: updatedUser.preferences?.email_notifications ?? true,
          marketingEmails: updatedUser.preferences?.marketing_emails ?? false,
          newsletter: updatedUser.preferences?.newsletter ?? false,
        },
      },
    });
  } catch (error) {
    winstonLogger.error('Error updating user settings', {
      userId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * POST /users/:id/change-password
 * Change user password
 * Protected endpoint - requires current password for verification
 *
 * @param {Object} req - Express request
 * @param {string} req.params.id - User ID
 * @param {Object} req.body - Password change data
 * @param {string} req.body.currentPassword - Current password (required)
 * @param {string} req.body.newPassword - New password (required, min 8 chars, strong)
 * @param {Object} req.user - Current authenticated user
 * @returns {Object} Success message
 */
exports.changePassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    const currentUser = req.user;

    // Check authentication
    if (!currentUser) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      error.code = 'NOT_AUTHENTICATED';
      return next(error);
    }

    // Users can only change their own password
    if (currentUser.id !== id) {
      const error = new Error('You can only change your own password');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      return next(error);
    }

    // Validate user ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      const error = new Error('Invalid user ID format');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      return next(error);
    }

    // Validate inputs
    if (!currentPassword || typeof currentPassword !== 'string' || currentPassword.length < 1) {
      const error = new Error('Current password is required');
      error.statusCode = 400;
      error.code = 'MISSING_CURRENT_PASSWORD';
      return next(error);
    }

    if (!newPassword || typeof newPassword !== 'string') {
      const error = new Error('New password is required');
      error.statusCode = 400;
      error.code = 'MISSING_NEW_PASSWORD';
      return next(error);
    }

    if (newPassword.length < 8) {
      const error = new Error('New password must be at least 8 characters long');
      error.statusCode = 400;
      error.code = 'PASSWORD_TOO_SHORT';
      return next(error);
    }

    if (newPassword.length > 128) {
      const error = new Error('Password must not exceed 128 characters');
      error.statusCode = 400;
      error.code = 'PASSWORD_TOO_LONG';
      return next(error);
    }

    // Check for password strength (basic: mix of upper, lower, numbers, special chars) - optional
    const passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~])/;
    if (!passwordStrengthRegex.test(newPassword)) {
      const error = new Error('Password must contain uppercase, lowercase, number, and special character');
      error.statusCode = 400;
      error.code = 'WEAK_PASSWORD';
      return next(error);
    }

    // Fetch user with password hash
    const user = await User.findById(id);

    if (!user || user.deleted_at) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      return next(error);
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      winstonLogger.warn('Failed password change attempt - invalid current password', {
        userId: id,
        ip: req.ip,
      });

      const error = new Error('Current password is incorrect');
      error.statusCode = 401;
      error.code = 'INVALID_CURRENT_PASSWORD';
      return next(error);
    }

    // Prevent reusing same password
    const sameAsNew = await verifyPassword(newPassword, user.password_hash);
    if (sameAsNew) {
      const error = new Error('New password cannot be the same as current password');
      error.statusCode = 400;
      error.code = 'PASSWORD_SAME_AS_CURRENT';
      return next(error);
    }

    // Update password
    user.password_hash = newPassword;
    user.updated_at = new Date();
    await user.save(); // Pre-save hook will hash the password

    winstonLogger.info('User password changed', {
      userId: id,
      ip: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    winstonLogger.error('Error changing password', {
      userId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * DELETE /users/:id
 * Delete user account (soft delete)
 * Protected endpoint - user can only delete own account, admin can delete any
 * Marks user as deleted without removing data from database
 *
 * @param {Object} req - Express request
 * @param {string} req.params.id - User ID to delete
 * @param {Object} req.body - Optional deletion data
 * @param {string} req.body.reason - Reason for deletion (optional)
 * @param {string} req.body.password - User's password for verification (required for non-admin)
 * @param {Object} req.user - Current authenticated user
 * @returns {Object} Success message
 */
exports.deleteAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, password } = req.body;
    const currentUser = req.user;

    // Check authentication
    if (!currentUser) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      error.code = 'NOT_AUTHENTICATED';
      return next(error);
    }

    // Validate user ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      const error = new Error('Invalid user ID format');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      return next(error);
    }

    // Authorization: user can delete own account, only super-admin can delete others
    if (currentUser.id !== id && currentUser.role !== 'admin') {
      const error = new Error('You can only delete your own account');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      return next(error);
    }

    // Non-admin users must provide password verification
    if (currentUser.role !== 'admin') {
      if (!password || typeof password !== 'string') {
        const error = new Error('Password is required to delete your account');
        error.statusCode = 400;
        error.code = 'MISSING_PASSWORD';
        return next(error);
      }
    }

    // Fetch user
    const user = await User.findById(id);

    if (!user || user.deleted_at) {
      const error = new Error('User not found or already deleted');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      return next(error);
    }

    // Verify password for non-admin deletion
    if (currentUser.role !== 'admin') {
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        winstonLogger.warn('Failed account deletion - invalid password', {
          userId: id,
          ip: req.ip,
        });

        const error = new Error('Invalid password');
        error.statusCode = 401;
        error.code = 'INVALID_PASSWORD';
        return next(error);
      }
    }

    // Prevent deleting admin accounts (only super-admin can)
    if (user.role === 'admin' && currentUser.role !== 'admin') {
      const error = new Error('Cannot delete admin accounts');
      error.statusCode = 403;
      error.code = 'CANNOT_DELETE_ADMIN';
      return next(error);
    }

    // Soft delete user
    user.deleted_at = new Date();
    user.deletion_reason = reason || 'User requested deletion';
    user.deleted_by = currentUser.id;
    user.updated_at = new Date();

    await user.save();

    winstonLogger.info('User account deleted', {
      userId: id,
      deletedBy: currentUser.id,
      reason: reason || 'User requested deletion',
      ip: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully. Your data will be retained for 30 days in case you change your mind.',
    });
  } catch (error) {
    winstonLogger.error('Error deleting user account', {
      userId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};
