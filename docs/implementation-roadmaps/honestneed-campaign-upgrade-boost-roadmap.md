# HonestNeed — Campaign Upgrade to Share Campaign + Community Boost
## Implementation Roadmap

**Status:** Planning artifact — no application code changed by this document.
**Date:** 2026-08-27
**Repos inspected:**
- Backend: `c:\Users\HP\Pictures\HONESTNEED-WEB-APPLICATION` (Node/Express + Mongoose)
- Frontend: `c:\Users\HP\Desktop\aniother-1` (Next.js 16 App Router)

---

## 1. Executive Summary

The client asked for five things. Inspection shows the codebase already contains
**two-thirds of the primitives** and **one hard naming collision** that must be
resolved before any code is written.

| # | Requirement | Repo reality |
|---|---|---|
| 1 | Admin can upgrade a user's Free Campaign | **Does not exist.** Admin campaign actions are limited to `moderate / pause / resume` (`src/routes/admin/index.js:74-78`). |
| 2 | Creator can upgrade own campaign to Share Campaign | **Does not exist**, and is actively *blocked*: `campaign_type` is in the locked-field set once a campaign is live (`src/services/CampaignService.js:22-25`). |
| 3 | Users can upgrade other users' campaigns | **Does not exist.** No sponsorship-of-config concept. The `Sponsorship` model is money-to-campaign, not a config change. |
| 4 | Encourage users to boost each other's campaigns | **Partially exists but is the WRONG kind of boost.** `CampaignBoost` is a *paid self-boost* — a creator buys Stripe visibility for their own campaign. There is no community/peer boost. |
| 5 | No Share Campaign without a withdrawal-capable payment method | **Does not exist at creation time.** `CampaignService.createCampaign` sets `share_config` and flips `is_paid_sharing_active: true` with **zero** payment-method check (`src/services/CampaignService.js:470-516`). The equivalent check exists only at *payout request* time (`src/controllers/ShareController.js:2040-2095`). This is the highest-severity gap in the whole request. |

### The single most important finding

**A "Share Campaign" today can be created by a user who can never be paid, and
who can never pay their sharers.** The trust-based Share-to-Earn model
(`SHARE_TO_EARN_TRUST_BASED_FLOW_2026-06-22.md`) removed escrow — the creator now
settles sharers *directly*. Yet nothing at creation time verifies the creator has
a payout rail. Requirement #5 is not a nice-to-have gate; it is a correctness fix
for an existing production hole.

### Recommended headline architecture

1. Introduce a **`CampaignUpgrade`** collection — one record per upgrade attempt,
   carrying `initiator_type` (`creator | sponsor | admin`), an idempotency key,
   and a state machine. This single table serves creator, sponsor, and admin
   upgrades; do **not** build three parallel flows.
2. Introduce **`CampaignSupportBoost`** as a *separate, new* concept from the
   existing paid `CampaignBoost`. Name collisions here will cause production
   incidents — see §12.2.
3. Centralise withdrawal-readiness in one new **`PayoutReadinessService`**, and
   call it from creation, upgrade, and the existing payout path so the three can
   never drift.

### Recommended boost model (one line)

**Free, verified-share-backed Community Boost** — a peer signal derived from a
*real* share event, rate-limited to one ranking-effective boost per user per
campaign per 24h, feeding a decaying `community_boost_score` that ranks *below*
paid boosts. Full analysis in §12.3.

---

## 2. Current Architecture Assessment

### 2.1 Backend

- **Framework:** Express, entry `index.js` → `src/app.js`.
- **Layering:** `routes/ → controllers/ → services/ → models/`. Controllers are
  fat in places (`campaignController.js` is 2,756 lines); services hold the
  business rules (`CampaignService.js`, 2,401 lines).
- **Style:** CommonJS, `snake_case` for Mongo fields, `PascalCase` service
  classes with `static` methods, `winstonLogger` structured logs with emoji
  prefixes, thrown error objects shaped `{ code, message, statusCode }`.
- **Models:** 68 Mongoose models in `src/models/`.
- **No pervasive MongoDB transactions.** Only `src/services/TransactionService.js`
  uses `startSession`. Everything else relies on single-document atomicity.
  **This constrains the concurrency design — see §26.**

### 2.2 Frontend

- Next.js 16 App Router at `c:\Users\HP\Desktop\aniother-1`.
- Route groups: `(app)`, `(auth)`, `(campaigns)`, `(creator)`, `(supporter)`,
  `admin`, `business`.
- **Convention (mandatory):** every authenticated call goes through `apiClient`
  in `lib/api.ts` for token refresh + retry. Raw `axios`/`fetch` for authed
  endpoints is a defect.
- Styling: `styled-components` with a theme object (`theme.colors`,
  `theme.spacing`, `theme.radii`, `theme.typography`), plus `framer-motion` for
  entrance animations. See `components/sections/Pricing.js` for the canonical
  card/plan pattern.

### 2.3 Documentation reliability warning

The repo root holds ~200 `*_COMPLETE.md` files. Several **overstate** what is
built. **This roadmap is grounded in read code, not in those documents.** Treat
`CAMPAIGN_BOOST_IMPLEMENTATION_COMPLETE.md` as describing the *paid self-boost*
only.

---

## 3. Existing Campaign Architecture

### 3.1 `src/models/Campaign.js` (875 lines) — fields that matter here

| Field | Line | Notes |
|---|---|---|
| `status` | 218 | `draft \| active \| paused \| completed \| cancelled \| rejected`. **There is no `suspended` or `deleted` status** — suspension is expressed via `moderation.review_status` + `status: 'paused'`. |
| `campaign_type` | 226 | `fundraising \| sharing`. **This is the Free ↔ Share discriminator.** |
| `moderation.review_status` | 239 | `pending \| approved \| rejected \| flagged \| escalated`. Independent of `status`. |
| `share_config` | ~475-556 | Trust-based reward pool: `total_budget`, `committed_budget_remaining`, `committed_total`, `amount_per_share`, `is_paid_sharing_active`, `creator_payout_consent_at`, `share_channels`. |
| `is_boosted` / `current_boost_tier` / `boost_weight` | 721-738 | Paid-boost ranking flags. `boost_weight` is `0` or the tier multiplier (`10` for pro). |
| `view_count` / `share_count` / `engagement_score` | 293-309 | Denormalised metrics; `engagement_score` is indexed. |
| `activists[]` | 332-355 | `{ user_id, user_name, action_type: share\|volunteer\|organizer\|advocate, impact_score, date_joined }`. **Closest existing thing to a peer-support record.** |
| `metrics.unique_supporters` | ~415 | `[String]` — unbounded array, already a growth risk. |
| `miracle_mode` | ~645 | RG-19 emergency surfacing. Precedent for a non-paid visibility modifier. |

### 3.2 Campaign type lifecycle

`CampaignService.createCampaign` (`src/services/CampaignService.js:400-540`):
- Line 421: `campaign_type: normalizedData.campaign_type || 'fundraising'`.
- Line 470: **only** if `campaign_type === 'sharing' && budget && reward_per_share`
  does it build `share_config`.
- Lines 484-490: requires `normalizedData.payout_consent`, else throws
  `PAYOUT_CONSENT_REQUIRED`.
- Line 494: `canActivate = rewardPerShareCents > 0 && budgetCents >= rewardPerShareCents`.
- Line 501: `is_paid_sharing_active: canActivate` — **live immediately**.

**Gap:** `payout_consent` is a checkbox. It proves intent, not capability. No
`PaymentMethod` lookup occurs anywhere in this path.

### 3.3 The locked-field problem

`src/services/CampaignService.js:20-25`:
```js
// CE-1 / U-3: fields a creator may edit while a campaign is LIVE (active/paused).
// Title, goals, location, need_type, campaign_type are locked once live ...
const LIVE_EDITABLE_FIELDS = ['description', 'image_url', 'tags', 'category',
                              'geographic_scope', 'payment_methods'];
```
`campaign_type` is deliberately immutable on live campaigns so donors can trust
the campaign they backed. **The upgrade feature must not weaken this rule.**

**Recommendation:** do *not* add `campaign_type` to `LIVE_EDITABLE_FIELDS`. The
upgrade is a **separate, audited, single-direction, service-owned transition**
that bypasses the generic edit path entirely. Generic edits stay locked. This
preserves the original donor-trust intent while enabling the feature.

### 3.4 Listing / ranking

`CampaignService.listCampaigns` (`src/services/CampaignService.js:1035-1055`):
```js
case 'trending':
default:
  sortStage = { is_boosted: -1, boost_weight: -1, created_at: -1 };
```
Only the default `trending` sort honours boosts; explicit sorts (`newest`,
`raised`, `goalAsc`, `goalDesc`) ignore them. **Community boost must slot into
this same sort stage** or it will have no visible effect.

---

## 4. Existing Payment and Withdrawal Architecture

### 4.1 `src/models/PaymentMethod.js`

| Field | Values |
|---|---|
| `type` | `stripe \| bank_transfer \| mobile_money` |
| `provider` | `stripe \| plaid \| twilio \| manual` |
| `status` | `active \| pending_verification \| inactive \| failed` (default `pending_verification`) |
| `verification_status` | `unverified \| verifying \| verified \| failed \| rejected` (default `unverified`) |
| `verification_method` | `instant \| micro_deposits \| manual_review \| null` |
| `is_primary` | Boolean, indexed |
| `deleted_at` | Soft delete, sparse index |

Instance methods:
- `isExpired()` — cards only; compares `card_expiry_{month,year}`.
- `isActive()` — `!deleted_at && status === 'active' && !isExpired()`.

**Critical nuance:** `status` and `verification_status` are two *independent*
fields and the codebase does **not** keep them in sync. A method can be
`status: 'active'` while `verification_status: 'unverified'`.

Sensitive fields `bank_account_number` / `bank_routing_number` are stored
**encrypted at rest** (AES-256-GCM, `enc:v1:` envelope, `utils/fieldEncryption`)
and decrypted only on the owning creator's payout views.

### 4.2 The de-facto withdrawal-readiness rule (observed)

`src/controllers/ShareController.js:2040-2095` is the **only** place that decides
"can this user be paid?":

```js
const SUPPORTED_TYPES = ['bank_transfer', 'mobile_money', 'stripe'];
const usableFilter = {
  user_id: userId,
  deleted_at: null,
  status: { $in: ['active', 'pending_verification'] },
};
```
Selection order when no explicit id is given: `is_primary` desc, then
`created_at` desc, with an optional type hint.

Error codes already in use — **reuse these exact codes**:
`INVALID_PAYMENT_METHOD_ID`, `PAYMENT_METHOD_NOT_FOUND`, `NO_PAYOUT_METHOD`,
`UNSUPPORTED_PAYOUT_METHOD`.

**Observation:** this rule accepts `pending_verification`. It is *deliberately
lenient* because the trust-based model means HonestNeed never actually moves the
money — the creator pays the sharer directly, so the "payment method" is really
"contact details for the payer to send funds to." **Any upgrade gate must use the
same leniency or the two paths will contradict each other** (a user could pass the
upgrade gate and fail payout, or vice-versa). See §11-Q18.

