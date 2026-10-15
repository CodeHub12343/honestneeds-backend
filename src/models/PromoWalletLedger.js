/**
 * PromoWalletLedger — append-only ledger for the promo wallet. TASK-6.1.
 *
 * Every mutation to the promo bank is a row here. Four entry kinds:
 *
 *   credit               — admin tops the bank up (TASK-6.2)
 *   sponsor_contribution — Phase-2 sponsor funding (TASK-6.7); schema allows
 *                          it now so no migration is needed later.
 *   reward_reserve       — a pending reward holds funds (negative on reserved)
 *   reward_debit         — a verified reward pays out (negative on balance)
 *   reward_release       — a rejected reward frees the reserve (positive)
 *   adjustment           — reconciliation / correction entry
 *
 * `delta_cents` is signed: credits positive, debits negative.
 *
 * The ledger carries idempotency: `(idempotency_key, actor_scope)` is unique
 * where present, so a replayed POST never doubles up. The actor_scope is
 * "admin:<userId>" for admin credits and "reward:<rewardId>" for the reward
 * flow — keeps the global namespace from colliding between actors.
 *
 * Writers:
 *   PromoWalletLedger.credit({ amount_cents, reason, posted_by, idempotency_key, metadata })
 *   PromoWalletLedger.reserve({ amount_cents, ref_id, metadata })
 *   PromoWalletLedger.commit({ amount_cents, ref_id, metadata })  // reserve → paid
 *   PromoWalletLedger.release({ amount_cents, ref_id, metadata }) // reserve → free
 */

const mongoose = require('mongoose');
const PromoWallet = require('./PromoWallet');

const ENTRY_TYPES = [
  'credit',
  'sponsor_contribution',
  'reward_reserve',
  'reward_debit',
  'reward_release',
  'upgrade_grant',
  'upgrade_grant_refund',
  'adjustment',
];

