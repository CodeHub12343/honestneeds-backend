/**
 * PromoWallet — single singleton row for the platform-wide promo bank.
 * TASK-6.1.
 *
 * There is only ever ONE promo wallet row. Call `PromoWallet.singleton()`
 * to read-or-create it. The `balance_cents` field here is a **cached
 * derivative** of the ledger — the ledger is the source of truth. The
 * nightly reconciliation job (TASK-6.6) recomputes it and alerts on drift.
 *
 * Why keep a cached balance at all?
 *   - Reads are hot (every eligibility check wants the current balance).
 *   - Summing the ledger on every read scales poorly as entries grow.
 *   - The ledger controller is the only writer and does an atomic
 *     `findOneAndUpdate({$inc: {balance_cents: delta}})` in the same code
 *     path that inserts the ledger row — see PromoWalletLedger.credit().
 *
 * There is NO direct balance-write endpoint. The only mutations happen
 * through PromoWalletLedger.credit() / .reserve() / .commit() / .release(),
 * which keep ledger and balance in sync.
 */

const mongoose = require('mongoose');

const promoWalletSchema = new mongoose.Schema(
  {
    singleton: {
      type: String,
      enum: ['v1'],
      default: 'v1',
      unique: true,
    },
    // Cached running total of ledger entries. Reconciled nightly.
    balance_cents: { type: Number, default: 0 },
    // Cents that are reserved against pending rewards. Available-to-spend is
    // (balance_cents - reserved_cents). Reserve on pending verification;
    // debit on verify (balance−, reserved−); release on reject (reserved−).
    reserved_cents: { type: Number, default: 0 },
  },
  { timestamps: true }
);

promoWalletSchema.statics.singleton = async function singleton(session = null) {
  const q = this.findOneAndUpdate(
    { singleton: 'v1' },
    { $setOnInsert: { singleton: 'v1', balance_cents: 0, reserved_cents: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (session) q.session(session);
  return q;
};

promoWalletSchema.virtual('available_cents').get(function get() {
  return (this.balance_cents || 0) - (this.reserved_cents || 0);
});

promoWalletSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('PromoWallet', promoWalletSchema);
