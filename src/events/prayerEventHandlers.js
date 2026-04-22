const winstonLogger = require('../utils/winstonLogger');
const EventBus = require('./EventBus');
const NotificationService = require('../services/NotificationService');

/**
 * Register all prayer-related event handlers
 */
function registerPrayerEventHandlers() {
  /**
   * When a prayer is created
   */
  EventBus.on('prayer:created', async (data) => {
    try {
      winstonLogger.info(`📬 Processing prayer:created event for ${data.prayer_id}`);

      const { campaign_id, creator_id, supporter_id, type, status, flagged } = data;

      // Notify creator of new prayer
      if (!flagged) {
        try {
          await NotificationService.notifyCreatorNewPrayer(creator_id, campaign_id, {
            prayer_id: data.prayer_id,
            type,
            supporter_id,
          });
        } catch (error) {
          winstonLogger.error(`Failed to notify creator of prayer: ${error.message}`);
        }
      } else {
        // Notify admin of flagged prayer
        try {
          await NotificationService.notifyAdminFlaggedPrayer({
            prayer_id: data.prayer_id,
            campaign_id,
            creator_id,
            type,
          });
        } catch (error) {
          winstonLogger.error(`Failed to notify admin of flagged prayer: ${error.message}`);
        }
      }

      // Log activity
      try {
        const ActivityLog = require('../models/ActivityLog');
        await ActivityLog.create({
          user_id: supporter_id,
          action: 'prayer_submitted',
          resource_type: 'prayer',
          resource_id: data.prayer_id,
          campaign_id,
          metadata: { type, flagged },
        });
      } catch (error) {
        winstonLogger.warn(`Failed to log prayer activity: ${error.message}`);
      }
    } catch (error) {
      winstonLogger.error(`Error handling prayer:created event: ${error.message}`);
    }
  });

  /**
   * When a prayer is approved
   */
  EventBus.on('prayer:approved', async (data) => {
    try {
      winstonLogger.info(`✅ Processing prayer:approved event for ${data.prayer_id}`);

      const { campaign_id, creator_id } = data;

      // Increment campaign public prayer count if needed
      const Campaign = require('../models/Campaign');
      await Campaign.updateOne(
        { _id: campaign_id },
        {
          $inc: { 'prayer_metrics.public_prayers_count': 1 },
        }
      );

      // Log activity
      try {
        const ActivityLog = require('../models/ActivityLog');
        await ActivityLog.create({
          user_id: creator_id,
          action: 'prayer_approved',
          resource_type: 'prayer',
          resource_id: data.prayer_id,
          campaign_id,
        });
      } catch (error) {
        winstonLogger.warn(`Failed to log prayer approval activity: ${error.message}`);
      }
    } catch (error) {
      winstonLogger.error(`Error handling prayer:approved event: ${error.message}`);
    }
  });

  /**
   * When a prayer is reported
   */
  EventBus.on('prayer:reported', async (data) => {
    try {
      winstonLogger.info(`🚩 Processing prayer:reported event for ${data.prayer_id}`);

      const { prayer_id, report_count, auto_flagged } = data;

      // If auto-flagged, notify admin
      if (auto_flagged) {
        try {
          const Prayer = require('../models/Prayer');
          const prayer = await Prayer.findOne({ prayer_id }).lean();

          await NotificationService.notifyAdminPrayerAutoFlagged({
            prayer_id,
            report_count,
            reason: prayer?.flagged_reason,
          });
        } catch (error) {
          winstonLogger.error(`Failed to notify admin of auto-flagged prayer: ${error.message}`);
        }
      }

      // Log activity
      try {
        const ActivityLog = require('../models/ActivityLog');
        await ActivityLog.create({
          action: 'prayer_reported',
          resource_type: 'prayer',
          resource_id: prayer_id,
          metadata: { report_count, auto_flagged },
        });
      } catch (error) {
        winstonLogger.warn(`Failed to log prayer report activity: ${error.message}`);
      }
    } catch (error) {
      winstonLogger.error(`Error handling prayer:reported event: ${error.message}`);
    }
  });

  /**
   * When a prayer is deleted
   */
  EventBus.on('prayer:deleted', async (data) => {
    try {
      winstonLogger.info(`🗑️ Processing prayer:deleted event for ${data.prayer_id}`);

      const { campaign_id } = data;

      // Decrement campaign prayer count
      const Campaign = require('../models/Campaign');
      await Campaign.updateOne(
        { _id: campaign_id },
        {
          $inc: { 'prayer_metrics.total_prayers': -1 },
        }
      );

      // Log activity
      try {
        const ActivityLog = require('../models/ActivityLog');
        await ActivityLog.create({
          action: 'prayer_deleted',
          resource_type: 'prayer',
          resource_id: data.prayer_id,
          campaign_id,
          metadata: { reason: data.reason },
        });
      } catch (error) {
        winstonLogger.warn(`Failed to log prayer deletion activity: ${error.message}`);
      }
    } catch (error) {
      winstonLogger.error(`Error handling prayer:deleted event: ${error.message}`);
    }
  });

  winstonLogger.info('✅ Prayer event handlers registered');
}

module.exports = {
  registerPrayerEventHandlers,
};
