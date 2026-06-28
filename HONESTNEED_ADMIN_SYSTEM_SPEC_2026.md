# HonestNeed — Administrative System Specification

**Document type:** Product & Engineering Specification (audit + blueprint)
**Prepared for:** Adepoju Emmanuel, Founder
**Date:** 2026-06-19
**Status:** v1.0 — grounded in a code-level audit of the live backend
**Target launch:** 2026-07-07

> **How to read this document.** Sections 1–4 are the *audit* — what actually
> exists in the codebase today (not what the PRD claims). Sections 5–17 are the
> *blueprint* — the administrative platform HonestNeed needs to operate safely at
> scale over the next five years. Every "Current state" claim is traceable to a
> file path in the repository.

---

## 1. Executive Summary

### 1.1 The headline finding

The PRD (`HONESTNEED_PRD_COMPLETE_2026.md`, §3.12) lists all ten administrative
features AD-01…AD-10 as **🔲 Planned**. **This is wrong.** A code-level audit
found a substantial, already-shipped admin system:

- **4 admin route surfaces** mounted under `/api/admin` — `adminRoutes.js`
  (~30 endpoints), `adminUserRoutes.js` (13 endpoints), `adminFeeRoutes.js`
  (6 endpoints), `adminPrayerRoutes.js` (10 endpoints).
- **6 admin controllers + 3 admin services** (`AdminController`,
  `AdminUserController`, `AdminFeeController`, `AdminPrayerController`,
  `AdminDashboardController`; `AdminService`, `AdminDashboardService`,
  `AdminPrayerService`).
- **Supporting models** already in place: `AuditLog`, `UserReport`, `Alert`,
  `PlatformSettings`, `PlatformContent`, `BroadcastNotification`, `Category`,
  `ActivityLog`, `IdentityVerification`, plus AI assessment stores
  (`AIFraudAssessment`, `AIModerationResult`, `AIGenerationLog`).
- **AI trust-layer services** already built: `AIFraudDetectionService` (risk
  scoring with graceful degradation), `AIModerationService` (approve/flag/block
  with a deterministic fallback), `ProfanityService`.

So the real exercise is **not** "build the admin system from scratch." It is:
**(a) reconcile two divergent admin subsystems that were built in parallel and do
not share data conventions; (b) close genuine trust-&-safety / financial gaps;
and (c) layer enterprise RBAC and AI assistance on top.**

### 1.2 The three problems that matter most

1. **Two admin subsystems with incompatible field conventions.** `AdminService`
   (snake_case: `is_verified`, `is_blocked`, `created_at`, `admin_id`,
   `action_type`) and `AdminDashboardService` (camelCase: `deletedAt`,
   `isSuspicious`, `adminId`, `action`, `timestamp`) operate on the *same*
   collections with *different* field names. The `User` model itself uses a
   third convention (`verified`, `blocked`, `deleted_at`, single `role` string).
   This is not cosmetic — it silently breaks queries and writes (see §2.4).

2. **The audit trail is not trustworthy yet.** `AdminDashboardService.logAuditTrail()`
   writes `{ adminId, action, targetType, targetId, timestamp, isImmutable }`,
   but the `AuditLog` schema *requires* `admin_id`, `action_type`, `entity_id`
   (snake_case). Those writes fail Mongoose validation. Meanwhile the working
   path (`AuditLog.createLog` via `AdminService`) records only a fixed enum of
   ~22 action types and has **no DB-level immutability** — the "immutable audit
   log" is a comment, not a guarantee.

3. **RBAC does not exist beyond a single `admin` flag.** `authorize(['admin'])`
   checks whether the JWT `roles` array contains `'admin'`. The `User` model
   stores a single `role` enum of `['user','creator','admin']`. There is no
   moderator, trust-&-safety, finance, verification, sponsor-manager, or support
   role. Every admin today is effectively a super-admin with full destructive
   power (hard-delete users, edit platform settings, settle fees).

### 1.3 Launch-readiness verdict

