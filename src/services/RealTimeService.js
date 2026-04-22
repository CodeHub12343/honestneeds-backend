/**
 * Real-Time Service
 * Handles WebSocket/Socket.io connections for live donation updates
 * 
 * Broadcasts donation updates to all clients viewing a campaign
 * Enables real-time dashboard refresh without polling
 */

const winstonLogger = require('../utils/winstonLogger');

class RealTimeService {
  constructor() {
    this.io = null;
    this.campaignRooms = new Map(); // Track rooms per campaign
  }

  /**
   * Initialize Socket.io server
   * @param {Object} io - Socket.io instance
   */
  initialize(io) {
    this.io = io;
    winstonLogger.info('✅ RealTimeService: Socket.io initialized', {
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast new donation to all clients viewing a campaign
   * @param {string} campaignId - Campaign ID
   * @param {Object} donationData - Donation details
   * @returns {void}
   */
  broadcastDonation(campaignId, donationData) {
    if (!this.io) {
      winstonLogger.warn('⚠️ RealTimeService.broadcastDonation: Socket.io not initialized');
      return;
    }

    const roomName = `campaign:${campaignId}`;
    const payload = {
      event_type: 'donation:new',
      campaign_id: campaignId,
      timestamp: new Date().toISOString(),
      data: {
        transaction_id: donationData.transaction_id,
        amount_dollars: donationData.amount_dollars,
        amount_cents: donationData.amount_cents,
        donor_name: donationData.donor_name || 'Anonymous Donor',
        message: donationData.message || null,
        sweepstakes_entries: donationData.sweepstakes_entries || 0,
      },
    };

    winstonLogger.debug('📡 RealTimeService: Broadcasting donation', {
      room: roomName,
      transactionId: donationData.transaction_id,
      amountDollars: donationData.amount_dollars,
    });

    this.io.to(roomName).emit('donation:received', payload);
  }

  /**
   * Broadcast campaign analytics update
   * @param {string} campaignId - Campaign ID
   * @param {Object} analyticsData - Updated analytics
   * @returns {void}
   */
  broadcastAnalyticsUpdate(campaignId, analyticsData) {
    if (!this.io) {
      winstonLogger.warn('⚠️ RealTimeService.broadcastAnalyticsUpdate: Socket.io not initialized');
      return;
    }

    const roomName = `campaign:${campaignId}`;
    const payload = {
      event_type: 'analytics:updated',
      campaign_id: campaignId,
      timestamp: new Date().toISOString(),
      data: {
        total_donations: analyticsData.total_donations,
        total_donation_amount_cents: analyticsData.total_donation_amount_cents,
        total_donation_amount_dollars: (analyticsData.total_donation_amount_cents / 100).toFixed(2),
        fee_total_cents: analyticsData.fee_total_cents,
        creator_net_cents: analyticsData.creator_net_cents,
        average_donation: analyticsData.average_donation,
        progress_percent: analyticsData.progress_percent,
      },
    };

    winstonLogger.debug('📡 RealTimeService: Broadcasting analytics update', {
      room: roomName,
      totalDonations: analyticsData.total_donations,
    });

    this.io.to(roomName).emit('analytics:updated', payload);
  }

  /**
   * Broadcast campaign status change
   * @param {string} campaignId - Campaign ID
   * @param {string} newStatus - New campaign status
   * @param {Object} additionalData - Extra data
   * @returns {void}
   */
  broadcastCampaignStatusChange(campaignId, newStatus, additionalData = {}) {
    if (!this.io) {
      winstonLogger.warn('⚠️ RealTimeService.broadcastCampaignStatusChange: Socket.io not initialized');
      return;
    }

    const roomName = `campaign:${campaignId}`;
    const payload = {
      event_type: 'campaign:status_changed',
      campaign_id: campaignId,
      new_status: newStatus,
      timestamp: new Date().toISOString(),
      data: additionalData,
    };

    winstonLogger.info('📡 RealTimeService: Broadcasting campaign status change', {
      room: roomName,
      newStatus,
    });

    this.io.to(roomName).emit('campaign:status_changed', payload);
  }

  /**
   * Send user connection confirmation
   * @param {Object} socket - Socket.io socket instance
   * @param {string} campaignId - Campaign ID
   * @returns {void}
   */
  sendConnectionConfirmation(socket, campaignId) {
    const payload = {
      event_type: 'connection:confirmed',
      campaign_id: campaignId,
      message: `Connected to live updates for campaign ${campaignId}`,
      timestamp: new Date().toISOString(),
    };

    winstonLogger.debug('✅ RealTimeService: Sending connection confirmation', {
      socketId: socket.id,
      campaignId,
    });

    socket.emit('connection:confirmed', payload);
  }

  /**
   * Send keep-alive heartbeat
   * @param {Object} socket - Socket.io socket instance
   * @returns {void}
   */
  sendHeartbeat(socket) {
    const payload = {
      event_type: 'heartbeat',
      timestamp: new Date().toISOString(),
    };

    socket.emit('heartbeat', payload);
  }

  /**
   * Get connected clients count for a campaign
   * @param {string} campaignId - Campaign ID
   * @returns {number} Number of connected clients
   */
  getConnectedClientsCount(campaignId) {
    if (!this.io) {
      return 0;
    }

    const roomName = `campaign:${campaignId}`;
    const room = this.io.sockets.adapter.rooms.get(roomName);
    return room ? room.size : 0;
  }

  /**
   * Disconnect all clients from a campaign room
   * @param {string} campaignId - Campaign ID
   * @param {string} reason - Disconnection reason
   * @returns {void}
   */
  disconnectCampaignRoom(campaignId, reason = 'Campaign closed') {
    if (!this.io) {
      return;
    }

    const roomName = `campaign:${campaignId}`;
    this.io.to(roomName).emit('campaign:closed', {
      event_type: 'campaign:closed',
      campaign_id: campaignId,
      reason,
      timestamp: new Date().toISOString(),
    });

    winstonLogger.info('🔌 RealTimeService: Disconnecting campaign room', {
      room: roomName,
      reason,
    });
  }
}

// Export singleton instance
module.exports = new RealTimeService();
