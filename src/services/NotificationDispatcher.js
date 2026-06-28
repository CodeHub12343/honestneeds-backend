/**
 * NotificationDispatcher
 *
 * The single, unified entry point for emitting a user-facing notification.
 * Every domain event (donation, payout, campaign lifecycle, prayer, etc.)
 * should route through `NotificationDispatcher.notify(...)` instead of writing
 * a `Notification` document directly — this guarantees the four delivery
 * concerns stay coordinated:
 *
 *   1. Persistence  — a `Notification` doc (the in-app feed source).
 *   2. Realtime     — a live WebSocket frame via websocket/NotificationService.
 *   3. Email        — a transactional email via emailService.
 *   4. Preferences  — channel/quiet-hours/frequency gating from
 *                     NotificationPreferences.
 *
 * Presentation (title/message/icon/color/action_url) and default channels are
 * resolved from the notification type registry (notifications/notificationTypes).
 *
 * Design rule: a delivery failure must NEVER bubble back to the caller. Every
 * channel is best-effort and isolated.
 */

const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const NotificationPreferences = require('../models/NotificationPreferences');
const User = require('../models/User');
const emailService = require('./emailService');
const wsService = require('../websocket/NotificationService');
const { getType } = require('../notifications/notificationTypes');
const { winstonLogger } = require('../utils/logger');

// Sub-fields the Notification.data schema types as ObjectId. A value that is not
// a valid ObjectId (e.g. a business id like "CMP-123") is stashed in custom_data
// instead so persistence never fails on a cast error.
const OBJECTID_DATA_FIELDS = ['prayer_id', 'campaign_id', 'conversation_id', 'user_id'];
// Loosely-typed (string/number/mixed) sub-fields that accept any scalar.
const SCALAR_DATA_FIELDS = [
  'prayer_type',
  'supporter_name',
  'campaign_title',
  'status',
  'reason',
  'milestone',
];