| Track | Verdict for 2026-07-07 launch |
|---|---|
| **Core moderation (users, campaigns, reports)** | ✅ Functional; needs the field-convention reconciliation to be reliable |
| **Audit trail** | ⚠️ Must fix before launch — compliance & accountability depend on it |
| **RBAC / least privilege** | ⚠️ Must add at least a `moderator` vs `super_admin` split before onboarding non-founder staff |
| **Financial oversight** | ⚠️ Fee dashboard exists; payout approval, refund, chargeback, and reconciliation workflows are thin |
| **Messaging moderation** | ❌ Largely absent — highest unmitigated trust risk |
| **Sponsor management admin** | ❌ Absent — blocks sponsorship monetization |

---

## 2. Current Administrative System Audit

### 2.1 What is actually deployed

**Route mounting** (`src/app.js`):
```
/api/admin            ← adminUserRoutes.js   (users, reports, statistics)
/api/admin            ← adminRoutes.js        (comprehensive: users, campaigns,
                                               reports, donations, dashboard,
                                               logs, settings, broadcasts,
                                               activity feed, alerts, categories,
                                               content)
/api/admin/prayers    ← adminPrayerRoutes.js  (prayer moderation + analytics)
/api                  ← prayerRoutes.js        (also exposes admin prayer paths)
```
`adminFeeRoutes.js` exposes `/admin/fees/*` (dashboard, outstanding, settle,
settlement-history, report, audit-trail).

> **⚠️ Route collision risk.** `adminUserRoutes.js` and `adminRoutes.js` are
> *both* mounted at `/api/admin` and both define `GET /users`,
> `GET /users/:userId`, `PATCH /users/:userId/verify`, `/block`, `/unblock`,
> `DELETE /users/:userId`, `GET /reports`, etc. Express resolves to whichever
> mounts first (`adminUserRoutes`, line 247), so the second router's duplicate
> handlers (`adminRoutes`, line 248) are **dead code** for overlapping paths.
> Two controllers (`AdminUserController`, `AdminController`) implement the same
> features divergently. This must be consolidated.

### 2.2 Feature inventory that already exists (mapped to AD-xx)

| AD-xx (PRD says) | Reality in code | Evidence |
|---|---|---|
| AD-01 Admin Dashboard | **Built (×2)** — `AdminService.getDashboardStatistics` + `AdminDashboardService.getDashboardOverview` (period-based, with platform health, recent events, alerts) | `adminRoutes.js:416`, `AdminDashboardService.js:19` |
| AD-02 Campaign Moderation Queue | **Built** — list/detail/approve/reject + flag/suspend (camelCase path) | `AdminService.js:253-373`, `AdminDashboardService.js:172,372,405` |
| AD-03 User Management | **Built (×2)** — list/detail/verify/reject/block/unblock/delete/export(GDPR) | `adminUserRoutes.js`, `adminRoutes.js:49-181` |
| AD-04 Financial Oversight Panel | **Partial** — fee dashboard, outstanding, settlement, transaction verify/reject | `adminFeeRoutes.js`, `AdminDashboardService.js:236-509` |
| AD-05 ID+ Verification Queue | **Partial** — user verify/reject exists; `IdentityVerification` model exists; no dedicated review queue UI/workflow surfaced in admin routes | `IdentityVerification.js`, `VerificationController.js` |
| AD-06 Fraud Detection Dashboard | **Partial** — `Alert` model + `AIFraudDetectionService` + alerts endpoints exist; no consolidated fraud dashboard endpoint | `AdminService.js:772`, `AIFraudDetectionService.js` |
| AD-07 Platform Configuration | **Built** — `PlatformSettings` get/update by key | `adminRoutes.js:466-498` |
| AD-08 Content Moderation Tools | **Partial** — CMS content + prayer moderation + `AIModerationService` exist; campaign/comment/message moderation uneven | `AdminService.js:1064`, `AdminPrayerService.js`, `AIModerationService.js` |
| AD-09 Audit Log Access | **Built but defective** — see §2.4 | `AuditLog.js`, `AdminService.js:529`, `AdminDashboardService.js:517` |
| AD-10 Financial Reports & Reconciliation | **Partial** — fee reports + CSV export; no double-entry reconciliation against Stripe | `adminFeeRoutes.js:85`, `AdminDashboardService.js:561` |

**Net:** 4 of 10 are genuinely "done enough," 5 are partial, 0 are truly
"Planned/not-started." The PRD status column should be rewritten.

### 2.3 Beyond AD-xx — admin capabilities the PRD never listed

These exist in code and should be added to the inventory:

