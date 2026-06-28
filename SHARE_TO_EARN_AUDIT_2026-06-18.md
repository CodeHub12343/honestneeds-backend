# Share-to-Earn (RG-01) — System Audit & Remediation Plan

**Date:** 2026-06-18
**Feature ID:** RG-01
**PRD status claim:** ✅ Backend Implemented
**Audit verdict:** ⚠️ **Partially implemented, NOT production-ready.** Core money paths are split across two conflicting reward architectures, several controller endpoints call service methods that do not exist, and the frontend dashboard talks to API routes that don't exist on the backend. Several PRD business rules are unenforced.

Scope reviewed:
- Backend: `src/services/ShareService.js`, `src/services/ShareRewardService.js`, `src/controllers/ShareController.js`, `src/routes/shareRoutes.js`, `src/jobs/ProcessShareHolds.js`, `src/services/TransactionService.js` (conversion wiring)
- Frontend (`Desktop\aniother-1`): `app/dashboard/share-rewards/page.tsx`, `api/hooks/useShareEarnings.ts`, related share components

---

## 0. Executive Summary

| Area | State | Severity |
|---|---|---|
| Two parallel reward engines (per-share vs per-conversion) double-counting budget & earnings | Broken | 🔴 Critical |
| Earnings ledger split (ShareRecord sums vs User.wallet) — numbers never reconcile | Broken | 🔴 Critical |
| `requestSharePayout` reads a field the service never returns → payouts always blocked | Broken | 🔴 Critical |
| Controller endpoints call non-existent `ShareService` methods → 500s | Broken | 🔴 Critical |
| Frontend dashboard/hooks call API routes that don't exist (404) | Broken | 🔴 Critical |
| Donation rollback triggered by reward-processing errors | Broken | 🔴 Critical |
| "Atomic" conversion ignores the passed Mongo `session` | Broken | 🟠 High |
| Self-referral prevention (PRD rule) not enforced on conversion | Missing | 🟠 High |
| Real click tracking <100ms + bot/IP fraud at click time | Missing/honor-system | 🟠 High |
| Streak rewards | Missing | 🟡 Medium |
| Min campaign goal ($100) to enable rewards | Not enforced | 🟡 Medium |
| Min withdrawal ($10) inconsistent across paths/UI | Inconsistent | 🟡 Medium |
| Stripe Connect / PayPal / Venmo real payouts | Stubbed (manual records) | 🟡 Medium |

---

## 1. 🔴 CRITICAL — What Is Broken

### 1.1 Two conflicting reward architectures pay (and deduct budget) twice
There are **two independent reward engines** that both fire and both deduct the campaign share budget:

1. **Per-share, honor-system** — `ShareService.recordShare()`
   - On every share it immediately sets `is_paid: true`, `status: 'completed'`, `reward_amount = amount_per_share`, and **deducts `current_budget_remaining` right away** (`ShareService.js:162-265`).
   - Earnings are then computed by summing `ShareRecord.reward_amount` (`getUserAvailableEarnings`, `ShareService.js:1625-1673`).

2. **Per-conversion, hold-based** — `ShareRewardService.processShareConversion()`
   - When a referred donation lands (`TransactionService.js:277`), it creates a **separate** `Transaction(type: 'share_reward', status: 'pending_hold')` and **deducts the budget AGAIN** (`ShareRewardService.js:235-393`).
   - That reward later lands in `User.wallet.available_cents` via the holds job.

**Impact:** A single share that converts is paid twice and the creator's budget is debited twice. The two systems also disagree on *when* a user earns (at share time vs at verified conversion). The PRD intends **per verified conversion**, so the honor-system path in `recordShare` is the incorrect one.

### 1.2 Earnings ledger is split and never reconciles
- `getUserAvailableEarnings` / `getUserEarnings` compute balance from **`ShareRecord` sums**.
- `ProcessShareHolds.approveReward` credits **`User.wallet.available_cents`** and `stats.total_earned` (`ProcessShareHolds.js:177-186`).
- Nothing reads `User.wallet.available_cents` back into the earnings endpoints.

**Impact:** The number a user sees as "available" depends on which endpoint is hit, and the wallet credited by the hold job is effectively invisible to the withdrawal math. Payout authorization and displayed balances will be wrong.

### 1.3 Payouts are always blocked (wrong field read)
`ShareController.requestSharePayout` checks:
```js
const availableEarnings = userEarnings.data?.verified_earnings_cents || 0; // ShareController.js:1880
```
But `ShareService.getUserEarnings` returns `{ total, withdrawn, pending, available, byPlatform }` — **there is no `verified_earnings_cents`**. So `availableEarnings` is always `0` and every payout request fails with `409 Insufficient earnings`.

