/**
 * Phase 0 — Tests the admin_roles backfill migration logic.
 * Unit-level: mocks User + AuditLog. Does not touch Mongo.
 */

jest.mock('../../src/models/User', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../../src/models/AuditLog', () => ({
  create: jest.fn().mockResolvedValue({ _id: 'audit-1' }),
}));

const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const { backfill } = require('../../scripts/migrations/2026-10-backfill-admin-roles');

function selectReturning(docs) {
  return { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(docs) }) };
}

describe('backfill admin_roles migration', () => {
  afterEach(() => jest.clearAllMocks());

  it('dry run reports candidates without writing', async () => {
    User.find.mockReturnValue(selectReturning([
      { _id: 'a', email: 'a@x', admin_roles: [] },
      { _id: 'b', email: 'b@x' },
    ]));
    const summary = await backfill({ apply: false });
    expect(summary.found).toBe(2);
    expect(summary.updated).toBe(0);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('apply writes [super_admin] and creates audit entries', async () => {
    User.find.mockReturnValue(selectReturning([
      { _id: 'a', email: 'a@x', admin_roles: [] },
    ]));
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'actor-1' }) });
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const summary = await backfill({ apply: true });
    expect(summary.updated).toBe(1);
    expect(User.updateOne).toHaveBeenCalledTimes(1);
    expect(AuditLog.create).toHaveBeenCalledTimes(1);
    const call = AuditLog.create.mock.calls[0][0];
    expect(call.action_type).toBe('admin_role.backfill');
    expect(call.changes.after.admin_roles).toEqual(['super_admin']);
  });

  it('is idempotent — second run finds nothing', async () => {
    User.find.mockReturnValue(selectReturning([]));
    const summary = await backfill({ apply: true });
    expect(summary.found).toBe(0);
    expect(summary.updated).toBe(0);
  });

  it('race-safe update: skips if guard query no longer matches', async () => {
    User.find.mockReturnValue(selectReturning([
      { _id: 'a', email: 'a@x', admin_roles: [] },
    ]));
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'actor-1' }) });
    User.updateOne.mockResolvedValue({ modifiedCount: 0 });

    const summary = await backfill({ apply: true });
    expect(summary.skipped).toBe(1);
    expect(summary.updated).toBe(0);
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('throws when --actor-email names a non-admin', async () => {
    User.find.mockReturnValue(selectReturning([{ _id: 'a', email: 'a@x', admin_roles: [] }]));
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    await expect(backfill({ apply: true, actorEmail: 'ghost@x' })).rejects.toThrow(/not found/);
  });
});
