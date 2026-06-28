/**
 * UserMission (RG-18)
 *
 * Per-user, per-period progress on a Mission. `period_key` makes a mission
 * instance unique within its cadence window (e.g. '2026-06-18' for daily,
 * '2026-W25' for weekly, 'once' for one-shot), so a unique compound index
 * guarantees one progress row per user/mission/period.
 */

const mongoose = require('mongoose');

const userMissionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    mission_code: { type: String, required: true, index: true },
    period_key: { type: String, required: true }, // window identifier
    progress: { type: Number, default: 0, min: 0 },
    target: { type: Number, required: true, min: 1 },
    completed: { type: Boolean, default: false, index: true },
    completed_at: { type: Date, default: null },
    reward_xp: { type: Number, default: 0 },
    reward_claimed: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

userMissionSchema.index(
  { user_id: 1, mission_code: 1, period_key: 1 },
  { unique: true }
);

module.exports = mongoose.model('UserMission', userMissionSchema);