const promoWalletLedgerSchema = new mongoose.Schema(
  {
    entry_type: {
      type: String,
      enum: ENTRY_TYPES,
      required: true,
      index: true,
    },
    // Signed delta applied to balance_cents or reserved_cents, depending on
    // entry_type. See the writer methods below for the sign convention.
    delta_cents: { type: Number, required: true },
    // Independent delta on reserved_cents (so reserve/release/commit can
    // move reserved without touching the balance). May be 0 for pure
    // balance mutations (credit, sponsor_contribution, adjustment, debit).
    reserved_delta_cents: { type: Number, default: 0 },

    reason: { type: String, required: true },

    ref_type: { type: String, default: null }, // 'VideoReward' | 'Admin' | ...
    ref_id: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    posted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    idempotency_key: { type: String, default: null },
    actor_scope: { type: String, default: null },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Running total AFTER applying this delta. Lets the ledger be audited
    // without replaying every prior row; must match sum of prior deltas.
    balance_after_cents: { type: Number, required: true },
    reserved_after_cents: { type: Number, required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

promoWalletLedgerSchema.index({ created_at: -1 });
promoWalletLedgerSchema.index(
  { idempotency_key: 1, actor_scope: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);

// ─── Writer helpers ───────────────────────────────────────────────────────
//
// Each writer performs ONE atomic `findOneAndUpdate` on the singleton
// wallet so the cached balance can never diverge from the ledger within a
// single process. The ledger row is then inserted referencing the new
// balances. If the insert fails, a compensating wallet update undoes the
// cached-balance change — the ledger stays the source of truth either way.

async function applyAtomic({ balanceDelta, reservedDelta }) {
  const wallet = await PromoWallet.findOneAndUpdate(
    { singleton: 'v1' },
    {
      $inc: {
        balance_cents: balanceDelta,
        reserved_cents: reservedDelta,
      },
      $setOnInsert: { singleton: 'v1' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return wallet;
}

async function compensate({ balanceDelta, reservedDelta }) {
  await PromoWallet.updateOne(
    { singleton: 'v1' },
    { $inc: { balance_cents: -balanceDelta, reserved_cents: -reservedDelta } }
  );
}

async function appendEntry({
  entryType,
  balanceDelta,
  reservedDelta = 0,
  reason,
  refType = null,
  refId = null,
  postedBy = null,
  idempotencyKey = null,
  actorScope = null,
  metadata = {},
}) {
  if (idempotencyKey) {
    const existing = await mongoose
      .model('PromoWalletLedger')
      .findOne({ idempotency_key: idempotencyKey, actor_scope: actorScope });
    if (existing) return { entry: existing, replayed: true };
  }

  const wallet = await applyAtomic({ balanceDelta, reservedDelta });

  try {
    const entry = await mongoose.model('PromoWalletLedger').create({
      entry_type: entryType,
      delta_cents: balanceDelta,
      reserved_delta_cents: reservedDelta,
      reason,
      ref_type: refType,
      ref_id: refId,
      posted_by: postedBy,
      idempotency_key: idempotencyKey,
      actor_scope: actorScope,
      metadata,
      balance_after_cents: wallet.balance_cents,
      reserved_after_cents: wallet.reserved_cents,
    });
    return { entry, replayed: false, wallet };
  } catch (err) {
    // Roll the cache back so the ledger (which has nothing) and the cached
    // balance agree. The reconciliation job catches anything we miss.
    await compensate({ balanceDelta, reservedDelta });
    if (err.code === 11000 && idempotencyKey) {
      const existing = await mongoose
        .model('PromoWalletLedger')
        .findOne({ idempotency_key: idempotencyKey, actor_scope: actorScope });
      if (existing) return { entry: existing, replayed: true };
    }
    throw err;
  }
}

promoWalletLedgerSchema.statics.ENTRY_TYPES = ENTRY_TYPES;

promoWalletLedgerSchema.statics.credit = function credit({
  amount_cents,
  reason,
  posted_by,
  idempotency_key,
  entry_type = 'credit',
  metadata = {},
}) {
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
    const err = new Error('amount_cents must be a positive integer');
    err.statusCode = 400;
    err.code = 'INVALID_AMOUNT';
    throw err;
  }
  if (!reason || typeof reason !== 'string') {
    const err = new Error('reason required');
    err.statusCode = 400;
    err.code = 'INVALID_REASON';
    throw err;
  }
  if (!ENTRY_TYPES.includes(entry_type)) {
    const err = new Error(`unknown entry_type ${entry_type}`);
    err.statusCode = 400;
    err.code = 'INVALID_ENTRY_TYPE';
    throw err;
  }
  if (entry_type !== 'credit' && entry_type !== 'sponsor_contribution' && entry_type !== 'adjustment') {
    const err = new Error('credit() only produces credit/sponsor_contribution/adjustment entries');
    err.statusCode = 400;
    err.code = 'INVALID_ENTRY_TYPE';
    throw err;
  }
  return appendEntry({
    entryType: entry_type,
    balanceDelta: amount_cents,
    reservedDelta: 0,
    reason,
    refType: 'Admin',
    refId: null,
    postedBy: posted_by,
    idempotencyKey: idempotency_key,
    actorScope: posted_by ? `admin:${posted_by}` : null,
    metadata,
  });
};

promoWalletLedgerSchema.statics.reserve = function reserve({ amount_cents, ref_id, reason, metadata }) {
  return appendEntry({
    entryType: 'reward_reserve',
    balanceDelta: 0,
    reservedDelta: amount_cents,
    reason: reason || 'reward_reserve',
    refType: 'VideoReward',
    refId: ref_id,
    idempotencyKey: `reserve:${ref_id}`,
    actorScope: `reward:${ref_id}`,
    metadata,
  });
};

promoWalletLedgerSchema.statics.commit = function commit({ amount_cents, ref_id, reason, metadata }) {
  // Verified reward: pay out → balance goes down by amount, reserved returns.
  return appendEntry({
    entryType: 'reward_debit',
    balanceDelta: -amount_cents,
    reservedDelta: -amount_cents,
    reason: reason || 'reward_debit',
    refType: 'VideoReward',
    refId: ref_id,
    idempotencyKey: `debit:${ref_id}`,
    actorScope: `reward:${ref_id}`,
    metadata,
  });
};

// Upgrade pool: debit the balance to fund a free→share campaign upgrade.
// Idempotent by UpgradeRequest id so a replayed admin click can't double-spend.
promoWalletLedgerSchema.statics.upgradeGrant = function upgradeGrant({
  amount_cents,
  ref_id,
  reason,
  posted_by,
  metadata,
}) {
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
    const err = new Error('amount_cents must be a positive integer');
    err.statusCode = 400;
    err.code = 'INVALID_AMOUNT';
    throw err;
  }
  return appendEntry({
    entryType: 'upgrade_grant',
    balanceDelta: -amount_cents,
    reservedDelta: 0,
    reason: reason || 'upgrade_grant',
    refType: 'UpgradeRequest',
    refId: ref_id,
    postedBy: posted_by,
    idempotencyKey: `upgrade_grant:${ref_id}`,
    actorScope: `upgrade:${ref_id}`,
    metadata,
  });
};

// Refund an upgrade grant (e.g. the downstream upgrade write failed and we
// need to put the money back). Same actor_scope so a double-refund is blocked
// by its own idempotency key.
promoWalletLedgerSchema.statics.upgradeGrantRefund = function upgradeGrantRefund({
  amount_cents,
  ref_id,
  reason,
  posted_by,
  metadata,
}) {
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
    const err = new Error('amount_cents must be a positive integer');
    err.statusCode = 400;
    err.code = 'INVALID_AMOUNT';
    throw err;
  }
  return appendEntry({
    entryType: 'upgrade_grant_refund',
    balanceDelta: amount_cents,
    reservedDelta: 0,
    reason: reason || 'upgrade_grant_refund',
    refType: 'UpgradeRequest',
    refId: ref_id,
    postedBy: posted_by,
    idempotencyKey: `upgrade_grant_refund:${ref_id}`,
    actorScope: `upgrade:${ref_id}`,
    metadata,
  });
};

promoWalletLedgerSchema.statics.release = function release({ amount_cents, ref_id, reason, metadata }) {
  // Rejected reward: free the reserved funds without touching balance.
  return appendEntry({
    entryType: 'reward_release',
    balanceDelta: 0,
    reservedDelta: -amount_cents,
    reason: reason || 'reward_release',
    refType: 'VideoReward',
    refId: ref_id,
    idempotencyKey: `release:${ref_id}`,
    actorScope: `reward:${ref_id}`,
    metadata,
  });
};

module.exports = mongoose.model('PromoWalletLedger', promoWalletLedgerSchema);
module.exports.ENTRY_TYPES = ENTRY_TYPES;
