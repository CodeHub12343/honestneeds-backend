/**
 * CommunityChallenge (RG-07/08/19/20/21)
 *
 * A single model that powers every time-boxed community event:
 *   - team             Team-Based Campaign Competitions (RG-07)
 *   - city_vs_city     City vs. City Challenges (RG-08)
 *   - crowd_storm      Platform-wide sharing events (RG-20)
 *   - one_heart_one_city  City rallying events (RG-21)
 *
 * Miracle Mode (RG-19) is a campaign-level flag handled separately, but an
 * emergency rally can also be modeled here as a crowd_storm.
 *
 * Scoring is tracked per "entrant" — depending on type an entrant is a team
 * (team / city_vs_city) or a city string (city_vs_city / one_heart_one_city)
 * or the whole platform (crowd_storm). `metric` decides what counts.
 */

const mongoose = require('mongoose');
const { CHALLENGE_TYPES, CHALLENGE_METRICS } = require('../config/gamification');

const entrantSchema = new mongoose.Schema(
  {
    // 'team' | 'city' | 'platform'
    kind: { type: String, required: true },
    ref_id: { type: mongoose.Schema.Types.ObjectId, default: null }, // team id
    label: { type: String, required: true }, // team name or city name
    score: { type: Number, default: 0 },
    participant_count: { type: Number, default: 0 },
    _id: false,
  },
  { _id: false }
);

const communityChallengeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 150, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: '', maxlength: 2000 },
    type: {
      type: String,
      enum: Object.keys(CHALLENGE_TYPES),
      required: true,
      index: true,
    },
    metric: {
      type: String,
      enum: CHALLENGE_METRICS,
      default: 'amount',
    },
    banner_url: { type: String, default: null },
    starts_at: { type: Date, required: true, index: true },
    ends_at: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    // Scoreboard. Each entry is a team / city / platform aggregate.
    entrants: { type: [entrantSchema], default: [] },
    // Platform-wide running totals (for crowd_storm / overall progress bar).
    total_score: { type: Number, default: 0 },
    total_participants: { type: Number, default: 0 },
    goal: { type: Number, default: null }, // optional target for a progress bar
    // Reward description shown to winners (XP/badge handled on completion).
    reward_xp: { type: Number, default: 0 },
    reward_badge: { type: String, default: null },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

communityChallengeSchema.index({ status: 1, ends_at: 1 });

module.exports = mongoose.model('CommunityChallenge', communityChallengeSchema);
