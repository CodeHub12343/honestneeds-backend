/**
 * UpgradePortalReconciliation — nightly consistency check for pool-funded
 * UpgradeRequests.
 *
 * The sibling PromoWalletReconciliation already catches balance drift: every
 * upgrade_grant / upgrade_grant_refund row is summed into the cached balance,
 * so a missing debit shows up there.
 *
 * This job catches APPLICATION-level drift that the balance check cannot see:
 *
 *   A. A request is marked `pool_funded: true` but no `upgrade_grant` ledger
 *      row exists for it (or a refund cancels it out). The grant service
 *      compensates on failure, so this normally means someone edited the row
 *      by hand or a prior deploy raced the ledger write.
 *
 *   B. An `upgrade_grant` row exists net-positive against a request, but the
 *      request is NOT marked `pool_funded`. Equally bad — the pool was
 *      debited but the request looks unfunded, so staff might grant it again.
 *
 * Either kind writes a `system_error` Alert and is logged. We do NOT
 * auto-correct; a human decides whether to refund, mark funded, or escalate.
 */

const UpgradeRequest = require('../models/UpgradeRequest');
const PromoWalletLedger = require('../models/PromoWalletLedger');
const Alert = require('../models/Alert');
const winstonLogger = require('../utils/winstonLogger');

const MAX_INCIDENTS_PER_RUN = 25;

async function run({ clock = () => new Date(), writeAlerts = true } = {}) {
  const started = clock();

  // Sum net grant per request from the ledger. Positive = debited (funded);
  // zero (or negative) = already refunded.
  const ledgerRollup = await PromoWalletLedger.aggregate([
    { $match: { entry_type: { $in: ['upgrade_grant', 'upgrade_grant_refund'] } } },
    {
      $group: {
        _id: '$ref_id',
        // upgrade_grant has delta_cents < 0; refund > 0. Net < 0 means the
        // pool is net-debited for this request.
        net_delta_cents: { $sum: '$delta_cents' },
        entries: { $sum: 1 },
      },
    },
  ]);

  const ledgerByRequest = new Map(
    ledgerRollup
      .filter((r) => r._id)
      .map((r) => [String(r._id), { net_delta_cents: r.net_delta_cents, entries: r.entries }])
  );

  // Pull every request that EITHER has pool_funded flag OR shows up in the
  // ledger. Anything not in that union is irrelevant to this check.
  const flaggedIds = await UpgradeRequest.find({ pool_funded: true })
    .select({ _id: 1 })
    .lean();
  const flaggedIdSet = new Set(flaggedIds.map((r) => String(r._id)));
  const allIds = new Set([...flaggedIdSet, ...ledgerByRequest.keys()]);

  const incidents = [];

  for (const id of allIds) {
    const flagged = flaggedIdSet.has(id);
    const ledger = ledgerByRequest.get(id);
    const netDebited = ledger && ledger.net_delta_cents < 0;

    // Case A: pool_funded but no net debit on the ledger.
    if (flagged && !netDebited) {
      incidents.push({
        kind: 'funded_without_ledger',
        request_id: id,
        ledger_entries: ledger ? ledger.entries : 0,
        net_delta_cents: ledger ? ledger.net_delta_cents : 0,
      });
      continue;
    }

    // Case B: pool was debited but the request isn't marked funded.
    if (!flagged && netDebited) {
      incidents.push({
        kind: 'ledger_without_funded',
        request_id: id,
        ledger_entries: ledger.entries,
        net_delta_cents: ledger.net_delta_cents,
      });
    }
  }

  const summary = {
    started_at: started.toISOString(),
    requests_flagged: flaggedIdSet.size,
    ledger_refs: ledgerByRequest.size,
    incidents_total: incidents.length,
    incidents: incidents.slice(0, MAX_INCIDENTS_PER_RUN),
    drifted: incidents.length > 0,
  };

  if (incidents.length > 0) {
    winstonLogger.error('UpgradePortalReconciliation: drift detected', {
      count: incidents.length,
      sample: incidents.slice(0, 5),
    });
    if (writeAlerts) {
      await writeAlert(incidents);
    }
  } else {
    winstonLogger.info('UpgradePortalReconciliation: in sync', {
      requests_flagged: flaggedIdSet.size,
      ledger_refs: ledgerByRequest.size,
    });
  }

  return summary;
}

async function writeAlert(incidents) {
  const sample = incidents
    .slice(0, 10)
    .map((i) => `${i.kind}:${i.request_id} (${i.net_delta_cents}¢)`)
    .join('; ');
  try {
    await Alert.create({
      alert_type: 'system_error',
      severity: 'high',
      title: 'Upgrade portal pool-grant drift detected',
      description:
        `${incidents.length} UpgradeRequest/ledger mismatch(es). ` +
        `First ${Math.min(10, incidents.length)}: ${sample}. ` +
        `No auto-correction applied — review and reconcile manually.`,
      related_entity: 'System',
      source: 'system',
    });
  } catch (err) {
    winstonLogger.error('UpgradePortalReconciliation: Alert.create failed', {
      message: err.message,
    });
  }
}

module.exports = { run };
