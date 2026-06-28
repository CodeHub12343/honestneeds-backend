/**
 * ConfigService (AD-07 Platform Configuration)
 * -------------------------------------------------------------------------
 * Read/write access to the keyed PlatformSettings documents (general,
 * moderation rules, payment config, notification settings, email templates,
 * feature flags) plus management of admin broadcast notifications.
 *
 * Default values for fee rates come from the central feeEngine so config never
 * hard-codes percentages.
 */

const PlatformSettings = require('../../models/PlatformSettings');
const BroadcastNotification = require('../../models/BroadcastNotification');
const AuditService = require('./AuditService');
const {
  PLATFORM_FEE_RATE,
  WITHDRAWAL_FEE_RATE,
  DONATION_FEE_RATE,
  SHARE_RELOAD_FEE_RATE,
} = require('../../utils/feeEngine');

// Valid setting keys mirror the PlatformSettings enum.
const VALID_KEYS = [
  'platform_general',
  'moderation_rules',
  'payment_config',
  'notification_settings',
  'email_templates',
  'feature_flags',
];

// Sensible defaults returned when a key has never been written.
const DEFAULTS = {
  payment_config: {
    platform_fee_rate: PLATFORM_FEE_RATE,
    donation_fee_rate: DONATION_FEE_RATE,
    share_reload_fee_rate: SHARE_RELOAD_FEE_RATE,
    withdrawal_fee_rate: WITHDRAWAL_FEE_RATE,
    min_withdrawal_cents: 1000,
  },
  moderation_rules: {
    campaign_report_flag_threshold: 3,
    comment_report_hide_threshold: 5,
    auto_flag_high_risk_score: 75,
  },
  feature_flags: {},
  platform_general: {},
  notification_settings: {},
  email_templates: {},
};

class ConfigService {
  static async getAll() {
    const docs = await PlatformSettings.getAllSettings();
    const byKey = docs.reduce((acc, d) => {
      acc[d.key] = d.value;
      return acc;
    }, {});
    // Merge defaults so the client always gets every key.
    const result = {};
    for (const key of VALID_KEYS) {
      result[key] = byKey[key] !== undefined ? byKey[key] : DEFAULTS[key] || {};
    }
    return result;
  }

  static async getByKey(key) {
    this._assertKey(key);
    const doc = await PlatformSettings.getByKey(key);
    return doc ? doc.value : DEFAULTS[key] || {};
  }

  static async updateByKey(key, value, { adminId, req } = {}) {
    this._assertKey(key);
    if (value === undefined || value === null || typeof value !== 'object') {
      const err = new Error('Setting value must be an object');
      err.statusCode = 400;
      err.code = 'INVALID_VALUE';
      throw err;
    }

    const existing = await PlatformSettings.getByKey(key);
    const updated = await PlatformSettings.updateByKey(key, value, adminId);

    await AuditService.record({
      adminId,
      action: 'config.updated',
      entityType: 'Settings',
      entityId: updated._id,
      description: `Platform setting "${key}" updated`,
      changes: { before: existing?.value, after: value },
      metadata: { key },
      req,
    });
    return updated;
  }

  // ── Broadcast notifications ───────────────────────────────────────────

  static async listBroadcasts({ page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [broadcasts, total] = await Promise.all([
      BroadcastNotification.find({})
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('created_by', 'display_name email')
        .lean(),
      BroadcastNotification.countDocuments({}),
    ]);
    return { broadcasts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  static async createBroadcast({ title, message, type, priority, targetSegments, scheduledFor, adminId, req }) {
    if (!title || !message) {
      const err = new Error('Title and message are required');
      err.statusCode = 400;
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    const broadcast = await BroadcastNotification.create({
      title,
      message,
      type: type || 'announcement',
      priority: priority || 'normal',
      target_segments: Array.isArray(targetSegments) ? targetSegments : undefined,
      scheduled_for: scheduledFor ? new Date(scheduledFor) : undefined,
      status: scheduledFor ? 'scheduled' : 'draft',
      created_by: adminId,
    });

    await AuditService.record({
      adminId,
      action: 'broadcast.created',
      entityType: 'Content',
      entityId: broadcast._id,
      description: `Broadcast created: ${title}`,
      req,
    });
    return broadcast.toObject();
  }

  static _assertKey(key) {
    if (!VALID_KEYS.includes(key)) {
      const err = new Error(`Invalid settings key. Must be one of: ${VALID_KEYS.join(', ')}`);
      err.statusCode = 400;
      err.code = 'INVALID_SETTINGS_KEY';
      throw err;
    }
  }
}

ConfigService.VALID_KEYS = VALID_KEYS;
module.exports = ConfigService;
