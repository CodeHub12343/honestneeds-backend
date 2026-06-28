/**
 * Mission (RG-18 Push Notification Missions)
 *
 * A short, repeatable objective ("Share 3 campaigns today") that users complete
 * for XP. Default missions are seeded from config/gamification.MISSIONS, but
 * admins can create timed/promotional missions stored here as well. Per-user
 * progress lives in the UserMission collection.
 */

const mongoose = require('mongoose');

const missionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 500 },
    icon: { type: String, default: '🎯' },
    // The gamification metric this mission tracks (matches event actions:
    // 'share' | 'pray' | 'donate' | 'refer' | 'volunteer' | 'login').
    metric: { type: String, required: true },
    target: { type: Number, required: true, min: 1 },
    reward_xp: { type: Number, required: true, min: 0 },
    // How often the mission resets for a user.
    cadence: {
      type: String,
      enum: ['daily', 'weekly', 'once'],
      default: 'daily',
      index: true,
    },
    is_active: { type: Boolean, default: true, index: true },
    // Optional scheduling window for promotional missions.
    starts_at: { type: Date, default: null },
    ends_at: { type: Date, default: null },
    // Whether to fire a push notification when this mission becomes available.
    notify_on_available: { type: Boolean, default: true },
    sort_order: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

module.exports = mongoose.model('Mission', missionSchema);
