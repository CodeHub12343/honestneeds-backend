/**
 * Notification Preferences Model
 * Comprehensive notification settings for users
 * Enables fine-grained control over notification delivery channels and types
 */

const mongoose = require('mongoose');

const notificationPreferencesSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // Global notification toggles
    notifications_enabled: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Delivery channel preferences
    channels: {
      email: {
        enabled: { type: Boolean, default: true },
        digest: { type: String, enum: ['instant', 'daily', 'weekly'], default: 'instant' },
      },
      in_app: {
        enabled: { type: Boolean, default: true },
      },
      push: {
        enabled: { type: Boolean, default: false },
      },
      sms: {
        enabled: { type: Boolean, default: false },
      },
      webhook: {
        enabled: { type: Boolean, default: false },
        url: { type: String, sparse: true },
        secret: { type: String, sparse: true },
      },
    },

    // Prayer-specific notifications
    prayer_notifications: {
      someone_prayed: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
      new_text_prayer: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
      new_voice_prayer: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
      new_video_prayer: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
      prayer_approved: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
      prayer_rejected: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
      prayer_flagged: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
      prayer_milestone: {
        // e.g., reached 100 prayers
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
    },

    // Campaign notifications
    campaign_notifications: {
      goal_reached: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
      donation_received: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
      campaign_activated: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
      campaign_ended: {
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['email', 'in_app', 'push'] }],
      },
    },

    // Marketing notifications
    marketing: {
      enabled: { type: Boolean, default: false },
      product_updates: { type: Boolean, default: false },
      feature_announcements: { type: Boolean, default: false },
      promotional_offers: { type: Boolean, default: false },
    },

    // Do Not Disturb settings
    do_not_disturb: {
      enabled: { type: Boolean, default: false },
      start_time: { type: String, default: '22:00' }, // HH:MM format
      end_time: { type: String, default: '08:00' },
      timezone: { type: String, default: 'UTC' },
      apply_to_all: { type: Boolean, default: false }, // If true, applies to all channels
    },

    // Frequency limits
    frequency_limits: {
      max_daily_emails: { type: Number, default: 10, min: 1, max: 100 },
      max_daily_push: { type: Number, default: 20, min: 1, max: 100 },
      batching_window_minutes: { type: Number, default: 5, min: 1, max: 1440 },
    },

    // Privacy settings
    privacy: {
      allow_data_collection: { type: Boolean, default: false },
      allow_analytics: { type: Boolean, default: true },
      gdpr_consent: { type: Boolean, default: false },
      gdpr_consent_date: { type: Date, default: null },
    },

    // Last preferences update
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Indexes for efficient queries
notificationPreferencesSchema.index({ user_id: 1, notifications_enabled: 1 });
notificationPreferencesSchema.index({ 'channels.email.enabled': 1 });
notificationPreferencesSchema.index({ 'do_not_disturb.enabled': 1 });

module.exports = mongoose.model('NotificationPreferences', notificationPreferencesSchema);
