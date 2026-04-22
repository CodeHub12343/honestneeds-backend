/**
 * Referral Link Model
 * Tracks shareable referral links for campaigns with unique tokens and analytics
 * 
 * Purpose:
 * - Generate unique shareable URLs for campaigns
 * - Track clicks and conversions on referral links
 * - Provide QR codes for physical sharing
 * - Enable referral rewards tracking
 * 
 * @typedef {Object} ReferralLink
 * @property {ObjectId} campaign_id - Campaign reference
 * @property {ObjectId} created_by - User who created link (sharer)
 * @property {String} token - Unique token for link (32 chars, base62)
 * @property {String} share_url - Full shareable URL (e.g., https://honestneed.com/ref/abc123)
 * @property {String} qr_code - QR code as base64 PNG image
 * @property {String} platform - Platform where shared (facebook, twitter, email, whatsapp, link, other)
 * @property {Number} click_count - Number of clicks on link
 * @property {Object[]} clicks - Array of click events { timestamp, ip, device, location, user_agent }
 * @property {Number} conversion_count - Number of donations from link
 * @property {ObjectId[]} conversions - Donation IDs from this link
 * @property {String} status - 'active' | 'paused' | 'expired'
 * @property {Date} expires_at - When link expires (optional, 90 days default)
 * @property {Date} created_at
 * @property {Date} updated_at
 */

const mongoose = require('mongoose');

const referralLinkSchema = new mongoose.Schema(
  {
    // Relationships
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator (sharer) ID is required'],
      index: true,
    },

    // Link data
    token: {
      type: String,
      required: [true, 'Referral token is required'],
      unique: true,
      index: true,
      minlength: [32, 'Token must be at least 32 characters'],
      maxlength: [40, 'Token cannot exceed 40 characters'],
    },

    share_url: {
      type: String,
      required: [true, 'Share URL is required'],
      unique: true,
      match: [/^https?:\/\/.+\/ref\/.+$/, 'Invalid share URL format'],
    },

    qr_code: {
      type: String, // Base64 PNG image
      required: false,
    },

    platform: {
      type: String,
      enum: {
        values: ['facebook', 'twitter', 'linkedin', 'email', 'whatsapp', 'link', 'other'],
        message: 'Platform must be one of: facebook, twitter, linkedin, email, whatsapp, link, other',
      },
      default: 'link',
      index: true,
    },

    // Analytics - Clicks
    click_count: {
      type: Number,
      default: 0,
      index: true,
    },

    clicks: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        ip_address: String,
        device: {
          type: String,
          enum: ['mobile', 'desktop', 'tablet', 'unknown'],
          default: 'unknown',
        },
        location: String, // Country/region from IP geolocation
        user_agent: String,
        referrer: String, // HTTP referer from click
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: false,
        },
        _id: false,
      },
    ],

    // Analytics - Conversions
    conversion_count: {
      type: Number,
      default: 0,
      index: true,
    },

    conversions: [
      {
        donation_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Transaction',
        },
        amount_cents: Number,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        _id: false,
      },
    ],

    // Calculated conversion rate
    conversion_rate: {
      type: Number,
      default: 0, // (conversion_count / click_count) * 100
      min: 0,
      max: 100,
    },

    // Status
    status: {
      type: String,
      enum: {
        values: ['active', 'paused', 'expired'],
        message: 'Status must be active, paused, or expired',
      },
      default: 'active',
      index: true,
    },

    // Expiration
    expires_at: {
      type: Date,
      index: true,
      required: false,
      // Default to 90 days from creation (set in pre-save hook)
    },

    // Metadata
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },

    // Timestamps
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
    collection: 'referral_links',
    timestamps: false, // We'll manage timestamps manually
  }
);

// Pre-save hook: Set default expires_at to 90 days if not provided
referralLinkSchema.pre('save', function (next) {
  if (!this.expires_at) {
    const expiresIn90Days = new Date();
    expiresIn90Days.setDate(expiresIn90Days.getDate() + 90);
    this.expires_at = expiresIn90Days;
  }

  // Update conversion_rate
  if (this.click_count > 0) {
    this.conversion_rate = (this.conversion_count / this.click_count) * 100;
  } else {
    this.conversion_rate = 0;
  }

  this.updated_at = new Date();
  next();
});