class NotificationDispatcher {
  /**
   * Emit a notification to a single user.
   *
   * @param {object} opts
   * @param {string} opts.userId   - Recipient user id (required).
   * @param {string} opts.type     - Registry type key (required).
   * @param {object} [opts.data]   - Event payload used by registry templates.
   * @param {object} [opts.overrides] - Override resolved fields
   *                                     { title, message, icon_emoji, color, action_url, channels }.
   * @param {object} [opts.email]  - Override email content { subject, htmlBody, textBody }.
   * @param {number} [opts.priority] - 0=low,1=normal,2=high (reserved).
   * @returns {Promise<{ delivered: boolean, notificationId?: string, channels: string[] }>}
   */
  static async notify(opts = {}) {
    const { userId, type, data = {}, overrides = {}, email } = opts;

    try {
      if (!userId || !type) {
        winstonLogger.warn('NotificationDispatcher.notify called without userId/type', {
          userId,
          type,
        });
        return { delivered: false, channels: [] };
      }

      const spec = getType(type);
      if (!spec) {
        winstonLogger.warn('NotificationDispatcher: unknown notification type', { type });
        return { delivered: false, channels: [] };
      }

      // 1. Preferences --------------------------------------------------------
      const prefs = await this.getPreferences(userId);

      // Global off-switch (security/transactional types still pass when prefPath is null).
      if (prefs && prefs.notifications_enabled === false && spec.prefPath) {
        winstonLogger.debug('Notification suppressed: notifications globally disabled', {
          userId: String(userId),
          type,
        });
        return { delivered: false, channels: [] };
      }

      const typePref = spec.prefPath ? this.readPath(prefs, spec.prefPath) : null;
      if (typePref && typePref.enabled === false) {
        winstonLogger.debug('Notification suppressed: type disabled by user', {
          userId: String(userId),
          type,
        });
        return { delivered: false, channels: [] };
      }

      // 2. Channel resolution -------------------------------------------------
      // Precedence: explicit override > per-type pref channels > registry default,
      // then intersected with globally-enabled channels.
      let channels =
        overrides.channels ||
        (typePref && Array.isArray(typePref.channels) && typePref.channels.length
          ? typePref.channels
          : spec.defaultChannels) ||
        ['in_app'];

      channels = channels.filter((ch) => this.channelEnabled(prefs, ch));

      // Quiet hours: keep in_app, defer email/push (sent as in-app only now).
      if (this.inQuietHours(prefs)) {
        channels = channels.filter((ch) => ch === 'in_app');
      }

      // 3. Resolve presentation ----------------------------------------------
      const title = overrides.title || this.safeTemplate(spec.title, data, 'Notification');
      const message = overrides.message || this.safeTemplate(spec.message, data, '');
      const icon_emoji = overrides.icon_emoji || spec.icon_emoji || '🔔';
      const color = overrides.color || spec.color || 'primary';
      const action_url =
        overrides.action_url !== undefined
          ? overrides.action_url
          : this.safeTemplate(spec.actionUrl, data, null);

      const builtData = this.buildData(data);
      const deliveredChannels = [];

      // 4. Persist (in-app) ---------------------------------------------------
      let notification = null;
      if (channels.includes('in_app')) {
        try {
          notification = await Notification.create({
            user_id: userId,
            type,
            title,
            message,
            data: builtData,
            action_url,
            icon_emoji,
            color,
          });
          deliveredChannels.push('in_app');
        } catch (err) {
          winstonLogger.error('NotificationDispatcher: failed to persist notification', {
            userId: String(userId),
            type,
            error: err.message,
          });
        }
      }

      // 5. Realtime push ------------------------------------------------------
      if (channels.includes('in_app')) {
        this.pushRealtime(userId, {
          notification,
          type,
          title,
          message,
          icon_emoji,
          color,
          action_url,
          data: builtData,
        });
      }

      // 6. Email --------------------------------------------------------------
      if (channels.includes('email')) {
        // Fire-and-forget so the caller is never blocked on SMTP.
        this.sendEmail(userId, { type, title, message, action_url }, email, notification).catch(
          (err) =>
            winstonLogger.error('NotificationDispatcher: email dispatch failed', {
              userId: String(userId),
              type,
              error: err.message,
            })
        );
        deliveredChannels.push('email');
      }

      // 7. push/sms — recorded intent only (no provider configured yet).
      if (channels.includes('push')) deliveredChannels.push('push');

      return {
        delivered: deliveredChannels.length > 0,
        notificationId: notification ? String(notification._id) : undefined,
        channels: deliveredChannels,
      };
    } catch (error) {
      // Absolute backstop — never throw to the caller.
      winstonLogger.error('NotificationDispatcher.notify unexpected error', {
        type,
        error: error.message,
        stack: error.stack,
      });
      return { delivered: false, channels: [] };
    }
  }

