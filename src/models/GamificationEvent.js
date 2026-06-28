/**
 * GamificationEvent (RG-02..RG-21 audit trail)
 *
 * Append-only log of every XP grant, badge award, streak change, golden ticket
 * drop, mission completion, etc. Powers:
 *  - period-scoped leaderboards (RG-05)
 *  - the activity / transformation journey timeline (RG-15)
 *  - the swipe feed surfacing (RG-17)
 *  - analytics & abuse review.
 *
 * Writes are best-effort: a failed insert must never break the primary action,
 * so producers wrap creation in try/catch (see GamificationService).
 */

const mongoose = require('mongoose');

const gamificationEventSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Stable event/action code: 'xp_award', 'badge_earned', 'streak_milestone',
    // 'golden_ticket', 'mission_complete', 'level_up', plus the raw action
    // ('donate','share','pray','refer','volunteer',...) stored in `action`.
    type: {
      type: String,
      required: true,
      index: true,
    },
    action: { type: String, default: null }, // originating action code
    xp_awarded: { type: Number, default: 0 },
    // Free-form details (badge code, prize, mission code, level, multiplier...).
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
    },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

// Period leaderboard aggregation: sum xp per user within a date window.
gamificationEventSchema.index({ user_id: 1, created_at: -1 });
gamificationEventSchema.index({ type: 1, created_at: -1 });

module.exports = mongoose.model('GamificationEvent', gamificationEventSchema);
