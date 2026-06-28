/**
 * Profile Service
 *
 * Powers the multi-level HonestNeed profile system:
 *  - Level 1: Basic profile setup + completion meter
 *  - Level 3: Enhanced supporter profile (aggregate impact stats)
 *  - Level 4: Creator profile (story + campaign performance stats)
 *  - AI-style profile strength scoring with actionable suggestions
 *
 * Trust/verification (Level 2) is owned by VerificationService; this service
 * reads the projected verification_badges off the user.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const VolunteerProfile = require('../models/VolunteerProfile');
const Campaign = require('../models/Campaign');
const { getLevelProgress } = require('../config/gamification');
const { normalizeInterests } = require('../config/causes');
const GamificationService = require('./GamificationService');
const winstonLogger = require('../utils/winstonLogger');

class ProfileError extends Error {
  constructor(message, statusCode = 400, code = 'PROFILE_ERROR') {
    super(message);
    this.name = 'ProfileError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Fields a user may set during profile setup / editing. */
const EDITABLE_TEXT_FIELDS = ['first_name', 'last_name', 'bio'];

class ProfileService {
  /**
   * Update the authenticated user's profile (Level 1 + Level 4 fields).
   * Recomputes the completion meter and awards completion XP/badge the first
   * time the profile hits 100%.
   *
   * @param {string} userId
   * @param {Object} body - partial profile fields
   * @returns {Promise<Object>} updated user (toJSON)
   */
  static async updateProfile(userId, body = {}) {
    const user = await User.findById(userId);
    if (!user || user.deleted_at) {
      throw new ProfileError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Simple text fields
    for (const field of EDITABLE_TEXT_FIELDS) {
      if (body[field] !== undefined) {
        user[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
      }
    }

    // Username (validated + uniqueness checked)
    if (body.username !== undefined && body.username !== null && body.username !== '') {
      const normalized = String(body.username).toLowerCase().trim();
      if (!/^[a-z0-9_.]{3,30}$/.test(normalized)) {
        throw new ProfileError(
          'Username must be 3-30 chars: letters, numbers, underscores, dots',
          400,
          'INVALID_USERNAME'
        );
      }
      if (normalized !== user.username) {
        const available = await User.isUsernameAvailable(normalized, userId);
        if (!available) {
          throw new ProfileError('That username is already taken', 409, 'USERNAME_TAKEN');
        }
        user.username = normalized;
      }
    }

    // Location (merge, preserve coordinates)
    if (body.location && typeof body.location === 'object') {
      const { city, state, country, address, latitude, longitude } = body.location;
      user.location = user.location || {};
      if (city !== undefined) user.location.city = city;
      if (state !== undefined) user.location.state = state;
      if (country !== undefined) user.location.country = country;
      if (address !== undefined) user.location.address = address;
      if (latitude != null && longitude != null) {
        user.location.coordinates = { type: 'Point', coordinates: [longitude, latitude] };
      }
    }

    // Interests / causes (onboarding Step 3). Sanitized to valid cause codes.
    if (body.interests !== undefined) {
      user.preferences = user.preferences || {};
      user.preferences.interests = normalizeInterests(body.interests);
    }

    // Creator profile (Level 4)
    if (body.creator_profile && typeof body.creator_profile === 'object') {
      const cp = body.creator_profile;
      if (cp.personal_story !== undefined) user.creator_profile.personal_story = cp.personal_story;
      if (cp.why_joined !== undefined) user.creator_profile.why_joined = cp.why_joined;
      if (Array.isArray(cp.areas_of_need)) {
        user.creator_profile.areas_of_need = cp.areas_of_need.slice(0, 20);
      }
    }

    // Privacy controls
    if (body.privacy && typeof body.privacy === 'object') {
      const p = body.privacy;
      if (p.profile_visibility && ['public', 'private'].includes(p.profile_visibility)) {
        user.privacy.profile_visibility = p.profile_visibility;
      }
      ['show_activity_feed', 'show_stats', 'show_donations', 'show_location'].forEach((k) => {
        if (typeof p[k] === 'boolean') user.privacy[k] = p[k];
      });
    }

    const wasComplete = user.profile_completion >= 100;
    user.recomputeProfileCompletion();
    user.updated_at = new Date();
    await user.save();

    // First time reaching 100% → reward (best-effort, never blocks save)
    if (!wasComplete && user.profile_completion >= 100) {
      GamificationService.awardForAction(userId, 'complete_profile').catch(() => {});
    }

    return user.toJSON();
  }

  /**
   * Build the full profile dashboard for the owner: identity, completion meter,
   * verification badges, gamification, and aggregated supporter + creator stats.
   *
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  static async getDashboard(userId) {
    const user = await User.findById(userId);
    if (!user || user.deleted_at) {
      throw new ProfileError('User not found', 404, 'USER_NOT_FOUND');
    }

    const [supporterStats, creatorStats] = await Promise.all([
      this.getSupporterStats(userId, user),
      this.getCreatorStats(userId),
    ]);

    return {
      identity: {
        id: user._id,
        email: user.email,
        username: user.username,
        display_name: user.display_name,
        full_name: user.full_name,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url,
        bio: user.bio,
        phone: user.phone,
        location: user.location,
        role: user.role,
        interests: user.preferences?.interests || [],
        created_at: user.created_at,
      },
      completion: {
        percent: user.profile_completion,
        setup_completed: user.profile_setup_completed,
        checklist: user.getCompletionChecklist(),
      },
      verification: {
        badges: user.verification_badges,
        identity_tier: user.identity_tier,
        identity_status: user.verification_status,
        trust_score: user.trust_score,
      },
      gamification: {
        ...getLevelProgress(user.gamification?.xp || 0),
        badges: user.gamification?.badges || [],
      },
      supporter_stats: supporterStats,
      creator_stats: creatorStats,
      creator_profile: user.creator_profile,
      privacy: user.privacy,
    };
  }

  /**
   * Aggregate "Enhanced Supporter Profile" stats (Level 3).
   * Combines denormalized User.stats with volunteer hours and a simple impact
   * score.
   */
  static async getSupporterStats(userId, userDoc = null) {
    const user = userDoc || (await User.findById(userId).select('stats').lean());
    const stats = (user && user.stats) || {};

    const volunteer = await VolunteerProfile.findOne({ user_id: userId, deleted_at: null })
      .select('total_hours')
      .lean();
    const volunteerHours = volunteer?.total_hours || 0;

    // Community impact score: a weighted blend of contributions.
    const impactScore =
      Math.round((stats.total_donated || 0) / 100) * 1 + // $1 donated = 1 pt
      (stats.shares_recorded || 0) * 5 +
      volunteerHours * 20 +
      (stats.referral_count || 0) * 25;

    return {
      campaigns_supported: stats.donations_made || 0,
      total_donated_cents: stats.total_donated || 0,
      volunteer_hours: volunteerHours,
      shares_completed: stats.shares_recorded || 0,
      rewards_earned_cents: stats.total_earned || 0,
      referrals: stats.referral_count || 0,
      community_impact_score: impactScore,
    };
  }

  /**
   * Aggregate "Creator Profile" stats (Level 4) from the Campaign collection.
   * Defensive: any path mismatch degrades to 0 rather than throwing.
   */
  static async getCreatorStats(userId) {
    try {
      const result = await Campaign.aggregate([
        { $match: { creator_id: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            campaigns_created: { $sum: 1 },
            campaigns_completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            funds_raised_cents: { $sum: { $sum: '$goals.current_amount' } },
            supporters_reached: {
              $sum: { $size: { $ifNull: ['$metrics.unique_supporters', []] } },
            },
          },
        },
      ]);

      const agg = result[0] || {};
      const created = agg.campaigns_created || 0;
      const completed = agg.campaigns_completed || 0;

      // Pull creator trust metrics off the user doc.
      const user = await User.findById(userId)
        .select('creator_profile profile_completion verification_status identity_tier')
        .lean();

      return {
        campaigns_created: created,
        campaigns_completed: completed,
        funds_raised_cents: agg.funds_raised_cents || 0,
        supporters_reached: agg.supporters_reached || 0,
        success_rate: created > 0 ? Math.round((completed / created) * 100) : 0,
        response_rate: user?.creator_profile?.response_rate || 0,
        community_rating: user?.creator_profile?.community_rating || 0,
        rating_count: user?.creator_profile?.rating_count || 0,
        verification_level: user?.identity_tier || (user?.verification_status === 'verified' ? 'basic' : 'none'),
        profile_completion: user?.profile_completion || 0,
      };
    } catch (error) {
      winstonLogger.error('Failed to aggregate creator stats', {
        userId: userId?.toString(),
        error: error.message,
      });
      return {
        campaigns_created: 0,
        campaigns_completed: 0,
        funds_raised_cents: 0,
        supporters_reached: 0,
        success_rate: 0,
        response_rate: 0,
        community_rating: 0,
        rating_count: 0,
        verification_level: 'none',
        profile_completion: 0,
      };
    }
  }

  /**
   * Public profile view, respecting the target user's privacy settings.
   *
   * @param {string} idOrUsername
   * @param {string|null} viewerId - the requesting user (null if guest)
   * @returns {Promise<Object>}
   */
  static async getPublicProfile(idOrUsername, viewerId = null) {
    const query = mongoose.isValidObjectId(idOrUsername)
      ? { _id: idOrUsername }
      : { username: String(idOrUsername).toLowerCase().trim() };
    query.deleted_at = null;

    const user = await User.findOne(query);
    if (!user || user.blocked) {
      throw new ProfileError('User not found', 404, 'USER_NOT_FOUND');
    }

    const isOwner = viewerId && viewerId.toString() === user._id.toString();

    // Private profiles only reveal a minimal card to non-owners.
    if (user.privacy?.profile_visibility === 'private' && !isOwner) {
      return {
        id: user._id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        is_private: true,
        verification_badges: user.verification_badges,
      };
    }

    const profile = {
      id: user._id,
      username: user.username,
      display_name: user.display_name,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      role: user.role,
      verification_badges: user.verification_badges,
      identity_tier: user.identity_tier,
      trust_score: user.trust_score,
      gamification: {
        level: user.gamification?.level || 1,
        ...getLevelProgress(user.gamification?.xp || 0),
        badges: user.gamification?.badges || [],
      },
      creator_profile: {
        personal_story: user.creator_profile?.personal_story || '',
        areas_of_need: user.creator_profile?.areas_of_need || [],
      },
      created_at: user.created_at,
    };

    if (user.privacy?.show_location && user.location) {
      profile.location = { city: user.location.city, state: user.location.state, country: user.location.country };
    }
    if (user.privacy?.show_stats || isOwner) {
      profile.supporter_stats = await this.getSupporterStats(user._id, user);
      profile.creator_stats = await this.getCreatorStats(user._id);
    }

    return profile;
  }

  /**
   * AI-style profile strength score (rule-based) with prioritized suggestions.
   * Returns a 0-100 score and the highest-impact next actions.
   *
   * @param {string} userId
   * @returns {Promise<{ score: number, suggestions: Array }>}
   */
  static async getProfileStrength(userId) {
    const user = await User.findById(userId);
    if (!user || user.deleted_at) {
      throw new ProfileError('User not found', 404, 'USER_NOT_FOUND');
    }

    const suggestions = [];
    const checklist = user.getCompletionChecklist();

    const SUGGESTION_COPY = {
      first_name: 'Add your first name',
      last_name: 'Add your last name',
      username: 'Choose a username',
      avatar: 'Add a profile photo',
      bio: 'Write a short bio (at least 20 characters)',
      location: 'Add your city and country',
      email_verified: 'Verify your email address',
      phone_verified: 'Verify your phone number',
      identity_verified: 'Complete ID+ identity verification',
    };

    checklist
      .filter((item) => !item.done)
      .sort((a, b) => b.weight - a.weight)
      .forEach((item) => {
        suggestions.push({
          key: item.key,
          label: SUGGESTION_COPY[item.key] || `Complete ${item.key}`,
          impact: item.weight,
        });
      });

    // Score = completion meter, with a small bonus for premium identity tier.
    let score = user.profile_completion;
    if (user.identity_tier === 'premium') score = Math.min(100, score + 5);

    return {
      score,
      level: score >= 90 ? 'excellent' : score >= 70 ? 'strong' : score >= 40 ? 'developing' : 'incomplete',
      suggestions: suggestions.slice(0, 5),
    };
  }

  /**
   * Username availability check.
   * @param {string} username
   * @param {string} [excludeUserId]
   */
  static async checkUsername(username, excludeUserId = null) {
    const normalized = String(username || '').toLowerCase().trim();
    const valid = /^[a-z0-9_.]{3,30}$/.test(normalized);
    if (!valid) {
      return { username: normalized, valid: false, available: false, reason: 'invalid_format' };
    }
    const available = await User.isUsernameAvailable(normalized, excludeUserId);
    return { username: normalized, valid: true, available };
  }
}

module.exports = ProfileService;
module.exports.ProfileError = ProfileError;