// Indexes for common queries
referralLinkSchema.index({ campaign_id: 1, created_at: -1 }); // Campaign's referral links
referralLinkSchema.index({ created_by: 1, created_at: -1 }); // User's referral links
referralLinkSchema.index({ token: 1 }); // Lookup by token
referralLinkSchema.index({ conversion_count: -1, created_at: -1 }); // Top performing links
referralLinkSchema.index({ status: 1, expires_at: 1 }); // Find active/expiring links

// Virtual for age in days
referralLinkSchema.virtual('age_days').get(function () {
  const now = new Date();
  const ageMs = now - this.created_at;
  return Math.floor(ageMs / (1000 * 60 * 60 * 24));
});

// Virtual for days until expiration
referralLinkSchema.virtual('days_to_expiry').get(function () {
  if (!this.expires_at) return null;
  const now = new Date();
  const diffMs = this.expires_at - now;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
});

// Virtual for is_expired status
referralLinkSchema.virtual('is_expired').get(function () {
  if (!this.expires_at) return false;
  return new Date() > this.expires_at;
});

// Static method: Generate unique token
referralLinkSchema.statics.generateToken = function () {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

// Static method: Find by token
referralLinkSchema.statics.findByToken = function (token) {
  return this.findOne({ token });
};

// Method: Record click
referralLinkSchema.methods.recordClick = function (clickData) {
  this.clicks.push({
    timestamp: new Date(),
    ip_address: clickData.ip_address,
    device: clickData.device || 'unknown',
    location: clickData.location,
    user_agent: clickData.user_agent,
    referrer: clickData.referrer,
    user_id: clickData.user_id,
  });

  this.click_count = this.clicks.length;

  // Recalculate conversion rate
  if (this.click_count > 0) {
    this.conversion_rate = (this.conversion_count / this.click_count) * 100;
  }

  return this.save();
};

// Method: Record conversion
referralLinkSchema.methods.recordConversion = function (donationId, amountCents) {
  // Check if conversion already exists
  const exists = this.conversions.some((c) => c.donation_id.toString() === donationId.toString());
  if (exists) return;

  this.conversions.push({
    donation_id: donationId,
    amount_cents: amountCents,
    timestamp: new Date(),
  });

  this.conversion_count = this.conversions.length;

  // Recalculate conversion rate
  if (this.click_count > 0) {
    this.conversion_rate = (this.conversion_count / this.click_count) * 100;
  }

  return this.save();
};

// Method: Get public summary
referralLinkSchema.methods.getPublicSummary = function () {
  return {
    token: this.token,
    share_url: this.share_url,
    platform: this.platform,
    click_count: this.click_count,
    conversion_count: this.conversion_count,
    conversion_rate: this.conversion_rate.toFixed(2),
    status: this.status,
    created_at: this.created_at,
  };
};

// Method: Get analytics summary
referralLinkSchema.methods.getAnalytics = function () {
  return {
    token: this.token,
    campaign_id: this.campaign_id,
    created_by: this.created_by,
    platform: this.platform,
    click_count: this.click_count,
    conversion_count: this.conversion_count,
    conversion_rate: this.conversion_rate.toFixed(2),
    clicks_by_device: this._getClicksByDevice(),
    clicks_by_location: this._getClicksByLocation(),
    recent_clicks: this.clicks.slice(-10),
    status: this.status,
    expires_at: this.expires_at,
  };
};

// Helper: Get clicks grouped by device
referralLinkSchema.methods._getClicksByDevice = function () {
  const byDevice = {};
  this.clicks.forEach((click) => {
    const device = click.device || 'unknown';
    byDevice[device] = (byDevice[device] || 0) + 1;
  });
  return byDevice;
};

// Helper: Get clicks grouped by location
referralLinkSchema.methods._getClicksByLocation = function () {
  const byLocation = {};
  this.clicks.forEach((click) => {
    if (!click.location) return;
    byLocation[click.location] = (byLocation[click.location] || 0) + 1;
  });
  return byLocation;
};

module.exports = mongoose.model('ReferralLink', referralLinkSchema);
