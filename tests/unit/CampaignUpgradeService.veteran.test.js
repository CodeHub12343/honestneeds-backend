/**
 * TASK-7.11 — one-free-upgrade entitlement is one-shot.
 */

const path = require('path');
const mongoose = require('mongoose');

let describeFn = describe;
let MongoMemoryServer;
try {
  MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;
} catch {
  describeFn = describe.skip;
}

describeFn('CampaignUpgradeService.claimVeteranFreeUpgrade', () => {
  let mongod;
  let User;
  let CampaignUpgradeService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), {});
    User = require(path.resolve(__dirname, '../../src/models/User'));
    CampaignUpgradeService = require(path.resolve(
      __dirname,
      '../../src/services/CampaignUpgradeService'
    ));
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  test('verified-by-idme veteran can claim once', async () => {
    const u = await User.create({
      email: 'v@x.com',
      password_hash: 'password123',
      display_name: 'Vet One',
      veteran_profile: { is_veteran: true, verified_via: 'idme' },
    });
    const first = await CampaignUpgradeService.claimVeteranFreeUpgrade({ userId: u._id });
    expect(first.granted).toBe(true);

    const second = await CampaignUpgradeService.claimVeteranFreeUpgrade({ userId: u._id });
    expect(second.granted).toBe(false);
    expect(second.reason).toBe('ALREADY_USED');
  });

  test('self-attest only (not idme/admin) is refused', async () => {
    const u = await User.create({
      email: 's@x.com',
      password_hash: 'password123',
      display_name: 'Vet Self',
      veteran_profile: { is_veteran: true, verified_via: 'self' },
    });
    const r = await CampaignUpgradeService.claimVeteranFreeUpgrade({ userId: u._id });
    expect(r.granted).toBe(false);
    expect(r.reason).toBe('VERIFICATION_INSUFFICIENT');
  });

  test('concurrent claims: only one wins', async () => {
    const u = await User.create({
      email: 'r@x.com',
      password_hash: 'password123',
      display_name: 'Vet Race',
      veteran_profile: { is_veteran: true, verified_via: 'admin' },
    });
    const results = await Promise.all([
      CampaignUpgradeService.claimVeteranFreeUpgrade({ userId: u._id }),
      CampaignUpgradeService.claimVeteranFreeUpgrade({ userId: u._id }),
      CampaignUpgradeService.claimVeteranFreeUpgrade({ userId: u._id }),
    ]);
    const granted = results.filter((r) => r.granted);
    expect(granted).toHaveLength(1);
  });
});
