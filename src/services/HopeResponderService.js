/**
 * HopeResponderService (VO-08 Hope Responder Program — "Need Now")
 *
 * Volunteers enrol as Hope Responders with a location and service radius.
 * Anyone can post an emergency "Need Now" request; the service matches nearby,
 * verified, active responders by geo-distance and notifies them. Responders
 * accept, update arrival status, and complete; the requester confirms
 * resolution, which awards the responders volunteer XP.
 */

const VolunteerProfile = require('../models/VolunteerProfile');
const HopeResponderRequest = require('../models/HopeResponderRequest');
const User = require('../models/User');
const VolunteerProgramService = require('./VolunteerProgramService');
const NotificationDispatcher = require('./NotificationDispatcher');
const { VOLUNTEER_XP, HOPE_RESPONDER } = require('../config/volunteerProgram');
const winstonLogger = require('../utils/winstonLogger');

class HopeResponderError extends Error {
  constructor(message, statusCode = 400, code = 'HOPE_RESPONDER_ERROR') {
    super(message);
    this.name = 'HopeResponderError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function toCoordinates(input = {}) {
  const lat = Number(input.latitude ?? input.lat);
  const lng = Number(input.longitude ?? input.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat]; // GeoJSON order
}

class HopeResponderService {
  /**
   * Enrol (or update enrollment of) the caller as a Hope Responder.
   * @param {string} userId
   * @param {Object} data - { latitude, longitude, radius_km, categories }
   */
  static async enroll(userId, data = {}) {
    const profile = await VolunteerProfile.findByUserId(userId);
    if (!profile) {
      throw new HopeResponderError('Volunteer profile required', 403, 'NO_VOLUNTEER_PROFILE');
    }

    const coords = toCoordinates(data);
    if (!coords) {
      throw new HopeResponderError('Valid latitude and longitude are required', 400, 'INVALID_LOCATION');
    }

    const categories = Array.isArray(data.categories)
      ? data.categories.filter((c) => HOPE_RESPONDER.categories.includes(c))
      : [];

    const wasEnrolled = profile.hope_responder.enrolled;
    profile.hope_responder.enrolled = true;
    if (HOPE_RESPONDER.auto_verify && profile.hope_responder.status !== 'suspended') {
      // Auto-verify: responders go straight to active so they can accept
      // requests immediately (no admin gate). Suspended responders are excluded.
      profile.hope_responder.verified = true;
      profile.hope_responder.status = 'active';
    } else if (profile.hope_responder.status === 'inactive') {
      // Manual mode: stay pending until an admin verifies; preserve any
      // existing active/verified state.
      profile.hope_responder.status = 'pending';
    }
    profile.hope_responder.radius_km = Math.min(200, Math.max(1, Number(data.radius_km) || HOPE_RESPONDER.default_radius_km));
    profile.hope_responder.categories = categories;
    profile.hope_responder.location = { type: 'Point', coordinates: coords };
    if (!wasEnrolled) profile.hope_responder.enrolled_at = new Date();
    // Re-evaluate badges (may grant the hope_responder badge once verified).
    VolunteerProgramService.evaluateBadges(profile);
    await profile.save();

    winstonLogger.info('🚨 Hope Responder enrolled', {
      userId: userId.toString(),
      status: profile.hope_responder.status,
    });

    return profile.hope_responder;
  }

  /**
   * Update responder availability (active/inactive) — only verified responders
   * may go active.
   */
  static async setAvailability(userId, active) {
    const profile = await VolunteerProfile.findByUserId(userId);
    if (!profile || !profile.hope_responder.enrolled) {
      throw new HopeResponderError('Not enrolled as a Hope Responder', 404, 'NOT_ENROLLED');
    }
    if (active && !profile.hope_responder.verified) {
      throw new HopeResponderError('Hope Responder enrollment is not yet verified', 403, 'NOT_VERIFIED');
    }
    if (profile.hope_responder.status === 'suspended') {
      throw new HopeResponderError('Hope Responder enrollment is suspended', 403, 'SUSPENDED');
    }
    profile.hope_responder.status = active ? 'active' : 'pending';
    await profile.save();
    return profile.hope_responder;
  }

