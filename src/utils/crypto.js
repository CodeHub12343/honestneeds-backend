/**
 * crypto.js — AES-256-GCM envelope encryption for stored OAuth tokens.
 * TASK-5.1.
 *
 * Format: `v1:<keyId>:<ivB64>:<tagB64>:<ctB64>`
 *   - Per-row 12-byte IV (GCM standard; never reuse with the same key)
 *   - keyId lets us rotate: SOCIAL_TOKEN_ENCRYPTION_KEY carries the active
 *     base64 key; SOCIAL_TOKEN_ENCRYPTION_KEYS (JSON {id: base64Key}) carries
 *     retired keys so old ciphertexts still decrypt during rotation. See
 *     docs/SOCIAL_TOKEN_KEY_ROTATION.md.
 *   - 32-byte key (AES-256). Keys shorter than 32 bytes fail at startup.
 *
 * Nothing here logs cleartext or ciphertext; callers must do the same.
 */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const VERSION = 'v1';

let keyCache = null;

function loadKeys() {
  if (keyCache) return keyCache;

  const activeB64 = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!activeB64) {
    throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY not set (base64 32-byte key)');
  }
  const activeKey = Buffer.from(activeB64, 'base64');
  if (activeKey.length !== KEY_LENGTH) {
    throw new Error(`SOCIAL_TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes`);
  }
  const activeId = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY_ID || '1';

  const keys = { [activeId]: activeKey };

  const retiredRaw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEYS;
  if (retiredRaw) {
    let parsed;
    try {
      parsed = JSON.parse(retiredRaw);
    } catch (e) {
      throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEYS must be JSON {keyId: base64Key}');
    }
    for (const [id, b64] of Object.entries(parsed)) {
      const k = Buffer.from(b64, 'base64');
      if (k.length !== KEY_LENGTH) {
        throw new Error(`Retired key ${id} is not ${KEY_LENGTH} bytes`);
      }
      if (!keys[id]) keys[id] = k;
    }
  }

  keyCache = { activeId, keys };
  return keyCache;
}

function _resetKeyCacheForTests() {
  keyCache = null;
}

function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const { activeId, keys } = loadKeys();
  const key = keys[activeId];
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    activeId,
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

function decrypt(ciphertext) {
  if (ciphertext === null || ciphertext === undefined || ciphertext === '') return null;
  if (typeof ciphertext !== 'string') {
    throw new Error('decrypt: expected string');
  }
  const parts = ciphertext.split(':');
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new Error('decrypt: malformed ciphertext');
  }
  const [, keyId, ivB64, tagB64, ctB64] = parts;
  const { keys } = loadKeys();
  const key = keys[keyId];
  if (!key) {
    throw new Error(`decrypt: unknown key id ${keyId}`);
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

/**
 * PKCE helpers (RFC 7636). code_verifier = 43–128 unreserved chars;
 * code_challenge = base64url(sha256(verifier)).
 */
function generatePkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}

function generateState(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = {
  encrypt,
  decrypt,
  sha256,
  generatePkcePair,
  generateState,
  _resetKeyCacheForTests,
};