### 4.3 Other payment surfaces

- `src/models/Withdrawal.js`, `src/models/ShareWithdrawal.js`, `src/models/Payout.js`,
  `src/models/SettlementLedger.js`.
- `src/services/PayoutService.js:57` — **automated transfers are retired**;
  non-manual payout methods are rejected and logged. Confirms the trust model.
- `src/controllers/PaymentMethodController.js`, `src/routes/paymentMethodRoutes.js`.
- `src/middleware/rateLimiter.js:211` — `paymentMethodLimiter` already exists.

---

## 5. Existing Authentication and Authorization Architecture

- `src/middleware/authMiddleware.js` — verifies JWT (RS256), attaches
  `req.user = { userId, roles }`.
- `src/middleware/adminAuth.js`:
  - `requireAdmin` — DB lookup, rejects non-`admin`, `blocked`, or soft-deleted
    accounts; attaches `req.adminUser` and `req.adminPermissions`.
  - `requirePermission(perm)` — granular gate, must run after `requireAdmin`.
- `src/config/adminRoles.js` — `PERMISSIONS` map (line 23) and role bundles.
  Campaign-relevant: `CAMPAIGN_MODERATION_VIEW` (`campaign_moderation:view`),
  `CAMPAIGN_MODERATION_ACT` (`campaign_moderation:act`).
- `src/middleware/rbac.js` — non-admin role helpers.

**Known defect:** dual inconsistent admin services and single-role RBAC exist in
this codebase. Do **not** attempt to fix these here; build on `adminAuth.js` +
`adminRoles.js`, which is the newer, correct path.

---

## 6. Existing Admin Architecture

- Routes: single file `src/routes/admin/index.js`.
- Controllers: `src/controllers/admin/` (10 files).
- Services: `src/services/admin/` (9 files).
- Campaign surface today:
  ```
  GET  /moderation/campaigns                      CAMPAIGN_MODERATION_VIEW
  GET  /moderation/campaigns/:campaignId          CAMPAIGN_MODERATION_VIEW
  POST /moderation/campaigns/:campaignId/decision CAMPAIGN_MODERATION_ACT
  POST /moderation/campaigns/:campaignId/pause    CAMPAIGN_MODERATION_ACT
  POST /moderation/campaigns/:campaignId/resume   CAMPAIGN_MODERATION_ACT
  ```
- Audit: `AuditService.record({ adminId, action, entityType, entityId, description, changes, metadata, req, status })` → `src/models/AuditLog.js`. Failures are swallowed and logged, never thrown.
- Frontend admin: `app/admin/moderation`, with shared pieces in
  `app/admin/_components/` and `app/admin/_lib/`.

---

## 7. Existing Notification Architecture

- **Registry:** `src/notifications/notificationTypes.js` — single source of truth.
  Entry shape:
  ```js
  comment_received: {
    category: 'campaigns',
    icon_emoji: '💬',
    color: 'info',                 // primary|success|warning|danger|info
    defaultChannels: IN_APP_PUSH,  // ALL | IN_APP_ONLY | IN_APP_PUSH
    prefPath: null,                // dot-path into NotificationPreferences, null = always on
    title:   () => 'New comment',
    message: (d) => `${actor(d)} commented on ${campaignName(d)}.`,
    actionUrl: campaignUrl,
  },
  ```
- **Dispatcher:** `NotificationDispatcher.notify({ userId, type, data, overrides, email })`
  and `.notifyMany(userIds, opts)`. Resolves prefs → channels → quiet hours →
  in-app row → realtime push → email.
- **Model:** `src/models/Notification.js` — `type` is a **hard enum** (line 20).
  **Every new notification type requires BOTH an enum entry AND a registry entry.**
  Missing either = silently dropped notification.

Existing types nearest to this feature: `campaign_activated`, `campaign_paused`,
`share_extra_approved`, `payout_requested`, `comment_received`.

---

## 8. Existing Analytics / Gamification / Reward Architecture

- **Gamification:** `src/services/GamificationService.js`
  - `awardXp(userId, amount, reason)` (line 36)
  - `awardForAction(userId, action, opts)` (line 100) — known actions include
    `share_campaign`, `pray`, `refer_user`, `create_campaign`, `donate_per_dollar`,
    `volunteer_per_hour`, `campaign_completed`, `complete_profile`, `verify_identity`.
  - `rollGoldenTicket`, `recomputeHopeScore`, `updateViralMultiplier`, `recordDailyActivity`
  - Constants in `src/config/gamification.js` (`XP_ACTIONS`). Event log:
    `src/models/GamificationEvent.js`.
- **Sharing:** `src/models/Share.js` (well-indexed, includes
  `{ ip_address, campaign_id, created_at }` for rate-limit checks),
  `ShareTracking`, `ShareGrant` (daily 1-share-per-campaign quota),
  `ShareFraudDetectionService`, `ShareVerificationService`.
- **Referrals:** `ReferralLink`, `ReferralTracking`, `ReferralTrackingService`,
  `ReferralUrlService`, `src/middleware/referralMiddleware.js`.
- **Analytics:** `CampaignAnalyticsService`, `CampaignMetricsService`,
  `ConversionTrackingService`, `AdvancedAnalyticsService`,
  `TimeSeriesAnalyticsService`, `ActivityLog` model.
- **Existing paid boost:** `CampaignBoost` model, `BoostController`,
  `StripeBoostService`, `boostRoutes`, `src/jobs/ExpireBoosts.js`,
  `StripeWebhookHandler.js:160-175`.

### 8.1 The existing paid boost, precisely

