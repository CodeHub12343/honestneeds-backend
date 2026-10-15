/**
 * Concurrency: two sibling share requests with the SAME idempotency key must
 * end up with one VideoReward row, one reservation, no double credit. Uses
 * the in-memory Mongo so the unique index actually fires.
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

jest.mock('../../src/services/FeatureFlagService', () => ({
  isEnabled: jest.fn().mockResolvedValue(true),
}));

describeFn('VideoRewardService — concurrent share race', () => {
  let mongod;
  let PromoWallet;
  let PromoWalletLedger;
  let VideoReward;
  let VideoRewardService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), {});
    PromoWallet = require(path.resolve(__dirname, '../../src/models/PromoWallet'));
    PromoWalletLedger = require(path.resolve(
      __dirname,
      '../../src/models/PromoWalletLedger'
    ));
    VideoReward = require(path.resolve(__dirname, '../../src/models/VideoReward'));
    VideoRewardService = require(path.resolve(
      __dirname,
      '../../src/services/VideoRewardService'
    ));
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await PromoWalletLedger.credit({
      amount_cents: 10_000,
      reason: 'seed',
      posted_by: new mongoose.Types.ObjectId(),
      idempotency_key: 'seed-race',
    });
  });

  test('same idempotency key → one row, one reservation', async () => {
    const user = {
      _id: new mongoose.Types.ObjectId(),
      verification_badges: { identity_verified: true },
      primary_social_platform: 'facebook',
    };
    const video = { _id: new mongoose.Types.ObjectId(), status: 'published' };

    const key = 'same-share-key-123';
    const [a, b] = await Promise.all([
      VideoRewardService.requestReward({
        user,
        video,
        platform: 'facebook',
        idempotencyKey: key,
      }).catch((e) => e),
      VideoRewardService.requestReward({
        user,
        video,
        platform: 'facebook',
        idempotencyKey: key,
      }).catch((e) => e),
    ]);

    // At least one must succeed; replays or the duplicate-key path must
    // not produce two independent rows.
    const successes = [a, b].filter((r) => r && r.reward && r.reward._id);
    expect(successes.length).toBeGreaterThanOrEqual(1);
    if (successes.length === 2) {
      expect(String(successes[0].reward._id)).toBe(String(successes[1].reward._id));
    }

    const count = await VideoReward.countDocuments({ user_id: user._id });
    expect(count).toBe(1);

    const wallet = await PromoWallet.singleton();
    const amount = VideoRewardService.getRewardAmountCents();
    expect(wallet.reserved_cents).toBe(amount);
    expect(wallet.balance_cents).toBe(10_000);
  });
});
