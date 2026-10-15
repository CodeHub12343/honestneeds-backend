/**
 * Persona webhook handler.
 *
 * Mounted at POST /api/webhooks/persona by the webhook router. The router
 * applies `express.raw({type:'application/json'})` so this handler sees a
 * Buffer `req.body` suitable for HMAC verification. If body-parser JSON ran
 * first the raw buffer would be gone and every signature would fail — see
 * the mount comment in webhookRoutes.js.
 *
 * Flow:
 *   1. Verify signature with PersonaService.verifyWebhookSignature.
 *      - Fail → 400. Log an alert metric (not just a warn).
 *   2. Parse JSON; hand off to VerificationService.handlePersonaWebhook.
 *   3. Return 200 { applied, reason? } so Persona sees success and does not
 *      retry. Internal failures mid-processing return 500 — Persona will
 *      retry, and the service is idempotent on event_id so retries are safe.
 */

const PersonaService = require('../services/identity/PersonaService');
const VerificationService = require('../services/VerificationService');
const winstonLogger = require('../utils/winstonLogger');

async function handle(req, res) {
  const signature = req.headers['persona-signature'];
  const rawBody = req.body;

  if (!signature || !Buffer.isBuffer(rawBody)) {
    winstonLogger.warn('Persona webhook: missing signature or raw body', {
      hasSignature: !!signature,
      bodyType: typeof rawBody,
    });
    return res.status(400).json({ success: false, error: { code: 'MISSING_SIGNATURE' } });
  }

  const valid = PersonaService.verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    winstonLogger.error('🚨 Persona webhook: SIGNATURE INVALID', {
      ip: req.ip,
      ua: req.headers['user-agent'],
    });
    return res.status(400).json({ success: false, error: { code: 'INVALID_SIGNATURE' } });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    winstonLogger.error('Persona webhook: malformed JSON after signature verify', { message: err.message });
    return res.status(400).json({ success: false, error: { code: 'MALFORMED_JSON' } });
  }

  try {
    const result = await VerificationService.handlePersonaWebhook(payload);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    // handlePersonaWebhook throws VerificationError for malformed payloads
    // (400) — anything else is treated as a transient service failure and
    // mapped to 500 so Persona retries.
    const statusCode = err.statusCode || 500;
    winstonLogger.error('Persona webhook: handler error', {
      statusCode,
      code: err.code,
      message: err.message,
    });
    return res.status(statusCode).json({
      success: false,
      error: { code: err.code || 'WEBHOOK_HANDLER_ERROR', message: err.message },
    });
  }
}

module.exports = handle;