- Tiers `free` (weight 1, $0) and `pro` (weight 10, $20/30 days).
- `CampaignBoost.creator_id` is **the campaign's own creator** — this is a
  self-purchase, not a peer action. Confirmed by `BoostController.js:108`
  ("free tier does NOT set `Campaign.is_boosted`… only paid boosts affect
  ranking") and by `getCreatorActiveBoosts`.
- `reconcileCampaignFlags(campaignId)` recomputes `is_boosted`/`boost_weight`
  from surviving paid boosts; `RANKING_TIERS = ['pro']`.
- `recordBoostEvent(campaignId, 'view'|'engagement'|'conversion', { revenueCents })`
  increments live-boost stats and recomputes ROI.
- `updateStats()` still contains a **hardcoded `revenue = conversions * 50`**
  ("Assuming $50 avg donation"), superseded by `recordBoostEvent`'s real-revenue
  path but not removed. Pre-existing defect — **out of scope, do not silently
  fix; log it as tech debt.**

---

## 9. Feature Requirements

### F1 — Creator upgrade (Free → Share)
Preserve `_id`, `campaign_id`, `creator_id`, donations, `contributors`, media,
description, category, location, and all history. Change only `campaign_type`
and `share_config`. Idempotent. Rejected for already-`sharing` campaigns and for
ineligible statuses.

### F2 — Withdrawal-eligible payment method gate
Applies to **both** create-as-Share and upgrade-to-Share. Server-side authority.
Frontend shows state but is never trusted.

### F3 — User-to-user (sponsored) upgrade
An authorised non-owner initiates; owner must approve; owner retains ownership.

### F4 — Admin upgrade
`CAMPAIGN_MODERATION_ACT`-gated, confirmed, audited, owner notified.

### F5 — Community boost
Peer visibility signal, abuse-resistant, tracked, feeds ranking + analytics + XP.

---

## 10. Business Rules and Decisions

Rules **established by the codebase** (not negotiable — they already ship):

| ID | Rule | Evidence |
|---|---|---|
| BR-1 | A "Share Campaign" is `campaign_type === 'sharing'` with a populated `share_config`. | `Campaign.js:226`, `CampaignService.js:470-516` |
| BR-2 | Paid sharing activates when `amount_per_share > 0 && total_budget >= amount_per_share`. | `CampaignService.js:494` |
| BR-3 | Creator must accept the pay-sharers-directly agreement (`creator_payout_consent_at`). | `CampaignService.js:484-490` |
| BR-4 | HonestNeed does not escrow or transfer sharer rewards; creators settle directly. | `SHARE_TO_EARN_TRUST_BASED_FLOW_2026-06-22.md`, `PayoutService.js:57` |
| BR-5 | A usable payout method is: not deleted, `status ∈ {active, pending_verification}`, `type ∈ {bank_transfer, mobile_money, stripe}`. | `ShareController.js:2040-2050` |
| BR-6 | `campaign_type` is immutable through the generic edit path on live campaigns. | `CampaignService.js:20-25` |
| BR-7 | Only paid (`pro`) boosts set `is_boosted`/`boost_weight`. | `BoostController.js:108`, `CampaignBoost.js` `RANKING_TIERS` |
| BR-8 | Boost ranking only affects the default `trending` sort. | `CampaignService.js:1050-1052` |
| BR-9 | One tip-eligible share per user per campaign per day; over-quota shares are free. | `ShareGrant`, `ShareGrantService` |
| BR-10 | Upgrading does **not** change donation fees. HonestNeed takes 0% of donations. | `components/sections/Pricing.js` ("100% of donations to recipient") |

Rules **proposed** by this roadmap need approval — see §11 and §35.

---

## 11. Unresolved Questions Requiring Product Approval

> Format per question: **Evidence → Recommendation → Reasoning → Impact → Approval needed?**

**Q1. What is a "Free Campaign"?**
*Evidence:* The term appears **once in the entire codebase**, in marketing copy:
`components/sections/Pricing.js:220` — `name: 'Free Campaign', price: 0`, sitting
beside `'Standard Campaign', price: 20` which sells "Featured placement &
visibility boost". So in marketing, Free/Standard is a **boost-purchase tier**.
But `CampaignBoost.tier` is also `free|pro`, and `campaign_type` is
`fundraising|sharing`. **Three overlapping "free" axes.**
*Recommendation:* Define **Free Campaign := `campaign_type === 'fundraising'`**
(a campaign with no paid-sharing reward pool), and rename nothing.
*Reasoning:* It is the only reading under which "upgrade to Share Campaign" is a
meaningful state transition; the other readings make requirement #1 a Stripe
purchase, which the client did not describe.
*Impact:* Determines the eligibility predicate for every one of F1/F3/F4.
*Approval:* **YES — blocking. Nothing else can be finalised until this is settled.**

**Q2. Does upgrading change pricing?**
*Evidence:* Upgrade path does not exist; creation charges nothing (BR-4).
*Recommendation:* No charge for a creator self-upgrade.
*Reasoning:* Creation of a Share Campaign is free today; charging for the same end
state reached by a different route would be arbitrary.
*Impact:* No Stripe work in F1. *Approval:* Yes (revenue decision).

**Q3. Does upgrading change fees?**
*Evidence:* BR-10; `FeeTransaction` / `FeeTrackingService` exist but donations are
0%-fee to recipient. *Recommendation:* No fee change. *Approval:* Confirm only.

**Q4. Does upgrading change visibility?**
*Evidence:* Ranking depends on `is_boosted`/`boost_weight` only (BR-7, BR-8);
`campaign_type` has **no** ranking effect.
*Recommendation:* Upgrading grants **no** inherent ranking boost.
*Reasoning:* Otherwise upgrading becomes a free ranking exploit and devalues the
$20 pro boost. *Approval:* Yes.

**Q5. Does upgrading change fundraising mechanics?**
*Evidence:* `campaignController.js:1887` gates a feature on
`campaign_type !== 'sharing'`; `CampaignService.js:1663-1665` gates another on
`campaign_type !== 'fundraising'`.
*Recommendation:* **Must be audited before implementation.** Every
`campaign_type` branch must be enumerated and its post-upgrade behaviour
confirmed, because upgrading will flip live campaigns through these branches for
the first time ever.
*Impact:* Potentially the largest hidden-risk item in the project. See §30 R-1.
*Approval:* Yes — requires a product + engineering review of each branch.

**Q6. Does a user-sponsored upgrade require payment?**
*Recommendation:* **No payment in v1.**
*Reasoning:* Since HonestNeed never holds funds (BR-4), a "paid" sponsorship would
create an escrow obligation the platform deliberately removed.
*Impact:* F3 becomes a permission + approval flow, not a payment flow.
*Approval:* **YES — blocking for F3.**

**Q7. Can any verified user upgrade another user's campaign?**
*Recommendation:* **No.** Restrict to users with a demonstrated relationship to
the campaign: has donated to it, OR has a verified `Share` record for it, OR is on
the campaign's `CampaignTeam`. Plus account age ≥ 7 days and not blocked.
*Reasoning:* Any-verified-user is a spam and social-engineering vector.
*Approval:* Yes.

**Q8. Should another-user upgrades require creator approval?**
*Recommendation:* **YES — mandatory.** The sponsor creates a *request*; the owner
must accept, and in accepting supplies the two things only they can supply:
`creator_payout_consent_at` and a withdrawal-capable payment method.
*Reasoning:* An upgrade obliges the *owner* to pay sharers directly. No third
party can consent to a financial obligation on the owner's behalf. This single
constraint is what makes F3 safe at all.
*Impact:* F3 = `CampaignUpgrade` in `pending_owner_approval` state.
*Approval:* Yes, but the recommendation is strong.

**Q9. Notified before or after a sponsored upgrade?**
*Recommendation:* **Before** — the notification *is* the approval request.
Follows from Q8. *Approval:* Confirm.

**Q10–Q13. Should boosts give XP / rewards / visibility / affect analytics?**
*Evidence:* `GamificationService.awardForAction` already supports `share_campaign`;
`XP_ACTIONS` in `src/config/gamification.js`.
*Recommendation:* XP **yes** (new `boost_campaign` action, small award, capped
daily). Monetary rewards **no** (would be inventing money — explicitly forbidden
by the brief). Visibility **yes**, but strictly below paid boosts. Analytics **yes**.
*Approval:* Yes for the XP amount and daily cap.

**Q14–Q16. How many boosts per user per campaign? Repeat? Cooldown?**
*Evidence:* BR-9 establishes a 1-per-campaign-per-day precedent for shares.
*Recommendation:* **Mirror BR-9 exactly** — one ranking-effective boost per user
per campaign per rolling 24h. Additional boosts in the window are accepted and
recorded but flagged `counts_toward_score: false` (same "over-quota = free"
pattern as shares).
*Reasoning:* Reusing an existing, user-understood rule beats inventing a new one.
*Approval:* Yes.

**Q17. Can admins override the payment-method requirement?**
*Evidence:* No override mechanism exists anywhere in the codebase.
*Recommendation:* **No override.** An admin may upgrade a campaign only if the
*owner* has a usable payout method.
*Reasoning:* An override would produce exactly the broken state described in §1 —
a Share Campaign whose owner cannot pay sharers — except now with HonestNeed's own
fingerprints on it, which is materially worse for liability.
*Impact:* Admin UI must display owner payout readiness and disable the action.
*Approval:* **YES — blocking for F4.** If product disagrees, the override must be
a *separate named permission* and a distinct audit action.

**Q18. Which payment-method status is withdrawal-ready?**
*Evidence:* BR-5 — the live payout path accepts `pending_verification`.
*Recommendation:* Use BR-5 verbatim for v1. Add a `readiness_level` of
`verified | provisional | none` so the UI can warn on `provisional` without blocking.
*Reasoning:* Any stricter rule creates a state where a user can upgrade but not be
paid, or is blocked from upgrading while being payable. Consistency > purity.
*Approval:* Yes — and flag that tightening this later is a breaking change.

**Q19. Must the owner have a payment method before an admin upgrade?**
*Recommendation:* Yes. Follows from Q17. *Approval:* With Q17.

**Q20. Is Share Campaign status reversible?**
*Evidence:* `ShareConfigService` can set `is_paid_sharing_active: false`
(lines 419-420) — pausing exists; type reversal does not.
*Recommendation:* **The `campaign_type` transition is one-way.** Reversal is
expressed by pausing paid sharing, not by downgrading the type.
*Reasoning:* Downgrading with accrued `committed_total` and owed sharer rewards
would strand liabilities. *Approval:* Yes.

**Q21. What if the payment method becomes invalid after upgrade?**
*Evidence:* No monitoring exists for this today.
*Recommendation:* v1 — a scheduled job (mirroring `src/jobs/ExpireBoosts.js`)
pauses paid sharing (`is_paid_sharing_active: false`) and notifies the creator. Do
**not** downgrade the campaign type (Q20).
*Impact:* New job file. Could be deferred to v1.1 with an accepted risk.
*Approval:* Yes — including whether it ships in v1.

---

## 12. Recommended System Architecture

### 12.1 One upgrade pipeline, three initiators

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Creator    │  │   Sponsor   │  │    Admin    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │ POST           │ POST           │ POST /admin/...
       ▼                ▼                ▼
┌──────────────────────────────────────────────────┐
│  CampaignUpgradeService.requestUpgrade({          │
│    campaignId, actorId, initiatorType, idemKey }) │
└───────────────────────┬──────────────────────────┘
                        ▼
        ┌───────────────────────────────┐
        │ 1. Load campaign              │
        │ 2. assertEligible()           │  ← shared predicate
        │ 3. authorise(initiatorType)   │
        │ 4. PayoutReadinessService     │  ← shared gate (OWNER!)
        │    .assertReady(ownerId)      │
        │ 5. requiresOwnerApproval?     │
        └───────────┬───────────────────┘
              yes ──┴── no
               │         │
     pending_owner_    applyUpgrade()  ← atomic conditional update
     approval           │
               │        ├─ CampaignUpgrade → completed
     owner accepts ────►├─ AuditService.record
                        ├─ NotificationDispatcher.notify
                        └─ analytics event
```

**Why one pipeline:** the eligibility predicate, the payout gate, the atomic
write, the audit record, and the notification are identical across all three
initiators. Only *authorisation* and *approval requirement* differ. Three parallel
implementations would guarantee drift — exactly the defect this codebase already
exhibits in its dual admin services.

### 12.2 Naming — a hard requirement

`CampaignBoost` already means **paid self-boost**. The new peer feature **must
not** reuse the word unqualified.

| Concept | Model | Collection | API prefix |
|---|---|---|---|
| Existing paid self-boost | `CampaignBoost` | `campaign_boosts` | `/api/boosts` |
| **New** community peer boost | `CampaignSupportBoost` | `campaign_support_boosts` | `/api/campaigns/:id/support-boost` |

Frontend copy calls the new one **"Support"** / **"Boost this campaign"** (peer
framing) and the old one **"Promote"** (creator framing). Reusing `/api/boosts`
would break the existing creator `/boosts` dashboard.

### 12.3 Recommended boost model — **Free, verified-share-backed Community Boost**

**Selected from:** share / promote / community boost / reward-supported /
referral / XP / visibility.

**Why this one fits HonestNeed:**
1. HonestNeed's entire growth engine is already sharing (`Share`, `ShareTracking`,
   `ShareGrant`, `ReferralTracking`, `ShareVerificationService`). A boost *backed
   by a real verified share* reuses that machinery and inherits its fraud defences
   instead of building a parallel, weaker one.
2. It cannot be paid, because a paid peer boost collides head-on with the existing
   $20 pro boost and with BR-4 (no escrow).
3. A pure-XP boost would be a vanity button with no effect on the campaign — it
   would not satisfy "encourage users to boost/support each other's campaigns."
4. `miracle_mode` (RG-19) is direct precedent for a non-paid visibility modifier
   that HonestNeed already accepts.

**Reused infrastructure:** `Share` + `ShareGrant` (quota), `ShareFraudDetectionService`,
`GamificationService.awardForAction`, `Campaign.activists[]`, `ActivityLog`,
`NotificationDispatcher`, `rateLimiter`, the `trending` sort stage.

**New infrastructure:** `CampaignSupportBoost` model, `CampaignBoostService`,
`Campaign.community_boost_score` + `community_boost_count`, a decay job, one
notification type, one XP action.

**Free or paid:** **Free.** Justified by BR-4 and by collision with the pro tier.

**Visibility effect:** extend the `trending` sort to
`{ is_boosted: -1, boost_weight: -1, community_boost_score: -1, created_at: -1 }`.
Paid boosts always outrank community boosts — **this is essential**, or the paid
product loses its value and the change becomes a revenue regression.

**Score formula (proposed):**
```
score = Σ over distinct boosters of ( trust_weight × e^(−age_days / 7) )
trust_weight = 1.0  verified identity
             = 0.5  email-verified, account ≥ 7 days
             = 0.0  otherwise (recorded, no ranking effect)
```
Time decay means a campaign cannot coast on old boosts; the per-distinct-user cap
means one enthusiast cannot outweigh a genuine crowd.

**Frequency:** one ranking-effective boost per user per campaign per rolling 24h
(mirrors BR-9). **Cooldown:** yes, the same 24h window. **Self-boost:** blocked.
**Owner notified:** yes, but **digested** — first boost immediately, then at most
one summary per campaign per 24h, or a popular campaign becomes a notification DoS.

**Abuse vectors and defences:** see §25.

---

## 13. Database Changes

### 13.1 New collection — `campaign_upgrades`

`src/models/CampaignUpgrade.js` *(new)*

```js
{
  campaign_id:     { type: ObjectId, ref: 'Campaign', required: true, index: true },
  campaign_ref:    { type: String },              // human campaign_id, denormalised
  owner_id:        { type: ObjectId, ref: 'User', required: true, index: true },
  initiated_by:    { type: ObjectId, ref: 'User', required: true, index: true },
  initiator_type:  { type: String, enum: ['creator','sponsor','admin'], required: true },

  status: {
    type: String,
    enum: ['pending_owner_approval','completed','rejected','cancelled','failed','expired'],
    default: 'completed', index: true,
  },

  from_campaign_type: { type: String, enum: ['fundraising','sharing'], required: true },
  to_campaign_type:   { type: String, enum: ['sharing'], default: 'sharing' },

  // Snapshot of what the upgrade applied (audit + rollback reference)
  applied_share_config:  { type: Mixed, default: null },
  previous_share_config: { type: Mixed, default: null },

  // Payout gate evidence captured at decision time
  payout_readiness: {
    ready:             { type: Boolean, default: false },
    readiness_level:   { type: String, enum: ['verified','provisional','none'], default: 'none' },
    payment_method_id: { type: ObjectId, ref: 'PaymentMethod', default: null },
    method_type:       { type: String, default: null },
    checked_at:        { type: Date, default: null },
  },

  reason:           { type: String, maxlength: 500, default: null },
  admin_note:       { type: String, maxlength: 1000, default: null },
  rejection_reason: { type: String, maxlength: 500, default: null },

  idempotency_key: { type: String, required: true },   // see unique index below
  approved_at:     { type: Date, default: null },
  completed_at:    { type: Date, default: null },
  expires_at:      { type: Date, default: null },       // sponsor requests only
}
// timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
// collection: 'campaign_upgrades'
```

**Indexes**
```js
{ campaign_id: 1, created_at: -1 }
{ owner_id: 1, status: 1 }
{ initiated_by: 1, created_at: -1 }
{ idempotency_key: 1 }                       // UNIQUE  ← the idempotency guarantee
{ campaign_id: 1, status: 1 }                // partial: status='pending_owner_approval', UNIQUE
{ expires_at: 1 }                            // sweeper
```
The **unique** `idempotency_key` index is the primary duplicate-upgrade defence
(§26). The **partial unique** index on pending requests prevents a campaign
accumulating a queue of competing sponsor requests.

### 13.2 New collection — `campaign_support_boosts`

`src/models/CampaignSupportBoost.js` *(new)*

```js
{
  campaign_id:  { type: ObjectId, ref: 'Campaign', required: true, index: true },
  owner_id:     { type: ObjectId, ref: 'User', required: true, index: true },
  booster_id:   { type: ObjectId, ref: 'User', required: true, index: true },

  boost_type:   { type: String, enum: ['share','endorse','amplify'], default: 'share' },
  source:       { type: String, enum: ['campaign_page','discover','share_flow','notification','api'], default: 'campaign_page' },

  share_id:     { type: ObjectId, ref: 'Share', default: null },  // when share-backed
  channel:      { type: String, default: null },

  // Ranking contribution
  counts_toward_score: { type: Boolean, default: true, index: true },
  trust_weight:        { type: Number, default: 0, min: 0, max: 1 },
  score_contribution:  { type: Number, default: 0, min: 0 },
  suppressed_reason:   { type: String, default: null },  // 'daily_quota' | 'low_trust' | 'fraud_flag'

  xp_awarded:      { type: Number, default: 0 },
  ip_hash:         { type: String, default: null, index: true },  // hashed, never raw
  user_agent_hash: { type: String, default: null },
  boost_day:       { type: String, required: true },  // 'YYYY-MM-DD' UTC — quota key
  revoked_at:      { type: Date, default: null },
  revoked_reason:  { type: String, default: null },
}
```

**Indexes**
```js
{ campaign_id: 1, booster_id: 1, boost_day: 1 }   // UNIQUE  ← one-per-day guarantee
{ campaign_id: 1, created_at: -1 }
{ booster_id: 1, created_at: -1 }
{ ip_hash: 1, created_at: -1 }                     // fraud sweeps
{ campaign_id: 1, counts_toward_score: 1 }
```

> **Design note:** the unique `{campaign_id, booster_id, boost_day}` index makes
> the daily quota a *database* invariant, not an application check. A concurrent
> double-submit fails with `E11000` and is translated to a friendly
> `ALREADY_BOOSTED_TODAY` — no race window. Same reasoning as the idempotency-key
> index.

### 13.3 `Campaign` schema additions (additive only)

`src/models/Campaign.js`
```js
community_boost_score:   { type: Number, default: 0, min: 0, index: true },
community_boost_count:   { type: Number, default: 0, min: 0 },
last_community_boost_at: { type: Date, default: null },

upgrade_meta: {
  original_campaign_type: { type: String, enum: ['fundraising','sharing'], default: null },
  upgraded_at:            { type: Date, default: null },
  upgraded_by:            { type: ObjectId, ref: 'User', default: null },
  upgrade_initiator_type: { type: String, enum: ['creator','sponsor','admin'], default: null },
  upgrade_id:             { type: ObjectId, ref: 'CampaignUpgrade', default: null },
},
```
`upgrade_meta.original_campaign_type` satisfies "must clearly distinguish between
the original campaign type and the upgraded campaign type" without a second
mutable type field.

### 13.4 `Notification.type` enum additions
`campaign_upgraded`, `campaign_upgrade_requested`, `campaign_upgrade_approved`,
`campaign_upgrade_rejected`, `campaign_boosted`, `campaign_boost_milestone`,
`share_campaign_payout_method_invalid`.

### 13.5 Migration strategy

- **All changes are additive.** No field is removed, renamed, or retyped.
- Mongoose defaults mean existing documents need **no backfill** — a missing
  `community_boost_score` reads as `undefined` and sorts last, which is correct.
- **Optional** one-shot backfill `scripts/backfill-upgrade-meta.js` to set
  `upgrade_meta.original_campaign_type = campaign_type` on existing campaigns.
  **Not required** — the field is nullable by design and `null` correctly means
  "never upgraded".
- Index builds: run `createIndexes` in background. Both new collections start
  empty, so their index builds are free.
- **Rollback:** drop the two new collections, unset the new `Campaign` fields,
  revert the sort stage. No data loss for pre-existing entities. **Except:**
  campaigns already upgraded keep `campaign_type: 'sharing'` — intended (Q20,
  one-way) and *not* rolled back.

---

## 14. Backend Changes

### 14.1 New services

**`src/services/PayoutReadinessService.js`** *(new — the linchpin)*
```js
class PayoutReadinessService {
  // Single source of truth for BR-5. Called by creation, upgrade, and admin views.
  static async getReadiness(userId)      // → { ready, level, method, reason, code }
  static async assertReady(userId)       // throws { code, message, statusCode } or returns readiness
  static async getReadinessMany(userIds) // → Map, for admin queue lists (avoids N+1)
}
```
Levels: `verified` (`status: 'active'` **and** `verification_status: 'verified'`),
`provisional` (passes BR-5 but not verified), `none`. The gate passes on
`verified` **or** `provisional` (per Q18).

> **This service must be the only implementation of the rule.** The long-term
> follow-up is to refactor `ShareController.js:2040-2095` to call it, eliminating
> the duplicate. **Do not do that refactor in the same PR as the feature** — it
> touches the live payout path. Schedule it immediately after, as its own change.

**`src/services/CampaignUpgradeService.js`** *(new)*
```js
static async getEligibility(campaignId, actorId)     // read-only, drives UI
static async requestUpgrade({ campaignId, actorId, initiatorType, shareConfig,
                              idempotencyKey, reason, req })
static async approveUpgrade({ upgradeId, ownerId, shareConfig, req })
static async rejectUpgrade({ upgradeId, ownerId, reason, req })
static async cancelUpgrade({ upgradeId, actorId })
static async listUpgrades(filter)
// private
static assertCampaignEligible(campaign)
static async applyUpgrade(campaign, upgradeDoc)
```

**`src/services/CampaignBoostService.js`** *(new — peer boost; name deliberately
distinct from `StripeBoostService`)*
```js
static async getBoostEligibility(campaignId, userId)
static async createBoost({ campaignId, userId, source, shareId, channel, req })
static async getCampaignBoostStats(campaignId)
static async getUserBoostActivity(userId, { page, limit })
static async recomputeScore(campaignId)       // decay-aware recompute
static async revokeBoost(boostId, reason)     // fraud remediation
```

### 14.2 Modified services

| File | Change | Required? |
|---|---|---|
| `src/services/CampaignService.js` | (a) In `createCampaign`, call `PayoutReadinessService.assertReady(creatorId)` **before** building `share_config` when `campaign_type === 'sharing'` (insert ~line 470, before the `payout_consent` check). (b) Extend the `trending` sort stage (line 1052) with `community_boost_score: -1`. (c) Include `community_boost_*` and `upgrade_meta` in campaign projections. | **Required** |
| `src/services/admin/ModerationService.js` | Add `upgradeCampaign(campaignId, adminId, opts)` delegating to `CampaignUpgradeService`. | Required |
| `src/services/GamificationService.js` | Support a `boost_campaign` action in `awardForAction`. | Required |
| `src/config/gamification.js` | Add `XP_ACTIONS.boost_campaign`. | Required |
| `src/services/ShareService.js` | Optionally emit a support-boost when a verified share is recorded (share-backed boost). | Optional (v1.1) |

### 14.3 New controllers

- `src/controllers/campaignUpgradeController.js` — creator + sponsor endpoints.
- `src/controllers/CampaignSupportBoostController.js` — peer boost endpoints.
- `src/controllers/admin/ModerationController.js` — **modified**, add
  `upgradeCampaign` + `getCampaignUpgradeContext`.

### 14.4 New jobs

- `src/jobs/DecayCommunityBoosts.js` — nightly `community_boost_score` recompute
  (model on `src/jobs/ExpireBoosts.js`; register in `src/app.js` near line 493).
- `src/jobs/CheckSharePayoutReadiness.js` — Q21; pauses paid sharing when the
  owner's method goes bad. **Ship only if Q21 is approved for v1.**

---

## 15. API Changes

All new routes are additive. **No existing endpoint changes shape.**

### 15.1 Creator / sponsor — mounted in `src/routes/campaignRoutes.js`

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/campaigns/:id/upgrade-eligibility` | `authMiddleware` | Eligibility + payout readiness. Drives the UI. Never authoritative. |
| `POST` | `/api/campaigns/:id/upgrade` | `authMiddleware` + `upgradeLimiter` | Body: `{ share_config, payout_consent, payment_method_id?, idempotency_key }`. Creator path. |
| `POST` | `/api/campaigns/:id/upgrade-requests` | `authMiddleware` + limiter | Sponsor creates a request. |
| `GET` | `/api/campaigns/:id/upgrade-requests` | `authMiddleware` | Owner or sponsor views. |
| `POST` | `/api/campaigns/upgrade-requests/:upgradeId/approve` | `authMiddleware` | **Owner only.** Supplies consent + payment method. |
| `POST` | `/api/campaigns/upgrade-requests/:upgradeId/reject` | `authMiddleware` | Owner only. |
| `POST` | `/api/campaigns/upgrade-requests/:upgradeId/cancel` | `authMiddleware` | Sponsor only. |

> **Route-ordering hazard:** `campaignRoutes.js` has many `/:id/...` patterns.
> `/upgrade-requests/:upgradeId/...` must be registered **before** any
> `/:id/:something` catch-all, or Express will match `upgrade-requests` as an `:id`.
> Verify against the existing ordering around lines 600-760.

### 15.2 Community boost

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/campaigns/:id/support-boost/eligibility` | `authMiddleware` | |
| `POST` | `/api/campaigns/:id/support-boost` | `authMiddleware` + `boostLimiter` | Body: `{ source, share_id?, channel? }` |
| `GET` | `/api/campaigns/:id/support-boost/stats` | public | Count + recent boosters (respecting privacy) |
| `GET` | `/api/users/me/support-boosts` | `authMiddleware` | Paginated activity |

### 15.3 Admin — `src/routes/admin/index.js`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/moderation/campaigns/:campaignId/upgrade-context` | `CAMPAIGN_MODERATION_VIEW` |
| `POST` | `/moderation/campaigns/:campaignId/upgrade` | `CAMPAIGN_MODERATION_ACT` |
| `GET` | `/moderation/campaign-upgrades` | `CAMPAIGN_MODERATION_VIEW` |

### 15.4 Response contracts

```jsonc
// GET /api/campaigns/:id/upgrade-eligibility
{
  "success": true,
  "data": {
    "eligible": false,
    "reason_code": "NO_PAYOUT_METHOD",
    "reasons": [
      { "code": "NO_PAYOUT_METHOD",
        "message": "Add a payout method before enabling Share-to-Earn.",
        "blocking": true, "action": "add_payment_method",
        "action_url": "/settings/payment-methods?returnTo=/campaigns/CAMP-2026-001-ABC123/upgrade" }
    ],
    "campaign": { "campaign_type": "fundraising", "status": "active",
                  "already_share_campaign": false },
    "payout_readiness": { "ready": false, "level": "none", "method": null },
    "actor_role": "creator",
    "requires_owner_approval": false,
    "pending_upgrade": null
  }
}
```
```jsonc
// POST /api/campaigns/:id/support-boost — 200 on first, 200 on replay (idempotent)
{ "success": true,
  "data": { "boost_id": "…", "counted": true, "xp_awarded": 5,
            "campaign": { "community_boost_count": 43, "community_boost_score": 21.7 },
            "next_boost_available_at": "2026-08-28T09:14:00.000Z" } }
```

**Error codes (new):** `ALREADY_SHARE_CAMPAIGN`, `CAMPAIGN_NOT_ELIGIBLE`,
`CAMPAIGN_STATUS_INELIGIBLE`, `UPGRADE_ALREADY_PENDING`, `NOT_CAMPAIGN_OWNER`,
`NOT_AUTHORIZED_SPONSOR`, `OWNER_PAYOUT_NOT_READY`, `SELF_BOOST_FORBIDDEN`,
`ALREADY_BOOSTED_TODAY`, `BOOST_RATE_LIMITED`.
**Reused:** `NO_PAYOUT_METHOD`, `PAYMENT_METHOD_NOT_FOUND`,
`UNSUPPORTED_PAYOUT_METHOD`, `INVALID_PAYMENT_METHOD_ID`, `PAYOUT_CONSENT_REQUIRED`.

---

## 16. Authorization and Security Model

### 16.1 Matrix

| Action | Creator | Sponsor (qualified) | Any user | Admin (`campaign_moderation:act`) |
|---|---|---|---|---|
| View eligibility | ✅ own | ✅ | ✅ limited | ✅ |
| Upgrade own campaign | ✅ | ❌ | ❌ | — |
| Request upgrade of other's campaign | — | ✅ → pending | ❌ | — |
| Approve pending request | ✅ own only | ❌ | ❌ | ❌ |
| Upgrade another's campaign directly | ❌ | ❌ | ❌ | ✅ (owner must be payout-ready) |
| Boost another's campaign | ✅ | ✅ | ✅ | ✅ |
| Boost own campaign | ❌ | — | ❌ | ❌ |
| Revoke a boost | ❌ | ❌ | ❌ | ✅ |

### 16.2 Threat model

| # | Threat | Vector | Mitigation |
|---|---|---|---|
| T1 | Type escalation via generic edit | `PATCH /campaigns/:id` with `campaign_type: 'sharing'` | `campaign_type` stays out of `LIVE_EDITABLE_FIELDS` (§3.3); upgrade only via the dedicated service. **Add an explicit test asserting the generic edit path rejects `campaign_type`.** |
| T2 | Payout-gate bypass | Call `POST /upgrade` directly, skipping the UI | `PayoutReadinessService.assertReady` runs **server-side inside the service**, not in the controller — so every caller is gated. |
| T3 | Owner-obligation forgery | Sponsor upgrades without owner consent | Mandatory owner approval (Q8); `creator_payout_consent_at` can only be written by the owner's own approve call. |
| T4 | Admin bypass of payout gate | Admin upgrade of an unpayable owner | No override (Q17); the gate lives inside the shared service, so the admin route cannot skip it. |
| T5 | Duplicate upgrade / double-charge | Retry, double-click, network replay | Unique `idempotency_key` index + conditional atomic update (§26). |
| T6 | Boost farming (sockpuppets) | Many fresh accounts boost one campaign | `trust_weight = 0` for accounts < 7 days / unverified — recorded but zero ranking effect. |
| T7 | Boost spam (one user, many boosts) | Loop the endpoint | Unique `{campaign_id, booster_id, boost_day}` index + `boostLimiter`. |
| T8 | Self-dealing | Owner boosts own campaign, or via alt account | Direct self-boost blocked by `owner_id === booster_id`; alt accounts caught by T6 + `ip_hash` clustering. |
| T9 | Notification DoS | Boost a campaign repeatedly to spam the owner | Digested notifications (§23). |
| T10 | PII leakage | Payout details exposed in eligibility responses | `PayoutReadinessService` returns **only** `{ ready, level, method_type, last_four }` — never account/routing numbers, never `stripe_payment_method_id`. |
| T11 | Enumeration | Probing `/upgrade-eligibility` to map campaigns | Public campaign data only; 404 for non-existent; `publicApiLimiter`. |
| T12 | Privilege drift after token issue | Revoked admin's old JWT | Already handled — `requireAdmin` re-reads the User doc each request. |

### 16.3 Rate limiting

`src/middleware/rateLimiter.js` — add:
- `upgradeLimiter`: 5 requests / hour / user.
- `boostLimiter`: 30 / hour / user, 200 / day / IP.

Follow the existing `rateLimit({...})` construction and export from the same
`module.exports` block (line 351).

---

## 17. Campaign Upgrade Flow (Creator)

```
1.  Creator opens their campaign (owner view).
2.  UI calls GET /api/campaigns/:id/upgrade-eligibility.
3a. eligible:false + NO_PAYOUT_METHOD → show blocked card (§21.3).
3b. eligible:false + ALREADY_SHARE_CAMPAIGN → show "already a Share Campaign" chip.
3c. eligible:true → show "Upgrade to Share Campaign" CTA.
4.  Creator clicks → modal explains: what changes, that they will owe sharers
    directly, the reward-per-share and budget inputs, the payout method on file.
5.  Creator sets reward_per_share + budget, ticks payout consent, confirms.
6.  UI generates an idempotency_key (uuid, held for the whole attempt including
    retries) and POSTs /api/campaigns/:id/upgrade.
7.  Server: authenticate → authorize (owner) → assertCampaignEligible →
    PayoutReadinessService.assertReady(owner) → validate share_config (BR-2) →
    require payout_consent (BR-3).
8.  Atomic conditional update (§26.2).
9.  CampaignUpgrade → completed; Campaign.upgrade_meta populated.
10. AuditService.record({ action: 'campaign.upgrade.creator', ... }).
11. NotificationDispatcher.notify({ type: 'campaign_upgraded' }).
12. Analytics event emitted.
13. Response 200 → UI invalidates campaign cache, re-renders as Share Campaign,
    shows success state with a link to the Share-to-Earn config.
```

**Eligibility predicate (shared by all three flows):**
```js
campaign.campaign_type === 'fundraising'          // not already Share  (Q1)
&& ['active','paused','draft'].includes(campaign.status)
&& !['rejected','flagged','escalated'].includes(campaign.moderation?.review_status)
&& !campaign.deleted_at
&& !campaignEndDatePassed(campaign)
```
> Note: `draft` is included so a creator can upgrade before publishing. Product
> should confirm — see §35.

---

## 18. User-to-User Upgrade Flow (Sponsored)

```
Sponsor                          System                        Owner
   │ POST /upgrade-requests         │                             │
   │───────────────────────────────►│                             │
   │                                │ verify sponsor qualification│
   │                                │  (donated | verified share  │
   │                                │   | team member) + age ≥ 7d │
   │                                │ assertCampaignEligible      │
   │                                │ partial-unique index blocks │
   │                                │  a second pending request   │
   │                                │ create CampaignUpgrade      │
   │                                │   status=pending_owner_approval
   │                                │   expires_at = +14 days     │
   │                                │ notify campaign_upgrade_requested
   │                                │────────────────────────────►│
   │                                │                             │ reviews
   │                                │  POST /approve              │
   │                                │◄────────────────────────────│
   │                                │ owner supplies:             │
   │                                │   payout_consent            │
   │                                │   payment_method_id         │
   │                                │ PayoutReadinessService gate │
   │                                │ applyUpgrade()              │
   │  notify upgrade_approved       │ audit + notify              │
   │◄───────────────────────────────│                             │
```
Rejection → `status: 'rejected'`, sponsor notified, no campaign change.
Expiry → sweeper sets `expired`; sponsor may submit a new request.

**Ownership is never transferred.** `Campaign.creator_id` is untouched;
`CampaignUpgrade.initiated_by` records the sponsor.

---

## 19. Admin Upgrade Flow

```
1. Admin opens /admin/moderation → campaign detail.
2. UI calls GET /admin/moderation/campaigns/:id/upgrade-context, returning:
     - campaign: title, campaign_id, status, campaign_type, created_at
     - owner: display_name, email, account age, identity-verification state, blocked
     - payout_readiness: { ready, level, method_type, last_four }   ← no PII
     - risk: moderation.risk_score, moderation.report_count,
             CreatorReliabilityService score if available
     - upgrade_history: prior CampaignUpgrade records
3. If payout_readiness.ready === false → the action is DISABLED with the reason
   shown. No override (Q17).
4. Admin clicks "Upgrade to Share Campaign" → confirmation dialog requiring an
   admin_note (mandatory, min 10 chars — it lands in the audit trail).
5. POST /admin/moderation/campaigns/:id/upgrade
     { share_config, admin_note, idempotency_key }
6. requireAdmin → requirePermission(CAMPAIGN_MODERATION_ACT) →
   CampaignUpgradeService.requestUpgrade({ initiatorType: 'admin' }).
7. Same shared gate. Same atomic write.
8. AuditService.record({ adminId, action: 'campaign.upgrade.admin',
     entityType: 'Campaign', entityId, changes: { before, after },
     metadata: { admin_note, upgrade_id }, req })
9. Owner notified: campaign_upgraded (initiator_type: 'admin').
10. Admin sees a success toast; the queue row refreshes.
```

**Admin-specific note on payout consent:** the owner has not personally accepted
the pay-sharers-directly agreement in this path. **Recommendation:** the admin
upgrade sets `is_paid_sharing_active: false` and leaves
`creator_payout_consent_at: null`; the owner's notification carries a
"Review & activate" link where they accept the agreement, flipping sharing live.
This keeps BR-3 intact — an admin cannot consent on a user's behalf to a
financial obligation. **Flag for product (§35).**

---

## 20. Campaign Boost Flow

```
1. User views another user's campaign (or a Discover card).
2. UI calls GET /api/campaigns/:id/support-boost/eligibility.
3. States: available | already_boosted_today | self_boost | ineligible_campaign
           | unauthenticated.
4. User clicks "Boost". Tooltip: "Boosting helps this campaign appear higher in
   Discover for the next few days. It's free."
5. POST /api/campaigns/:id/support-boost { source }
6. Server:
     a. authenticate; reject booster_id === owner_id (SELF_BOOST_FORBIDDEN)
     b. campaign must be status 'active' and moderation-clean
     c. compute trust_weight from the booster's account
     d. boost_day = UTC YYYY-MM-DD
     e. insert CampaignSupportBoost → unique index enforces one/day
        - E11000 → return the existing boost, counted:false, ALREADY_BOOSTED_TODAY
     f. if counts_toward_score: atomic $inc on Campaign
        { community_boost_count: 1, community_boost_score: contribution }
        and $set last_community_boost_at
     g. push to Campaign.activists[] with action_type 'advocate'  (reuses §3.1)
     h. GamificationService.awardForAction(userId, 'boost_campaign')
     i. ActivityLog entry
     j. digested owner notification (§23)
7. Response includes updated counts + next_boost_available_at.
8. UI: optimistic count bump, button → "Boosted today ✓", disabled with a
   countdown to the next window.
```

Nightly `DecayCommunityBoosts` recomputes `community_boost_score` with the decay
factor so the ranking reflects *recent* community energy.

---

## 21. Frontend / UI Changes

### 21.1 New files
```
services/campaignUpgradeService.ts        API wrapper (via apiClient — mandatory)
services/campaignBoostService.ts          API wrapper (via apiClient)
hooks/useCampaignUpgrade.ts               eligibility + mutation + cache invalidation
hooks/useCampaignBoost.ts                 eligibility + optimistic boost
features/campaigns/upgrade/UpgradeToShareCard.tsx
features/campaigns/upgrade/UpgradeModal.tsx
features/campaigns/upgrade/PayoutMethodGate.tsx
features/campaigns/upgrade/UpgradeRequestInbox.tsx
features/campaigns/boost/BoostButton.tsx
features/campaigns/boost/BoostStats.tsx
app/(creator)/upgrade-requests/page.tsx   owner inbox for sponsored requests
```

### 21.2 Modified files
```
app/(campaigns)/[id]/page.tsx    mount BoostButton (non-owner) / UpgradeToShareCard (owner)
app/(creator)/dashboard/page.tsx upgrade CTA + pending-request badge
app/(supporter)/discover/page.tsx BoostButton on cards
app/(creator)/notifications/page.tsx render new notification types
app/admin/moderation/…            admin upgrade action + context panel
components/…Navbar                badge for pending upgrade requests
```

### 21.3 State matrix (must all be implemented)

| State | Visual | Copy |
|---|---|---|
| Eligible | Primary CTA, `theme.colors.primary` | "Upgrade to Share Campaign" |
| Not eligible (status) | Disabled button + helper text | "Only active campaigns can be upgraded." |
| Missing payment method | Info card, `theme.colors.warning`, secondary CTA | "Share Campaigns reward people who share your story — so we need to know where your money goes before you can promise rewards. Add a payout method to continue." |
| Payment method provisional | Amber inline note, **not blocking** | "Your payout method is still being verified. You can upgrade now." |
| Already upgraded | Success chip | "Share Campaign ✓" |
| Suspended / flagged | Disabled + muted | "This campaign is under review." |
| Closed / completed | Hidden entirely | — |
| Upgrade loading | Button spinner, modal locked, inputs disabled | "Upgrading…" |
| Upgrade success | Success modal + confetti (reuse the existing milestone celebration) | "Your campaign is now a Share Campaign." |
| Upgrade failed | Inline error, retry preserves the same `idempotency_key` | server `message` |
| Pending owner approval (sponsor view) | Muted card | "Waiting for the campaign owner." |
| Pending owner approval (owner view) | Actionable card, Approve / Decline | "{name} wants to help you turn this into a Share Campaign." |
| Boost available | Outline button + count | "Boost" |
| Boost unavailable (self) | Hidden | — |
| Boost already performed | Filled button, disabled, countdown | "Boosted today ✓" |
| Unauthorized | Button routes to login with `returnTo` | "Sign in to boost" |

### 21.4 Blocked-payment resume flow

The eligibility response supplies `action_url` with a `returnTo` query param:
`/settings/payment-methods?returnTo=<encoded upgrade url>`. After a successful
method save, the payment-methods page reads `returnTo` and routes back; the
upgrade page **re-fetches eligibility on mount** rather than trusting any cached
state. Never persist eligibility across navigation.

### 21.5 Responsive & accessibility

- Breakpoints follow the existing theme; the upgrade modal becomes a full-screen
  sheet under 640px. Boost button collapses to icon + count under 480px.
- Modal: focus trap, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`,
  ESC to close, focus returns to the invoking button.
- Boost button: `aria-pressed` reflects boosted state; the disabled state carries
  `aria-describedby` pointing at the countdown text.
- Count changes announced via `aria-live="polite"`.
- Never encode state in colour alone — every state has a text label or icon.
- Touch targets ≥ 44×44px.
- Respect `prefers-reduced-motion` for the success animation.

---

## 22. Admin UI Changes

- `app/admin/moderation/` — add an **Upgrade** action to the campaign detail view,
  behind a `CAMPAIGN_MODERATION_ACT` permission check (mirror how the existing
  pause/resume actions gate).
- New context panel showing: owner identity, account age, payout readiness badge
  (`Verified` / `Provisional` / `None`), risk score, report count, prior upgrades.
- Confirmation dialog with a **mandatory** `admin_note`.
- Disabled state with an explicit reason when the owner is not payout-ready.
- Optional: a `/admin/moderation/campaign-upgrades` list view for the audit trail.

---

## 23. Notification Changes

**Two edits per type — both mandatory:**
1. `src/models/Notification.js` — add to the `type` enum (line 20).
2. `src/notifications/notificationTypes.js` — add the registry entry.

| Type | Recipient | Channels | prefPath |
|---|---|---|---|
| `campaign_upgraded` | Owner | `IN_APP_PUSH` + email | `campaigns.upgrades` |
| `campaign_upgrade_requested` | Owner | `ALL` | `null` (actionable, always on) |
| `campaign_upgrade_approved` | Sponsor | `IN_APP_PUSH` | `campaigns.upgrades` |
| `campaign_upgrade_rejected` | Sponsor | `IN_APP_ONLY` | `campaigns.upgrades` |
| `campaign_boosted` | Owner | `IN_APP_PUSH` | `campaigns.boosts` |
| `campaign_boost_milestone` | Owner | `IN_APP_PUSH` | `campaigns.boosts` |
| `share_campaign_payout_method_invalid` | Owner | `ALL` | `null` (transactional) |

**Digest rule for `campaign_boosted`:** send on the campaign's first boost, then
suppress for 24h and send `campaign_boost_milestone` at 10 / 25 / 50 / 100
cumulative boosts. Implement by checking `last_community_boost_at` before dispatch.
Without this, a trending campaign generates hundreds of notifications.

`NotificationPreferences` needs the `campaigns.upgrades` and `campaigns.boosts`
paths added, or `prefPath` lookups silently return `undefined` (which reads as
"enabled" — acceptable, but the toggles won't appear in settings).

---

## 24. Analytics Changes

Events to emit (via `ActivityLog` + `CampaignAnalyticsService`):

| Event | Properties |
|---|---|
| `campaign_upgrade_attempted` | campaign_id, initiator_type, actor_id |
| `campaign_upgrade_succeeded` | + upgrade_id, from_type, to_type, payout_level |
| `campaign_upgrade_failed` | + reason_code |
| `campaign_upgrade_requested` | campaign_id, sponsor_id |
| `campaign_upgrade_approved` / `_rejected` | + upgrade_id |
| `campaign_boost_attempted` | campaign_id, booster_id, source |
| `campaign_boost_succeeded` | + counted, trust_weight, score_contribution |
| `campaign_boost_suppressed` | + suppressed_reason |

Derived metrics: upgrade conversion rate (eligible → upgraded), payout-gate
drop-off rate (**the key product metric** — it tells you whether requirement #5 is
blocking legitimate users), boost → donation attribution via
`ConversionTrackingService`, and boost-score distribution to tune the decay constant.

**Reuse, do not rebuild:** `CampaignBoost.recordBoostEvent` already models
attributing views/engagement/conversions to a live boost. The community-boost
equivalent should follow the same shape rather than inventing a new one.

---

## 25. Abuse Prevention

| Vector | Control |
|---|---|
| Sockpuppet boost farms | `trust_weight = 0` under 7 days / unverified; boost recorded but zero ranking effect |
| Rapid-fire boosting | `boostLimiter` (30/h user, 200/day IP) + DB unique index |
| Same-user repeat boost | Unique `{campaign_id, booster_id, boost_day}` |
| Self-boost | `owner_id === booster_id` rejection + alt-account IP clustering |
| Coordinated ring boosting | `ip_hash` clustering sweep; reuse `ShareFraudDetectionService` heuristics; admin `revokeBoost` with score recompute |
| Upgrade spam by sponsors | Partial-unique pending index (one open request per campaign) + `upgradeLimiter` + 14-day expiry |
| Upgrade to dodge moderation | Eligibility excludes `flagged` / `escalated` / `rejected` review states |
| Admin abuse | Mandatory `admin_note`, full audit record, permission gate, no payout override |
| Replay attacks | Unique `idempotency_key`; server returns the original result on replay rather than erroring |

**Store `ip_hash`, never raw IPs**, on boost records — this data is retained
long-term for ranking and the privacy exposure of raw IPs is not justified.
(Note: `Share` stores raw `ip_address` — pre-existing, out of scope, but do not
propagate the pattern.)

---

## 26. Idempotency and Concurrency Strategy

### 26.1 The constraint

Only `TransactionService.js` uses `startSession`. The deployment target may be a
standalone MongoDB where multi-document transactions are unavailable. **Do not
build this feature on `withTransaction`.**

### 26.2 The pattern — atomic conditional update

`applyUpgrade` must use a guarded `findOneAndUpdate`, so the *state check and the
write are one operation*:

```js
const updated = await Campaign.findOneAndUpdate(
  {
    _id: campaignId,
    campaign_type: 'fundraising',              // ← guard: not already upgraded
    status: { $in: ['active', 'paused', 'draft'] },
  },
  {
    $set: {
      campaign_type: 'sharing',
      share_config: nextShareConfig,
      'upgrade_meta.original_campaign_type': 'fundraising',
      'upgrade_meta.upgraded_at': new Date(),
      'upgrade_meta.upgraded_by': actorId,
      'upgrade_meta.upgrade_initiator_type': initiatorType,
      'upgrade_meta.upgrade_id': upgradeDoc._id,
    },
  },
  { new: true }
);

if (!updated) {
  // Lost the race, or already upgraded. Re-read to produce the right answer.
  const current = await Campaign.findById(campaignId).lean();
  if (current?.campaign_type === 'sharing') {
    return { alreadyUpgraded: true, campaign: current };   // idempotent success
  }
  throw { code: 'CAMPAIGN_NOT_ELIGIBLE', statusCode: 409, message: '…' };
}
```
Two concurrent upgrades: exactly one matches the guard; the loser re-reads, sees
`sharing`, and returns an idempotent success. No duplicate state, no transaction.

### 26.3 Idempotency keys

- Client generates a UUID per user *intent* and reuses it across retries.
- `CampaignUpgrade.idempotency_key` is **uniquely indexed**.
- On `E11000`, load the existing record and return its outcome — do not error.
- Keys namespaced as `${campaignId}:${actorId}:${clientUuid}` to prevent
  cross-campaign collisions.

### 26.4 Ordering

`CampaignUpgrade` is created **before** the campaign mutation, so a crash between
the two leaves an auditable `pending`/`failed` record rather than an unexplained
type change. A sweeper reconciles records stuck in a non-terminal state.

### 26.5 Boost counters

Use `$inc` only — never read-modify-write. The unique day index makes the
"has this user boosted today" check race-free at the storage layer.

---

## 27. Testing Strategy

Existing suites live in `src/tests/` and `tests/`; `jest.config.js` at root.
Integration tests follow `src/tests/integration/settlements.integration.test.js`.

### 27.1 New test files
```
src/tests/unit/PayoutReadinessService.test.js
src/tests/unit/CampaignUpgradeService.test.js
src/tests/unit/CampaignBoostService.test.js
src/tests/integration/campaign-upgrade.integration.test.js
src/tests/integration/campaign-upgrade-admin.integration.test.js
src/tests/integration/campaign-support-boost.integration.test.js
```

### 27.2 Mandatory scenarios

**Upgrade — creator**
1. Active fundraising campaign + verified method → 200, `campaign_type: 'sharing'`, `upgrade_meta` set.
2. No payment method → 400 `NO_PAYOUT_METHOD`, campaign unchanged.
3. `status: 'inactive'` method only → 400, unchanged.
4. `pending_verification` method → **200** (BR-5 leniency, Q18) with `level: 'provisional'`.
5. Duplicate POST, same `idempotency_key` → 200, single `CampaignUpgrade` row.
6. `status: 'completed'` campaign → 400 `CAMPAIGN_STATUS_INELIGIBLE`.
7. Already `sharing` → 400 `ALREADY_SHARE_CAMPAIGN`.
8. `moderation.review_status: 'flagged'` → 400.
9. **Data preservation:** assert `_id`, `campaign_id`, `creator_id`, donations,
   `contributors`, `metrics`, `image_url`, `category`, `location` are byte-identical
   before/after.

**Upgrade — sponsor**
10. Qualified sponsor → `pending_owner_approval`, campaign unchanged, owner notified.
11. Unqualified user → 403 `NOT_AUTHORIZED_SPONSOR`.
12. Owner approves with method → completed, `creator_payout_consent_at` set.
13. Owner rejects → `rejected`, campaign unchanged.
14. Second sponsor request while one pending → 409 `UPGRADE_ALREADY_PENDING`.
15. Non-owner tries to approve → 403.

**Upgrade — admin**
16. Admin with `CAMPAIGN_MODERATION_ACT` + payout-ready owner → 200 + audit row.
17. Admin, owner **not** payout-ready → 400 `OWNER_PAYOUT_NOT_READY` (proves no override, Q17).
18. Admin without the permission → 403.
19. Non-admin hitting the admin route → 403.
20. Audit record asserts `admin_id`, `action_type`, `changes.before/after`, `metadata.admin_note`.

**Boost**
21. Boost another's campaign → 201, count +1, XP awarded.
22. Second boost same day → 200 `counted: false`, count unchanged.
23. Self-boost → 403 `SELF_BOOST_FORBIDDEN`.
24. Boost a paused campaign → 400.
25. New account (< 7 days) → recorded, `counts_toward_score: false`, score unchanged.
26. Rate limit exceeded → 429.
27. Boost affects `trending` order but **never** outranks a `pro`-boosted campaign
    — the revenue-protection assertion.

**Concurrency**
28. Two parallel upgrade POSTs (different keys) → exactly one mutation; both
    resolve without a 500.
29. Two parallel boosts, same user/campaign → one row; `E11000` surfaces as a
    friendly response.

**Security**
30. `PATCH /campaigns/:id { campaign_type: 'sharing' }` → **rejected** (T1 regression guard).
31. Eligibility response contains no `bank_account_number`, `bank_routing_number`,
    or `stripe_payment_method_id` (T10 guard).

### 27.3 Frontend
React Testing Library for each of the §21.3 states; keyboard-only traversal of the
modal; `returnTo` resume flow; optimistic boost rollback on failure.

---

## 28. Migration and Rollout Strategy

1. **Ship the schema + services dark.** New models and `PayoutReadinessService`
   deploy with no route wiring. Zero user-visible change.
2. **Enable the creator upgrade behind a flag** (`PlatformSettings` already exists
   — reuse it rather than adding an env var). Internal accounts only.
3. **Enable the payment-method gate on *creation*.** ⚠️ **This is the only
   genuinely breaking change in the project** — users who could previously create a
   Share Campaign will now be blocked. Announce it, and consider a 7-day
   soft-launch where the gate warns instead of blocks, with metrics on how many
   users would have been blocked. **Do not skip this measurement.**
4. Enable the admin upgrade.
5. Enable the sponsored upgrade.
6. Enable community boost with `community_boost_score` **excluded** from the sort —
   collect data for a week, tune the decay constant against real distributions.
7. Add `community_boost_score` to the `trending` sort. Watch paid-boost CTR for
   cannibalisation; roll back this step alone if pro conversions drop.
8. Enable the payout-readiness monitoring job (Q21).

Each step is independently revertible. Step 7 is the only one that changes what
existing users see in Discover.

---

## 29. Backward Compatibility

- All schema changes are additive with defaults → existing documents valid unchanged.
- No existing endpoint changes request or response shape; new fields are additive.
- `/api/boosts/*` (paid) is untouched. The creator boost dashboard keeps working.
- `LIVE_EDITABLE_FIELDS` is unchanged → no new generic-edit capability.
- Campaigns with no `upgrade_meta` correctly read as "never upgraded".
- **The one incompatibility:** step 3 of §28. Creating a Share Campaign without a
  payout method stops working. That is the point of requirement #5, but it must
  ship deliberately, not silently.

---

## 30. Risks and Mitigations

| ID | Risk | Sev | Mitigation |
|---|---|---|---|
| R-1 | Unenumerated `campaign_type` branches misbehave when a live campaign flips type for the first time (`campaignController.js:1887`, `CampaignService.js:1663`) | **High** | Q5 — enumerate every branch before coding. Add an integration test per branch. Top technical risk. |
| R-2 | Payment gate blocks legitimate users, suppressing Share Campaign creation | High | Soft-launch measurement (§28 step 3); lenient BR-5 rule; clear in-context copy |
| R-3 | Community boost cannibalises the $20 pro boost | High | Community score ranks strictly below paid; staged rollout with CTR monitoring (§28 step 7) |
| R-4 | Boost farming distorts Discover | Med | Trust weighting, decay, unique index, IP clustering, admin revoke |
| R-5 | Name collision between paid `CampaignBoost` and peer boost causes a wrong-model bug | Med | Distinct model/collection/route/UI names (§12.2), enforced at review |
| R-6 | No MongoDB transactions → partial state | Med | Atomic conditional updates + create-before-mutate ordering + sweeper (§26) |
| R-7 | Notification storm from a viral campaign's boosts | Med | Digest + milestone thresholds (§23) |
| R-8 | Sponsored upgrade used for social pressure on vulnerable creators | Med | Mandatory owner approval; expiry; one pending request per campaign |
| R-9 | Payout method becomes invalid post-upgrade; sharers accrue unpayable rewards | Med | Q21 monitoring job; pause sharing rather than downgrade |
| R-10 | Duplicated withdrawal-readiness logic drifts from `ShareController` | Med | `PayoutReadinessService` as sole implementation; scheduled follow-up refactor (separate PR) |
| R-11 | `metrics.unique_supporters` and `activists[]` unbounded array growth accelerates with boosts | Low-Med | Cap `activists[]` writes; pre-existing issue, log as tech debt |
| R-12 | Route-ordering collision on `/upgrade-requests/:id` vs `/:id` | Low | Register before catch-alls; add a routing test |

---

## 31. Dependencies

**No new npm packages required.** Everything needed exists: `express-rate-limit`,
`mongoose`, `winston`, the notification pipeline, `stripe` (unused by this
feature). Use `crypto.randomUUID()` (Node ≥ 14.17) rather than adding `uuid`.

**Internal dependencies (must exist and be working before starting):**
`authMiddleware`, `adminAuth` + `adminRoles`, `NotificationDispatcher` +
`notificationTypes`, `AuditService`, `GamificationService`, `PaymentMethod` + its
controller, `CampaignService`, `rateLimiter`, frontend `apiClient`.

**Blocking product dependencies:** Q1, Q6, Q8, Q17 (§35).

---

## 32. Recommended Implementation Order

| Phase | Work | Depends on |
|---|---|---|
| 1 | Architecture prep: confirm §5 branch audit (Q5), confirm Mongo replica-set status | — |
| 2 | **Product sign-off on Q1, Q6, Q8, Q17** | — |
| 3 | Models: `CampaignUpgrade`, `CampaignSupportBoost`, `Campaign` additive fields, `Notification` enum | 2 |
| 4 | `PayoutReadinessService` + unit tests | 3 |
| 5 | `CampaignUpgradeService` + `CampaignBoostService` + unit tests | 4 |
| 6 | Routes, controllers, validators, rate limiters | 5 |
| 7 | Creator upgrade end-to-end (backend + UI) | 6 |
| 8 | **Creation-time payment gate** (the requirement-5 fix) | 4 |
| 9 | Admin upgrade (backend + admin UI + audit) | 6 |
| 10 | Sponsored upgrade (request/approve/reject + inbox UI) | 6 |
| 11 | Community boost (backend + UI, score excluded from sort) | 6 |
| 12 | Notifications + analytics wiring | 7–11 |
| 13 | Decay job; enable score in `trending` sort | 11 |
| 14 | Full test suite; security review | all |
| 15 | Staged rollout (§28); production verification | 14 |

Phase 8 can run in parallel with 7 — it is small and independently valuable.

---

## 33. File-by-File Implementation Plan

### 33.1 Backend — new files

| File | Responsibility | Risk |
|---|---|---|
| `src/models/CampaignUpgrade.js` | Upgrade record + state machine + unique idempotency index | Low — new collection |
| `src/models/CampaignSupportBoost.js` | Peer boost record + unique daily index | Low |
| `src/services/PayoutReadinessService.js` | Sole implementation of BR-5 | **Med** — must match `ShareController` exactly or the two paths contradict |
| `src/services/CampaignUpgradeService.js` | Shared upgrade pipeline | **High** — mutates live campaigns |
| `src/services/CampaignBoostService.js` | Peer boost logic + scoring | Med |
| `src/controllers/campaignUpgradeController.js` | Creator/sponsor HTTP layer | Low |
| `src/controllers/CampaignSupportBoostController.js` | Boost HTTP layer | Low |
| `src/validators/campaignUpgradeValidators.js` | Body validation (follow `sharingValidators.js`) | Low |
| `src/jobs/DecayCommunityBoosts.js` | Nightly score decay (model on `ExpireBoosts.js`) | Low |
| `src/jobs/CheckSharePayoutReadiness.js` | Q21 monitoring | Low — ship only if Q21 approved |

### 33.2 Backend — modified files

| File | Current responsibility | Change | Risk | Required? |
|---|---|---|---|---|
| `src/models/Campaign.js` | Campaign schema | Add `community_boost_*`, `upgrade_meta` | Low — additive | Required |
| `src/models/Notification.js` | Notification schema | Extend `type` enum (line 20) | Low | Required |
| `src/notifications/notificationTypes.js` | Registry | 7 new entries | Low | Required |
| `src/services/CampaignService.js` | Campaign business logic | Payout gate at ~line 470; sort stage line 1052; projections | **High** — 2,401 lines, central; the gate changes existing creation behaviour | Required |
| `src/routes/campaignRoutes.js` | Campaign routing | Mount upgrade + boost routes; **watch ordering** (§15.1) | Med | Required |
| `src/routes/admin/index.js` | Admin routing | 3 new routes | Low | Required |
| `src/controllers/admin/ModerationController.js` | Admin campaign moderation | Add `upgradeCampaign`, `getCampaignUpgradeContext` | Low | Required |
| `src/services/admin/ModerationService.js` | Admin campaign service | Delegate to `CampaignUpgradeService` | Low | Required |
| `src/middleware/rateLimiter.js` | Rate limits | Add `upgradeLimiter`, `boostLimiter`; export at line 351 | Low | Required |
| `src/services/GamificationService.js` | XP | `boost_campaign` action | Low | Required |
| `src/config/gamification.js` | XP constants | `XP_ACTIONS.boost_campaign` | Low | Required |
| `src/models/NotificationPreferences.js` | Pref schema | `campaigns.upgrades`, `campaigns.boosts` | Low | Optional (toggles) |
| `src/app.js` | Bootstrap | Register `DecayCommunityBoosts` near line 493 | Low | Required |
| `src/controllers/ShareController.js` *(payout path)* | Payout method resolution | **Later PR:** delegate to `PayoutReadinessService` | **High** — live money path | Deferred |

### 33.3 Frontend — new files

| File | Responsibility |
|---|---|
| `services/campaignUpgradeService.ts` | apiClient wrapper for upgrade endpoints |
| `services/campaignBoostService.ts` | apiClient wrapper for boost endpoints |
| `hooks/useCampaignUpgrade.ts` | Eligibility query + upgrade mutation |
| `hooks/useCampaignBoost.ts` | Boost eligibility + optimistic mutation |
| `features/campaigns/upgrade/UpgradeToShareCard.tsx` | Owner-facing CTA + all states |
| `features/campaigns/upgrade/UpgradeModal.tsx` | Explanation, config inputs, consent, confirm |
| `features/campaigns/upgrade/PayoutMethodGate.tsx` | Blocked state + `returnTo` deep link |
| `features/campaigns/upgrade/UpgradeRequestInbox.tsx` | Owner approve/decline list |
| `features/campaigns/boost/BoostButton.tsx` | Boost CTA + all states |
| `features/campaigns/boost/BoostStats.tsx` | Count + recent boosters |
| `app/(creator)/upgrade-requests/page.tsx` | Inbox route |

### 33.4 Frontend — modified files

| File | Change | Risk |
|---|---|---|
| `app/(campaigns)/[id]/page.tsx` | Mount owner card / boost button | Med — highest-traffic page |
| `app/(creator)/dashboard/page.tsx` | CTA + pending badge | Low |
| `app/(supporter)/discover/page.tsx` | Boost on cards | Low |
| `app/(creator)/notifications/page.tsx` | New types render | Low |
| `app/admin/moderation/*` | Admin upgrade action + context | Med |
| `types/campaign.ts` (or equivalent) | New fields | Low |

---

## 34. Acceptance Criteria

**Upgrade — creator**
- [ ] An eligible fundraising campaign owner sees an "Upgrade to Share Campaign" CTA.
- [ ] Upgrading preserves `_id`, `campaign_id`, `creator_id`, donations, contributors, media, description, category, location, and all metrics.
- [ ] `campaign_type` becomes `sharing`; `upgrade_meta.original_campaign_type` records `fundraising`.
- [ ] A `CampaignUpgrade` record exists with `initiator_type: 'creator'`.
- [ ] Repeating the request with the same idempotency key produces exactly one upgrade and one record.
- [ ] A campaign already `sharing` cannot be upgraded again.
- [ ] Completed / cancelled / rejected / flagged campaigns cannot be upgraded.

**Payment gate**
- [ ] Creating a Share Campaign without a usable payout method fails with `NO_PAYOUT_METHOD`.
- [ ] Upgrading without one fails identically.
- [ ] The gate is enforced server-side and cannot be bypassed by calling the API directly.
- [ ] The frontend explains *why* a method is required and links to setup with a working `returnTo` resume.
- [ ] No payment credentials appear in any eligibility or context response.

**Sponsored upgrade**
- [ ] Only qualified sponsors can request.
- [ ] The request never mutates the campaign before owner approval.
- [ ] The owner can approve or reject; ownership never changes.
- [ ] Initiator, owner, timestamp, and reason are all recorded.

**Admin upgrade**
- [ ] Gated on `CAMPAIGN_MODERATION_ACT`.
- [ ] Admin sees owner, status, type, payout readiness, and risk data before acting.
- [ ] Confirmation with a mandatory note is required.
- [ ] An `AuditLog` entry records the admin, action, before/after, and note.
- [ ] The action is disabled when the owner is not payout-ready (no override).
- [ ] The owner is notified.

**Community boost**
- [ ] A user can boost another user's active campaign.
- [ ] Self-boost is rejected.
- [ ] A second boost in the same UTC day is recorded but does not affect the score.
- [ ] Each boost records booster, campaign, timestamp, source, and type.
- [ ] Boosts influence the `trending` sort but never outrank a paid `pro` boost.
- [ ] Boosts award XP; no monetary reward is created.
- [ ] The owner receives a first-boost notification and milestone notifications, not one per boost.

**Cross-cutting**
- [ ] Every §21.3 state is implemented and reachable.
- [ ] All §27.2 tests pass.
- [ ] No existing endpoint changed shape; the paid boost dashboard still works.

---

## 35. Product Decisions Required Before Implementation

**Blocking — implementation cannot start:**
1. **Q1 — Definition of "Free Campaign."** Recommend `campaign_type === 'fundraising'`. Everything downstream depends on this.
2. **Q6 — Is a sponsored upgrade paid?** Recommend no (re-introducing money re-creates escrow, which BR-4 removed).
3. **Q8 — Does a sponsored upgrade require owner approval?** Recommend yes, mandatory. This is the constraint that makes F3 safe.
4. **Q17 — Can admins override the payment-method requirement?** Recommend no. If product insists, it needs a separate permission and a distinct audit action.

**Blocking — needed before the relevant phase:**
5. **Q5 — Audit of all `campaign_type` branches.** Engineering + product, before phase 7.
6. **§19 — Does an admin upgrade activate paid sharing, or leave it pending owner consent?** Recommend pending, so BR-3 holds.
7. **§17 — May `draft` campaigns be upgraded, or only published ones?**

**Non-blocking but needed before launch:**
8. Q10–Q13 — XP amount and daily cap for boosts.
9. Q14–Q16 — Confirm the 24h one-per-campaign boost rule mirrors BR-9.
10. Q18 — Confirm `pending_verification` counts as withdrawal-ready.
11. Q20 — Confirm the upgrade is one-way.
12. Q21 — Does the payout-readiness monitoring job ship in v1?
13. §28 step 3 — Approve the breaking change to Share Campaign creation, and the soft-launch measurement window.
14. Copy review for every state in §21.3, especially the payment-gate explanation.

---

## 36. Final Implementation Checklist

**Before writing code**
- [ ] Q1, Q6, Q8, Q17 answered in writing
- [ ] Q5 branch audit complete — every `campaign_type` conditional enumerated
- [ ] Mongo deployment topology confirmed (replica set or standalone)
- [ ] Naming convention agreed and recorded (§12.2)

**Database**
- [ ] `CampaignUpgrade` model + all indexes, unique `idempotency_key` verified
- [ ] `CampaignSupportBoost` model + unique `{campaign_id, booster_id, boost_day}` verified
- [ ] `Campaign` additive fields
- [ ] `Notification.type` enum extended
- [ ] Index builds run in background; rollback plan documented

**Backend**
- [ ] `PayoutReadinessService` matches BR-5 exactly (diff against `ShareController.js:2040-2095`)
- [ ] `CampaignUpgradeService` uses the guarded atomic update (§26.2)
- [ ] `CampaignBoostService` relies on the DB unique index, not an application check
- [ ] Creation-time payout gate added to `CampaignService.createCampaign`
- [ ] `campaign_type` still absent from `LIVE_EDITABLE_FIELDS`
- [ ] Rate limiters added and exported
- [ ] Admin routes permission-gated; audit records written
- [ ] Notification registry **and** enum both updated for all 7 types
- [ ] Boost notifications digested, not per-event
- [ ] Decay job registered in `src/app.js`

**Frontend**
- [ ] All API calls go through `apiClient` — no raw axios/fetch
- [ ] Every §21.3 state implemented
- [ ] `returnTo` resume flow works and re-fetches eligibility on mount
- [ ] Existing design system used; no new visual language
- [ ] Accessibility: focus trap, ARIA, keyboard, reduced motion, 44px targets
- [ ] Responsive at 480 / 640 / 1024 / 1440

**Testing**
- [ ] All 31 scenarios in §27.2 pass
- [ ] Data-preservation test asserts field-by-field equality
- [ ] T1 regression guard: generic edit cannot change `campaign_type`
- [ ] T10 guard: no payment credentials in any response
- [ ] Revenue guard: community boost never outranks a paid boost

**Security**
- [ ] Threat model §16.2 reviewed line by line
- [ ] `/security-review` run on the diff
- [ ] IPs hashed, never stored raw, on boost records

**Rollout**
- [ ] Feature flags via `PlatformSettings`
- [ ] Soft-launch measurement of the creation gate's block rate
- [ ] Paid-boost CTR monitored when community score enters the sort
- [ ] Each rollout step independently revertible

---

*End of roadmap. Planning artifact only — no application code was modified in producing this document.*
