/**
 * Notification Model
 * In-app notifications for users
 * Supports all notification types and delivery tracking
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        'someone_prayed',
        'new_text_prayer',
        'new_voice_prayer',
        'new_video_prayer',
        'prayer_approved',
        'prayer_rejected',
        'prayer_flagged',
        'prayer_milestone',
        'goal_reached',
        'donation_received',
        'campaign_activated',
        'campaign_ended',
        'system_alert',
        'admin_message',
      ],
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    // Structured data for the notification
    data: {
      prayer_id: mongoose.Schema.Types.ObjectId,
      campaign_id: mongoose.Schema.Types.ObjectId,
      user_id: mongoose.Schema.Types.ObjectId,
      prayer_type: String,
      supporter_name: String,
      campaign_title: String,
      status: String,
      reason: String,
      milestone: Number,
      custom_data: mongoose.Schema.Types.Mixed,
    },

    // Action URLs
    action_url: {
      type: String,
      default: null,
    },

    // Icons and styling
    icon_emoji: {
      type: String,
      default: '🔔',
    },

    color: {
      type: String,
      enum: ['primary', 'success', 'warning', 'danger', 'info'],
      default: 'primary',
    },

    // Read status
    read: {
      type: Boolean,
      default: false,
      index: true,
    },

    read_at: {
      type: Date,
      default: null,
    },

    // Archived status
    archived: {
      type: Boolean,
      default: false,
      index: true,
    },

    archived_at: {
      type: Date,
      default: null,
    },

    // Delivery tracking
    delivery_channels: {
      in_app: {
        sent: { type: Boolean, default: true },
        sent_at: { type: Date, default: Date.now },
      },
      email: {
        sent: { type: Boolean, default: false },
        sent_at: { type: Date, default: null },
        opened: { type: Boolean, default: false },
        opened_at: { type: Date, default: null },
      },
      push: {
        sent: { type: Boolean, default: false },
        sent_at: { type: Date, default: null },
        clicked: { type: Boolean, default: false },
        clicked_at: { type: Date, default: null },
      },
      sms: {
        sent: { type: Boolean, default: false },
        sent_at: { type: Date, default: null },
      },
    },

    // Expiration for cleanup
    expires_at: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      index: true,
    },

    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },

    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
  }
);

// Indexes for efficient queries
notificationSchema.index({ user_id: 1, created_at: -1 });
notificationSchema.index({ user_id: 1, read: 1 });
notificationSchema.index({ user_id: 1, archived: 1 });
notificationSchema.index({ type: 1, created_at: -1 });

// TTL index for automatic cleanup of expired notifications
notificationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Virtual for checking if notification is recent (within 24 hours)
notificationSchema.virtual('is_recent').get(function isRecent() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.created_at > dayAgo;
});

/**
 * Pre-save hook: Set read_at when marking as read
 */
notificationSchema.pre('save', function preSave(next) {
  if (this.isModified('read') && this.read && !this.read_at) {
    this.read_at = new Date();
  }

  if (this.isModified('archived') && this.archived && !this.archived_at) {
    this.archived_at = new Date();
  }

  next();
});

module.exports = mongoose.model('Notification', notificationSchema);