### 1.4 Controller endpoints call service methods that don't exist
`ShareController` references these methods, **none of which are defined in `ShareService.js`**:
- `ShareService.getShareStats` → `GET /campaigns/:id/shares/stats`
- `ShareService.getShareMetrics` → `GET /campaigns/:id/share-metrics`
- `ShareService.recordReferralClick` → `POST /referrals/:token/click`
- `ShareService.listUserShares` → `GET /shares`
- `ShareService.getPlatformShareStats` → `GET /shares/stats`
- `ShareService.getReferralHistory` → `GET /referrals/history`

**Impact:** Each of these endpoints throws `TypeError: ShareService.<x> is not a function` → **HTTP 500**.

### 1.5 Frontend ↔ backend route mismatches (dashboard is non-functional)
The sharer dashboard and hooks call endpoints that **do not exist** on the backend:

| Frontend call | Backend reality |
|---|---|
| `GET /api/sharer/rewards` (`share-rewards/page.tsx:68`) | No such route. Closest is `/api/sharer/earnings/available` |
| `POST /api/sharer/payout-requests` (`page.tsx:78`) | Route is `POST /api/payouts/request` |
| `POST /campaigns/:id/shares` (`useShareEarnings.ts:149`) | Record route is `POST /campaigns/:id/share` (singular); plural is GET-only |
| `POST /share-payouts/request` (`useShareEarnings.ts:185`) | Route is `/api/payouts/request` |
| `GET /campaigns/:id/share-earnings` | Not defined |
| `GET /campaigns/:id/share-earning-potential` | Not defined |
| `GET /campaigns/:id/share-leaderboard` | Not defined (leaderboard is `/share/leaderboard`, not campaign-scoped) |
| `GET /user/share-campaigns` | Not defined |

Also the dashboard expects a response shape (`summary.verified_cents`, `verified_rewards[]`, `pending_rewards[]`, `hold_days_remaining`) that **no backend endpoint returns**. `ShareRewardService.getPendingRewards()` produces something close but is **not wired to any route**.

**Impact:** The Share Rewards dashboard renders the error/empty state in production; payout submission 404s.

### 1.6 Reward-processing errors roll back legitimate donations
In `TransactionService.recordDonation`, if `processShareConversion` returns `{ success:false }` or throws, the code does `throw new Error('SHARE_REWARD_FAILED'/'SHARE_CONVERSION_ERROR')` (`TransactionService.js:303-310`), which aborts the **entire donation transaction**.

**Impact:** A bug or transient failure in the *reward* path can reject a *donor's payment*. Reward attribution must never be able to fail a donation.

---

## 2. 🟠 HIGH — What Needs Fixing

### 2.1 Conversion path is not actually atomic
`TransactionService` passes `session` into `processShareConversion`, but `ShareRewardService.processShareConversion` **never destructures or uses `session`** — `rewardTransaction.save()`, `shareRecord.save()`, and `Campaign.findByIdAndUpdate` all run outside the session (`ShareRewardService.js:37-45, 260, 285, 374`). If the donation rolls back, the reward + budget deduction persist.

### 2.2 Self-referral not prevented (PRD business rule)
PRD: "Sharers cannot self-refer." `processShareConversion` never compares the donor (`supporterId`) against the sharer (`shareRecord.supporter_id`). A user can share their own link, donate, and pay themselves a reward from the creator's budget.

### 2.3 No real click tracking / fraud at click time
PRD requires unique click tracking <100ms with duplicate-click/IP/bot detection. Today:
- `recordShare` marks shares `status: 'completed'` instantly (honor system, `ShareService.js:200`).
- Click endpoints (`recordReferralClick`) partly delegate to `ReferralUrlService`, but the controller-level `ShareService.recordReferralClick` is **missing** (see 1.4).
- The only rate control is 10 shares/IP/campaign/hour; there is no per-click dedupe or bot heuristic at the moment of click.

### 2.4 Inconsistent withdrawal field names in the service itself
- `getUserEarnings` computes withdrawn from `w.amount_cents` (`ShareService.js:983`).
- `getUserAvailableEarnings` computes withdrawn/reserved from `w.amount_requested` (`ShareService.js:1654-1661`).

One of these is reading a non-existent field depending on the `ShareWithdrawal` schema, so withdrawn/available will be wrong in at least one path.

### 2.5 Eligibility gating is inconsistent
`processShareConversion` requires `campaign.campaign_type === 'sharing'` (`ShareRewardService.js:121`), but `recordShare` pays regardless of campaign type. The two engines disagree on what makes a campaign eligible.

---