  /**
   * Admin verifies a responder's enrollment.
   */
  static async verifyResponder(targetUserId, verified = true) {
    const profile = await VolunteerProfile.findByUserId(targetUserId);
    if (!profile || !profile.hope_responder.enrolled) {
      throw new HopeResponderError('Not enrolled as a Hope Responder', 404, 'NOT_ENROLLED');
    }
    profile.hope_responder.verified = !!verified;
    profile.hope_responder.status = verified ? 'active' : 'pending';
    // Re-evaluate badges (may grant the hope_responder badge).
    VolunteerProgramService.evaluateBadges(profile);
    await profile.save();
    return profile.hope_responder;
  }

  /**
   * Create a Need Now emergency request and dispatch it to nearby responders.
   * @param {string} userId - requester
   * @param {Object} data
   */
  static async createRequest(userId, data = {}) {
    const coords = toCoordinates(data);
    if (!coords) {
      throw new HopeResponderError('Valid latitude and longitude are required', 400, 'INVALID_LOCATION');
    }
    if (!HOPE_RESPONDER.categories.includes(data.category)) {
      throw new HopeResponderError('Invalid category', 400, 'INVALID_CATEGORY');
    }

    const ttlHours = Math.min(72, Math.max(1, Number(data.expires_in_hours) || 24));

    const request = await HopeResponderRequest.create({
      requester_id: userId,
      campaign_id: data.campaign_id || null,
      title: data.title,
      description: data.description,
      category: data.category,
      urgency: HOPE_RESPONDER.urgency_levels.includes(data.urgency) ? data.urgency : 'high',
      location: { type: 'Point', coordinates: coords },
      address_text: data.address_text || '',
      city: data.city || '',
      responders_needed: Math.min(50, Math.max(1, Number(data.responders_needed) || 1)),
      contact_phone: data.contact_phone || '',
      contact_method: ['phone', 'inApp', 'email'].includes(data.contact_method) ? data.contact_method : 'inApp',
      expires_at: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
    });

    // Dispatch: find matching responders and record how many were notified.
    const matches = await this.findMatchingResponders(request);
    request.notified_count = matches.length;
    await request.save();

    winstonLogger.info('🆘 Need Now request created', {
      requestId: request._id.toString(),
      category: request.category,
      urgency: request.urgency,
      notified: matches.length,
    });

    return { request: request.toObject(), notified_responders: matches.length };
  }

  /**
   * Find verified, active responders within range whose categories match (or
   * who accept all categories).
   * @param {Object} request - HopeResponderRequest doc
   * @param {number} [maxRadiusKm]
   */
  static async findMatchingResponders(request, maxRadiusKm = 100) {
    const [lng, lat] = request.location.coordinates;
    const query = {
      status: 'active',
      deleted_at: null,
      'hope_responder.enrolled': true,
      'hope_responder.verified': true,
      'hope_responder.status': 'active',
      'hope_responder.location': {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: maxRadiusKm * 1000, // meters
        },
      },
      user_id: { $ne: request.requester_id },
    };

    const candidates = await VolunteerProfile.find(query)
      .select('user_id hope_responder')
      .limit(200)
      .lean();

    // Keep only responders whose own service radius covers the request and whose
    // categories include the request category (empty categories = accept all).
    return candidates.filter((p) => {
      const hr = p.hope_responder || {};
      const responderCoords = hr.location?.coordinates;
      if (!responderCoords) return false;
      const distanceKm = haversineKm(lat, lng, responderCoords[1], responderCoords[0]);
      if (distanceKm > (hr.radius_km || HOPE_RESPONDER.default_radius_km)) return false;
      if (Array.isArray(hr.categories) && hr.categories.length > 0) {
        return hr.categories.includes(request.category);
      }
      return true;
    });
  }