- **Broadcast notifications** to user segments (`BroadcastNotification`).
- **Activity feed monitoring** (`ActivityLog`, `getActivityFeed`).
- **Alerts engine** with severity, assignment, resolution (`Alert`).
- **Category management** (CMS for campaign categories).
- **Platform content/CMS** (manifesto, ToS, privacy, publish/unpublish).
- **Prayer moderation suite** — moderation queue, bulk approve/reject/flag,
  spam detection, compliance report/export, per-user prayer blocking,
  profanity testing (`AdminPrayerController`, 10 endpoints).
- **GDPR data export** per user (JSON/CSV).
- **AI fraud assessment + AI content moderation** persisted for audit/appeal.

### 2.4 Defects found during the audit (must-fix list)

| ID | Severity | Defect | Location |
|---|---|---|---|
| **D-1** | 🔴 Critical | `AdminDashboardService.logAuditTrail` writes camelCase fields (`adminId/action/targetType/timestamp`) that violate the snake_case **required** `AuditLog` schema → audit writes throw/fail | `AdminDashboardService.js:517-553` vs `AuditLog.js:18-73` |
| **D-2** | 🔴 Critical | Two routers mounted at same base path with overlapping routes → duplicate, divergent handlers; one set is dead code | `app.js:247-248` |
| **D-3** | 🔴 Critical | Field-convention drift across `User` (`verified/blocked/deleted_at`), `AdminService` (`is_verified/is_blocked`), `AdminDashboardService` (`deletedAt/isSuspicious`) → filters silently match nothing | `User.js:85-94`, `AdminService.js:24-26`, `AdminDashboardService.js:50` |
| **D-4** | 🟠 High | "Immutable" audit log has no DB-level write protection; `isImmutable` is an unenforced field | `AdminDashboardService.js:537` |
| **D-5** | 🟠 High | Single `admin` role = every admin is super-admin; no least privilege | `authMiddleware.js:234`, `User.js:85` |
| **D-6** | 🟠 High | Hardcoded `0.05` platform fee inside dashboard metrics instead of reading `feeEngine`/`PlatformSettings` | `AdminDashboardService.js:59` |
| **D-7** | 🟡 Med | `AuditLog.action_type` is a closed enum (~22 values); new admin actions (fees, alerts, categories, content already in `AdminService`) are not in the enum and will fail validation | `AuditLog.js:25-51` |
| **D-8** | 🟡 Med | Verbose `logger.info` of full token previews & user context on every authenticated request — noisy and a minor secrets-in-logs risk | `authMiddleware.js:25-108` |
| **D-9** | 🟡 Med | Admin endpoints lack rate limiting / step-up auth on destructive actions (hard delete, settle fees, bulk reject) | all admin routers |

---

## 3. Gap Analysis

Gaps are what a Stripe/GoFundMe/Airbnb-grade trust platform needs that
HonestNeed does **not** have yet. Grouped by domain.

### 3.1 Identity & access (enterprise)
- ❌ Granular RBAC (8 roles requested; 1 exists).
- ❌ Permission matrix / department separation.
- ❌ Admin MFA enforcement and admin session monitoring.
- ❌ Step-up (re-auth) for high-risk actions.
- ❌ Admin invite/offboarding lifecycle (provisioning, deactivation).

### 3.2 Trust & safety
- ❌ Unified **risk score** per user/campaign surfaced to admins (signals exist
  in `AIFraudDetectionService` but no admin-facing risk profile view).
- ❌ Multi-account / device-fingerprint / velocity detection.
- ❌ Behavioral fraud analytics (donation bursts, refund abuse, payout farming).
- ❌ Case management: link a report + alert + transactions + user into one case
  with status, owner, SLA, and notes.
- ❌ Appeals workflow for blocked users / rejected campaigns.

### 3.3 Campaign operations
- ⚠️ Approve/reject exist but **no campaign verification workflow** (proof of
  need, document review, beneficiary confirmation).
- ❌ Campaign health monitoring (stalled, suspicious velocity, withdrawal vs.
  spend mismatch).
- ❌ Escalation center (route hard cases to senior reviewers).
- ❌ Quality score driving feed ranking & featured eligibility.

