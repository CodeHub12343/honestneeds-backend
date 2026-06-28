/**
 * Field-level encryption (CF-7 / U-2)
 * --------------------------------------------------------------------------
 * Encrypts individual sensitive string fields at rest using AES-256-GCM, the
 * same scheme paymentService uses, but packed into a SINGLE self-contained
 * string so it fits existing `String` schema fields with no migration:
 *
 *     enc:v1:<ivHex>:<authTagHex>:<cipherHex>
 *
 * Backward compatible: `decryptField` / `maybeDecrypt` return any non-prefixed
 * value unchanged, so legacy plaintext rows keep working until they are next
 * written (at which point they are encrypted).
 *
 * Key: process.env.ENCRYPTION_KEY (validated ≥32 chars at startup).
 */

const crypto = require('crypto');
const winstonLogger = require('./winstonLogger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const ENC = 'hex';
const PREFIX = 'enc:v1:';

function getKey() {
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length < KEY_LENGTH) {
    throw new Error('ENCRYPTION_KEY environment variable not set or too short');
  }
  return Buffer.from(k.substring(0, KEY_LENGTH));
}

/**
 * Is this value an already-encrypted field string?
 * @param {*} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypt a single field value. Empty/nullish values and already-encrypted
 * values are returned unchanged (idempotent).
 * @param {string|null|undefined} plain
 * @returns {string|null|undefined}
 */
function encryptField(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  if (isEncrypted(plain)) return plain;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let ct = cipher.update(String(plain), 'utf8', ENC);
  ct += cipher.final(ENC);
  const tag = cipher.getAuthTag().toString(ENC);
  return `${PREFIX}${iv.toString(ENC)}:${tag}:${ct}`;
}

/**
 * Decrypt a field value. Non-encrypted values pass through unchanged.
 * Throws if an encrypted value is malformed or tampered with.
 * @param {string|null|undefined} value
 * @returns {string|null|undefined}
 */
function decryptField(value) {
  if (!isEncrypted(value)) return value;

  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted field');
  }
  const [ivHex, tagHex, ct] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, ENC));
  decipher.setAuthTag(Buffer.from(tagHex, ENC));
  let pt = decipher.update(ct, ENC, 'utf8');
  pt += decipher.final('utf8');
  return pt;
}

/**
 * Best-effort decrypt for read paths: never throws. Returns null if an
 * encrypted value can't be decrypted (logged), plaintext passes through.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function maybeDecrypt(value) {
  try {
    return decryptField(value);
  } catch (error) {
    winstonLogger.warn('⚠️ fieldEncryption: decrypt failed', { error: error.message });
    return null;
  }
}

module.exports = { encryptField, decryptField, maybeDecrypt, isEncrypted };
