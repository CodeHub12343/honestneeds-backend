/**
 * CampaignTeam (RG-07 Team-Based Campaign Competitions)
 *
 * A team of users rallying around a goal (often within a CommunityChallenge).
 * Members contribute donations/shares/prayers that roll up into the team's
 * `score`. Teams can exist standalone or be linked to a challenge.
 */

const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['captain', 'member'], default: 'member' },
    contribution: { type: Number, default: 0 }, // metric units contributed
    joined_at: { type: Date, default: Date.now },
    _id: false,
  },
  { _id: false }
);

const campaignTeamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 100, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: '', maxlength: 1000 },
    avatar_url: { type: String, default: null },
    captain_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    challenge_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommunityChallenge',
      default: null,
      index: true,
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
    },
    city: { type: String, default: null, index: true },
    members: { type: [teamMemberSchema], default: [] },
    member_count: { type: Number, default: 1 },
    // Aggregate score in the challenge metric (amount cents / shares / etc.).
    score: { type: Number, default: 0, index: true },
    is_open: { type: Boolean, default: true }, // open to join without invite
    is_active: { type: Boolean, default: true, index: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

campaignTeamSchema.index({ challenge_id: 1, score: -1 });

module.exports = mongoose.model('CampaignTeam', campaignTeamSchema);