  /**
   * A responder accepts a dispatched request.
   */
  static async acceptRequest(userId, requestId) {
    const profile = await VolunteerProfile.findByUserId(userId);
    if (!profile || !profile.hope_responder.verified || profile.hope_responder.status !== 'active') {
      throw new HopeResponderError('Only active, verified responders can accept', 403, 'NOT_ACTIVE_RESPONDER');
    }

    const request = await HopeResponderRequest.findById(requestId);
    if (!request) throw new HopeResponderError('Request not found', 404, 'REQUEST_NOT_FOUND');
    if (request.requester_id.toString() === userId.toString()) {
      throw new HopeResponderError('You cannot respond to your own request', 400, 'OWN_REQUEST');
    }
    if (!request.isAcceptingResponders()) {
      throw new HopeResponderError('Request is no longer accepting responders', 409, 'NOT_ACCEPTING');
    }
    if (request.responders.some((r) => r.volunteer_id.toString() === userId.toString() && r.status !== 'withdrawn')) {
      throw new HopeResponderError('You have already accepted this request', 409, 'ALREADY_ACCEPTED');
    }

    request.responders.push({
      volunteer_id: userId,
      volunteer_profile_id: profile._id,
      status: 'accepted',
      accepted_at: new Date(),
    });
    if (request.status === 'open') request.status = 'matched';
    await request.save();

    profile.hope_responder.responses_count += 1;
    await profile.save();

    this.notifyRequester(request, userId, 'hope_responder_accepted');

    return request.toObject();
  }

  /**
   * A responder updates their en-route/arrival status.
   */
  static async updateResponderStatus(userId, requestId, status) {
    const allowed = ['on_the_way', 'arrived', 'completed', 'withdrawn'];
    if (!allowed.includes(status)) {
      throw new HopeResponderError('Invalid status', 400, 'INVALID_STATUS');
    }
    const request = await HopeResponderRequest.findById(requestId);
    if (!request) throw new HopeResponderError('Request not found', 404, 'REQUEST_NOT_FOUND');

    const entry = request.responders.find((r) => r.volunteer_id.toString() === userId.toString());
    if (!entry) throw new HopeResponderError('You are not a responder on this request', 403, 'NOT_RESPONDER');

    entry.status = status;
    if (status === 'completed') entry.completed_at = new Date();
    await request.save();

    const NOTIFY_ON = { on_the_way: 'hope_responder_on_the_way', arrived: 'hope_responder_arrived' };
    if (NOTIFY_ON[status]) this.notifyRequester(request, userId, NOTIFY_ON[status]);

    return request.toObject();
  }

  /**
   * Best-effort: notify a request's owner about a responder action. Never throws
   * — a notification failure must not roll back the responder's action.
   * @param {object} request - HopeResponderRequest document
   * @param {string} responderUserId - the acting responder's user id
   * @param {string} type - notification registry type key
   */
  static notifyRequester(request, responderUserId, type) {
    (async () => {
      try {
        // Don't notify the requester about their own action (self-response).
        if (String(request.requester_id) === String(responderUserId)) return;
        const responder = await User.findById(responderUserId).select('display_name username').lean();
        await NotificationDispatcher.notify({
          userId: request.requester_id,
          type,
          data: {
            actor_name: responder?.display_name || responder?.username || 'A responder',
            request_id: String(request._id),
            request_title: request.title,
            category: request.category,
          },
        });
      } catch (err) {
        winstonLogger.warn('HopeResponder notifyRequester failed', { type, error: err.message });
      }
    })();
  }

  /**
   * The requester (or an admin) marks the request resolved and awards XP to
   * responders who saw it through.
   */
  static async resolveRequest(userId, requestId, { note = null, isAdmin = false } = {}) {
    const request = await HopeResponderRequest.findById(requestId);
    if (!request) throw new HopeResponderError('Request not found', 404, 'REQUEST_NOT_FOUND');
    if (!isAdmin && request.requester_id.toString() !== userId.toString()) {
      throw new HopeResponderError('Not your request', 403, 'FORBIDDEN');
    }
    if (['resolved', 'cancelled'].includes(request.status)) {
      throw new HopeResponderError('Request already closed', 409, 'ALREADY_CLOSED');
    }

    request.status = 'resolved';
    request.resolved_at = new Date();
    request.resolution_note = note;

    // Credit responders who accepted (and didn't withdraw).
    const credited = request.responders.filter((r) => r.status !== 'withdrawn');
    for (const entry of credited) {
      if (entry.status !== 'completed') entry.status = 'completed';
      if (!entry.completed_at) entry.completed_at = new Date();
    }
    await request.save();

    // Award volunteer XP best-effort to each credited responder.
    await Promise.all(
      credited.map(async (entry) => {
        try {
          const profile = await VolunteerProfile.findById(entry.volunteer_profile_id);
          if (!profile) return;
          profile.hope_responder.resolved_count += 1;
          profile.xp = (profile.xp || 0) + VOLUNTEER_XP.hope_responder_resolved;
          profile.recomputeLevel();
          VolunteerProgramService.evaluateBadges(profile);
          await profile.save();
        } catch (err) {
          winstonLogger.error('Failed to credit Hope Responder', { error: err.message });
        }
      })
    );

    winstonLogger.info('✅ Need Now request resolved', {
      requestId: request._id.toString(),
      respondersCredited: credited.length,
    });

    return request.toObject();
  }

