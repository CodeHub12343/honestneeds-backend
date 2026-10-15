/**
 * Shared user fixtures for Phase 0+ integration tests.
 * Keep lean — the ad-hoc fixture at `tests/fixtures.js` is still used by older
 * suites; this file is for new tests that need deterministic email generation
 * (so afterEach cleanup matches a predictable pattern).
 */

const bcrypt = require('bcryptjs');
const User = require('../../src/models/User');

const TEST_EMAIL_DOMAIN = '@phase0.test.local';

function uniqueEmail(prefix = 'u') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${TEST_EMAIL_DOMAIN}`;
}

async function createUser({ role = 'user', admin_roles = undefined, password = 'ValidPassword1!', email, displayName = 'Test User' } = {}) {
  const resolvedEmail = email || uniqueEmail(role);
  const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 10));
  const doc = {
    email: resolvedEmail,
    password_hash: hash,
    display_name: displayName,
    role,
  };
  if (admin_roles !== undefined) doc.admin_roles = admin_roles;
  const user = await User.create(doc);
  return { user, email: resolvedEmail, password };
}

async function createAdmin({ admin_roles = ['super_admin'], password, email } = {}) {
  return createUser({ role: 'admin', admin_roles, password, email, displayName: `Admin ${admin_roles.join('/')}` });
}

async function cleanupTestUsers() {
  await User.deleteMany({ email: new RegExp(`${TEST_EMAIL_DOMAIN.replace('.', '\\.')}$`) });
}

module.exports = {
  TEST_EMAIL_DOMAIN,
  uniqueEmail,
  createUser,
  createAdmin,
  cleanupTestUsers,
};
