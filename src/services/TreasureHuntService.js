/**
 * TreasureHuntService (RG-11 GPS Treasure Hunts / Hidden QR Codes)
 *
 * Users find geolocated/QR "stops". A find is registered either by scanning a
 * stop's secret code or by submitting GPS coordinates within the stop's radius.
 * Each find grants stop XP; finding every stop completes the hunt for a bonus.
 */

const TreasureHunt = require('../models/TreasureHunt');
const GamificationService = require('./GamificationService');
const winstonLogger = require('../utils/winstonLogger');

function slugify(title) {
  return (
    String(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'hunt'
  );
}

/** Haversine distance in metres between two [lng,lat]-ish points. */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

class TreasureHuntService {
  static async createHunt(data = {}) {
    const title = (data.title || '').trim();
    if (title.length < 3) throw new Error('Title is required');
    if (!Array.isArray(data.stops) || data.stops.length === 0) {
      throw new Error('A hunt needs at least one stop');
    }

    let slug = slugify(title);
    if (await TreasureHunt.exists({ slug })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const stops = data.stops.map((s) => ({
      code: s.code || Math.random().toString(36).slice(2, 10),
      name: s.name,
      hint: s.hint || '',
      location:
        s.lat != null && s.lng != null
          ? { type: 'Point', coordinates: [s.lng, s.lat] }
          : undefined,
      radius_meters: s.radius_meters || 50,
      reward_xp: s.reward_xp || 100,
    }));

    return TreasureHunt.create({
      title,
      slug,
      description: (data.description || '').slice(0, 2000),
      city: data.city || null,
      stops,
      completion_reward_xp: data.completion_reward_xp || 500,
      completion_badge: data.completion_badge || null,
      starts_at: data.starts_at || null,
      ends_at: data.ends_at || null,
    });
  }

  static async listHunts(filter = {}) {
    const query = { is_active: true };
    if (filter.city) query.city = filter.city;
    return TreasureHunt.find(query)
      .select('title slug description city stops.name stops.hint completion_reward_xp starts_at ends_at')
      .sort({ created_at: -1 })
      .limit(100)
      .lean();
  }

  /**
   * Public view of a hunt for a given user: stops with hints (secret codes and
   * exact coordinates withheld) plus the user's find progress.
   */
  static async getHuntForUser(idOrSlug, userId) {
    const hunt = await this._resolve(idOrSlug);
    if (!hunt) return null;

    const found = new Set(
      (hunt.finds || [])
        .filter((f) => userId && f.user_id.toString() === userId.toString())
        .map((f) => f.stop_code)
    );

    return {
      id: hunt._id,
      title: hunt.title,
      slug: hunt.slug,
      description: hunt.description,
      city: hunt.city,
      total_stops: hunt.stops.length,
      found_count: [...found].length,
      completed: userId ? (hunt.completed_by || []).some((u) => u.toString() === userId.toString()) : false,
      completion_reward_xp: hunt.completion_reward_xp,
      stops: hunt.stops.map((s) => ({
        name: s.name,
        hint: s.hint,
        reward_xp: s.reward_xp,
        has_gps: !!(s.location && s.location.coordinates),
        found: found.has(s.code),
      })),
    };
  }

  /**
   * Register a find by QR code or GPS. Returns the outcome including any XP and
   * whether the hunt was completed by this find.
   *
   * @param {string} idOrSlug
   * @param {string} userId
   * @param {Object} attempt - { code } for QR, or { lat, lng } for GPS
   */
  static async recordFind(idOrSlug, userId, attempt = {}) {
    const hunt = await this._resolveDoc(idOrSlug);
    if (!hunt || !hunt.is_active) throw new Error('Hunt not found');

    const now = new Date();
    if (hunt.starts_at && now < hunt.starts_at) throw new Error('This hunt has not started yet');
    if (hunt.ends_at && now > hunt.ends_at) throw new Error('This hunt has ended');

    // Resolve which stop the attempt matches.
    let stop = null;
    let method = 'qr';
    if (attempt.code) {
      stop = hunt.stops.find((s) => s.code === attempt.code);
    } else if (attempt.lat != null && attempt.lng != null) {
      method = 'gps';
      stop = hunt.stops.find((s) => {
        const coords = s.location && s.location.coordinates;
        if (!coords) return false;
        const [lng, lat] = coords;
        return distanceMeters(attempt.lat, attempt.lng, lat, lng) <= (s.radius_meters || 50);
      });
    }
    if (!stop) throw new Error('No stop matched — wrong code or not close enough');

    const already = hunt.finds.some(
      (f) => f.user_id.toString() === userId.toString() && f.stop_code === stop.code
    );
    if (already) {
      return { already_found: true, stop: stop.name, xp_awarded: 0, hunt_completed: false };
    }

    hunt.finds.push({ user_id: userId, stop_code: stop.code, method, found_at: now });
    await GamificationService.awardXp(userId, stop.reward_xp, `treasure_hunt:${hunt.slug}`);

    // Completion check.
    const userFinds = new Set(
      hunt.finds.filter((f) => f.user_id.toString() === userId.toString()).map((f) => f.stop_code)
    );
    let huntCompleted = false;
    let completionXp = 0;
    if (userFinds.size >= hunt.stops.length && !hunt.completed_by.some((u) => u.toString() === userId.toString())) {
      hunt.completed_by.push(userId);
      huntCompleted = true;
      completionXp = hunt.completion_reward_xp;
      await GamificationService.awardXp(userId, completionXp, `treasure_hunt_complete:${hunt.slug}`);
      if (hunt.completion_badge) {
        GamificationService.logEvent(userId, 'badge_earned', { meta: { code: hunt.completion_badge } });
      }
    }

    await hunt.save();
    GamificationService.logEvent(userId, 'treasure_find', {
      meta: { hunt: hunt.slug, stop: stop.name, method, hunt_completed: huntCompleted },
    });

    return {
      already_found: false,
      stop: stop.name,
      method,
      xp_awarded: stop.reward_xp + completionXp,
      found_count: userFinds.size,
      total_stops: hunt.stops.length,
      hunt_completed: huntCompleted,
    };
  }

  static async _resolve(idOrSlug) {
    return this._resolveDoc(idOrSlug, true);
  }

  static async _resolveDoc(idOrSlug, lean = false) {
    const isId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);
    const q = isId ? TreasureHunt.findById(idOrSlug) : TreasureHunt.findOne({ slug: idOrSlug });
    return lean ? q.lean() : q;
  }
}

module.exports = TreasureHuntService;
