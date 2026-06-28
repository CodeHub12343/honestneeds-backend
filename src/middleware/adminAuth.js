/**
 * Admin Authentication & Authorization Middleware
 * -------------------------------------------------------------------------
 * Layered on top of the base `authMiddleware` (which verifies the JWT and
 * attaches `req.user`). This middleware:
 *   1. Confirms the requester is an admin (User.role === 'admin').
 *   2. Loads the full admin User document and attaches it as `req.adminUser`.
 *   3. Resolves the admin's effective permission set from `admin_roles`.
 *   4. Optionally enforces a specific permission for a route.
 *
 * The JWT only carries `userId` and coarse `roles`, so we must hit the DB once
 * to read granular `admin_roles` and to ensure the account is still an active,
 * unblocked admin (a revoked admin's old token is rejected here).
 */

const User = require('../models/User');
const { resolvePermissions, hasPermission } = require('../config/adminRoles');
const { logger } = require('../utils/logger');

/**
 * requireAdmin
 * Ensures the request comes from an authenticated, active admin account and
 * populates req.adminUser + req.adminPermissions.
 * Must run AFTER authMiddleware.
 */
async function requireAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.userId) {
      const err = new Error('Authentication required');
      err.statusCode = 401;
      err.code = 'AUTH_REQUIRED';
      return next(err);
    }

    const user = await User.findById(req.user.userId).select(
      '+admin_roles role blocked deleted_at email display_name'
    );

    if (!user || user.deleted_at) {
      const err = new Error('Admin account not found');
      err.statusCode = 403;
      err.code = 'ADMIN_NOT_FOUND';
      return next(err);
    }

    if (user.role !== 'admin') {
      logger.warn('Admin access denied: not an admin', {
        userId: req.user.userId,
        role: user.role,
        path: req.path,
      });
      const err = new Error('Admin access required');
      err.statusCode = 403;
      err.code = 'ADMIN_REQUIRED';
      return next(err);
    }

    if (user.blocked) {
      const err = new Error('Admin account is suspended');
      err.statusCode = 403;
      err.code = 'ADMIN_SUSPENDED';
      return next(err);
    }

    req.adminUser = user;
    req.adminPermissions = resolvePermissions(user.admin_roles);

    next();
  } catch (error) {
    logger.error('requireAdmin middleware error', { message: error.message, path: req.path });
    const err = new Error('Admin authorization failed');
    err.statusCode = 500;
    err.code = 'ADMIN_AUTH_ERROR';
    next(err);
  }
}

/**
 * requirePermission(permission)
 * Enforces a single granular permission. Must run AFTER requireAdmin.
 * @param {string} permission - one of config/adminRoles PERMISSIONS values
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.adminPermissions) {
      const err = new Error('Admin context missing (requireAdmin must run first)');
      err.statusCode = 500;
      err.code = 'ADMIN_CONTEXT_MISSING';
      return next(err);
    }

    if (!hasPermission(req.adminPermissions, permission)) {
      logger.warn('Admin permission denied', {
        userId: req.user?.userId,
        adminRoles: req.adminUser?.admin_roles,
        required: permission,
        path: req.path,
      });
      const err = new Error('You do not have permission to perform this action');
      err.statusCode = 403;
      err.code = 'INSUFFICIENT_PERMISSIONS';
      err.requiredPermission = permission;
      return next(err);
    }

    next();
  };
}

module.exports = { requireAdmin, requirePermission };
