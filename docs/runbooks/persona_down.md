# Runbook — Persona identity verification is down

Last reviewed: 2026-10-08 · Next review: 2027-01

## Detection

- Grafana panel **Persona webhook latency** p95 > 5 s for 5 minutes.
- Grafana alert **Persona 5xx rate** > 10 % for 5 minutes.
- `logs` filter `source:api action:persona.*` showing a persistent block of
  5xx error codes from `api.withpersona.com`.
- User report: a verification session that stays on "processing" for >10 min.

## Immediate response (within 15 min)

1. Confirm the outage is Persona and not us.
   - Hit `curl -sS -o /dev/null -w '%{http_code}\n' https://api.withpersona.com/healthz`
   - Check <https://status.persona.io>.
2. Flip the feature flag **off** so new verifications fall back to the
   legacy upload path:
   ```bash
   # from an admin shell
   node scripts/admin/set-flag.js persona_identity_v1 false
   ```
   (The flag's `off` state is defined in [FeatureFlagService](../../src/services/FeatureFlagService.js);
   when off, `VerificationService.submit()` routes to the manual-review flow.)
3. Post in `#eng-incident` with: start time, scope (verifications only — NO
   impact to login, donations, campaigns), expected ETA from Persona status.

## Rollback / recovery

- Do NOT replay queued webhooks until Persona status is green AND we have
  seen a successful end-to-end sandbox verification. The webhook signature
  TTL is 15 minutes — anything older than that must be re-submitted by the
  user; replay WILL fail the signature check and look like a worse issue.
- When Persona is green:
  1. Flip the flag back on.
  2. Monitor the dashboard for 30 minutes before closing the incident.
  3. Reach out to any users whose verification was in-flight at outage
     time; their session reference is in `IdentityVerification.automated_checks.provider_reference`.

## Communication

- Status page: "Identity verification is temporarily disabled. New
  verifications are queued and will process automatically once service
  restores. Nothing else on HonestNeed is affected."
- In-product banner on `/verify/identity` only, controlled by the flag —
  flipping the flag toggles the banner.

## Known fast fixes that are NOT a Persona outage

- `IDENTITY_VERIFICATION_FAILED` with 4xx: our template id probably moved.
  Check `PERSONA_TEMPLATE_ID` env.
- Webhook 401: the shared secret rotated. Check `PERSONA_WEBHOOK_SECRET`.
