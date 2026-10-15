# Runbook — Share-fraud spike

Last reviewed: 2026-10-08 · Next review: 2027-01

A share-fraud spike is a sudden rise in share-reward issuance that
`ShareFraudDetectionService` can't rule out as organic. Three bad things
happen together: the promo wallet drains, legitimate creators look like
spammers to the ranking signal, and reviewers get buried.

## Detection

- Grafana panel **Share-reward denial rate** by rule (duplicate_evidence,
  referer_mismatch, cross-user cluster) > 2× 7-day rolling baseline.
- Alert **Share-reward issuance** > 500/hour (platform-wide).
- `logs` filter `source:api action:share:reward:*` with `severity:warn`.

## Immediate response

1. Pull the share-fraud dashboard (`/admin/fraud/sharers`) — it ranks the
   top 20 sharers of the last 24h by reward count. One or two users
   should stand out if the spike is coordinated.
2. If a cluster is clear:
   - Flag the users:
     ```bash
     node scripts/admin/flag-user.js <userId> --reason=share_fraud
     ```
     (Flagging sets `User.fraud_flagged = true`; the eligibility rule
     catches it on next request.)
   - Pending rewards for the flagged users: reject in bulk:
     ```bash
     node scripts/admin/reject-pending-rewards.js --user=<userId>
     ```
     Each reject releases its reserved funds back to the wallet.
3. If no clear cluster — the attack is distributed:
   - Flip the kill switch:
     ```bash
     node scripts/admin/set-flag.js video_promo_rewards false
     ```
   - The share endpoint still records shares with
     `reward_status: 'skipped'`; nothing user-facing breaks.
4. Post in `#trust-safety` with: start time, affected user count, promo
   wallet before/after.

## Rollback / recovery

- Once the attacker is isolated, flip the flag back on.
- Audit the preceding 24 h of ledger entries for `reward_debit` rows
  linked to the flagged users and open a reversal task; the ledger is
  append-only, so a correction entry is the right instrument, NOT a direct
  balance edit.
- If the attack vector was a specific platform (e.g. a Facebook pattern we
  can't verify), add it to the deny list in
  `ShareVerificationService.assessIntegrity`.

## Communication

- No public communication for a short-lived spike; it's noise, not news.
- A sustained incident (>24 h with the flag off) warrants a status note:
  "Share-reward verification is temporarily paused for review. Shares are
  still recorded and credit will backfill after review."

## Known fast fixes that are NOT fraud

- One veteran crossed the per-user daily cap → see `USER_DAILY_CAP` in
  logs. Not an incident.
- A single video going viral is NOT the same as fraud. Confirm the shares
  resolve to distinct users on distinct platforms before flipping the kill
  switch — don't punish success.