### 3.4 Messaging moderation (largest unmitigated risk)
- ❌ No admin surface over `Conversation`/`Message` at all.
- ❌ No keyword/spam/harassment detection on DMs (off-platform payment lures,
  grooming, extortion of beneficiaries).
- ❌ No conversation flag-review queue.
> Direct messaging on a platform where vulnerable people ask strangers for money
> is the single highest abuse vector. This must not ship unmonitored.

### 3.5 Financial operations
- ⚠️ Fee tracking/settlement exists; **payout approval workflow** is thin.
- ❌ Refund processing UI/workflow (model hints `shouldRefund` but no operator
  flow).
- ❌ Chargeback / dispute center wired to Stripe webhooks.
- ❌ Reconciliation: ledger vs. Stripe balance vs. payouts (double-entry).
- ❌ Fee/rate management UI (rates are partly hardcoded — D-6).

### 3.6 Sponsorship / business operations
- ❌ No admin module for `Sponsorship` / `BusinessProfile` / `BusinessGiveaway`
  approval, ad-placement controls, sponsor analytics, or revenue tracking — yet
  these are monetization surfaces with their own controllers.

### 3.7 Community / gamification operations
- ❌ Volunteer oversight (hour-log verification disputes, reference-letter
  abuse), Hope Responder (Need Now) monitoring, reward/golden-ticket fraud, and
  gamification anti-abuse all lack admin surfaces despite large backends.

### 3.8 Reporting & analytics
- ⚠️ Dashboards exist but are siloed; no exec-level KPI rollups, cohort
  retention, trust KPIs (fraud rate, time-to-moderate, refund rate), or
  scheduled report exports.

---

## 4. Existing Feature Review — keep / fix / re-prioritize / drop

### 4.1 Keep (good foundations)
- `UserReport` model — well-indexed, rich lifecycle methods, severity, stats
  aggregation. Solid.
- `Alert` model — severity, source (incl. `ai_detection`), assignment,
  recommended action. Good basis for a fraud dashboard.
- `AIModerationService` / `AIFraudDetectionService` — graceful degradation and
  persisted results for audit/appeal is exactly right.
- Prayer moderation suite — the most complete moderation workflow in the
  codebase; use it as the **reference pattern** for messaging & campaign
  moderation.

### 4.2 Fix before scale (see §2.4)
- Reconcile field conventions (D-3) — pick **one** (recommend snake_case to
  match `User`, `UserReport`, `AuditLog`) and migrate `AdminDashboardService`.
- Repair audit logging (D-1, D-4, D-7) — single writer, open vocabulary,
  DB-level immutability.
- Collapse the duplicate user/report routers into one (D-2).
- Externalize fee rate (D-6).

### 4.3 Re-prioritize
- **Up:** Messaging moderation (P1→**P0**), RBAC split (P2→**P0** before staff
  onboarding), audit-log fix (**P0**), refund/chargeback (**P0** before
  monetization scale).
- **Down:** Categories CMS and platform-content CMS are P0 in the PRD but are
  low-risk operational niceties — **P2** is fine.

### 4.4 Drop / defer (unnecessary now)
- Multi-language CMS content (`language` param) — defer until i18n is a real
  requirement.
- `check-profanity` admin tester endpoint — useful in dev, not a launch feature;
  keep behind an internal flag.
- Treasure-hunt / miracle-mode gamification admin tooling — defer to Phase 3+.

---

## 5. Recommended Feature Inventory (target state)

Renumbered into modules. Status legend: ✅ exists · ⚠️ partial · ❌ new.

