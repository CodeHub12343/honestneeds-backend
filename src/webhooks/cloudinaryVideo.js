/**
 * Cloudinary video processing webhook.
 *
 * Mounted at POST /api/webhooks/cloudinary/video-processed by webhookRoutes.js
 * with `express.raw({type: 'application/json'})` — the signature is computed
 * from the raw bytes, so bodyParser.json() mustn't eat them first.
 *
 * Cloudinary signs each callback with:
 *   X-Cld-Signature: <sha1(sorted-params + api_secret)>
 *   X-Cld-Timestamp: <unix seconds>
 *
 * See https://cloudinary.com/documentation/notifications#callback_security.
 */

const crypto = require('crypto');

const VideoService = require('../services/VideoService');
const winstonLogger = require('../utils/winstonLogger');

const CLOCK_SKEW_S = 300; // tolerate 5 min of drift

function expectedSignature(body, timestamp, secret) {
  // Cloudinary signs the raw JSON body concatenated with the timestamp and
  // api_secret. The reference implementation is `sha1(body + timestamp + api_secret)`.
  return crypto
    .createHash('sha1')
    .update(`${body}${timestamp}${secret}`, 'utf8')
    .digest('hex');
}

function verifySignature(rawBody, headers, secret) {
  if (!secret || !headers) return false;
  const timestamp = headers['x-cld-timestamp'] || headers['X-Cld-Timestamp'];
  const provided = headers['x-cld-signature'] || headers['X-Cld-Signature'];
  if (!timestamp || !provided) return false;

  // Freshness check: reject anything outside the skew window.
  const nowS = Math.floor(Date.now() / 1000);
  if (Math.abs(nowS - Number(timestamp)) > CLOCK_SKEW_S) return false;

  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const expected = expectedSignature(bodyStr, timestamp, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(String(provided), 'hex');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function handle(req, res) {
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!secret) {
    // Reject in every environment including dev — a misconfigured webhook
    // endpoint is an open write surface.
    winstonLogger.error('cloudinaryVideo webhook: CLOUDINARY_API_SECRET not configured');
    return res.status(503).json({ success: false, error: { code: 'WEBHOOK_NOT_CONFIGURED' } });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_RAW_BODY' } });
  }

  const valid = verifySignature(req.body, req.headers, secret);
  if (!valid) {
    winstonLogger.error('🚨 cloudinaryVideo webhook: SIGNATURE INVALID', {
      ip: req.ip,
      ua: req.headers['user-agent'],
    });
    return res.status(400).json({ success: false, error: { code: 'INVALID_SIGNATURE' } });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch (err) {
    winstonLogger.error('cloudinaryVideo webhook: malformed JSON after signature verify', { message: err.message });
    return res.status(400).json({ success: false, error: { code: 'MALFORMED_JSON' } });
  }

  try {
    const result = await VideoService.applyProcessingWebhook(payload);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    winstonLogger.error('cloudinaryVideo webhook: handler error', {
      statusCode,
      code: err.code,
      message: err.message,
    });
    return res
      .status(statusCode)
      .json({ success: false, error: { code: err.code || 'WEBHOOK_HANDLER_ERROR', message: err.message } });
  }
}

module.exports = handle;
module.exports.verifySignature = verifySignature;
module.exports.expectedSignature = expectedSignature;
