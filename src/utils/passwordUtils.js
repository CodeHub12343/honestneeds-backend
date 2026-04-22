/**
 * Password Utility Module
 * Handles secure password hashing and verification with bcrypt
 */

const bcrypt = require('bcryptjs');
const { logger } = require('./logger');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

/**
 * Hash password with bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 * @throws {Error} If hashing fails
 */
const hashPassword = async (password) => {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    logger.debug('Password hashed successfully', {
      rounds: BCRYPT_ROUNDS,
    });
    return hashedPassword;
  } catch (error) {
    logger.error('Password hashing failed:', { message: error.message });
    throw new Error('Failed to hash password');
  }
};

/**
 * Compare plain text password with hashed password
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Stored hash to compare against
 * @returns {Promise<boolean>} True if passwords match
 * @throws {Error} If comparison fails
 */
const verifyPassword = async (plainPassword, hashedPassword) => {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Plain password must be a non-empty string');
  }

  if (!hashedPassword || typeof hashedPassword !== 'string') {
    throw new Error('Hashed password must be a non-empty string');
  }

  try {
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    logger.error('Password verification failed:', { message: error.message });
    throw new Error('Failed to verify password');
  }
};

module.exports = {
  hashPassword,
  verifyPassword,
  BCRYPT_ROUNDS,
};
