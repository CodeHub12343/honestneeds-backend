jest.mock('../../src/models/AuditLog', () => ({
  create: jest.fn(),
  updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
}));

const AuditLog = require('../../src/models/AuditLog');
const AuditLogger = require('../../src/services/AuditLogger');

describe('AuditLogger', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records a success entry with resolved actor + context', async () => {
    AuditLog.create.mockResolvedValue({ _id: 'a1' });
    const req = { headers: { 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, ip: '9.9.9.9' };
    const doc = await AuditLogger.record({
      actor: { _id: 'admin-1' },
      action: 'thing.changed',
      entityType: 'Thing',
      entityId: 'thing-1',
      before: { x: 1 },
      after: { x: 2 },
      req,
    });
    expect(doc).toEqual({ _id: 'a1' });
    const payload = AuditLog.create.mock.calls[0][0];
    expect(payload.admin_id).toBe('admin-1');
    expect(payload.action_type).toBe('thing.changed');
    expect(payload.changes).toEqual({ before: { x: 1 }, after: { x: 2 } });
    expect(payload.ip_address).toBe('1.2.3.4');
    expect(payload.user_agent).toBe('jest');
    expect(payload.status).toBe('success');
  });

  it('falls back to req.user when actor is omitted', async () => {
    AuditLog.create.mockResolvedValue({ _id: 'a2' });
    await AuditLogger.record({
      action: 'x',
      req: { user: { userId: 'from-req' }, headers: {} },
    });
    expect(AuditLog.create.mock.calls[0][0].admin_id).toBe('from-req');
  });

  it('returns null if no actor can be resolved', async () => {
    const doc = await AuditLogger.record({ action: 'x' });
    expect(doc).toBeNull();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('returns null and does not throw when AuditLog.create fails', async () => {
    AuditLog.create.mockRejectedValue(new Error('db down'));
    const doc = await AuditLogger.record({ actor: { _id: 'a' }, action: 'x' });
    expect(doc).toBeNull();
  });

  it('recordFailure writes status failed with error details', async () => {
    AuditLog.create.mockResolvedValue({ _id: 'a3' });
    await AuditLogger.recordFailure({
      actor: { _id: 'admin-1' },
      action: 'thing.change_denied',
      errorMessage: 'nope',
      errorCode: 'DENIED',
    });
    const payload = AuditLog.create.mock.calls[0][0];
    expect(payload.status).toBe('failed');
    expect(payload.error_message).toBe('nope');
    expect(payload.error_code).toBe('DENIED');
  });

  it('rejects when action key is missing', async () => {
    const doc = await AuditLogger.record({ actor: { _id: 'a' } });
    expect(doc).toBeNull();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });
});