| Code | Feature | Status | Phase |
|---|---|---|---|
| **IAM (Identity & Access)** | | | |
| IAM-01 | Granular RBAC (8 roles) | ❌ | 1 |
| IAM-02 | Permission matrix & department scoping | ❌ | 1 |
| IAM-03 | Admin MFA enforcement | ❌ | 1 |
| IAM-04 | Step-up re-auth for destructive actions | ❌ | 2 |
| IAM-05 | Admin session monitoring & forced logout | ❌ | 2 |
| IAM-06 | Admin lifecycle (invite/suspend/offboard) | ❌ | 2 |
| **CORE (Operations)** | | | |
| OPS-01 | Unified admin dashboard (KPIs) | ⚠️ | 1 |
| OPS-02 | User management (consolidated) | ⚠️ | 1 |
| OPS-03 | Campaign moderation queue | ✅ | 1 |
| OPS-04 | Campaign verification workflow | ❌ | 2 |
| OPS-05 | Campaign escalation center | ❌ | 3 |
| OPS-06 | Audit log (immutable, open-vocabulary) | ⚠️ | 1 |
| OPS-07 | Platform configuration | ✅ | 1 |
| OPS-08 | Broadcast notifications | ✅ | 2 |
| **TNS (Trust & Safety)** | | | |
| TNS-01 | Report/case management center | ⚠️ | 1 |
| TNS-02 | Unified risk profile (user & campaign) | ⚠️ | 2 |
| TNS-03 | Fraud detection dashboard | ⚠️ | 2 |
| TNS-04 | Multi-account & device fingerprinting | ❌ | 3 |
| TNS-05 | Behavioral/velocity anomaly detection | ❌ | 3 |
| TNS-06 | Appeals workflow | ❌ | 2 |
| TNS-07 | ID+ verification review queue | ⚠️ | 1 |
| **MSG (Messaging Moderation)** | | | |
| MSG-01 | Conversation flag-review queue | ❌ | 1 |
| MSG-02 | Keyword/abuse detection on DMs | ❌ | 1 |
| MSG-03 | Spam & off-platform-payment detection | ❌ | 2 |
| MSG-04 | Harassment reporting queue | ❌ | 1 |
| **FIN (Financial Operations)** | | | |
| FIN-01 | Fee dashboard & settlement | ✅ | 1 |
| FIN-02 | Payout approval workflow | ⚠️ | 1 |
| FIN-03 | Refund processing | ❌ | 1 |
| FIN-04 | Chargeback / dispute center | ❌ | 2 |
| FIN-05 | Reconciliation (ledger vs Stripe) | ❌ | 2 |
| FIN-06 | Fee/rate management UI | ⚠️ | 2 |
| FIN-07 | Revenue analytics | ⚠️ | 2 |
| **SPN (Sponsor Management)** | | | |
| SPN-01 | Sponsor approval queue | ❌ | 2 |
| SPN-02 | Sponsor management dashboard | ❌ | 2 |
| SPN-03 | Ad-placement controls | ❌ | 3 |
| SPN-04 | Sponsor analytics & revenue tracking | ❌ | 3 |
| **COM (Community Ops)** | | | |
| COM-01 | Volunteer oversight | ❌ | 3 |
| COM-02 | Need Now / Hope Responder monitoring | ❌ | 2 |
| COM-03 | Reward/gamification anti-abuse | ❌ | 3 |
| COM-04 | Content/CMS & categories | ✅ | 2 |
| **AI (AI-Powered Admin)** | | | |
| AI-01 | AI content moderation assistant | ✅ | 1 |
| AI-02 | AI fraud/risk scoring engine | ✅ | 2 |
| AI-03 | AI case summaries | ❌ | 4 |
| AI-04 | AI admin copilot | ❌ | 5 |
| AI-05 | AI financial anomaly detection | ❌ | 4 |

---

## 6. Administrative Modules (information architecture)

```
HonestNeed Admin Console
│
├── 1. Overview            → OPS-01  KPIs, health, alerts, action queue
├── 2. Users               → OPS-02, TNS-07  list · profile · verify · block · GDPR export
├── 3. Campaigns           → OPS-03/04/05  queue · verify · flag · suspend · escalate
├── 4. Trust & Safety      → TNS-01..06  cases · risk profiles · fraud dashboard · appeals
├── 5. Messaging           → MSG-01..04  flag queue · keyword hits · harassment
├── 6. Finance             → FIN-01..07  fees · payouts · refunds · disputes · reconcile
├── 7. Sponsors & Business → SPN-01..04  approvals · placements · analytics
├── 8. Community           → COM-01..03  volunteers · Need Now · rewards
├── 9. Content & Config    → OPS-07/08, COM-04  settings · CMS · categories · broadcasts
├── 10. Reports & Analytics→ exec KPIs · exports · scheduled reports
└── 11. Admin & Audit      → IAM-01..06, OPS-06  roles · sessions · immutable audit log
```

Each module follows the **prayer-moderation reference pattern** already in the
codebase: a filtered/paginated queue → detail view → single + bulk actions →
every action writes an audit log entry.

