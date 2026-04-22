/**
 * Authentication Middleware
 * Verifies JWT tokens and attaches user context to requests
 * 
 * Usage:
 * app.use('/api/protected', authMiddleware, routeHandler);
 */

const { verifyToken, extractTokenFromHeader } = require('../utils/jwt');
const { logger } = require('../utils/logger');

/**
 * Authentication middleware
 * Extracts JWT from Authorization header and verifies it
 * Attaches verified user data to req.user
 */
const authMiddleware = (req, res, next) => {
  try {
    // Extract Authorization header (primary source)
    const authHeader = req.headers.authorization;
    
    // Fallback: check for auth_token in cookies
    const cookieToken = req.cookies?.auth_token;

    logger.info('🔐 Auth Middleware: Processing request', {
      path: req.path,
      method: req.method,
      hasAuthHeader: !!authHeader,
      hasCookieToken: !!cookieToken,
      authHeaderPreview: authHeader ? authHeader.substring(0, 50) + '...' : 'none',
    });

    if (!authHeader && !cookieToken) {
      logger.warn('❌ Auth Middleware: Missing authorization header and no auth_token cookie', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      const error = new Error('Missing authorization credentials (header or cookie)');
      error.statusCode = 401;
      error.code = 'MISSING_AUTH_CREDENTIALS';
      return next(error);
    }

    // Extract token from "Bearer <token>" format OR use cookie token directly
    let token;
    if (authHeader) {
      token = extractTokenFromHeader(authHeader);
    } else if (cookieToken) {
      token = cookieToken;
    }

    logger.info('🔍 Auth Middleware: Token extraction', {
      tokenExtracted: !!token,
      tokenLength: token ? token.length : 0,
      tokenSource: authHeader ? 'authorization-header' : 'cookie',
      tokenPreview: token ? token.substring(0, 30) + '...' : 'none',
    });

    if (!token) {
      logger.warn('❌ Auth Middleware: No valid token extracted', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        authHeader: authHeader ? authHeader.substring(0, 50) : 'none',
        hasCookie: !!cookieToken,
      });

      const error = new Error('Invalid or missing authentication token');
      error.statusCode = 401;
      error.code = 'INVALID_AUTH_TOKEN';
      return next(error);
    }

    // Verify token
    logger.info('🔑 Auth Middleware: About to verify token', {
      tokenLength: token.length,
    });

    const decoded = verifyToken(token);

    logger.info('✅ Auth Middleware: Token verified successfully', {
      userId: decoded.userId,
      roles: decoded.roles,
      tokenType: decoded.type,
      iat: decoded.iat,
      exp: decoded.exp,
    });

    // Attach user context to request
    req.user = {
      _id: decoded.userId,  // MongoDB uses _id
      id: decoded.userId,
      userId: decoded.userId,
      roles: decoded.roles,
      type: decoded.type,
      iat: decoded.iat,
      exp: decoded.exp,
    };

    logger.info('📌 Auth Middleware: User context attached to request', {
      'req.user._id': req.user._id,
      'req.user.id': req.user.id,
      'req.user.userId': req.user.userId,
      'req.user.roles': req.user.roles,
      'Object keys': Object.keys(req.user),
    });

    logger.debug('User authenticated', {
      userId: req.user.id,
      roles: req.user.roles,
      path: req.path,
    });

    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      logger.warn('❌ Auth Middleware: Token expired', {
        path: req.path,
        expiredAt: error.expiredAt,
        ip: req.ip,
      });

      const err = new Error('Authentication token has expired');
      err.statusCode = 401;
      err.code = 'TOKEN_EXPIRED';
      err.name = 'TokenExpiredError';
      return next(err);
    }

    if (error.name === 'JsonWebTokenError') {
      logger.warn('❌ Auth Middleware: Invalid token signature', {
        path: req.path,
        ip: req.ip,
        errorMessage: error.message,
      });

      const err = new Error('Authentication token is invalid');
      err.statusCode = 401;
      err.code = 'INVALID_TOKEN';
      err.name = 'JsonWebTokenError';
      return next(err);
    }

    if (error.name === 'TokenMissingError') {
      logger.warn('❌ Auth Middleware: Token missing', {
        path: req.path,
        ip: req.ip,
      });

      const err = new Error('Authentication token is missing');
      err.statusCode = 401;
      err.code = 'TOKEN_MISSING';
      return next(err);
    }

    // Generic authentication error
    logger.error('❌ Auth Middleware: Authentication middleware error', {
      message: error.message,
      name: error.name,
      path: req.path,
      ip: req.ip,
      stack: error.stack,
    });

    const err = new Error('Authentication failed');
    err.statusCode = 401;
    err.code = 'AUTH_FAILED';
    next(err);
  }
};

/**
 * Optional authentication middleware
 * Attempts to verify token but doesn't fail if missing
 * Useful for endpoints that work with or without authentication
 */
const optionalAuthMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      // No token provided - continue as anonymous
      return next();
    }

    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      // Invalid format but we don't fail - continue as anonymous
      return next();
    }

    // Try to verify token
    const decoded = verifyToken(token);

    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      roles: decoded.roles,
      type: decoded.type,
      iat: decoded.iat,
      exp: decoded.exp,
    };

    logger.debug('Optional user authenticated', {
      userId: req.user.id,
      roles: req.user.roles,
    });

    next();
  } catch (error) {
    // Token verification failed but we don't require it
    // Log for debugging but continue request
    logger.debug('Optional auth verification failed', {
      message: error.message,
      path: req.path,
    });

    next();
  }
};

/**
 * Authorization middleware factory
 * Checks if user has required roles
 * Must be used after authMiddleware
 * 
 * @param {string[]} requiredRoles - Array of required roles (user must have at least one)
 * @returns {function} Express middleware
 */
const authorize = (requiredRoles = []) => {
  return (req, res, next) => {
    try {
      // Ensure user is authenticated (should be set by authMiddleware)
      if (!req.user) {
        const error = new Error('User not authenticated');
        error.statusCode = 401;
        error.code = 'NOT_AUTHENTICATED';
        return next(error);
      }

      // If no roles required, continue
      if (!requiredRoles || requiredRoles.length === 0) {
        return next();
      }

      // Get user's roles (default to empty array if not present)
      const userRoles = req.user.roles || [];

      // Check if user has at least one required role
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        logger.warn('User lacks required roles', {
          userId: req.user.id,
          requiredRoles,
          userRoles,
          path: req.path,
        });

        const error = new Error(`User lacks required roles. Required: ${requiredRoles.join(', ')}`);
        error.statusCode = 403;
        error.code = 'INSUFFICIENT_PERMISSIONS';
        return next(error);
      }

      logger.debug('Authorization check passed', {
        userId: req.user.id,
        userRoles,
        path: req.path,
      });

      next();
    } catch (error) {
      logger.error('Authorization middleware error', {
        message: error.message,
        path: req.path,
      });

      const err = new Error('Authorization failed');
      err.statusCode = 500;
      err.code = 'AUTH_CHECK_FAILED';
      next(err);
    }
  };
};

/**
 * Alias for authenticate middleware
 * Kept for backward compatibility with code that uses authMiddleware as a function
 */
const authenticate = authMiddleware;

/**
 * Alias for authorize middleware
 * Used in routes like authorizeRoles('admin')
 */
const authorizeRoles = authorize;

/**
 * Combined middleware: Requires authentication AND admin role
 * Usage: router.post('/admin/path', requireAdmin, controller.method)
 */
const requireAdmin = [authenticate, authorize(['admin'])];

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  authorize,
  authorizeRoles,
  authenticate,
  requireAdmin,
};
