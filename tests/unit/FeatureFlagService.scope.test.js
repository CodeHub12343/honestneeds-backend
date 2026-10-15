/**
 * Phase 0 — Tests the scope-aware extensions on FeatureFlagService:
 *   isEnabledFor({userId, role, env}) with scoped-value payloads.
 *
 * These tests do NOT touch the DB — we mock getAll().
 */

const FeatureFlagService = require('../../src/services/FeatureFlagService');

describe('FeatureFlagService.isEnabledFor', () => {
  afterEach(() => {
    if (FeatureFlagService.getAll.mockRestore) FeatureFlagService.getAll.mockRestore();
  });

  function stub(flags) {
    jest.spyOn(FeatureFlagService, 'getAll').mockResolvedValue(flags);
  }

  it('returns boolean value for plain-boolean flags (context ignored)', async () => {
    stub({ foo: true });
    await expect(FeatureFlagService.isEnabledFor('foo', {})).resolves.toBe(true);
    stub({ foo: false });
    await expect(FeatureFlagService.isEnabledFor('foo', {})).resolves.toBe(false);
  });

  it('mode flags are enabled unless value is "off"', async () => {
    stub({ gate: 'off' });
    await expect(FeatureFlagService.isEnabledFor('gate', {})).resolves.toBe(false);
    stub({ gate: 'warn' });
    await expect(FeatureFlagService.isEnabledFor('gate', {})).resolves.toBe(true);
    stub({ gate: 'enforce' });
    await expect(FeatureFlagService.isEnabledFor('gate', {})).resolves.toBe(true);
  });

  it('scoped payload with enabled:false is always off', async () => {
    stub({ f: { enabled: false, percentage: 100 } });
    await expect(FeatureFlagService.isEnabledFor('f', { userId: 'anyone' })).resolves.toBe(false);
  });

  it('env axis excludes non-matching envs', async () => {
    stub({ f: { enabled: true, envs: ['production'] } });
    await expect(FeatureFlagService.isEnabledFor('f', { env: 'development' })).resolves.toBe(false);
    await expect(FeatureFlagService.isEnabledFor('f', { env: 'production' })).resolves.toBe(true);
  });

  it('role axis excludes users without the role', async () => {
    stub({ f: { enabled: true, roles: ['admin'] } });
    await expect(FeatureFlagService.isEnabledFor('f', { role: 'user', env: 'production' })).resolves.toBe(false);
    await expect(FeatureFlagService.isEnabledFor('f', { role: 'admin', env: 'production' })).resolves.toBe(true);
  });

  it('user allowlist hit forces on; miss without percentage forces off', async () => {
    stub({ f: { enabled: true, user_ids: ['507f1f77bcf86cd799439011'] } });
    await expect(
      FeatureFlagService.isEnabledFor('f', { userId: '507f1f77bcf86cd799439011', env: 'production' })
    ).resolves.toBe(true);
    await expect(
      FeatureFlagService.isEnabledFor('f', { userId: '507f1f77bcf86cd799439099', env: 'production' })
    ).resolves.toBe(false);
  });

  it('percentage is stable per userId', async () => {
    stub({ f: { enabled: true, percentage: 50 } });
    const uid = 'user-xyz';
    const first = await FeatureFlagService.isEnabledFor('f', { userId: uid });
    const second = await FeatureFlagService.isEnabledFor('f', { userId: uid });
    expect(first).toBe(second);
  });

  it('percentage distribution is approximately correct over many users', async () => {
    stub({ f: { enabled: true, percentage: 25 } });
    let on = 0;
    const n = 2000;
    for (let i = 0; i < n; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await FeatureFlagService.isEnabledFor('f', { userId: `u${i}` });
      if (result) on += 1;
    }
    const ratio = on / n;
    expect(ratio).toBeGreaterThan(0.20);
    expect(ratio).toBeLessThan(0.30);
  });

  it('percentage 100 is on for everyone; 0 is off for everyone', async () => {
    stub({ f: { enabled: true, percentage: 100 } });
    await expect(FeatureFlagService.isEnabledFor('f', { userId: 'anyone' })).resolves.toBe(true);
    stub({ f: { enabled: true, percentage: 0 } });
    await expect(FeatureFlagService.isEnabledFor('f', { userId: 'anyone' })).resolves.toBe(false);
  });

  it('unknown flag resolves to false', async () => {
    stub({});
    await expect(FeatureFlagService.isEnabledFor('nope', { userId: 'u' })).resolves.toBe(false);
  });
});