---

## 7. Roles & Permissions

### 7.1 Role model change (foundational)

Replace the single `User.role` enum with a **roles array + scoped permissions**.
Keep `role` for the public app (`user`/`creator`), add an `admin_roles` array
and an optional `permissions` override. The JWT already carries `roles` — align
the model to it (fixes the `role` vs `roles` mismatch noted in D-3/D-5).

```js
admin_roles: [{ type: String, enum: [
  'super_admin','operations_admin','moderator','trust_safety_admin',
  'financial_admin','verification_admin','sponsor_manager','support_agent'
]}]
```

### 7.2 Permission matrix

| Capability | Super | Ops | Mod | T&S | Finance | Verify | Sponsor | Support |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| View dashboards | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Verify/reject user ID | ✅ | ✅ | — | ✅ | — | ✅ | — | — |
| Block/unblock user | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| **Hard-delete user** | ✅ | — | — | — | — | — | — | — |
| Approve/reject campaign | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Suspend campaign | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Resolve reports/cases | ✅ | ✅ | ✅ | ✅ | — | — | — | ✅(view) |
| Review messaging flags | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Verify/reject transaction | ✅ | — | — | ✅ | ✅ | — | — | — |
| Process refund | ✅ | — | — | — | ✅ | — | — | — |
| Settle fees / payouts | ✅ | — | — | — | ✅ | — | — | — |
| Approve sponsor/ads | ✅ | ✅ | — | — | — | — | ✅ | — |
| Edit platform settings | ✅ | — | — | — | — | — | — | — |
| Manage admin accounts | ✅ | — | — | — | — | — | — | — |
| View audit log | ✅ | ✅ | — | ✅ | ✅ | — | — | — |
| Broadcast notifications | ✅ | ✅ | — | — | — | — | — | — |

Enforcement: extend `authorize()` into `authorize({ anyOf:[...roles], permission })`
backed by a central permission map, so routes declare *capabilities* not roles.

### 7.3 Admin hardening
- Enforce MFA for any `admin_roles.length > 0` account.
- Step-up re-auth (re-enter password / TOTP) for: hard delete, fee settlement,
  refund, settings edit, admin-account changes.
- Short-lived admin JWTs + server-side admin session registry with forced
  logout. Reduce the per-request token logging in `authMiddleware` (D-8).

---

## 8. Admin Dashboard Architecture

**Overview screen (OPS-01)** — one screen the on-call admin opens each morning:

- **Health band:** active campaigns, 24h transaction volume, platform fees
  (from `feeEngine`, **not** hardcoded), uptime, active users.
  *(reuse `AdminDashboardService.getDashboardOverview`, fix D-6)*
- **Action queue (counts → deep links):** open reports, critical alerts,
  campaigns pending verification, pending transactions, ID+ queue, messaging
  flags, refund/dispute requests, sponsor approvals.
- **Trust KPIs:** fraud-flag rate, median time-to-moderate, refund rate,
  chargeback rate, blocked-user count, appeal backlog.
- **Recent events stream:** new campaigns, large donations (≥$500),
  suspicious transactions, new users *(already implemented)*.

Data contract: a single `GET /api/admin/overview?period=today|week|month`
returning `{ health, actionQueue, trustKpis, recentEvents }`. Every count is a
filtered link into its module queue.

---

## 9. Operational Workflows

### 9.1 Campaign verification (OPS-04, new)
```
Creator submits → AI moderation (AIModerationService) → AI risk score
(AIFraudDetectionService) →
  risk < low  → auto-approve, sample-audited
  risk mid    → manual review queue (proof of need, ID+ check)
  risk high   → escalation center + hold funds
Reviewer: approve | request-info | reject | escalate  → audit log
```

### 9.2 Report → Case lifecycle (TNS-01)
```
User report (UserReport) ┐
System alert  (Alert)    ├─► CASE (owner, SLA, linked entities, notes)
Message flag  (MSG)      ┘
Case states: open → investigating → action_taken → resolved/dismissed
Actions: warn · block user · suspend campaign · refund · escalate · no-action
Every transition → immutable audit entry; subject can appeal (TNS-06)
```

