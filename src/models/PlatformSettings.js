const mongoose = require('mongoose');

/**
 * PlatformSettings Schema
 * Stores platform-wide configuration and settings
 *
 * @typedef {Object} PlatformSettings
 * @property {Object} platform - Platform general settings
 * @property {Object} moderation - Moderation rules and thresholds
 * @property {Object} payment - Payment configuration
 * @property {Object} notifications - Notification settings
 * @property {ObjectId} updated_by - Admin who updated settings
 * @property {Date} updated_at - Last update timestamp
 */

const PlatformSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      required: true,
      enum: [
        'platform_general',
        'moderation_rules',
        'payment_config',
        'notification_settings',
        'email_templates',
        'feature_flags',
      ],
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    description: String,
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Instance Methods
 */

/**
 * Update setting value
 */
PlatformSettingsSchema.methods.updateValue = function (newValue, adminId) {
  this.value = newValue;
  this.updated_by = adminId;
  this.updated_at = new Date();
  return this.save();
};

/**
 * Static Methods
 */

/**
 * Get setting by key
 */
PlatformSettingsSchema.statics.getByKey = function (key) {
  return this.findOne({ key }).lean();
};

/**
 * Get all settings
 */
PlatformSettingsSchema.statics.getAllSettings = function () {
  return this.find({}).lean();
};

/**
 * Update setting by key
 */
PlatformSettingsSchema.statics.updateByKey = async function (key, value, adminId) {
  return this.findOneAndUpdate(
    { key },
    {
      value,
      updated_by: adminId,
      updated_at: new Date(),
    },
    { new: true, upsert: true }
  );
};

module.exports = mongoose.model('PlatformSettings', PlatformSettingsSchema);
