/**
 * Role-Based Access Control (RBAC) Middleware
 * Enforces permission and ownership checks
 * 
 * Usage:
 * app.delete('/campaigns/:id', authMiddleware, rbac.requirePermission('delete:campaign'), handler);
 * app.put('/campaigns/:id', authMiddleware, rbac.verifyOwnership('creatorId'), handler);
 */

const { logger } = require('../utils/logger');

/**
 * Permission matrix
 * Maps permissions to required roles
 */
const PERMISSION_MATRIX = {
  // Admin permissions
  'admin:view-all-users': ['admin'],
  'admin:edit-user': ['admin'],
  'admin:delete-user': ['admin'],
  'admin:verify-transaction': ['admin'],
  'admin:view-analytics': ['admin'],

  // Creator permissions
  'create:campaign': ['creator', 'admin'],
  'edit:campaign': ['creator', 'admin'],
  'delete:campaign': ['creator', 'admin'],
  'view:campaign-analytics': ['creator', 'admin'],
  'activate:campaign': ['creator', 'admin'],
  'pause:campaign': ['creator', 'admin'],
  'manage:payments': ['creator', 'admin'],

  // User permissions
  'view:campaigns': ['user', 'creator', 'admin'],
  'donate:campaign': ['user', 'creator', 'admin'],
  'share:campaign': ['user', 'creator', 'admin'],
  'view:profile': ['user', 'creator', 'admin'],
  'edit:profile': ['user', 'creator', 'admin'],

  // Public permissions (anyone can use)
  'view:public-campaigns': ['user', 'creator', 'admin', 'anonymous'],
};

/**
 * Check if user has required role
 * @param {array} userRoles - User's roles
 * @param {array} requiredRoles - Required roles
 * @returns {boolean} True if user has required role
 */
const hasRequiredRole = (userRoles, requiredRoles) => {
  if (!Array.isArray(userRoles)) {
    return false;
  }

  return userRoles.some((role) => requiredRoles.includes(role));
};

/**
 * Require permission middleware
 * Checks if user has permission to perform action
 * 
 * @param {string|array} permission - Permission or array of permissions
 * @returns {function} Middleware function
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        logger.warn('Permission denied: user not authenticated', {
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        const error = new Error('Authentication required');
        error.statusCode = 401;
        error.code = 'AUTH_REQUIRED';
        return next(error);
      }

      // Normalize permission to array
      const permissions = Array.isArray(permission) ? permission : [permission];

      // Check if user has any of the required permissions
      const hasPermission = permissions.some((perm) => {
        const requiredRoles = PERMISSION_MATRIX[perm];

        if (!requiredRoles) {
          logger.warn('Unknown permission requested', {
            permission: perm,
            path: req.path,
          });

          return false;
        }

        return hasRequiredRole(req.user.roles, requiredRoles);
      });

      if (!hasPermission) {
        logger.warn('Permission denied', {
          userId: req.user.id,
          userRoles: req.user.roles,
          requiredPermission: permissions,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        const error = new Error('You do not have permission to perform this action');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        return next(error);
      }

      logger.debug('Permission granted', {
        userId: req.user.id,
        permission: permissions,
      });

      next();
    } catch (error) {
      logger.error('Permission check failed:', {
        message: error.message,
        path: req.path,
      });

      const err = new Error('Permission check failed');
      err.statusCode = 500;
      err.code = 'PERMISSION_CHECK_ERROR';
      next(err);
    }
  };
};

/**
 * Require admin role
 * Shorthand for: requirePermission('admin:*')
 * @returns {function} Middleware function
 */
const requireAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      error.code = 'AUTH_REQUIRED';
      return next(error);
    }

    if (!req.user.roles.includes('admin')) {
      logger.warn('Admin access denied', {
        userId: req.user.id,
        userRoles: req.user.roles,
        path: req.path,
        ip: req.ip,
      });

      const error = new Error('Admin access required');
      error.statusCode = 403;
      error.code = 'ADMIN_REQUIRED';
      return next(error);
    }

    logger.debug('Admin access granted', {
      userId: req.user.id,
    });

    next();
  } catch (error) {
    logger.error('Admin check failed:', { message: error.message });

    const err = new Error('Admin check failed');
    err.statusCode = 500;
    next(err);
  }
};

