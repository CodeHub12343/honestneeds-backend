/**
 * JWT Utility Module
 * Handles token generation and verification with RS256 (asymmetric encryption)
 * 
 * Benefits of RS256:
 * - Public key can be shared for verification (no secret needed on frontend)
 * - Private key stays secure on backend
 * - Better for distributed systems
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

// JWT configuration
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const ALGORITHM = 'RS256';

// Load RSA keys (should be generated separately and stored securely)
const keysDir = path.join(__dirname, '../../keys');
let privateKey;
let publicKey;

/**
 * Initialize RSA keys
 * In production, these should be:
 * 1. Generated with: openssl genrsa -out private.pem 4096
 *                    openssl rsa -in private.pem -pubout -out public.pem
 * 2. Stored in AWS Secrets Manager or similar
 * 3. Not kept in git repository
 */
const initializeKeys = () => {
  try {
    // Try to load keys from environment variables first (production)
    if (process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY) {
      privateKey = process.env.JWT_PRIVATE_KEY;
      publicKey = process.env.JWT_PUBLIC_KEY;
      logger.info('JWT keys loaded from environment variables');
      return;
    }

    // Fall back to file-based keys
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }

    const privateKeyPath = path.join(keysDir, 'private.pem');
    const publicKeyPath = path.join(keysDir, 'public.pem');

    // Generate keys if they don't exist
    if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
      logger.warn('RSA keys not found. Generating new keys...');
      const crypto = require('crypto');
      
      // Generate RSA keypair synchronously
      const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      fs.writeFileSync(privateKeyPath, priv, 'utf8');
      fs.writeFileSync(publicKeyPath, pub, 'utf8');
      logger.info('New RSA keys generated and saved');
      
      privateKey = priv;
      publicKey = pub;
    } else {
      privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      logger.info('JWT keys loaded from files');
    }
  } catch (error) {
    logger.error('Failed to initialize JWT keys:', { message: error.message });
    throw error;
  }
};

// Initialize keys on module load
try {
  initializeKeys();
} catch (error) {
  if (process.env.NODE_ENV === 'development') {
    logger.warn('JWT keys initialization error (non-fatal in development):', { message: error.message });
  } else {
    throw error;
  }
}

/**
 * Generate JWT access token
 * @param {string} userId - User ID
 * @param {array} roles - User roles ['user', 'creator', 'admin']
 * @param {string} expiresIn - Token expiry (defaults to 24h)
 * @returns {string} JWT token
 */
const generateToken = (userId, roles = ['user'], expiresIn = JWT_EXPIRY) => {
  if (!userId) {
    logger.error('🔴 JWT: generateToken called with missing userId', { userId });
    throw new Error('userId is required for token generation');
  }

  if (!privateKey) {
    logger.error('🔴 JWT: generateToken called with missing private key');
    throw new Error('Private key not initialized');
  }

  const payload = {
    userId,
    roles: Array.isArray(roles) ? roles : [roles],
    type: 'access',
    iat: Math.floor(Date.now() / 1000),
  };

  logger.info('🔑 JWT: Generating access token', {
    userId,
    roles,
    expiresIn,
    payload,
  });

  try {
    const token = jwt.sign(payload, privateKey, {
      algorithm: ALGORITHM,
      expiresIn,
    });

    logger.info('✅ JWT: Access token generated successfully', {
      userId,
      roles,
      expiresIn,
      tokenLength: token.length,
      tokenPreview: token.substring(0, 50) + '...',
    });

    return token;
  } catch (error) {
    logger.error('🔴 JWT: Token generation failed:', {
      error: error.message,
      userId,
      stack: error.stack,
    });
    throw new Error('Failed to generate token');
  }
};

/**
 * Generate JWT refresh token
 * Used to obtain new access tokens without user login
 * @param {string} userId - User ID
 * @returns {string} Refresh token
 */
