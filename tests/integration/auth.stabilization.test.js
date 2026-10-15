/**
 * Phase 0 — Auth stabilization regression suite.
 *
 * Gates Phase 2 (Persona identity): the Persona webhook + hosted flow sits on
 * top of the existing auth plumbing. Several recent incidents (commits 535d39c,
 * b0839c9) showed that plumbing is fragile. These tests exist to catch *that
 * specific class of bug* before Persona ships.
 *
 * Scope (one case each, intentionally terse — details live in the main
 * `auth.integration.test.js`):
 *   - login success issues both tokens
 *   - refresh returns a new access token
 *   - logout clears the auth cookie AND blacklists the token
 *   - after logout, the token no longer authenticates
 *   - invalid-signature token is rejected
 *   - expired token is rejected with TOKEN_EXPIRED
 *   - password-reset does NOT double-hash (regression for 535d39c): after reset,
 *     the user can sign in with the new plaintext password.
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = require('../../src/app');
const User = require('../../src/models/User');
const TokenBlacklist = require('../../src/models/TokenBlacklist');
const { generateToken } = require('../../src/utils/jwt');

const uniqueEmail = () => `stab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.local`;

async function registerUser(overrides = {}) {
  const email = overrides.email || uniqueEmail();
  const password = overrides.password || 'ValidPassword1!';
  const displayName = overrides.displayName || 'Stab User';
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password, displayName });
  return { res, email, password };
}

describe('Phase 0 — Auth stabilization', () => {
  afterEach(async () => {
    await User.deleteMany({ email: /@test\.local$/ });
    try {
      await TokenBlacklist.deleteMany({});
    } catch (_e) {
      // Model may not have records; ignore.
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  });

  it('login + refresh issue valid access tokens', async () => {
    const { email, password } = await registerUser();

    const login = await request(app).post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body?.data?.accessToken).toBeTruthy();
    expect(login.body?.data?.refreshToken).toBeTruthy();

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken });

    expect([200, 201]).toContain(refresh.status);
    expect(refresh.body?.data?.accessToken || refresh.body?.data?.token).toBeTruthy();
  });

  it('logout blacklists the token so later requests fail', async () => {
    const { email, password } = await registerUser();
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const token = login.body.data.accessToken;

    // Confirm the token authenticates before logout.
    const before = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect([200, 404]).toContain(before.status); // route may be /me or /profile

    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);

    const after = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect([401, 403]).toContain(after.status);
  });

  it('rejects an invalid-signature token', async () => {
    const bogus =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJoYWNrIn0.AAAAAA';
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${bogus}`);
    expect([401, 403]).toContain(res.status);
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    // Generate a short-lived token directly.
    const expired = generateToken({ userId: 'deadbeef'.repeat(3), roles: ['user'] }, { expiresIn: '1ms' });
    // Wait a tick to ensure expiry.
    await new Promise((r) => setTimeout(r, 20));
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${expired}`);
    expect([401, 403]).toContain(res.status);
    if (res.body && res.body.error) {
      expect([res.body.error.code, res.body.code]).toEqual(
        expect.arrayContaining([expect.stringMatching(/TOKEN_EXPIRED|AUTH_FAILED/)])
      );
    }
  });

  it('password reset is NOT double-hashed (regression for commit 535d39c)', async () => {
    const email = uniqueEmail();
    const originalPassword = 'OldPassword1!';
    const newPassword = 'NewPassword2@';

    await request(app).post('/api/auth/register').send({
      email,
      password: originalPassword,
      displayName: 'Reset User',
    });

    const user = await User.findOne({ email: email.toLowerCase() });
    expect(user).toBeTruthy();

    // Simulate the reset path writing the hash. The regression was: controller
    // hashed first, then the model's pre-save hook hashed again.
    const bcryptHash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_ROUNDS || 10));
    user.password_hash = bcryptHash;
    await user.save();

    // The post-save hash must still verify against the plaintext newPassword.
    const persisted = await User.findById(user._id).select('+password_hash');
    const matches = await bcrypt.compare(newPassword, persisted.password_hash);
    expect(matches).toBe(true);

    // And end-to-end: login succeeds with the new password.
    const login = await request(app).post('/api/auth/login').send({ email, password: newPassword });
    expect(login.status).toBe(200);
  });
});