  /**
   * Requester (or admin) cancels an open/matched request.
   */
  static async cancelRequest(userId, requestId, isAdmin = false) {
    const request = await HopeResponderRequest.findById(requestId);
    if (!request) throw new HopeResponderError('Request not found', 404, 'REQUEST_NOT_FOUND');
    if (!isAdmin && request.requester_id.toString() !== userId.toString()) {
      throw new HopeResponderError('Not your request', 403, 'FORBIDDEN');
    }
    if (['resolved', 'cancelled'].includes(request.status)) {
      throw new HopeResponderError('Request already closed', 409, 'ALREADY_CLOSED');
    }
    request.status = 'cancelled';
    await request.save();
    return request.toObject();
  }

  /**
   * Browse open requests near a point (for responders to discover) or by city.
   * @param {Object} opts - { latitude, longitude, radius_km, category, city, page, limit }
   */
  static async browseRequests(opts = {}, viewerId = null) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(opts.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { status: { $in: ['open', 'matched'] } };
    if (opts.category && HOPE_RESPONDER.categories.includes(opts.category)) query.category = opts.category;
    if (opts.city) query.city = new RegExp(`^${escapeRegex(opts.city)}$`, 'i');

    const coords = toCoordinates(opts);
    if (coords) {
      const radiusKm = Math.min(200, Math.max(1, Number(opts.radius_km) || HOPE_RESPONDER.default_radius_km));
      query.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: coords },
          $maxDistance: radiusKm * 1000,
        },
      };
    }

    // $near can't be combined with skip-based count cheaply; run find then count.
    const [requests, total] = await Promise.all([
      HopeResponderRequest.find(query).skip(skip).limit(limit).lean(),
      coords ? null : HopeResponderRequest.countDocuments(query),
    ]);

    // Annotate each request with the viewer's own (non-withdrawn) responder
    // status so the UI can persist "Accepted / On the way / …" across reloads.
    if (viewerId) {
      const vid = String(viewerId);
      for (const r of requests) {
        const mine = (r.responders || []).find(
          (e) => String(e.volunteer_id) === vid && e.status !== 'withdrawn'
        );
        r.my_status = mine ? mine.status : null;
      }
    }

    return {
      requests,
      pagination: { page, limit, total: total ?? requests.length, totalPages: total ? Math.ceil(total / limit) : 1 },
    };
  }

  /**
   * Requests the caller has created.
   */
  static async listMyRequests(userId, { page = 1, limit = 20, status } = {}) {
    const skip = (page - 1) * limit;
    const query = { requester_id: userId };
    if (status) query.status = status;
    const [requests, total] = await Promise.all([
      HopeResponderRequest.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        // Populate accepted responders so the requester can see who's helping
        // and start an in-app conversation with them.
        .populate('responders.volunteer_id', 'display_name username avatar_url')
        .lean(),
      HopeResponderRequest.countDocuments(query),
    ]);
    return { requests, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  static async getRequestById(requestId) {
    const request = await HopeResponderRequest.findById(requestId)
      .populate('responders.volunteer_id', 'display_name username avatar_url')
      .lean();
    if (!request) throw new HopeResponderError('Request not found', 404, 'REQUEST_NOT_FOUND');
    return request;
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = HopeResponderService;
module.exports.HopeResponderError = HopeResponderError;
