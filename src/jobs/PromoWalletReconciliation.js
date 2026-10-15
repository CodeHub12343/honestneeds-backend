/**
 * PromoWalletReconciliation — nightly job (TASK-6.6).
 *
 * Recomputes `balance_cents` and `reserved_cents` by summing the ledger from
 * the beginning of time, and compares to the cached values on PromoWallet.
 * Any drift beyond a tolerance window triggers an Alert (loudly) and emits
 * a metric; the cached balance is corrected to the ledger total.
 *
 * Tolerance: 0 cents, but we read the wallet and then run the aggregation
 * — if an entry lands between those two reads, the pre-aggregation balance
 * will be off by that entry's delta. Instead of alerting on a transient
 * difference, we re-read the wallet after the aggregation and only alert
 * when the drift PERSISTS. That window is at most a few milliseconds in
 * practice.
 */

const PromoWallet = require('../models/PromoWallet');
const PromoWalletLedger = require('../models/PromoWalletLedger');
const Alert = require('../models/Alert');
const winstonLogger = require('../utils/winstonLogger');

async function sumLedger() {
  const [row] = await PromoWalletLedger.aggregate([
    {
      $group: {
        _id: null,
        balance: { $sum: '$delta_cents' },
        reserved: { $sum: '$reserved_delta_cents' },
        count: { $sum: 1 },
      },
    },
  ]);
  return {
    balance: row?.balance || 0,
    reserved: row?.reserved || 0,
    count: row?.count || 0,
  };
}

async function alertOnDrift({ wallet, totals }) {
  try {
    await Alert.create({
      alert_type: 'system_error',
      severity: 'critical',
      title: 'Promo wallet drift detected',
      description:
        `Cached balance ${wallet.balance_cents}¢ vs ledger ${totals.balance}¢ ` +
        `(drift ${wallet.balance_cents - totals.balance}¢). Reserved cached ` +
        `${wallet.reserved_cents}¢ vs ledger ${totals.reserved}¢ ` +
        `(drift ${wallet.reserved_cents - totals.reserved}¢).`,
      related_entity: 'System',
      source: 'system',
    });
  } catch (err) {
    // Alert write failing is itself critical — surface it loud.
    winstonLogger.error('PromoWalletReconciliation: Alert.create failed', {
      message: err.message,
    });
  }
}

async function run({ clock = () => new Date(), writeAlerts = true } = {}) {
  const started = clock();
  const walletBefore = await PromoWallet.singleton();
  const totals = await sumLedger();
  const walletAfter = await PromoWallet.singleton();

  const persistentBalanceDrift =
    walletBefore.balance_cents - totals.balance !== 0 &&
    walletAfter.balance_cents - totals.balance !== 0;
  const persistentReservedDrift =
    walletBefore.reserved_cents - totals.reserved !== 0 &&
    walletAfter.reserved_cents - totals.reserved !== 0;

  const drifted = persistentBalanceDrift || persistentReservedDrift;

  const summary = {
    started_at: started.toISOString(),
    cached_balance_cents: walletAfter.balance_cents,
    ledger_balance_cents: totals.balance,
    balance_drift_cents: walletAfter.balance_cents - totals.balance,
    cached_reserved_cents: walletAfter.reserved_cents,
    ledger_reserved_cents: totals.reserved,
    reserved_drift_cents: walletAfter.reserved_cents - totals.reserved,
    ledger_entries: totals.count,
    drifted,
    corrected: false,
  };

  if (drifted) {
    winstonLogger.error('PromoWalletReconciliation: drift detected', summary);
    if (writeAlerts) {
      await alertOnDrift({ wallet: walletAfter, totals });
    }
    await PromoWallet.updateOne(
      { singleton: 'v1' },
      { $set: { balance_cents: totals.balance, reserved_cents: totals.reserved } }
    );
    summary.corrected = true;
  } else {
    winstonLogger.info('PromoWalletReconciliation: in sync', {
      balance_cents: totals.balance,
      reserved_cents: totals.reserved,
    });
  }

  return summary;
}

module.exports = { run, sumLedger };