### 9.3 Refund / dispute (FIN-03/04)
```
Trigger: admin reject txn (shouldRefund) | Stripe dispute webhook | user request
→ Finance queue → verify → issue refund via Stripe → ledger entry →
reconciliation marks matched → audit log → notify donor & creator
```

### 9.4 Appeals (TNS-06)
```
Blocked user / rejected campaign → appeal form → appeal queue →
independent reviewer (not original actor) → uphold | overturn → audit log
```

---

## 10. Trust & Safety System

- **Unified risk profile (TNS-02):** surface `AIFraudDetectionService.userSignals`
  /`campaignSignals` (account age, verification badges, trust score, payout vs
  donation ratios, content red-flags) as a single admin-facing score + indicator
  list, with the AI assessment and history attached.
- **Fraud dashboard (TNS-03):** built on `Alert` (`source:'ai_detection'`,
  `confidence_score`, `recommended_action`) — list by severity, assign,
  resolve, with drill-down to the triggering entity.
- **Velocity / multi-account (TNS-04/05):** add device fingerprint + IP/email
  similarity + donation-burst and refund-abuse detectors emitting `Alert`s.
- **Case management (TNS-01):** the connective tissue tying reports, alerts,
  transactions, and messages to one investigable unit with SLA timers.

---

## 11. Financial Management System

- Reuse `AdminFeeController` + `AdminDashboardService` financial methods.
- **Add payout approval (FIN-02):** queue of `Payout`/`Withdrawal` requests with
  KYC + risk gating before release.
- **Add refunds (FIN-03)** and **disputes/chargebacks (FIN-04)** wired to
  `StripeWebhookHandler` — auto-create a Finance case on `charge.dispute.created`.
- **Reconciliation (FIN-05):** nightly job comparing `SettlementLedger` /
  `FeeTransaction` against Stripe balance transactions; surface mismatches as
  critical alerts.
- **Externalize fee rates (FIN-06, fixes D-6):** read from `feeEngine` /
  `PlatformSettings`; expose an admin rate editor (super-admin only, audited).

---

## 12. Messaging Moderation System (new — highest priority gap)

- **MSG-02 detection:** run `AIModerationService.moderateText` (already supports
  `targetType:'message'`) on DMs asynchronously; persist `AIModerationResult`.
- **Off-platform-payment & contact lures:** keyword/regex pack (cashapp, venmo,
  "send to my personal", phone/email patterns) → `Alert` + flag.
- **MSG-01/04 queues:** conversation flag-review and harassment queues modeled
  on the prayer moderation suite (bulk actions + per-user messaging block).
- **Beneficiary protection:** auto-warn users when a counterparty asks to move
  off-platform or requests payment outside a campaign.

---

## 13. Sponsor Management System (new — blocks monetization)

- **SPN-01 approval queue** over `BusinessProfile` + `BusinessVerification`
  (document review, business legitimacy, risk score).
- **SPN-02 dashboard:** sponsor list, status, spend, active `Sponsorship`s and
  `BusinessGiveaway`s.
- **SPN-03 placement controls:** approve/pause ad placements, content standards
  enforcement (run through `AIModerationService`).
- **SPN-04 analytics:** impressions, clicks, conversions, revenue per sponsor →
  feeds Finance revenue analytics.

---

## 14. Analytics & Reporting

- **Exec KPI rollups:** GMV, take-rate, active campaigns, new users, retention
  cohorts, trust KPIs (fraud/refund/chargeback rates, time-to-moderate).
- **Scheduled exports:** reuse CSV export patterns
  (`exportTransactionsToCSV`, prayer/compliance exports) on a schedule with
  delivery + retention.
- **Compliance reporting:** extend the prayer `compliance-report` pattern
  platform-wide (moderation actions, GDPR exports/deletes, financial reconciliation).
- **Data quality prerequisite:** none of this is reliable until D-3
  (field-convention drift) is resolved.

---

## 15. AI-Powered Administration

| Tier | Capability | Build-on |
|---|---|---|
| **Now (exists)** | AI content moderation (approve/flag/block, audited, degrades gracefully) | `AIModerationService` |
| **Now (exists)** | AI fraud/risk scoring with deterministic fallback | `AIFraudDetectionService` |
| **Phase 4** | AI case summaries — auto-summarize a case's reports/alerts/txns for the reviewer | new, over Case model |
| **Phase 4** | AI financial anomaly detection — flag reconciliation/refund/payout anomalies | over `SettlementLedger`/Stripe |
| **Phase 5** | AI admin copilot — natural-language admin queries & recommended actions (read-only first, then guarded actions) | over all modules |

