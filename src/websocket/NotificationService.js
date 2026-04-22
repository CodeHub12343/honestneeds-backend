/**
 * WebSocket Notifications Service
 * Manages WebSocket connections for real-time notifications
 * Handles message broadcasting, user-specific notifications, and cleanup
 */

const WebSocket = require('ws');
const winstonLogger = require('../utils/winstonLogger');

class WebSocketNotificationService {
  constructor() {
    this.clients = new Map(); // userId -> Set<WebSocket>
    this.messageQueue = []; // Store messages for offline users
    this.messageQueueLimit = 100; // Max messages per user
  }

  /**
   * Setup WebSocket server
   */
  setupServer(server) {
    this.wss = new WebSocket.Server({ server, path: '/api/notifications' });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    winstonLogger.info('✅ WebSocket server initialized', { path: '/api/notifications' });
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, req) {
    try {
      // Extract user ID from query token
      const url = new URL(req.url, `http://${req.headers.host}`);
      const userId = url.searchParams.get('token');

      if (!userId) {
        winstonLogger.warn('❌ WebSocket connection rejected: No user ID');
        ws.close(1008, 'Missing user ID');
        return;
      }

      // Add to clients map
      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId).add(ws);

      winstonLogger.info('✅ WebSocket client connected', {
        userId,
        totalClients: this.clients.size,
        clientConnectionsForUser: this.clients.get(userId).size,
      });

      // Send queued messages
      this.sendQueuedMessages(userId, ws);

      // Setup message handler
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(userId, message, ws);
        } catch (err) {
          winstonLogger.error('Error parsing WebSocket message:', {
            error: err.message,
            userId,
            data: data.toString().substring(0, 100),
          });
        }
      });

      // Setup close handler
      ws.on('close', () => {
        const userConnections = this.clients.get(userId);
        if (userConnections) {
          userConnections.delete(ws);
          if (userConnections.size === 0) {
            this.clients.delete(userId);
          }
        }
        winstonLogger.info('📤 WebSocket client disconnected', {
          userId,
          remainingClientsForUser: userConnections?.size || 0,
        });
      });

      // Setup error handler
      ws.on('error', (error) => {
        winstonLogger.error('WebSocket error', {
          userId,
          error: error.message,
        });
      });
    } catch (error) {
      winstonLogger.error('Error handling WebSocket connection:', {
        error: error.message,
        stack: error.stack,
      });
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(userId, message, ws) {
    winstonLogger.debug('📨 Incoming WebSocket message', {
      userId,
      type: message.type,
    });

    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;

      case 'subscribe':
        // User can subscribe to specific channels
        if (!ws.subscriptions) {
          ws.subscriptions = new Set();
        }
        ws.subscriptions.add(message.channel);
        winstonLogger.info('User subscribed to channel', {
          userId,
          channel: message.channel,
        });
        break;

      case 'unsubscribe':
        if (ws.subscriptions) {
          ws.subscriptions.delete(message.channel);
        }
        break;

      default:
        winstonLogger.warn('Unknown WebSocket message type', {
          userId,
          type: message.type,
        });
    }
  }

  /**
   * Send notification to specific user
   */
  notifyUser(userId, message) {
    const userConnections = this.clients.get(userId);

    if (!userConnections || userConnections.size === 0) {
      // Queue message for when user comes online
      this.queueMessage(userId, message);
      return false;
    }

    const payload = JSON.stringify({
      ...message,
      timestamp: new Date().toISOString(),
    });

    let sent = false;
    userConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        sent = true;
      }
    });

    if (sent) {
      winstonLogger.debug('📤 Notification sent to user', {
        userId,
        type: message.type,
      });
    }

    return sent;
  }

  /**
   * Broadcast notification to all connected users
   */
  broadcastNotification(message) {
    const payload = JSON.stringify({
      ...message,
      timestamp: new Date().toISOString(),
    });

    let sent = 0;
    this.clients.forEach((connections) => {
      connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
          sent++;
        }
      });
    });

    winstonLogger.info('📢 Notification broadcasted', {
      type: message.type,
      sentTo: sent,
      totalClients: this.clients.size,
    });
  }

  /**
   * Queue message for offline user
   */
  queueMessage(userId, message) {
    if (!this.messageQueue[userId]) {
      this.messageQueue[userId] = [];
    }

    this.messageQueue[userId].push({
      ...message,
      timestamp: new Date().toISOString(),
    });

    // Limit queue size
    if (this.messageQueue[userId].length > this.messageQueueLimit) {
      this.messageQueue[userId].shift();
    }

    winstonLogger.debug('💾 Message queued for offline user', {
      userId,
      queueSize: this.messageQueue[userId].length,
    });
  }

  /**
   * Send queued messages to user
   */
  sendQueuedMessages(userId, ws) {
    if (!this.messageQueue[userId] || this.messageQueue[userId].length === 0) {
      return;
    }

    const messages = this.messageQueue[userId];
    winstonLogger.info('📬 Sending queued messages to user', {
      userId,
      count: messages.length,
    });

    messages.forEach((message) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });

    // Clear queue
    delete this.messageQueue[userId];
  }

  /**
   * Notify campaign event
   */
  notifyCampaignEvent(userId, eventType, campaignData) {
    return this.notifyUser(userId, {
      type: 'campaign_event',
      eventType,
      data: campaignData,
    });
  }

  /**
   * Notify donation
   */
  notifyDonation(userId, donationData) {
    return this.notifyUser(userId, {
      type: 'donation_received',
      data: donationData,
    });
  }

  /**
   * Notify milestone
   */
  notifyMilestone(userId, campaignData, milestonePercentage) {
    return this.notifyUser(userId, {
      type: 'milestone_reached',
      data: {
        ...campaignData,
        milestonePercentage,
      },
    });
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount() {
    return this.clients.size;
  }

  /**
   * Get total connected clients
   */
  getTotalClientsCount() {
    let total = 0;
    this.clients.forEach((connections) => {
      total += connections.size;
    });
    return total;
  }

  /**
   * Cleanup method
   */
  cleanup() {
    this.clients.forEach((connections) => {
      connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    });
    this.clients.clear();
    this.messageQueue = [];
    winstonLogger.info('WebSocketNotificationService cleaned up');
  }
}

module.exports = new WebSocketNotificationService();
