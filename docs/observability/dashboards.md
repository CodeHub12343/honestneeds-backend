# Dashboards + alerts — TASK-10.4

Dashboards live in Grafana (board: `HonestNeed / Phase 10 — launch`). The
metric sources are the Prometheus exporter at `/metrics` and the Mongo
stats scraper. Links in each runbook deep-link to the specific panel so
the on-call never has to hunt.

> **Alert destination.** Every alert here PagerDuty-pages the on-call
> rotation. Thresholds are tuned against a 7-day baseline — review quarterly
> alongside the runbooks.

## Panels

| Panel | Metric | Source | Linked runbook | Alert threshold |
| --- | --- | --- | --- | --- |
| **Promo wallet available** | `honestneed_promo_wallet_available_cents` | `/metrics` (gauge, emitted by [PromoWalletReconciliation](../../src/jobs/PromoWalletReconciliation.js)) | [promo_wallet_exhausted.md](../runbooks/promo_wallet_exhausted.md) | <$50 for 1h daytime, <$200 overnight |
| **Promo wallet drift** | `honestneed_promo_wallet_drift_cents` | reconciliation job | [promo_wallet_exhausted.md](../runbooks/promo_wallet_exhausted.md) | abs(drift) > 0 (critical) |
| **Video upload success rate** | `honestneed_video_upload_total{result}` ratio of result=ok / all | API | [cloudinary_down.md](../runbooks/cloudinary_down.md) | <90% for 5min |
| **Cloudinary 5xx share** | `honestneed_cloudinary_response_total{status}` ratio | API | [cloudinary_down.md](../runbooks/cloudinary_down.md) | >5% for 5min |
| **Persona webhook latency** | `honestneed_persona_webhook_duration_seconds` p95 | webhook handler timing | [persona_down.md](../runbooks/persona_down.md) | p95 > 5s for 5min |
| **Persona 5xx rate** | `honestneed_persona_response_total{status}` ratio | API | [persona_down.md](../runbooks/persona_down.md) | >10% for 5min |
| **Battle-buddy match rate** | `honestneed_bb_match_accepted_total` / `honestneed_bb_match_invited_total` | API | n/a (health) | drop >50% day-over-day warn |
| **Share-reward denial rate** | `honestneed_share_reward_total{result}` ratio | API | [share_fraud_spike.md](../runbooks/share_fraud_spike.md) | >2× 7d baseline |
| **Social publish failure rate** | `honestneed_social_publish_total{provider,result}` by provider | API | [social_provider_revoked.md](../runbooks/social_provider_revoked.md) | >25% for 10min, per provider |
| **Needs-reauth rate** | `honestneed_social_connection_status_total{status}` delta | API | [social_provider_revoked.md](../runbooks/social_provider_revoked.md) | >100/day |

## Metric naming convention

- Prefix: `honestneed_`
- Shape: `{domain}_{noun}_{unit?}` — e.g. `honestneed_video_upload_total`.
- Counters end in `_total`; gauges carry no suffix; histograms end in
  `_seconds` or `_bytes`.
- Labels stay low-cardinality: `provider`, `result`, `status` only. No
  user ids, no campaign ids — those explode cardinality and bill us for
  nothing.

## Instrumentation hooks

- Promo wallet gauges: emitted by the reconciliation job's `summary`
  (TASK-6.6). The scraper reads them from `/metrics`.
- Video upload counter: incremented in
  [VideoController.create](../../src/controllers/VideoController.js) and
  the Cloudinary webhook (`src/webhooks/cloudinaryVideo.js`).
- Persona latency histogram: incremented in `src/webhooks/persona.js`
  around the signature-verify + handler call.
- Social publish counter: incremented in
  [SocialDistributionService](../../src/services/SocialDistributionService.js)
  on each per-platform result.
- Share-reward counter: incremented in
  [VideoRewardService](../../src/services/VideoRewardService.js) at the
  three terminal transitions.

Where a hook is missing, open a follow-up PR before closing the launch
checklist — the dashboards are useless without the counters.

## Importing

The board JSON lives alongside this doc at `dashboards.grafana.json`.
Import via the Grafana UI (**Dashboards → Import → Upload JSON file**) or
with the Grafana API:

```bash
curl -X POST -H "Authorization: Bearer $GRAFANA_API_KEY" \
     -H "Content-Type: application/json" \
     -d @docs/observability/dashboards.grafana.json \
     "$GRAFANA_URL/api/dashboards/db"
```

## Quarterly review

The dashboards and this doc are reviewed on the first Monday of each
quarter alongside the runbooks (same calendar event). Reviewers:

- SRE on-call: thresholds, false positives, missing counters.
- Trust & safety lead: share-fraud baseline.
- Finance lead: promo wallet threshold vs. forecast burn.
