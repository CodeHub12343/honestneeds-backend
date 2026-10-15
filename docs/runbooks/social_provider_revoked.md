# Runbook — Social provider tokens revoked en masse

Last reviewed: 2026-10-08 · Next review: 2027-01

Scope: Meta (Facebook + Instagram) and X. ID.me is a one-shot
attestation and is covered elsewhere; a mass revocation there isn't
possible by design.

## Detection

- Grafana panel **Social publish failure rate** by provider > 25 % for
  10 minutes.
- Alert **`SocialConnection.status='needs_reauth'` rate** > 100/day.
- `logs` filter `source:api action:SocialDistribution* code:META_* OR code:X_*`.

A single-user token expiry is routine; a sudden spike (dozens in minutes)
means either the provider has rotated keys, our Meta app was flagged, or
our X API tier was downgraded.

## Immediate response

1. Hit the provider status page.
   - Meta: <https://metastatus.com>
   - X: <https://api.twitterstat.us>
2. Try a sandbox OAuth round-trip for the affected provider on staging. If
   staging fails too, the issue is on the provider side.
3. Pause the aggregator so no new posts queue up and fail:
   ```bash
   node scripts/admin/set-flag.js social_distribute_enabled false
   ```
4. Post the status banner on `/settings/social` only — this is scoped to
   one feature, no site-wide banner.

## Rollback / recovery

- Users whose rows went to `needs_reauth` must re-connect — there is no
  server-side way to recover a revoked token. The `/settings/social` UI
  renders a "Reconnect" button when `status === 'needs_reauth'` (shipped
  in Phase 5).
- If the cause was our app review / API tier:
  1. Resolve with the provider (Meta app review, X tier upgrade).
  2. Flip the aggregator flag back on.
  3. The ExternalLinksBlock stays rendering social icons regardless —
     those are static links, not provider-powered.

## Communication

- No site-wide banner. Users with a revoked connection see the badge in
  settings on their next visit; a one-time email ("We lost our connection
  to your Facebook — reconnect to keep auto-posting") is OPT-IN only. Do
  NOT auto-send to the whole impacted list — a mass "we lost your
  password" style email will land as phishing in corporate filters.

## Known fast fixes

- Meta `OAuthException` with code 190: user manually revoked at
  <https://facebook.com/settings/connections>. Expected behaviour, not an
  incident.
- X 429 with "monthly request budget exceeded": not a revocation — see
  `XService` monthly budget tracking. Reduce distribute cadence or buy a
  higher tier.
