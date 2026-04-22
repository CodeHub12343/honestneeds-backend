/**
 * Notification WebSocket Handlers
 * Manages real-time notifications for dashboard updates
 * 
 * Namespaces:
 * - /notifications: Creator notifications (activity feed, alerts)
 * - /notifications:creator:{userId}: User-specific notifications
 * 
 * Events:
 * - notification:subscribe: Subscribe to notifications
 * - notification:unsubscribe: Unsubscribe
 * - notification:read: Mark notification as read
 * - connection: User connects
 * - disconnect: User disconnects
 * - heartbeat: Keep-alive signal
 * 
 * Emitted Events:
 * - activity:created: New activity recorded
 * - notification:alert: Alert notification
 * - campaign:status_changed: Campaign status changed
 * - donation:received: New donation
 * - goal:reached: Campaign goal reached
 * - milestone:achieved: Milestone reached
 * - activity:feed: Activity feed update
 */

const winstonLogger = require('../utils/winstonLogger');
const ActivityFeedService = require('../services/ActivityFeedService');

/**
 * Connected users tracking
 * { userId: { socketId, preferences, connectedAt } }
 */
const connectedUsers = new Map();

/**
 * Initialize notification handlers
 * @param {Object} io - Socket.io instance
 */
function initializeNotificationHandlers(io) {
  winstonLogger.info('🔔 Initializing notification WebSocket handlers');

  // Create /notifications namespace
  const notificationNamespace = io.of('/notifications');

  notificationNamespace.use(async (socket, next) => {
    try {
      // Extract userId from socket handshake query or headers
      const userId = socket.handshake.query.userId || socket.handshake.auth?.userId;

      if (!userId) {
        winstonLogger.warn('❌ Notification WebSocket: Missing userId', {
          socketId: socket.id,
          query: socket.handshake.query,
        });
        return next(new Error('Missing userId'));
      }

      // Attach userId to socket
      socket.userId = userId;
      next();
    } catch (error) {
      winstonLogger.error('❌ Notification WebSocket middleware error', {
        error: error.message,
        stack: error.stack,
      });
      next(error);
    }
  });

  // Handle connection
  notificationNamespace.on('connection', (socket) => {
    const { userId } = socket;

    winstonLogger.info('✅ Notification WebSocket: Connected', {
      socketId: socket.id,
      userId,
      timestamp: new Date().toISOString(),
    });

    // Track connected user
    connectedUsers.set(userId, {
      socketId: socket.id,
      connectedAt: new Date(),
      preferences: {
        notificationsEnabled: true,
        soundEnabled: true,
        browserNotificationsEnabled: true,
      },
    });

    // Send connection success
    socket.emit('connection:success', {
      socketId: socket.id,
      userId,
      timestamp: new Date().toISOString(),
      serverTime: Date.now(),
    });

    // Join user room for targeted notifications
    socket.join(`user:${userId}`);

    /**
     * Subscribe to real-time notifications
     * Event: notification:subscribe
     */
    socket.on('notification:subscribe', async (data) => {
      try {
        const { preferences = {} } = data;

        // Update user preferences
        if (connectedUsers.has(userId)) {
          const user = connectedUsers.get(userId);
          user.preferences = { ...user.preferences, ...preferences };
          connectedUsers.set(userId, user);
        }

        winstonLogger.debug('📢 Notification: Subscribe', {
          userId,
          socketId: socket.id,
          preferences,
        });

        socket.emit('notification:subscribed', {
          success: true,
          message: 'Subscribed to notifications',
          timestamp: new Date().toISOString(),
        });

        // Send recent activity
        try {
          const recentActivity = await ActivityFeedService.getRecentActivity(userId, 10);
          socket.emit('activity:feed', {
            activities: recentActivity,
            count: recentActivity.length,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          winstonLogger.error('Error fetching recent activity', { userId, error: error.message });
        }
      } catch (error) {
        winstonLogger.error('❌ notification:subscribe error', {
          userId,
          error: error.message,
          stack: error.stack,
        });
        socket.emit('error', {
          code: 'SUBSCRIBE_ERROR',
          message: error.message,
        });
      }
    });

    /**
     * Mark notification as read
     * Event: notification:read
     */
    socket.on('notification:read', async (data) => {
      try {
        const { notificationId } = data;

        if (!notificationId) {
          return socket.emit('error', {
            code: 'MISSING_NOTIFICATION_ID',
            message: 'notificationId is required',
          });
        }

        // Mark as read in database
        await ActivityFeedService.markActivityAsRead(notificationId, userId);

        socket.emit('notification:read:success', {
          notificationId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        winstonLogger.error('❌ notification:read error', {
          userId,
          error: error.message,
        });
      }
    });

    /**
     * Heartbeat to keep connection alive
     * Event: heartbeat
     */
    socket.on('heartbeat', () => {
      socket.emit('heartbeat:ack', {
        timestamp: new Date().toISOString(),
        serverTime: Date.now(),
      });
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', () => {
      connectedUsers.delete(userId);

      winstonLogger.info('❌ Notification WebSocket: Disconnected', {
        socketId: socket.id,
        userId,
        timestamp: new Date().toISOString(),
      });
    });

    /**
     * Error handling
     */
    socket.on('error', (error) => {
      winstonLogger.error('❌ Notification WebSocket error', {
        socketId: socket.id,
        userId,
        error: error.message,
      });
    });
  });

  return notificationNamespace;
}

/**
 * Broadcast notification to user
 * @param {Object} io - Socket.io instance
 * @param {string} userId - User ID
 * @param {string} eventType - Event type (campaign_activated, donation_received, etc)
 * @param {Object} data - Event data
 */
function notifyUser(io, userId, eventType, data) {
  try {
    io.of('/notifications').to(`user:${userId}`).emit('notification:alert', {
      eventType,
      data,
      timestamp: new Date().toISOString(),
      read: false,
    });

    // Also emit specific event
    io.of('/notifications').to(`user:${userId}`).emit(eventType, {
      data,
      timestamp: new Date().toISOString(),
    });

    winstonLogger.debug('📧 Notification sent', {
      userId,
      eventType,
    });
  } catch (error) {
    winstonLogger.error('❌ Error notifying user', {
      userId,
      eventType,
      error: error.message,
    });
  }
}

/**
 * Broadcast notification to multiple users
 * @param {Object} io - Socket.io instance
 * @param {string[]} userIds - User IDs
 * @param {string} eventType - Event type
 * @param {Object} data - Event data
 */
function notifyUsers(io, userIds, eventType, data) {
  userIds.forEach((userId) => notifyUser(io, userId, eventType, data));
}

/**
 * Get connected users count
 * @returns {number}
 */
function getConnectedUsersCount() {
  return connectedUsers.size;
}

/**
 * Get user connection info
 * @param {string} userId - User ID
 * @returns {Object|null}
 */
function getUserConnection(userId) {
  return connectedUsers.get(userId) || null;
}

/**
 * Check if user is connected
 * @param {string} userId - User ID
 * @returns {boolean}
 */
function isUserConnected(userId) {
  return connectedUsers.has(userId);
}

module.exports = {
  initializeNotificationHandlers,
  notifyUser,
  notifyUsers,
  getConnectedUsersCount,
  getUserConnection,
  isUserConnected,
};
