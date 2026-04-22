/**
 * EventBus - Central event publishing and subscription system
 * Handles campaign lifecycle events with error handling and logging
 * 
 * Events emitted:
 * - campaign:created - Campaign created
 * - campaign:published - Campaign published (goes live)
 * - campaign:updated - Campaign updated
 * - campaign:paused - Campaign paused
 * - campaign:completed - Campaign completed
 * - campaign:deleted - Campaign deleted
 * 
 * Usage:
 * - Emit: EventBus.publishEvent('campaign:published', { campaignId, name, creatorEmail })
 * - Listen: EventBus.subscribeTo('campaign:published', async (data) => {...})
 */

const winstonLogger = require('../utils/winstonLogger');

class EventBus {
  constructor() {
    // Map of event type -> array of handler functions
    this.subscribers = new Map();
    
    // Store event history for debugging (keep last 1000 events)
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    
    // Track event statistics
    this.stats = {
      totalEvents: 0,
      eventsByType: {},
      failedHandlers: 0,
    };
  }

  /**
   * Subscribe to an event type
   * 
   * @param {string} eventType - Event type (e.g., 'campaign:published')
   * @param {function} handler - Async handler function that receives event data
   * @param {object} options - Optional { priority, once, timeout }
   * @returns {function} Unsubscribe function
   */
  subscribeTo(eventType, handler, options = {}) {
    if (typeof eventType !== 'string' || !eventType.trim()) {
      throw new Error('Event type must be a non-empty string');
    }
    
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    // Initialize event type if not exists
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }

    // Wrap handler with metadata
    const subscription = {
      handler,
      priority: options.priority || 0,
      once: options.once || false,
      timeout: options.timeout || 30000, // 30 second default timeout
      createdAt: new Date(),
    };

    const handlers = this.subscribers.get(eventType);
    
    // Insert by priority (higher priority first)
    const index = handlers.findIndex(h => h.priority < subscription.priority);
    if (index === -1) {
      handlers.push(subscription);
    } else {
      handlers.splice(index, 0, subscription);
    }

    winstonLogger.debug('Event subscriber registered', {
      eventType,
      handlerCount: handlers.length,
      priority: subscription.priority,
    });

