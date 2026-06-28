/**
 * Notification Event Handlers
 *
 * Central bridge from domain events → user-facing notifications via the unified
 * NotificationDispatcher. This is the one place that decides "event X means user
 * Y should get notification Z". Producers keep emitting their existing events;
 * a handler failure here can never affect a producer's primary write.
 *
 * Event sources (mirrors the gamification bridge):
 *   - Global EventBus:                 prayer:*, referral:converted
 *   - CampaignService.getEventEmitter: campaign:published/completed/paused
 *   - TransactionService (singleton):  donation:recorded (confirmed only)
 *
 * Many other events are dispatched directly from their controllers/services
 * (payouts, share rewards, sponsorships, messages) by calling
 * NotificationDispatcher.notify(...) at the success point — see those files.
 */

const EventBus = require('./EventBus');
const NotificationDispatcher = require('../services/NotificationDispatcher');
const winstonLogger = require('../utils/winstonLogger');

/** Run an async side effect without ever rejecting back to the emitter. */
function safe(label, fn) {
  Promise.resolve()
    .then(fn)
    .catch((error) =>
      winstonLogger.error(`Notification handler failed: ${label}`, { error: error.message })
    );
}

/** Map a prayer media type to its specific notification type. */
function prayerTypeToNotification(type) {
  switch (type) {
    case 'voice':
      return 'new_voice_prayer';
    case 'video':
      return 'new_video_prayer';
    case 'text':
      return 'new_text_prayer';
    default:
      return 'someone_prayed';
  }
}

function registerNotificationEventHandlers() {
  // Lazy requires to avoid circular import timing during bootstrap.
  const CampaignService = require('../services/CampaignService');
  const Campaign = require('../models/Campaign');
  const User = require('../models/User');

  /** Resolve a display title for a campaign by its business id or _id. */
  async function campaignTitle(campaignId) {
    if (!campaignId) return undefined;
    try {
      const c = await Campaign.findOne({
        $or: [{ campaign_id: campaignId }, { _id: campaignId }],
      })
        .select('title')
        .lean();
      return c ? c.title : undefined;
    } catch (_) {
      return undefined;
    }
  }

  async function userName(userId) {
    if (!userId) return undefined;
    try {
      const u = await User.findById(userId).select('display_name').lean();
      return u ? u.display_name : undefined;
    } catch (_) {
      return undefined;
    }
  }

  // ── Campaign lifecycle (local emitter) ────────────────────────────────────
  const campaignEmitter = CampaignService.getEventEmitter();

  // NOTE: campaignEventHandlers owns the branded campaign lifecycle EMAILS
  // (publication/completion/pause). To avoid duplicate emails we deliver these
  // as in-app + push only here.
  campaignEmitter.on('campaign:published', (data) =>
    safe('campaign:published', () =>
      NotificationDispatcher.notify({
        userId: data.creator_id,
        type: 'campaign_activated',
        data: { campaign_id: data.campaign_id, campaign_title: data.title },
        overrides: { channels: ['in_app', 'push'] },
      })
    )
  );

  campaignEmitter.on('campaign:completed', (data) =>
    safe('campaign:completed', () =>
      NotificationDispatcher.notify({
        userId: data.creator_id,
        type: 'campaign_ended',
        data: {
          campaign_id: data.campaign_id,
          campaign_title: data.title,
          total_raised_cents: data.total_raised,
        },
        overrides: { channels: ['in_app', 'push'] },
      })
    )
  );

  campaignEmitter.on('campaign:paused', (data) =>
    safe('campaign:paused', () =>
      NotificationDispatcher.notify({
        userId: data.creator_id,
        type: 'campaign_paused',
        data: { campaign_id: data.campaign_id, campaign_title: data.title },
        overrides: { channels: ['in_app', 'push'] },
      })
    )
  );

  // ── Donations (TransactionService singleton, confirmed only) ──────────────
  const onDonation = (data) => {
    // Creator: "you received a donation"
    safe('donation:received', async () => {
      const [title, donorName] = await Promise.all([
        campaignTitle(data.campaign_id),
        userName(data.supporter_id),
      ]);
      return NotificationDispatcher.notify({
        userId: data.creator_id,
        type: 'donation_received',
        data: {
          campaign_id: data.campaign_id,
          campaign_title: title,
          supporter_name: donorName,
          amount_cents: data.amount_cents,
        },
      });
    });

    // Donor: in-app receipt only (TransactionService already emails the receipt).
    safe('donation:made', async () => {
      const title = await campaignTitle(data.campaign_id);
      return NotificationDispatcher.notify({
        userId: data.supporter_id,
        type: 'donation_made',
        data: {
          campaign_id: data.campaign_id,
          campaign_title: title,
          amount_cents: data.amount_cents,
        },
        overrides: { channels: ['in_app'] },
      });
    });
  };

  try {
    const TransactionService = require('../services/TransactionService');
    if (TransactionService && typeof TransactionService.on === 'function') {
      TransactionService.on('donation:recorded', onDonation);
      winstonLogger.info('🔗 Bridged TransactionService donation:recorded → notifications');
    }
  } catch (error) {
    winstonLogger.warn('Could not bridge TransactionService donations to notifications', {
      error: error.message,
    });
  }
  // Also honor a global-bus variant if any producer uses it.
  EventBus.on('donation:completed', onDonation);

  // ── Prayer support (global EventBus) ──────────────────────────────────────
  // In-app + push only; the existing prayerEventHandlers handles prayer emails.
  EventBus.on('prayer:created', (data) =>
    safe('prayer:created', () =>
      NotificationDispatcher.notify({
        userId: data.creator_id,
        type: prayerTypeToNotification(data.type),
        data: { campaign_id: data.campaign_id, prayer_id: data.prayer_id, prayer_type: data.type },
        overrides: { channels: ['in_app', 'push'] },
      })
    )
  );

  EventBus.on('prayer:approved', (data) =>
    safe('prayer:approved', () =>
      NotificationDispatcher.notify({
        userId: data.supporter_id,
        type: 'prayer_approved',
        data: { campaign_id: data.campaign_id, prayer_id: data.prayer_id },
        overrides: { channels: ['in_app', 'push'] },
      })
    )
  );

  EventBus.on('prayer:rejected', (data) =>
    safe('prayer:rejected', () =>
      NotificationDispatcher.notify({
        userId: data.supporter_id,
        type: 'prayer_rejected',
        data: { campaign_id: data.campaign_id, prayer_id: data.prayer_id, reason: data.reason },
        overrides: { channels: ['in_app'] },
      })
    )
  );

  // ── Referrals (global EventBus) ───────────────────────────────────────────
  EventBus.on('referral:converted', (data) => {
    const userId = data.referrer_id || data.user_id || data.userId;
    if (!userId) return;
    safe('referral:converted', () =>
      NotificationDispatcher.notify({
        userId,
        type: 'referral_converted',
        data: { campaign_id: data.campaign_id },
      })
    );
  });

  winstonLogger.info('✅ Notification event handlers registered');
}

module.exports = { registerNotificationEventHandlers };
