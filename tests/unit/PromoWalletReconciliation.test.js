/**
 * TASK-6.6 — reconciliation logic with injected clock. We run against the
 * real models (in-memory Mongo) so the aggregation path is exercised.
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

describeFn('PromoWalletReconciliation.run', () => {
  let mongod;
  let PromoWallet;
  let PromoWalletLedger;
  let Alert;
  let job;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), {});
    PromoWallet = require(path.resolve(__dirname, '../../src/models/PromoWallet'));
    PromoWalletLedger = require(path.resolve(
      __dirname,
      '../../src/models/PromoWalletLedger'
    ));
    Alert = require(path.resolve(__dirname, '../../src/models/Alert'));
    job = require(path.resolve(__dirname, '../../src/jobs/PromoWalletReconciliation'));
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  test('clean wallet: no drift, no alert, no correction', async () => {
    await PromoWalletLedger.credit({
      amount_cents: 1000,
      reason: 'seed',
      posted_by: new mongoose.Types.ObjectId(),
      idempotency_key: 'clean-1',
    });
    const clock = () => new Date('2026-10-07T03:00:00Z');
    const summary = await job.run({ clock });
    expect(summary.drifted).toBe(false);
    expect(summary.corrected).toBe(false);
    expect(summary.balance_drift_cents).toBe(0);
    expect(summary.reserved_drift_cents).toBe(0);
    expect(await Alert.countDocuments({})).toBe(0);
  });

  test('drifted cache: writes alert and corrects balance to ledger total', async () => {
    await PromoWalletLedger.credit({
      amount_cents: 500,
      reason: 'seed',
      posted_by: new mongoose.Types.ObjectId(),
      idempotency_key: 'drift-1',
    });
    // Simulate drift by poking the cached balance directly, as a Mongo bug
    // or an aborted writer might.
    await PromoWallet.updateOne(
      { singleton: 'v1' },
      { $set: { balance_cents: 999, reserved_cents: 42 } }
    );
    const summary = await job.run({ clock: () => new Date('2026-10-07T03:00:00Z') });
    expect(summary.drifted).toBe(true);
    expect(summary.corrected).toBe(true);
    const wallet = await PromoWallet.singleton();
    expect(wallet.balance_cents).toBe(500);
    expect(wallet.reserved_cents).toBe(0);
    expect(await Alert.countDocuments({})).toBe(1);
  });

  test('writeAlerts:false still corrects but writes no Alert', async () => {
    await PromoWalletLedger.credit({
      amount_cents: 100,
      reason: 'seed',
      posted_by: new mongoose.Types.ObjectId(),
      idempotency_key: 'na-1',
    });
    await PromoWallet.updateOne(
      { singleton: 'v1' },
      { $set: { balance_cents: 50 } }
    );
    const summary = await job.run({ writeAlerts: false });
    expect(summary.drifted).toBe(true);
    expect(summary.corrected).toBe(true);
    expect(await Alert.countDocuments({})).toBe(0);
  });
});
