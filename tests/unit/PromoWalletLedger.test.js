/**
 * PromoWalletLedger — concurrent credits sum correctly and the balance-after
 * on each ledger row matches sum(delta) up to that row (TASK-6.1).
 *
 * We run against a real `mongoose` using an in-memory server when available;
 * when `mongodb-memory-server` isn't installed we skip the suite — the
 * production-ready part is the invariant the test asserts.
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

describeFn('PromoWalletLedger integrity', () => {
  let mongod;
  let PromoWallet;
  let PromoWalletLedger;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), {});
    PromoWallet = require(path.resolve(__dirname, '../../src/models/PromoWallet'));
    PromoWalletLedger = require(path.resolve(__dirname, '../../src/models/PromoWalletLedger'));
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  test('concurrent credits sum correctly', async () => {
    const N = 25;
    const amount = 100;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        PromoWalletLedger.credit({
          amount_cents: amount,
          reason: 'test',
          posted_by: new mongoose.Types.ObjectId(),
          idempotency_key: `k-${i}-${Math.random()}`,
          entry_type: 'credit',
        })
      )
    );
    expect(results.every((r) => !r.replayed)).toBe(true);

    const wallet = await PromoWallet.singleton();
    expect(wallet.balance_cents).toBe(N * amount);

    const total = await PromoWalletLedger.aggregate([
      { $group: { _id: null, sum: { $sum: '$delta_cents' } } },
    ]);
    expect(total[0].sum).toBe(N * amount);
  });

  test('idempotency replay returns the first row', async () => {
    const key = 'same-key-xyz';
    const posted_by = new mongoose.Types.ObjectId();
    const first = await PromoWalletLedger.credit({
      amount_cents: 500,
      reason: 'test',
      posted_by,
      idempotency_key: key,
    });
    const second = await PromoWalletLedger.credit({
      amount_cents: 500,
      reason: 'test',
      posted_by,
      idempotency_key: key,
    });
    expect(second.replayed).toBe(true);
    expect(String(second.entry._id)).toBe(String(first.entry._id));

    const wallet = await PromoWallet.singleton();
    expect(wallet.balance_cents).toBe(500); // not 1000
  });

  test('reserve → commit moves balance correctly', async () => {
    await PromoWalletLedger.credit({
      amount_cents: 1000,
      reason: 'seed',
      posted_by: new mongoose.Types.ObjectId(),
      idempotency_key: 'seed-1',
    });
    const ref = new mongoose.Types.ObjectId();
    await PromoWalletLedger.reserve({ amount_cents: 300, ref_id: ref });
    let wallet = await PromoWallet.singleton();
    expect(wallet.balance_cents).toBe(1000);
    expect(wallet.reserved_cents).toBe(300);

    await PromoWalletLedger.commit({ amount_cents: 300, ref_id: ref });
    wallet = await PromoWallet.singleton();
    expect(wallet.balance_cents).toBe(700);
    expect(wallet.reserved_cents).toBe(0);
  });

  test('reserve → release frees reserved without touching balance', async () => {
    await PromoWalletLedger.credit({
      amount_cents: 1000,
      reason: 'seed',
      posted_by: new mongoose.Types.ObjectId(),
      idempotency_key: 'seed-2',
    });
    const ref = new mongoose.Types.ObjectId();
    await PromoWalletLedger.reserve({ amount_cents: 400, ref_id: ref });
    await PromoWalletLedger.release({ amount_cents: 400, ref_id: ref });
    const wallet = await PromoWallet.singleton();
    expect(wallet.balance_cents).toBe(1000);
    expect(wallet.reserved_cents).toBe(0);
  });

  test('sponsor_contribution entry type is accepted', async () => {
    const { entry } = await PromoWalletLedger.credit({
      amount_cents: 10_000,
      reason: 'sponsor',
      posted_by: new mongoose.Types.ObjectId(),
      idempotency_key: 'sp-1',
      entry_type: 'sponsor_contribution',
    });
    expect(entry.entry_type).toBe('sponsor_contribution');
    const wallet = await PromoWallet.singleton();
    expect(wallet.balance_cents).toBe(10_000);
  });

  test('invalid entry_type rejected (enum validation)', async () => {
    expect(() =>
      PromoWalletLedger.credit({
        amount_cents: 1,
        reason: 'r',
        posted_by: new mongoose.Types.ObjectId(),
        idempotency_key: 'xx-1',
        entry_type: 'not-a-type',
      })
    ).toThrow(/INVALID_ENTRY_TYPE|unknown entry_type/);
  });

  test('ledger row balance_after matches running total', async () => {
    const u = new mongoose.Types.ObjectId();
    const amounts = [100, 50, 200, 75];
    for (let i = 0; i < amounts.length; i++) {
      await PromoWalletLedger.credit({
        amount_cents: amounts[i],
        reason: 't',
        posted_by: u,
        idempotency_key: `seq-${i}`,
      });
    }
    const rows = await PromoWalletLedger.find({}).sort({ created_at: 1 }).lean();
    let running = 0;
    for (let i = 0; i < rows.length; i++) {
      running += rows[i].delta_cents;
      expect(rows[i].balance_after_cents).toBe(running);
    }
  });
});
