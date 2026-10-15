/**
 * FeatureSpotlightService
 * -------------------------------------------------------------------------
 * Reads the FeatureSpotlight registry and filters it for a specific viewer.
 * Three callers:
 *
 *   list({ user, surface, now })  → the frontend's one API call
 *   dismiss({ user, key })        → one-way per-user hide
 *   admin.upsert/retire           → operator surface via admin router
 *
 * Audience resolution is intentionally liberal: 'any' always matches, and the
 * specific audiences layer on top. A spotlight whose audience the viewer does
 * not satisfy is simply filtered out — never surfaced as 404 or forbidden.
 */

const Campaign = require('../models/Campaign');
const FeatureSpotlight = require('../models/FeatureSpotlight');
const User = require('../models/User');

const NEW_USER_DAYS = 14;

function matchesAudience(spotlight, ctx) {
  const a = spotlight.audience;
  if (!a || a === 'any') return true;
  if (a === 'anonymous') return !ctx.authenticated;
  if (!ctx.authenticated) return false;
  if (a === 'authenticated') return true;
  if (a === 'creator') return !!ctx.isCreator;
  if (a === 'volunteer') return !!ctx.isVolunteer;
  if (a === 'veteran') return !!ctx.isVeteran;
  if (a === 'new_user') return !!ctx.isNewUser;
  return false;
}

async function buildContext({ userId }) {
  if (!userId) {
    return {
      authenticated: false,
      isCreator: false,
      isVolunteer: false,
      isVeteran: false,
      isNewUser: false,
      dismissed: new Set(),
    };
  }
  const user = await User.findById(userId)
    .select({
      createdAt: 1,
      dismissed_spotlights: 1,
      'veteran_profile.is_veteran': 1,
      is_volunteer: 1,
      roles: 1,
    })
    .lean();
  if (!user) {
    return {
      authenticated: true,
      isCreator: false,
      isVolunteer: false,
      isVeteran: false,
      isNewUser: false,
      dismissed: new Set(),
    };
  }
  const [hasCampaign] = await Promise.all([
    Campaign.exists({ creator_id: userId, deleted_at: null }),
  ]);
  const ageDays = user.createdAt
    ? (Date.now() - new Date(user.createdAt).getTime()) / 86400000
    : 0;
  return {
    authenticated: true,
    isCreator: !!hasCampaign,
    isVolunteer: !!user.is_volunteer || (user.roles && user.roles.includes('volunteer')),
    isVeteran: !!user.veteran_profile?.is_veteran,
    isNewUser: ageDays < NEW_USER_DAYS,
    dismissed: new Set(user.dismissed_spotlights || []),
  };
}

class FeatureSpotlightService {
  static async list({ userId = null, surface = null, now = new Date() } = {}) {
    const ctx = await buildContext({ userId });

    const query = { active: true };
    if (surface) query.surfaces = surface;

    const rows = await FeatureSpotlight.find(query)
      .sort({ priority: 1, created_at: -1 })
      .lean();

    const items = [];
    for (const row of rows) {
      if (row.starts_at && new Date(row.starts_at) > now) continue;
      if (row.ends_at && new Date(row.ends_at) < now) continue;
      if (!matchesAudience(row, ctx)) continue;
      const dismissed = ctx.dismissed.has(row.key);
      // Nav badges disappear once dismissed; the directory still shows the row
      // but with `dismissed: true` so the frontend greys it rather than hiding
      // it (the user asked for discovery — hiding it entirely contradicts that).
      if (surface === 'nav_badge' && dismissed) continue;
      items.push({
        key: row.key,
        title: row.title,
        subtitle: row.subtitle,
        body: row.body,
        href: row.href,
        cta_label: row.cta_label,
        icon: row.icon,
        accent: row.accent,
        audience: row.audience,
        is_new: !!row.is_new_until && new Date(row.is_new_until) > now,
        dismissed,
        priority: row.priority,
      });
    }
    return items;
  }

  static async dismiss({ userId, key }) {
    if (!userId || !key) {
      const err = new Error('userId and key are required');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }
    // $addToSet keeps the array a set, so repeated dismissals are no-ops.
    await User.updateOne(
      { _id: userId },
      { $addToSet: { dismissed_spotlights: String(key) } }
    );
    return { dismissed: true };
  }

  // ── Admin ────────────────────────────────────────────────────────────

  static async adminList() {
    return FeatureSpotlight.find({}).sort({ priority: 1, created_at: -1 }).lean();
  }

  static async adminUpsert({ key, patch, adminId }) {
    if (!key) {
      const err = new Error('key is required');
      err.statusCode = 400;
      err.code = 'KEY_REQUIRED';
      throw err;
    }
    const update = { ...patch, updated_by: adminId };
    const row = await FeatureSpotlight.findOneAndUpdate(
      { key },
      {
        $set: update,
        $setOnInsert: { key, created_by: adminId },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return row;
  }

  static async adminRetire({ key }) {
    const row = await FeatureSpotlight.findOneAndUpdate(
      { key },
      { $set: { active: false } },
      { new: true }
    );
    if (!row) {
      const err = new Error('Spotlight not found');
      err.statusCode = 404;
      err.code = 'SPOTLIGHT_NOT_FOUND';
      throw err;
    }
    return row;
  }
}

module.exports = FeatureSpotlightService;
module.exports.NEW_USER_DAYS = NEW_USER_DAYS;