const generateRefreshToken = (userId) => {
  if (!userId) {
    throw new Error('userId is required for refresh token generation');
  }

  if (!privateKey) {
    throw new Error('Private key not initialized');
  }

  const payload = {
    userId,
    type: 'refresh',
    iat: Math.floor(Date.now() / 1000),
  };

  try {
    const token = jwt.sign(payload, privateKey, {
      algorithm: ALGORITHM,
      expiresIn: JWT_REFRESH_EXPIRY,
    });

    return token;
  } catch (error) {
    logger.error('Refresh token generation failed:', { error: error.message, userId });
    throw new Error('Failed to generate refresh token');
  }
};

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token
 * @returns {object} Decoded token with userId and roles
 * @throws {Error} If token is invalid or expired
 */
const verifyToken = (token) => {
  logger.info('🔍 JWT: Verifying token', {
    tokenProvided: !!token,
    tokenLength: token ? token.length : 0,
    tokenPreview: token ? token.substring(0, 50) + '...' : 'none',
    publicKeyPresent: !!publicKey,
  });

  if (!token) {
    logger.error('🔴 JWT: Token is missing');
    const error = new Error('Token is required');
    error.name = 'TokenMissingError';
    throw error;
  }

  if (!publicKey) {
    logger.error('🔴 JWT: Public key not initialized');
    throw new Error('Public key not initialized');
  }

  try {
    logger.info('🔐 JWT: About to verify token signature', {
      algorithm: ALGORITHM,
    });

    const decoded = jwt.verify(token, publicKey, {
      algorithms: [ALGORITHM],
    });

    logger.info('✅ JWT: Token verified successfully', {
      userId: decoded.userId,
      roles: decoded.roles,
      type: decoded.type,
      iat: decoded.iat,
      exp: decoded.exp,
      decodedKeys: Object.keys(decoded),
    });

    const result = {
      userId: decoded.userId,
      roles: decoded.roles || ['user'],
      type: decoded.type || 'access',
      iat: decoded.iat,
      exp: decoded.exp,
    };

    logger.debug('📦 JWT: Returning decoded token', {
      result,
    });

    return result;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('⏰ JWT: Token has expired', {
        expiredAt: error.expiredAt,
      });

      const err = new Error('Token has expired');
      err.name = 'TokenExpiredError';
      err.expiredAt = error.expiredAt;
      throw err;
    }

    if (error.name === 'JsonWebTokenError') {
      logger.error('🔴 JWT: Invalid token signature', {
        errorMessage: error.message,
      });

      const err = new Error('Invalid token signature');
      err.name = 'JsonWebTokenError';
      throw err;
    }

    logger.error('🔴 JWT: Token verification failed:', {
      errorMessage: error.message,
      errorName: error.name,
      stack: error.stack,
    });
    throw new Error('Token verification failed');
  }
};

/**
 * Decode token without verification (for debugging only)
 * WARNING: This bypasses signature verification - never use in production
 * @param {string} token - JWT token
 * @returns {object} Decoded token payload
 */
const decodeTokenWithoutVerification = (token) => {
  if (!token) {
    throw new Error('Token is required');
  }

  try {
    const decoded = jwt.decode(token);

    if (!decoded) {
      throw new Error('Invalid token format');
    }

    if (process.env.NODE_ENV === 'production') {
      logger.warn('decodeTokenWithoutVerification called in production', {
        userId: decoded.userId,
      });
    }

    return decoded;
  } catch (error) {
    logger.error('Token decode failed:', { error: error.message });
    throw new Error('Failed to decode token');
  }
};

/**
 * Extract token from Authorization header
 * Expected format: "Bearer <token>"
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null if invalid format
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Check if token is close to expiration
 * @param {string} token - JWT token
 * @param {number} bufferMinutes - Minutes before expiry to consider "close" (default: 5)
 * @returns {boolean} True if token expires within buffer time
 */
const isTokenExpiringSoon = (token, bufferMinutes = 5) => {
  try {
    const decoded = decodeTokenWithoutVerification(token);

    if (!decoded.exp) {
      return false;
    }

    const expiryTime = decoded.exp * 1000; // Convert to milliseconds
    const bufferTime = bufferMinutes * 60 * 1000;
    const now = Date.now();

    return (expiryTime - now) < bufferTime;
  } catch (error) {
    return false;
  }
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  decodeTokenWithoutVerification,
  extractTokenFromHeader,
  isTokenExpiringSoon,
  ALGORITHM,
  JWT_EXPIRY,
  JWT_REFRESH_EXPIRY,
};
