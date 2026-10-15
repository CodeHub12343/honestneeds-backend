/**
 * SocialController — Phase 5 HTTP boundary.
 * Routes mounted at /api/social (see src/routes/socialRoutes.js).
 */

const SocialConnection = require('../models/SocialConnection');
const MetaService = require('../services/social/MetaService');
const XService = require('../services/social/XService');
const SocialDistributionService = require('../services/SocialDistributionService');
const winstonLogger = require('../utils/winstonLogger');

const PROVIDER_SERVICES = { meta: MetaService, x: XService };

function fail(res, err, context) {
  const statusCode = err?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`SocialController.${context} failed`, {
      message: err?.message,
      code: err?.code,
    });
  }
  return res.status(statusCode).json({
    success: false,
    error: {
      code: err?.code || 'SOCIAL_ERROR',
      message: err?.message || 'Social action failed',
    },
  });
}

function redirectToUi(res, { ok, provider, message }) {
  const base = (process.env.PUBLIC_WEB_URL || '').replace(/\/$/, '');
  const path = `/settings/social?provider=${encodeURIComponent(provider)}&${
    ok ? 'status=ok' : `status=error&reason=${encodeURIComponent(message || 'failed')}`
  }`;
  if (base) return res.redirect(302, `${base}${path}`);
  return res.status(ok ? 200 : 400).json({
    success: ok,
    error: ok ? undefined : { code: 'SOCIAL_CALLBACK_FAILED', message },
  });
}

class SocialController {
  // GET /api/social/connections — list the caller's connections
  static async list(req, res) {
    try {
      const rows = await SocialConnection.find({ user_id: req.user.userId }).sort({
        provider: 1,
      });
      return res.json({ success: true, data: rows.map((r) => r.toJSON()) });
    } catch (err) {
      return fail(res, err, 'list');
    }
  }

  // POST /api/social/connect/:provider
  static async connect(req, res) {
    try {
      const { provider } = req.params;
      const Service = PROVIDER_SERVICES[provider];
      if (!Service) {
        return res.status(400).json({
          success: false,
          error: { code: 'UNKNOWN_PROVIDER', message: `Unknown provider ${provider}` },
        });
      }
      const { url } = Service.getAuthorizeUrl({ userId: req.user.userId });
      return res.json({ success: true, data: { authorizeUrl: url } });
    } catch (err) {
      return fail(res, err, 'connect');
    }
  }

  // GET /api/social/callback/:provider  (public — provider redirect)
  static async callback(req, res) {
    const { provider } = req.params;
    const Service = PROVIDER_SERVICES[provider];
    if (!Service) {
      return redirectToUi(res, { ok: false, provider, message: 'unknown_provider' });
    }
    const { code, state, error } = req.query || {};
    if (error) {
      return redirectToUi(res, { ok: false, provider, message: String(error) });
    }
    try {
      await Service.handleCallback({ code, state });
      return redirectToUi(res, { ok: true, provider });
    } catch (err) {
      winstonLogger.warn('SocialController.callback failed', {
        provider,
        code: err.code,
        statusCode: err.statusCode,
      });
      return redirectToUi(res, { ok: false, provider, message: err.code || 'callback_failed' });
    }
  }

  // DELETE /api/social/connections/:provider
  static async disconnect(req, res) {
    try {
      const { provider } = req.params;
      const Service = PROVIDER_SERVICES[provider];
      if (!Service) {
        return res.status(400).json({
          success: false,
          error: { code: 'UNKNOWN_PROVIDER', message: `Unknown provider ${provider}` },
        });
      }
      const connection = await SocialConnection.findOne({
        user_id: req.user.userId,
        provider,
      });
      if (!connection) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_CONNECTED', message: 'No connection to disconnect' },
        });
      }
      await Service.revoke({ connection });
      return res.json({ success: true, data: connection.toJSON() });
    } catch (err) {
      return fail(res, err, 'disconnect');
    }
  }

  // POST /api/social/distribute (admin-only)
  static async distribute(req, res) {
    try {
      const { content_type, content_id, platforms, dry_run } = req.body || {};
      const result = await SocialDistributionService.distribute({
        userId: req.user.userId,
        contentType: content_type,
        contentId: content_id,
        platforms,
        dryRun: !!dry_run,
      });
      return res.json({ success: true, data: result });
    } catch (err) {
      return fail(res, err, 'distribute');
    }
  }
}

module.exports = SocialController;
