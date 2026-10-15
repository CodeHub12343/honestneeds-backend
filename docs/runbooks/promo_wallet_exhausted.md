# Runbook — Promo wallet exhausted

Last reviewed: 2026-10-08 · Next review: 2027-01

The promo wallet funds video-share rewards (Phase 6). "Exhausted" means
either the raw balance is near zero or the reserved amount approaches the
balance, so new `requestReward` calls will fail eligibility with
`INSUFFICIENT_PROMO_FUNDS` and no reward will be issued.

## Detection

- Grafana panel **Promo wallet available** < $50 for 1 hour (daytime
  US-ET) or < $200 for 1 hour overnight.
- Alert **share-reward denial reason `INSUFFICIENT_PROMO_FUNDS`** > 20
  per hour.
- Nightly reconciliation job surfaces drift (see
  [PromoWalletReconciliation](../../src/jobs/PromoWalletReconciliation.js));
  a drift alert is a separate incident, not this one.

## Immediate response

1. Confirm the balance is actually low (not a drift) by reading the ledger
   directly:
   ```bash
   node scripts/admin/promo-wallet-balance.js
   ```
   The output shows cached balance + ledger sum. They should match; if
   not, this is the drift runbook, not this one.
2. If balance is correctly low:
   - **Expected depletion** (we knew the campaign was running out): credit
     from the admin UI → `/admin/promo-wallet` → "Credit wallet" with an
     idempotency key and the ledger reason "scheduled_topup".
   - **Unexpected depletion** (we did not expect this spike): flip the
     kill switch so new share rewards degrade gracefully:
     ```bash
     node scripts/admin/set-flag.js video_promo_rewards false
     ```
     The `/videos/:id/share` endpoint will still record the share with
     `reward_status: 'skipped'`; nothing user-facing breaks.
3. Pull the last-24h ledger to see what drained it:
   ```bash
   node scripts/admin/promo-wallet-ledger.js --last 24h
   ```
   Share the result in `#eng-incident`.

## Rollback / recovery

- Reserved funds are released automatically when a pending reward is
  rejected. If a lot of reserves are stuck in `pending_verification`:
  ```bash
  node scripts/admin/sweep-stale-rewards.js --older-than=7d --reason=stale_pending
  ```
  which calls `VideoRewardService.rejectReward` for each. Reserves return
  to available balance in one atomic update per reward.

## Communication

- No user-facing banner. The feature degrades to "share recorded, reward
  skipped" — users keep sharing, the reward row simply doesn't earn.
- Internal: `#eng-incident` + a note to the finance role in Slack.

## Known fast fixes

- Share-fraud spike that drained the wallet → see `share_fraud_spike.md`.
  Don't credit until you know who drained it.
