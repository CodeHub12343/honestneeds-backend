/**
 * Middleware Unit Tests
 * Tests for authentication and RBAC middleware
 */

const { authMiddleware, optionalAuthMiddleware } = require('../../src/middleware/authMiddleware');
const { requirePermission, requireAdmin, verifyOwnership, verifyOwnershipById } = require('../../src/middleware/rbac');
const { generateToken } = require('../../src/utils/jwt');
const { extractTokenFromHeader } = require('../../src/utils/jwt');

jest.mock('../../src/utils/jwt');

describe('Auth Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      headers: {},
      path: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  describe('authMiddleware', () => {
    it('should attach user context with valid token', () => {
      const token = 'valid.jwt.token';
      req.headers.authorization = `Bearer ${token}`;

      // Mock JWT utility
      const mockExtract = require('../../src/utils/jwt').extractTokenFromHeader;
      mockExtract.mockReturnValue(token);

      const mockVerify = require('../../src/utils/jwt').verifyToken;
      mockVerify.mockReturnValue({
        userId: 'user123',
        roles: ['user'],
        type: 'access',
        iat: 1000,
        exp: 2000,
      });

      authMiddleware(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user123');
      expect(req.user.roles).toContain('user');
      expect(next).toHaveBeenCalled();
    });

    it('should call next error with missing header', () => {
      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toHaveProperty('statusCode', 401);
      expect(error).toHaveProperty('code', 'MISSING_AUTH_HEADER');
    });

    it('should call next error with invalid header format', () => {
      req.headers.authorization = 'InvalidFormat token';
      const mockExtract = require('../../src/utils/jwt').extractTokenFromHeader;
      mockExtract.mockReturnValue(null);

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toHaveProperty('statusCode', 401);
    });

    it('should handle token expired error', () => {
      req.headers.authorization = 'Bearer expired.token';
      const mockExtract = require('../../src/utils/jwt').extractTokenFromHeader;
      mockExtract.mockReturnValue('expired.token');

      const mockVerify = require('../../src/utils/jwt').verifyToken;
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      error.expiredAt = new Date();
      mockVerify.mockImplementation(() => {
        throw error;
      });

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      const callError = next.mock.calls[0][0];
      expect(callError).toHaveProperty('statusCode', 401);
      expect(callError).toHaveProperty('code', 'TOKEN_EXPIRED');
    });

    it('should handle invalid token signature', () => {
      req.headers.authorization = 'Bearer invalid.signature.token';
      const mockExtract = require('../../src/utils/jwt').extractTokenFromHeader;
      mockExtract.mockReturnValue('invalid.signature.token');

      const mockVerify = require('../../src/utils/jwt').verifyToken;
      const error = new Error('Invalid signature');
      error.name = 'JsonWebTokenError';
      mockVerify.mockImplementation(() => {
        throw error;
      });

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      const callError = next.mock.calls[0][0];
      expect(callError).toHaveProperty('statusCode', 401);
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should attach user if valid token provided', () => {
      const token = 'valid.jwt.token';
      req.headers.authorization = `Bearer ${token}`;

      const mockExtract = require('../../src/utils/jwt').extractTokenFromHeader;
      mockExtract.mockReturnValue(token);

      const mockVerify = require('../../src/utils/jwt').verifyToken;
      mockVerify.mockReturnValue({
        userId: 'user123',
        roles: ['user'],
      });

      optionalAuthMiddleware(req, res, next);

      expect(req.user).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    it('should continue without user if no token', () => {
      optionalAuthMiddleware(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should continue without user if token verification fails', () => {
      req.headers.authorization = 'Bearer invalid.token';
      const mockExtract = require('../../src/utils/jwt').extractTokenFromHeader;
      mockExtract.mockReturnValue('invalid.token');

      const mockVerify = require('../../src/utils/jwt').verifyToken;
      mockVerify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      optionalAuthMiddleware(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });
});

describe('RBAC Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      user: {
        id: 'user123',
        roles: ['user'],
      },
      path: '/api/test',
      ip: '127.0.0.1',
      body: {},
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  describe('requirePermission', () => {
    it('should allow user with required permission', () => {
      req.user.roles = ['creator'];

      const middleware = requirePermission('create:campaign');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should deny user without required permission', () => {
      req.user.roles = ['user'];

      const middleware = requirePermission('create:campaign');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toHaveProperty('statusCode', 403);
    });

    it('should allow admin to access any permission', () => {
      req.user.roles = ['admin'];

      const middleware = requirePermission('create:campaign');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should handle array of permissions', () => {
      req.user.roles = ['creator'];

      const middleware = requirePermission(['create:campaign', 'donate:campaign']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('requireAdmin', () => {
    it('should allow admin user', () => {
      req.user.roles = ['admin'];

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should deny non-admin user', () => {
      req.user.roles = ['user'];

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toHaveProperty('statusCode', 403);
      expect(error).toHaveProperty('code', 'ADMIN_REQUIRED');
    });
  });

  describe('verifyOwnership', () => {
    it('should allow resource owner', () => {
      req.body.creatorId = 'user123';

      const middleware = verifyOwnership('creatorId', 'body');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should deny non-owner user', () => {
      req.body.creatorId = 'other-user';

      const middleware = verifyOwnership('creatorId', 'body');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toHaveProperty('statusCode', 403);
      expect(error).toHaveProperty('code', 'OWNERSHIP_DENIED');
    });

    it('should allow admin to bypass ownership check', () => {
      req.user.roles = ['admin'];
      req.body.creatorId = 'other-user';

      const middleware = verifyOwnership('creatorId', 'body');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should check params when source is params', () => {
      req.params.creatorId = 'user123';

      const middleware = verifyOwnership('creatorId', 'params');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('verifyOwnershipById', () => {
    it('should allow owner using ID parameter', () => {
      req.params.id = 'user123';

      verifyOwnershipById(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should deny non-owner using ID parameter', () => {
      req.params.id = 'other-user';

      verifyOwnershipById(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toHaveProperty('statusCode', 403);
    });

    it('should allow admin bypass check', () => {
      req.user.roles = ['admin'];
      req.params.id = 'other-user';

      verifyOwnershipById(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});
