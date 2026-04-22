/**
 * Socket.io Handler
 * Manages WebSocket connections for real-time campaign updates
 * 
 * Events:
 * - connection: User connects to real-time updates
 * - donation:received: New donation recorded
 * - analytics:updated: Campaign analytics changed
 * - campaign:status_changed: Campaign status changed
 * - heartbeat: Keep-alive signal
 * - disconnect: User disconnects
 */

const winstonLogger = require('../utils/winstonLogger');
const RealTimeService = require('../services/RealTimeService');

/**
 * Initialize Socket.io handlers
 * @param {Object} io - Socket.io instance
 */
function initializeSocketHandlers(io) {
  winstonLogger.info('🔌 Initializing Socket.io handlers');

  // Initialize RealTimeService with io instance
  RealTimeService.initialize(io);

  // Handle new connections
  io.on('connection', (socket) => {
    winstonLogger.debug('✅ Socket.io: New connection', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    /**
     * Join campaign room for live updates
     * Event: join_campaign
     * Payload: { campaign_id: string }
     */
    socket.on('join_campaign', (data) => {
      const { campaign_id } = data;

      if (!campaign_id) {
        winstonLogger.warn('⚠️ Socket.io: join_campaign missing campaign_id', {
          socketId: socket.id,
        });
        socket.emit('error', {
          event_type: 'error',
          error_code: 'MISSING_CAMPAIGN_ID',
          message: 'campaign_id is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const roomName = `campaign:${campaign_id}`;
      socket.join(roomName);

      winstonLogger.info('📍 Socket.io: Client joined campaign room', {
        socketId: socket.id,
        campaign_id,
        room: roomName,
        connectedClients: RealTimeService.getConnectedClientsCount(campaign_id),
        timestamp: new Date().toISOString(),
      });

      // Send connection confirmation with current client count
      RealTimeService.sendConnectionConfirmation(socket, campaign_id);

      // Notify other clients in the room
      socket.to(roomName).emit('client_connected', {
        event_type: 'client_connected',
        campaign_id,
        connected_viewers: RealTimeService.getConnectedClientsCount(campaign_id),
        timestamp: new Date().toISOString(),
      });
    });

    /**
     * Leave campaign room
     * Event: leave_campaign
     * Payload: { campaign_id: string }
     */
    socket.on('leave_campaign', (data) => {
      const { campaign_id } = data;

      if (!campaign_id) {
        return;
      }

      const roomName = `campaign:${campaign_id}`;
      socket.leave(roomName);

      winstonLogger.info('📍 Socket.io: Client left campaign room', {
        socketId: socket.id,
        campaign_id,
        room: roomName,
        remainingClients: RealTimeService.getConnectedClientsCount(campaign_id),
        timestamp: new Date().toISOString(),
      });

      // Notify other clients
      io.to(roomName).emit('client_disconnected', {
        event_type: 'client_disconnected',
        campaign_id,
        connected_viewers: RealTimeService.getConnectedClientsCount(campaign_id),
        timestamp: new Date().toISOString(),
      });
    });

    /**
     * Heartbeat (keep-alive)
     * Event: ping
     * Response: pong
     */
    socket.on('ping', () => {
      socket.emit('pong', {
        timestamp: new Date().toISOString(),
      });
    });

    /**
     * Get current campaign viewer count
     * Event: get_viewers_count
     * Payload: { campaign_id: string }
     */
    socket.on('get_viewers_count', (data) => {
      const { campaign_id } = data;

      if (!campaign_id) {
        socket.emit('error', {
          error_code: 'MISSING_CAMPAIGN_ID',
          message: 'campaign_id is required',
        });
        return;
      }

      const count = RealTimeService.getConnectedClientsCount(campaign_id);

      socket.emit('viewers_count', {
        campaign_id,
        count,
        timestamp: new Date().toISOString(),
      });
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', () => {
      winstonLogger.debug('❌ Socket.io: Client disconnected', {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    });

    /**
     * Handle errors
     */
    socket.on('error', (error) => {
      winstonLogger.error('❌ Socket.io: Socket error', {
        socketId: socket.id,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    });
  });

  winstonLogger.info('✅ Socket.io handlers initialized successfully');
}

module.exports = {
  initializeSocketHandlers,
};
