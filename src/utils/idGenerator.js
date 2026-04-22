/**
 * ID Generator Utilities
 * Provides functions for generating unique identifiers
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a shortened unique ID
 * Uses first 8 characters of a UUID v4 for brevity while maintaining uniqueness
 *
 * @returns {string} Shortened unique identifier
 */
const generateShortenedId = () => {
  return uuidv4().substring(0, 8).toUpperCase();
};

module.exports = {
  generateShortenedId,
};