/**
 * Verify resource ownership
 * Checks if user owns the resource (used for path parameters)
 * 
 * @param {string} ownerIdField - Field name in request body/params containing owner ID
 * @param {string} sourceField - Where to get the owner ID from ('body', 'params', 'query')
 * @returns {function} Middleware function
 */
const verifyOwnership = (ownerIdField, sourceField = 'body') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        const error = new Error('Authentication required');
        error.statusCode = 401;
        error.code = 'AUTH_REQUIRED';
        return next(error);
      }

      // Get source object
      const sourceObject = sourceField === 'params' 
        ? req.params 
        : sourceField === 'query' 
          ? req.query 
          : req.body;

      const resourceOwnerId = sourceObject?.[ownerIdField];

      if (!resourceOwnerId) {
        logger.warn('Owner ID not found', {
          field: ownerIdField,
          source: sourceField,
          path: req.path,
        });

        const error = new Error('Resource owner not identified');
        error.statusCode = 400;
        error.code = 'INVALID_REQUEST';
        return next(error);
      }

      // Convert to strings for comparison (IDs might be ObjectId or string)
      const userIdStr = String(req.user.id);
      const resourceOwnerIdStr = String(resourceOwnerId);

      // Check ownership (allow admins to bypass this check)
      if (userIdStr !== resourceOwnerIdStr && !req.user.roles.includes('admin')) {
        logger.warn('Ownership verification failed', {
          userId: req.user.id,
          resourceOwnerId,
          path: req.path,
          ip: req.ip,
        });

        const error = new Error('You can only modify your own resources');
        error.statusCode = 403;
        error.code = 'OWNERSHIP_DENIED';
        return next(error);
      }

      logger.debug('Ownership verified', {
        userId: req.user.id,
        resourceOwnerId,
      });

      next();
    } catch (error) {
      logger.error('Ownership verification failed:', { message: error.message });

      const err = new Error('Ownership verification failed');
      err.statusCode = 500;
      err.code = 'OWNERSHIP_CHECK_ERROR';
      next(err);
    }
  };
};

/**
 * Verify resource ownership by ID parameter
 * Checks if user is the resource owner using req.params.id
 * 
 * @returns {function} Middleware function
 */
const verifyOwnershipById = (req, res, next) => {
  try {
    if (!req.user) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      error.code = 'AUTH_REQUIRED';
      return next(error);
    }

    const resourceOwnerId = req.params.id;

    if (!resourceOwnerId) {
      const error = new Error('Resource ID not found');
      error.statusCode = 400;
      error.code = 'INVALID_REQUEST';
      return next(error);
    }

    const userIdStr = String(req.user.id);
    const resourceOwnerIdStr = String(resourceOwnerId);

    if (userIdStr !== resourceOwnerIdStr && !req.user.roles.includes('admin')) {
      logger.warn('Ownership verification failed (by ID)', {
        userId: req.user.id,
        resourceId: resourceOwnerId,
        path: req.path,
        ip: req.ip,
      });

      const error = new Error('You can only modify your own resources');
      error.statusCode = 403;
      error.code = 'OWNERSHIP_DENIED';
      return next(error);
    }

    logger.debug('Ownership verified by ID', {
      userId: req.user.id,
      resourceId: resourceOwnerId,
    });

    next();
  } catch (error) {
    logger.error('Ownership verification by ID failed:', { message: error.message });

    const err = new Error('Ownership verification failed');
    err.statusCode = 500;
    err.code = 'OWNERSHIP_CHECK_ERROR';
    next(err);
  }
};

module.exports = {
  requirePermission,
  requireAdmin,
  verifyOwnership,
  verifyOwnershipById,
  PERMISSION_MATRIX,
  hasRequiredRole,
};
