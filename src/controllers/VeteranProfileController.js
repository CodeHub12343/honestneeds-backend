/**
 * VeteranProfileController — TASK-7.3 + TASK-7.4.
 *
 * Endpoints mounted under /api/veterans:
 *   GET  /profile                — the caller's own veteran profile
 *   PUT  /profile                — upsert the sub-doc
 *   POST /profile/verify         — self-attest OR submit DD-214
 *   POST /idme/start             — begin ID.me OAuth
 *   GET  /idme/callback          — ID.me OAuth return
 *
 * DD-214 upload constraints: 10 MB max, PDF or image only, routed to the
 * `veterans/dd214` private Cloudinary folder (the same pattern as the
 * identity folder).
 */

const User = require('../models/User');
const IDMeService = require('../services/identity/IDMeService');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const winstonLogger = require('../utils/winstonLogger');

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic))$/i;

function fail(res, err, context) {
  const statusCode = err?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`VeteranProfileController.${context} failed`, {
      message: err?.message,
      code: err?.code,
    });
  }
  return res.status(statusCode).json({
    success: false,
    error: { code: err?.code || 'VETERAN_PROFILE_ERROR', message: err?.message || 'Action failed' },
  });
}

function badgeFor(code) {
  return { code, name: 'Veteran Verified', icon: 'shield-star', category: 'identity' };
}

async function awardVeteranBadge(user) {
  if (!Array.isArray(user.gamification?.badges)) {
    user.gamification = user.gamification || {};
    user.gamification.badges = [];
  }
  const already = user.gamification.badges.some((b) => b.code === 'veteran_verified');
  if (!already) {
    user.gamification.badges.push(badgeFor('veteran_verified'));
  }
}

const ALLOWED_PROFILE_FIELDS = [
  'is_veteran',
  'branch',
  'service_years',
  'mos',
  'discharge_type',
  'interests',
  'looking_for',
  'location',
  'consent_to_match',
];

class VeteranProfileController {
  static async get(req, res) {
    try {
      const user = await User.findById(req.user.userId);
      if (!user) return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND' } });
      return res.json({ success: true, data: user.toSelfJSON().veteran_profile || {} });
    } catch (err) {
      return fail(res, err, 'get');
    }
  }

  static async update(req, res) {
    try {
      const user = await User.findById(req.user.userId);
      if (!user) return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND' } });

      const body = req.body || {};
      user.veteran_profile = user.veteran_profile || {};
      for (const key of ALLOWED_PROFILE_FIELDS) {
        if (body[key] !== undefined) {
          user.veteran_profile[key] = body[key];
        }
      }
      // Any update that includes is_veteran=true but no verified_via yet
      // leaves verified_via null — the dedicated /verify endpoint is the
      // only writer that moves verified_via away from null.
      await user.save();
      return res.json({ success: true, data: user.toSelfJSON().veteran_profile });
    } catch (err) {
      return fail(res, err, 'update');
    }
  }

  /**
   * POST /profile/verify
   * - body.method='self' flips verified_via='self' (soft self-attestation)
   * - body.method='dd214' expects multipart file 'document'; uploads to
   *   private Cloudinary folder and sets verified_via='dd214' PENDING
   *   admin review (admin promotes to verified_via='admin').
   */
  static async verify(req, res) {
    try {
      const user = await User.findById(req.user.userId);
      if (!user) return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND' } });

      user.veteran_profile = user.veteran_profile || {};
      user.veteran_profile.is_veteran = true;

      const method = (req.body?.method || '').toLowerCase();

      if (method === 'self') {
        user.veteran_profile.verified_via = 'self';
        user.veteran_profile.verified_at = new Date();
        await user.save();
        return res.json({
          success: true,
          data: { verified_via: 'self', verified_at: user.veteran_profile.verified_at },
        });
      }

      if (method === 'dd214') {
        const file = req.file;
        if (!file) {
          return res.status(400).json({
            success: false,
            error: { code: 'DD214_REQUIRED', message: 'Upload a DD-214 as the `document` field' },
          });
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          return res.status(400).json({
            success: false,
            error: { code: 'DD214_TOO_LARGE', message: 'Max 10 MB' },
          });
        }
        if (!ALLOWED_MIME.test(file.mimetype)) {
          return res.status(400).json({
            success: false,
            error: { code: 'DD214_BAD_MIME', message: 'PDF or image only' },
          });
        }

        const uploaded = await uploadToCloudinary(file.buffer, file.originalname, {
          folder: `veterans/dd214/${user._id}`,
          resource_type: 'auto',
          type: 'private',
          use_filename: false,
          unique_filename: true,
        });
        user.veteran_profile.dd214_url = uploaded.secure_url;
        user.veteran_profile.dd214_public_id = uploaded.publicId || uploaded.public_id;
        user.veteran_profile.verified_via = 'dd214'; // pending admin promotion
        user.veteran_profile.verified_at = null;
        await user.save();
        return res.json({
          success: true,
          data: { verified_via: 'dd214', status: 'pending_review' },
        });
      }

      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_METHOD', message: 'method must be self|dd214' },
      });
    } catch (err) {
      return fail(res, err, 'verify');
    }
  }

  // ── ID.me OAuth (TASK-7.4) ───────────────────────────────────────────
  static async idmeStart(req, res) {
    try {
      const { url } = IDMeService.getAuthorizeUrl({ userId: req.user.userId });
      return res.json({ success: true, data: { authorizeUrl: url } });
    } catch (err) {
      return fail(res, err, 'idmeStart');
    }
  }

  static async idmeCallback(req, res) {
    try {
      const { code, state, error } = req.query || {};
      const base = (process.env.PUBLIC_WEB_URL || '').replace(/\/$/, '');
      const to = (status, reason) => {
        const path = `/veterans/profile?idme=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`;
        if (base) return res.redirect(302, `${base}${path}`);
        return res.status(status === 'ok' ? 200 : 400).json({ success: status === 'ok' });
      };
      if (error) return to('error', String(error));

      const { userId, verified, affiliation } = await IDMeService.handleCallback({ code, state });
      if (!verified) return to('error', 'not_military');

      const user = await User.findById(userId);
      if (!user) return to('error', 'user_not_found');

      user.veteran_profile = user.veteran_profile || {};
      user.veteran_profile.is_veteran = true;
      user.veteran_profile.verified_via = 'idme';
      user.veteran_profile.verified_at = new Date();
      await awardVeteranBadge(user);
      await user.save();

      winstonLogger.info('IDMe verification completed', {
        userId: String(user._id),
        affiliation_handle: affiliation?.handle,
      });
      return to('ok');
    } catch (err) {
      return fail(res, err, 'idmeCallback');
    }
  }
}

module.exports = VeteranProfileController;