## 3. 🟡 MEDIUM — Needs Improvement / Unbuilt PRD Items

- **Streak rewards** ("bonus % for consecutive days sharing") — not implemented anywhere.
- **Min campaign goal $100** to enable share rewards — not enforced at config or share time.
- **Min withdrawal $10** — enforced in `requestWithdrawal` (`ShareController.js:870`) but **not** in `requestSharePayout`; the frontend `PayoutRequestModal` advertises **Min $0.10** (`page.tsx:463`). Three sources of truth, all different.
- **Real payouts (Stripe Connect / PayPal / Venmo)** — `requestSharePayout`/`PayoutService` only create manual pending records and a `PaymentMethod` with `provider: 'manual'`. No actual Stripe Connect transfer. PRD lists Stripe Connect/PayPal/Venmo.
- **Leaderboard** — exists (`getLeaderboard`) but is global, not campaign-scoped as the frontend hook assumes; `userName` reads `display_name` while other code uses `name` — verify the User field.
- **Real-time earnings (<30s)** — frontend polls every 30–60s (OK), but since the underlying endpoints 404, it's moot until wiring is fixed.
- **Dead/commented sweepstakes code** in `ShareService` (`:350-351, 866-905`) should be removed for clarity.
- **Excessive `console.log` PII/financial logging** in `getUserAvailableEarnings`/`getUserBalanceByCampaign` — strip before production.

---

## 4. Recommendations (in priority order)

**Decision required first:** pick **one** reward model. Recommended: **per-verified-conversion with 30-day hold** (matches PRD intent, fraud story, and the holds job that already exists).

### Phase 1 — Stop the money bugs (must fix before launch)
1. **Remove paid logic from `recordShare`.** Make shares free engagement events only (`is_paid: false`, no budget deduction). Let `ShareRewardService.processShareConversion` be the *sole* place rewards/budget are touched. Fixes 1.1 and 1.2.
2. **Single earnings source of truth.** Standardize on `User.wallet` (credited by the holds job) for "available", and `Transaction(share_reward, pending_hold)` for "pending". Rewrite `getUserEarnings`/`getUserAvailableEarnings` to read these. Fixes 1.2/1.3.
3. **Fix `requestSharePayout`** to read the corrected available balance; enforce the $10 minimum here too. Fixes 1.3.
4. **Make conversion non-fatal to donations.** In `TransactionService`, wrap reward processing so failures log + queue a retry but never throw/rollback the donation. Fixes 1.6.
5. **Honor the session** in `processShareConversion` (accept `session`, pass to all writes) — or explicitly run rewards *after* commit via an event/outbox. Fixes 2.1.

### Phase 2 — Restore endpoints & integration
6. **Implement the missing `ShareService` methods** (1.4) or remove the dead routes.
7. **Reconcile frontend ↔ backend routes** (1.5): align paths and add a real `GET /api/sharer/rewards` returning the `{ summary, verified_rewards, pending_rewards }` shape the dashboard expects (wire `getPendingRewards` + verified rewards). Fix `POST /campaigns/:id/share` (singular) in the hook.
8. **Standardize `ShareWithdrawal` field usage** (`amount_cents` vs `amount_requested`) across the service (2.4).

### Phase 3 — Enforce PRD rules & fraud
9. **Self-referral check** in `processShareConversion` (donor ≠ sharer). (2.2)
10. **Real click tracking**: persist clicks with dedupe (IP + referral_code + short window) and bot UA heuristics; keep it <100ms by writing async/fire-and-forget. (2.3)
11. **Min campaign goal $100** gate at share-config enable time. (3)
12. **Single min-withdrawal constant ($10)** shared by backend + surfaced to the UI. (3)

### Phase 4 — Complete the feature
13. Streak rewards engine. (3)
14. Real Stripe Connect / PayPal payout execution (replace manual stubs). (3)
15. Campaign-scoped leaderboard endpoint to match the hook; confirm `display_name` vs `name`. (3)
16. Remove dead sweepstakes code and financial `console.log`s. (3)

---

## 5. Suggested Test Coverage (currently a gap)
- Convert one referred donation → exactly **one** reward, budget debited **once**, hold created.
- Self-referral attempt → no reward.
- Donation succeeds even when reward processing throws.
- Payout allowed only when available ≥ $10 and ≤ available; balance decremented/reserved correctly.
- Budget-exhaustion auto-disables paid sharing exactly once (no negative budget).
- Frontend dashboard renders real data against the new `/api/sharer/rewards` contract.

---

*Generated by code audit of backend (`HONESTNEED-WEB-APPLICATION`) and frontend (`Desktop\aniother-1`) on 2026-06-18. Line references reflect the working tree at audit time.*
