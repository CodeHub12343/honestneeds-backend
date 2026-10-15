# Flag flip plan — TASK-10.5

Launch cadence per feature: **internal → staff → 10% → 50% → 100%**.
Each stage holds for **≥ 24 hours** AND meets its error-rate threshold
before the next flip. No two major flags flip on the same day — a
correlated failure is harder to attribute if two things changed at once.

## Flip order

The order below is deliberate: later features depend on the trust and
observability earned by earlier ones. Any slip pushes everything after
it; nothing jumps the queue.

| # | Feature | Flag(s) | Depends on | Earliest flip (relative to Day 0) |
| --- | --- | --- | --- | --- |
| 1 | Identity verification (Persona) | `persona_identity_v1` | 10.1 (pentest clean), 10.4 (dashboards live) | Day 0 |
| 2 | Social OAuth (connect only, no distribute) | `social_connect_enabled` | #1, Meta/X app review green | Day 2 |
| 3 | Video uploads | `video_uploads_enabled` | #1 (identity ties to creator trust) | Day 4 |
| 4 | Share-to-earn (video promo rewards) | `video_promo_rewards` | #1, #3, promo wallet funded, [promo_wallet_exhausted.md](../runbooks/promo_wallet_exhausted.md) rehearsed | Day 7 |
| 5 | Social distribute (admin only) | `social_distribute_enabled` | #2, #3 | Day 9 |
| 6 | Veterans / Battle Buddies | `veterans_enabled` *(FE route gate; crisis page always on)* | #1 | Day 11 |
| 7 | Marketing sends (live) | `marketing_live_sends` | #2 for OAuth-powered personalisation (optional) | Day 14 |

The marketing wrapper, admin UI and support surfaces are available to
staff from Day 0 — their flags only control user-facing sends.

> **Note on the crisis page.** `/veterans/crisis` ships before any other
> veterans surface. It has no server dependencies and no flag; delaying it
> on process has no upside and real downside.

## Per-stage gates (apply to every flag above)

Advance only if all three hold during the hold window:

1. **Error rate** on the feature's primary endpoint stays < 1% (5xx) and
   < 5% (4xx), measured in Grafana — panels listed per feature below.
2. **p95 latency** stays within the SLO (video feed < 500ms, OAuth round
   trip < 2s, share < 300ms, veteran suggestions < 500ms).
3. **No new P0/P1 bug** has been opened against the feature in the hold
   window.

A single failed gate → **hold the current stage**, do NOT roll back
unless the gate violation is severe (see rollback steps per feature).

## Rollback — per feature

Every rollback is a flag flip, not a code revert. Code reverts are a
last resort; the flag is the primary tool.

### 1 · Persona identity verification
- **Flip:** `persona_identity_v1 = false`.
- **Effect:** new verifications fall back to the manual upload + review
  flow (legacy path). In-flight Persona sessions complete; nothing is
  lost.
- **Runbook:** [persona_down.md](../runbooks/persona_down.md).

### 2 · Social OAuth (connect)
- **Flip:** `social_connect_enabled = false`.
- **Effect:** `/settings/social` shows "temporarily unavailable". Existing
  connections stay valid; no revocation happens on our side.
- **Runbook:** [social_provider_revoked.md](../runbooks/social_provider_revoked.md).

### 3 · Video uploads
- **Flip:** `video_uploads_enabled = false`.
- **Effect:** `/api/videos/sign-upload` returns 503; the frontend hides
  the "Add video" affordance. Existing published videos keep playing.
- **Runbook:** [cloudinary_down.md](../runbooks/cloudinary_down.md) (upload
  path is Cloudinary-dependent).

### 4 · Share-to-earn
- **Flip:** `video_promo_rewards = false`.
- **Effect:** `/api/videos/:id/share` still records the share, but
  `evaluateEligibility` returns `FEATURE_DISABLED` and no reserve is
  made. Nothing user-visible breaks beyond the reward display.
- **Runbook:** [promo_wallet_exhausted.md](../runbooks/promo_wallet_exhausted.md)
  for drain scenarios, [share_fraud_spike.md](../runbooks/share_fraud_spike.md)
  for abuse.

### 5 · Social distribute (admin)
- **Flip:** `social_distribute_enabled = false`.
- **Effect:** `/api/social/distribute` returns 503. In-flight scheduled
  sends on provider side are not recalled (fire-and-forget by design).

### 6 · Veterans / Battle Buddies
- **Flip:** `veterans_enabled = false` *(FE route gate)*.
- **Effect:** `/veterans/*` returns a maintenance page EXCEPT
  `/veterans/crisis` which stays live unconditionally (hard-coded —
  removing the crisis page is never an incident response).

### 7 · Marketing sends
- **Flip:** `marketing_live_sends = false`.
- **Effect:** The admin "SEND LIVE" button in the composer errors
  immediately with `MARKETING_PAUSED`. Dry-run and preview still work;
  the admin surface stays usable.

## Playbook for the flip

Each flip is a logged, reviewed action. The sequence:

1. Dev on-call posts the intent in `#eng-launch` with:
   - Feature + target percentage + hold window.
   - Which panels they'll be watching.
   - Who the second pair of eyes is during the hold.
2. The flag is set via `scripts/admin/set-flag.js <flag> <value>` from a
   production shell. The script writes an AuditLog entry; the "who,
   what, when" is captured there, not just in Slack.
3. On-call stays in the panel view for the first 30 min after each flip
   — error-rate thresholds spike fastest right after a flip.
4. At stage-end: post the gate check (pass/fail) in `#eng-launch`.
5. On fail: flip BACK to the previous percentage; open an incident; file
   the issue; never attempt a bigger rollout the same day.

## Correlated-failure guardrail

> Never flip two major flags on the same day.

A "major" flag is any flag in the table above. Minor flags (copy, UI
toggles, non-public staff tools) are not covered by this rule — flip
freely with the usual code-review gate.

The schedule above is calendared with the earliest-flip dates. If one
flag slips, every date after it slides, not just the owning one. The
calendar invite serialises the schedule — a conflicting invite is a
process bug, not a judgement call.