    // Return unsubscribe function
    return () => this.unsubscribeFrom(eventType, handler);
  }

  /**
   * Subscribe to event once and auto-unsubscribe after first call
   * 
   * @param {string} eventType - Event type
   * @param {function} handler - Handler function
   * @returns {function} Unsubscribe function
   */
  once(eventType, handler) {
    return this.subscribeTo(eventType, handler, { once: true });
  }

  /**
   * Unsubscribe from an event
   * 
   * @param {string} eventType - Event type
   * @param {function} handler - Handler function to remove
   */
  unsubscribeFrom(eventType, handler) {
    if (!this.subscribers.has(eventType)) {
      return;
    }

    const handlers = this.subscribers.get(eventType);
    const index = handlers.findIndex(h => h.handler === handler);
    
    if (index !== -1) {
      handlers.splice(index, 1);
      
      winstonLogger.debug('Event subscriber removed', {
        eventType,
        handlerCount: handlers.length,
      });

      // Clean up if no more handlers
      if (handlers.length === 0) {
        this.subscribers.delete(eventType);
      }
    }
  }

  /**
   * Publish an event - calls all subscribed handlers
   * 
   * @param {string} eventType - Event type
   * @param {object} data - Event data passed to handlers
   * @param {object} metadata - Optional metadata { correlationId, userId, timestamp }
   * @returns {Promise} Resolves when all handlers complete
   */
  async publishEvent(eventType, data = {}, metadata = {}) {
    if (typeof eventType !== 'string' || !eventType.trim()) {
      throw new Error('Event type must be a non-empty string');
    }

    // Generate correlation ID if not provided
    const correlationId = metadata.correlationId || this.generateCorrelationId();
    const timestamp = metadata.timestamp || new Date();

    // Create event object
    const event = {
      type: eventType,
      data,
      correlationId,
      userId: metadata.userId,
      timestamp,
      handlerCount: 0,
      failedHandlers: [],
      duration: 0,
    };

    // Record in history
    this.recordEvent(event);

    // Update statistics
    this.stats.totalEvents++;
    if (!this.stats.eventsByType[eventType]) {
      this.stats.eventsByType[eventType] = 0;
    }
    this.stats.eventsByType[eventType]++;

    // Log event publication
    winstonLogger.info(`Event published: ${eventType}`, {
      eventType,
      correlationId,
      userId: metadata.userId,
      dataKeys: Object.keys(data),
    });

    // Get handlers for this event type
    const handlers = this.subscribers.get(eventType) || [];
    if (handlers.length === 0) {
      winstonLogger.warn(`No handlers for event: ${eventType}`, {
        correlationId,
      });
      return event;
    }

    // Track execution time
    const startTime = Date.now();

    // Execute all handlers concurrently with error handling
    const handlerPromises = handlers.map(async (subscription) => {
      try {
        // Set timeout for handler execution
        const handlerResult = await Promise.race([
          subscription.handler(data, { correlationId, eventType }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Handler timeout')),
              subscription.timeout
            )
          ),
        ]);

        event.handlerCount++;

        winstonLogger.debug('Event handler completed', {
          eventType,
          correlationId,
          timeout: subscription.timeout,
        });

        // Remove if one-time subscription
        if (subscription.once) {
          this.unsubscribeFrom(eventType, subscription.handler);
        }

        return { success: true };
      } catch (error) {
        event.failedHandlers.push({
          handler: subscription.handler.name || 'anonymous',
          error: error.message,
          timestamp: new Date(),
        });

        this.stats.failedHandlers++;

        winstonLogger.error('Event handler failed', {
          eventType,
          correlationId,
          error: error.message,
          handlerName: subscription.handler.name || 'anonymous',
          stack: error.stack,
        });

        // Don't re-throw - allow other handlers to execute
        return { success: false, error };
      }
    });

    // Wait for all handlers
    await Promise.all(handlerPromises);

    // Record duration
    event.duration = Date.now() - startTime;

    // Log final event result
    winstonLogger.info(`Event complete: ${eventType}`, {
      eventType,
      correlationId,
      handlersExecuted: event.handlerCount,
      failedHandlers: event.failedHandlers.length,
      duration: event.duration,
    });

    return event;
  }

  /**
   * Record event in history
   * 
   * @private
   */
  recordEvent(event) {
    this.eventHistory.push({
      ...event,
      recordedAt: new Date(),
    });

    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get event history
   * 
   * @param {object} filter - Optional { eventType, limit, userId, correlationId }
   * @returns {array} Event history
   */
  getEventHistory(filter = {}) {
    let history = [...this.eventHistory];

    if (filter.eventType) {
      history = history.filter(e => e.type === filter.eventType);
    }

    if (filter.userId) {
      history = history.filter(e => e.userId === filter.userId);
    }

    if (filter.correlationId) {
      history = history.filter(e => e.correlationId === filter.correlationId);
    }

    const limit = filter.limit || 100;
    return history.slice(-limit);
  }

  /**
   * Get event statistics
   * 
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      subscriberCount: this.subscribers.size,
      historySize: this.eventHistory.length,
    };
  }

  /**
   * Clear all subscriptions (useful for testing)
   */
  clearSubscriptions() {
    this.subscribers.clear();
    winstonLogger.debug('All event subscriptions cleared');
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
  }

  /**
   * Generate unique correlation ID
   * 
   * @private
   */
  generateCorrelationId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get number of subscribers for an event type
   * 
   * @param {string} eventType - Event type
   * @returns {number} Number of subscribers
   */
  getSubscriberCount(eventType) {
    return (this.subscribers.get(eventType) || []).length;
  }

  /**
   * Alias for subscribeTo() for EventEmitter compatibility
   * Subscribe to an event type
   * 
   * @param {string} eventType - Event type
   * @param {function} handler - Handler function
   * @param {object} options - Optional options
   * @returns {function} Unsubscribe function
   */
  on(eventType, handler, options = {}) {
    return this.subscribeTo(eventType, handler, options);
  }

  /**
   * Alias for publishEvent() for EventEmitter compatibility
   * Publish an event to all subscribers
   * 
   * @param {string} eventType - Event type
   * @param {object} data - Event data
   * @param {object} metadata - Optional metadata
   * @returns {Promise<object>} Event result
   */
  emit(eventType, data = {}, metadata = {}) {
    return this.publishEvent(eventType, data, metadata);
  }
}

// Export singleton instance
module.exports = new EventBus();