Principle already established in the codebase and worth keeping as policy:
**AI never silently blocks** — it scores and recommends; a human (or an audited
rule) takes the action, and every AI decision is persisted for appeal.

---

## 16. Development Roadmap

### Phase 1 — Critical Launch (before 2026-07-07)
- **Fix D-1/D-2/D-3/D-7:** one audit writer, open-vocabulary actions, single
  consolidated user/report router, one field convention. *(reliability)*
- **RBAC v1 (IAM-01/03):** at minimum `super_admin` vs `moderator` vs
  `financial_admin`; enforce MFA on admins.
- **Messaging moderation v1 (MSG-01/02/04):** async AI scan + flag queue +
  harassment reports. *(non-negotiable trust gate)*
- **Refunds (FIN-03)** + payout approval (FIN-02).
- **Unified overview (OPS-01)** with real fee data (fix D-6).
- **ID+ review queue (TNS-07)** surfaced as a proper queue.

### Phase 2 — Growth (post-launch, ~Q3 2026)
- Campaign verification workflow (OPS-04), appeals (TNS-06).
- Fraud dashboard + unified risk profile (TNS-02/03).
- Disputes/chargebacks (FIN-04), reconciliation (FIN-05), rate UI (FIN-06).
- Sponsor approval + dashboard (SPN-01/02) — gates sponsorship monetization.
- Step-up auth, admin session monitoring (IAM-04/05).

### Phase 3 — Scale
- Multi-account/device fingerprinting + behavioral detection (TNS-04/05).
- Escalation center (OPS-05), ad-placement controls + sponsor analytics
  (SPN-03/04), volunteer & reward anti-abuse (COM-01/03).
- Performance: queue indexing, read replicas for analytics, archived audit
  storage.

### Phase 4 — Enterprise
- AI case summaries (AI-03), AI financial anomaly detection (AI-05).
- Full department separation, advanced compliance/audit exports, SLA dashboards.

### Phase 5 — AI Operations
- AI admin copilot (AI-04): read-only NL querying → then guarded, audited
  actions.

### Gating rules
- **Before public scale:** RBAC, immutable audit, messaging moderation, fraud
  dashboard, case management.
- **Before monetization:** refunds, disputes, reconciliation, fee-rate control.
- **Before mobile launch:** stable admin API contracts (post-D-3), session
  monitoring, push-capable broadcast.
- **Before sponsorship launch:** sponsor approval + placement controls +
  revenue tracking (SPN module).

---

## 17. Final Recommendations

1. **Rewrite the PRD §3.12 status column.** "Planned" is false and is causing
   the team to under-credit (and under-maintain) a real, shipped system.
2. **Stop building; start consolidating.** The biggest risk is not missing
   features — it's two parallel admin subsystems with incompatible data
   conventions and a broken audit trail. Fix D-1/D-2/D-3 first; everything else
   (analytics, RBAC, AI) sits on that foundation.
3. **Treat the audit log as a compliance asset, not a log line.** One writer,
   open vocabulary, DB-level immutability (append-only collection / WORM
   storage), IP + actor + before/after on every admin mutation.
4. **Least privilege before headcount.** The moment anyone other than the
   founder gets admin access, single-role super-admin is a liability. Ship RBAC
   v1 and admin MFA before onboarding moderators.
5. **Do not launch messaging unmonitored.** A money-seeking platform with
   unmoderated DMs to vulnerable people is the highest-severity gap in this
   audit. The `AIModerationService` already supports messages — wire it in.
6. **Reuse the prayer-moderation pattern everywhere.** It is the most complete,
   well-shaped moderation workflow in the codebase. Make it the template for
   messaging, campaigns, and sponsors instead of inventing new shapes.

---

*Prepared from a direct code audit of the HonestNeed backend on 2026-06-19.
Every "Current state / Evidence" reference is a real file path in the
repository. Frontend admin-console implementation (Next.js app at
`Desktop\aniother-1`) is out of scope for this backend-focused specification and
should be planned against the module/IA definitions in §6–§13.*
