/**
 * Analytics Cache
 * Simple in-memory cache for analytics queries
 * 
 * Features:
 * - TTL-based expiration (default 1 hour)
 * - Manual invalidation
 * - Memory-efficient
 */

const winstonLogger = require('./winstonLogger');

class AnalyticsCache {
  constructor(ttlMs = 3600000) {
    // 1 hour default TTL
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.timestamps = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
    };
  }

  /**
   * Generate cache key for campaign analytics
   * 
   * @param {string} campaignId - Campaign ID
   * @param {object} options - Cache options { progressDays }
   * @returns {string} Cache key
   */
  generateKey(campaignId, options = {}) {
    const { progressDays = 30 } = options;
    return `analytics:${campaignId}:${progressDays}`;
  }

  /**
   * Get value from cache
   * 
   * @param {string} key - Cache key
   * @returns {object|null} Cached value or null if expired/missing
   */
  get(key) {
    // Check if exists
    if (!this.cache.has(key)) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    const timestamp = this.timestamps.get(key);
    if (timestamp && Date.now() - timestamp > this.ttlMs) {
      // Expired, remove and return null
      this.cache.delete(key);
      this.timestamps.delete(key);
      this.stats.misses++;
      return null;
    }

    // Valid cache hit
    this.stats.hits++;
    return this.cache.get(key);
  }

  /**
   * Set value in cache
   * 
   * @param {string} key - Cache key
   * @param {object} value - Value to cache
   * @returns {object} Cached value
   */
  set(key, value) {
    this.cache.set(key, value);
    this.timestamps.set(key, Date.now());
    this.stats.sets++;

    winstonLogger.debug('Analytics cached', {
      key,
      ttlMs: this.ttlMs,
    });

    return value;
  }

  /**
   * Invalidate specific campaign analytics
   * 
   * @param {string} campaignId - Campaign ID to invalidate
   */
  invalidate(campaignId) {
    const keysToDelete = [];

    // Find all keys for this campaign
    for (const key of this.cache.keys()) {
      if (key.includes(`analytics:${campaignId}:`)) {
        keysToDelete.push(key);
      }
    }

    // Delete them
    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.timestamps.delete(key);
    });

    winstonLogger.debug('Analytics cache invalidated', {
      campaignId,
      keysDeleted: keysToDelete.length,
    });

    return keysToDelete.length;
  }

  /**
   * Clear all cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.timestamps.clear();

    winstonLogger.debug('Analytics cache cleared', { entriesCleared: size });
  }

  /**
   * Get cache statistics
   * 
   * @returns {object} Statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 'N/A';

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
    };
  }

  /**
   * Get cache memory usage estimate
   * 
   * @returns {object} Memory info
   */
  getMemoryInfo() {
    let totalSize = 0;

    for (const value of this.cache.values()) {
      totalSize += JSON.stringify(value).length;
    }

    return {
      entries: this.cache.size,
      estimatedBytesUsed: totalSize,
      estimatedKbUsed: (totalSize / 1024).toFixed(2),
    };
  }
}

// Export singleton instance
module.exports = new AnalyticsCache();