  /**
   * Emit the same notification to many users (best-effort, parallel).
   * @param {string[]} userIds
   * @param {object} opts - Same as notify() minus userId.
   */
  static async notifyMany(userIds = [], opts = {}) {
    const unique = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
    await Promise.all(unique.map((userId) => this.notify({ ...opts, userId })));
    return { count: unique.length };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Load (and lazily create) a user's notification preferences. */
  static async getPreferences(userId) {
    try {
      let prefs = await NotificationPreferences.findOne({ user_id: userId }).lean();
      if (!prefs) {
        // Create defaults so future reads/writes have a row; ignore races.
        try {
          const created = await NotificationPreferences.create({ user_id: userId });
          prefs = created.toObject();
        } catch (_) {
          prefs = await NotificationPreferences.findOne({ user_id: userId }).lean();
        }
      }
      return prefs;
    } catch (err) {
      winstonLogger.warn('NotificationDispatcher: failed to load preferences (defaulting on)', {
        userId: String(userId),
        error: err.message,
      });
      return null; // Null prefs => treat as all-enabled (fail-open for delivery).
    }
  }

  /** Read a dot-path (e.g. 'campaign_notifications.donation_received') from prefs. */
  static readPath(obj, path) {
    if (!obj || !path) return null;
    return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
  }

  /** Whether a delivery channel is enabled at the global channel level. */
  static channelEnabled(prefs, channel) {
    if (channel === 'in_app') return true; // always allowed (it's the feed)
    if (!prefs || !prefs.channels) return channel === 'email'; // default: email on, push off
    const c = prefs.channels[channel];
    return !!(c && c.enabled);
  }

  /** Quiet-hours check (HH:MM window, optional overnight wrap). */
  static inQuietHours(prefs) {
    try {
      const dnd = prefs && prefs.do_not_disturb;
      if (!dnd || !dnd.enabled) return false;
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      const [sh, sm] = String(dnd.start_time || '22:00').split(':').map(Number);
      const [eh, em] = String(dnd.end_time || '08:00').split(':').map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      if (start === end) return false;
      return start < end ? mins >= start && mins < end : mins >= start || mins < end;
    } catch (_) {
      return false;
    }
  }

  /** Evaluate a registry template function defensively. */
  static safeTemplate(fn, data, fallback) {
    try {
      if (typeof fn !== 'function') return fallback;
      const out = fn(data || {});
      return out == null ? fallback : out;
    } catch (_) {
      return fallback;
    }
  }

  /** Split arbitrary payload into typed Notification.data fields + custom_data. */
  static buildData(data) {
    const out = { custom_data: {} };
    Object.entries(data || {}).forEach(([key, value]) => {
      if (value === undefined) return;
      if (OBJECTID_DATA_FIELDS.includes(key)) {
        // Keep on the typed field only when it's a real ObjectId; otherwise keep
        // the (string) value in custom_data so the schema cast never fails.
        if (mongoose.isValidObjectId(value)) out[key] = value;
        else out.custom_data[key] = value;
      } else if (SCALAR_DATA_FIELDS.includes(key)) {
        out[key] = value;
      } else {
        out.custom_data[key] = value;
      }
    });
    return out;
  }

  /** Push a normalized realtime frame; queued automatically if user offline. */
  static pushRealtime(userId, payload) {
    try {
      const n = payload.notification;
      wsService.notifyUser(String(userId), {
        type: 'notification',
        data: {
          id: n ? String(n._id) : undefined,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          icon_emoji: payload.icon_emoji,
          color: payload.color,
          action_url: payload.action_url,
          data: payload.data,
          read: false,
          created_at: n ? n.created_at : new Date(),
        },
      });
      // Lightweight signal so clients can re-fetch the unread badge.
      wsService.notifyUser(String(userId), { type: 'unread_count' }, { queueIfOffline: false });
    } catch (err) {
      winstonLogger.warn('NotificationDispatcher: realtime push failed (non-fatal)', {
        userId: String(userId),
        error: err.message,
      });
    }
  }

  /** Send the email channel, recording delivery on the notification doc. */
  static async sendEmail(userId, base, emailOverride, notification) {
    const user = await User.findById(userId).select('email display_name').lean();
    if (!user || !user.email) return;

    const subject = (emailOverride && emailOverride.subject) || base.title;
    const htmlBody =
      (emailOverride && emailOverride.htmlBody) ||
      this.defaultEmailHtml(user.display_name, base);
    const textBody = (emailOverride && emailOverride.textBody) || base.message;

    await emailService.send({
      to: user.email,
      subject,
      htmlBody,
      textBody,
      metadata: { eventType: base.type },
    });

    if (notification) {
      try {
        notification.delivery_channels.email.sent = true;
        notification.delivery_channels.email.sent_at = new Date();
        await notification.save();
      } catch (_) {
        /* non-fatal */
      }
    }
  }

  /** Minimal branded HTML fallback for types without a dedicated email template. */
  static defaultEmailHtml(name, base) {
    const cta =
      base.action_url && /^https?:\/\//.test(base.action_url)
        ? `<p><a href="${base.action_url}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none">View</a></p>`
        : '';
    return `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 12px">${base.title}</h2>
        <p style="margin:0 0 8px">Hi ${name || 'there'},</p>
        <p style="margin:0 0 16px;line-height:1.5">${base.message}</p>
        ${cta}
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
        <p style="font-size:12px;color:#888">You're receiving this from HonestNeed. Manage your notification preferences in your account settings.</p>
      </div>`;
  }
}

module.exports = NotificationDispatcher;
