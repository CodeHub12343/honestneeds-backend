/**
 * Phase 0 — Tests for the role-key RBAC middleware (requireAdminRoles).
 *
 * These are tight unit tests on the middleware directly (not through the HTTP
 * stack) so they are robust to route churn.
 */

const requireAdminRoles = require('../../src/middleware/requireAdminRoles');
const User = require('../../src/models/User');

jest.mock('../../src/models/User', () => ({
  findById: jest.fn(),
}));

const buildReqRes = (adminUser = null) => {
  const req = {
    user: { userId: 'u1' },
    path: '/test',
    method: 'POST',
    headers: {},
  };
  if (adminUser) req.adminUser = adminUser;
  const res = {};
  return { req, res };
};

describe('requireAdminRoles', () => {
  afterEach(() => jest.clearAllMocks());

  it('throws on construction for empty required list', () => {
    expect(() => requireAdminRoles([])).toThrow();
  });

  it('throws on construction for unknown role', () => {
    expect(() => requireAdminRoles(['wizard'])).toThrow(/unknown role/);
  });

  it('allows super_admin regardless of required roles', async () => {
    const mw = requireAdminRoles(['finance']);
    const { req, res } = buildReqRes({ _id: 'u1', role: 'admin', admin_roles: ['super_admin'], blocked: false });
    const next = jest.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows legacy admin (role=admin, admin_roles=[]) as super_admin', async () => {
    const mw = requireAdminRoles(['finance']);
    const { req, res } = buildReqRes({ _id: 'u1', role: 'admin', admin_roles: [], blocked: false });
    const next = jest.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('denies a moderator from a finance-only route', async () => {
    const mw = requireAdminRoles(['finance']);
    const { req, res } = buildReqRes({ _id: 'u1', role: 'admin', admin_roles: ['moderator'], blocked: false });
    const next = jest.fn();
    await mw(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('INSUFFICIENT_ADMIN_ROLE');
  });

  it('allows a role present in the required list', async () => {
    const mw = requireAdminRoles(['finance', 'moderator']);
    const { req, res } = buildReqRes({ _id: 'u1', role: 'admin', admin_roles: ['moderator'], blocked: false });
    const next = jest.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a non-admin user', async () => {
    const mw = requireAdminRoles(['finance']);
    const { req, res } = buildReqRes({ _id: 'u1', role: 'user', admin_roles: [], blocked: false });
    const next = jest.fn();
    await mw(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('ADMIN_REQUIRED');
  });

  it('rejects a blocked admin', async () => {
    const mw = requireAdminRoles(['finance']);
    const { req, res } = buildReqRes({ _id: 'u1', role: 'admin', admin_roles: ['finance'], blocked: true });
    const next = jest.fn();
    await mw(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('loads adminUser via User.findById when not pre-populated', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', role: 'admin', admin_roles: ['finance'], blocked: false }),
    });
    const mw = requireAdminRoles(['finance']);
    const req = { user: { userId: 'u1' }, path: '/x', method: 'GET', headers: {} };
    const next = jest.fn();
    await mw(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(User.findById).toHaveBeenCalledWith('u1');
  });
});
