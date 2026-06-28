# HonestNeed — Campaign System End-to-End Audit & Feature Roadmap
**Date:** 2026-06-20
**Scope:** Full campaign lifecycle — Fundraising (Donation) campaigns + Share-to-Earn (Sharing) campaigns
**Payment model:** Manual / off-platform payments (creator-owned payment handles). This is a features per the inventory.fixed constraint** — every recommendation below assumes funds move directly between donor and creator, *not* through platform-held escrow.

> This document is a critical review, not a cheerleading sheet. It separates **what exists**, **what is broken**, **what needs updating**, **what should be removed**, and **what is missing** — and ends with a recommended feature inventory to make the campaign system feature-complete.

---

## 1. How the system works today (verified flow)

### 1.1 Campaign creation → activation
1. `POST /campaigns` → `CampaignService.createCampaign` — creates a `draft`. Handles two `campaign_type` values: `fundraising` and `sharing`. Parses FormData (goals, payment_methods, location, prayer_config, platforms/budget for sharing).
2. Campaign holds: `goals[]` (multi-meter: `fundraising` / `sharing_reach` / `resource_collection`), `payment_methods[]` (**stored as plain text**), `share_config`, `prayer_config`, `video`, `geographic_scope`, `moderation` (AD-02), `miracle_mode` (RG-19), `virality`, `milestones_celebrated`.
3. `POST /campaigns/:id/publish` → `draft → active`, sets `start_date`/`end_date` (default 30d, clamped 7–365).
4. Lifecycle transitions: `pause`, `unpause`, `complete`, `increase-goal`, soft-`delete`, plus batch variants.

### 1.2 Donation (manual) flow
1. `POST /campaigns/:campaignId/donations` → `DonationController.createDonation` → `TransactionService.recordDonation`.
2. Validates amount ($1–$10,000), active campaign, supporter exists, no self-donation, payment method accepted.
3. Computes `platform_fee_cents` at **20%**, writes a `Transaction` inside a Mongo session (ACID), updates campaign `metrics`, top-level aggregates, and the `fundraising` goal's `current_amount`.
4. **Status is set to `'verified'` immediately** (auto-verified), yet the response says *"Awaiting admin verification."*
5. If a `referralCode` is present, `ShareRewardService.processShareConversion` runs **post-commit, non-fatal** (correct design — reward never rolls back a donation).
6. `completeCampaign` calls `PayoutService.initiatePayout` for the creator.

### 1.3 Share-to-Earn flow
1. `POST /campaigns/:campaignId/share/generate` → referral link + QR.
2. Donor arrives via referral, donates → `processShareConversion` creates a `share_reward` Transaction (`pending_hold`, 30-day hold), deducts `amount_per_share` from `share_config.current_budget_remaining`, auto-disables paid sharing when budget hits 0.
3. Anti-fraud: donation ≥ 10× reward, sharer account ≥ 24h old, self-referral blocked, idempotency on donation id.
4. Sharer withdraws via `/sharer/payout-requests` / `/payouts/request`; creator sees & marks paid via `/campaigns/:campaignId/payouts/:withdrawalId/mark-paid`. Budget reloads via `/campaigns/:campaignId/reload-share` (admin-verified, 20% fee).

---

## 2. 🔴 What needs FIXING (bugs & correctness defects)

These are concrete defects found in the current code, ordered by severity.

### F-1 — Donations auto-verify but the whole platform is built around manual verification *(CRITICAL — core to manual-payment model)*
- `TransactionService.recordDonation` sets `status: 'verified'` on creation ([TransactionService.js:137](src/services/TransactionService.js#L137)) while returning `"Awaiting admin verification."` ([TransactionService.js:390](src/services/TransactionService.js#L390)).
- Consequence: in a **manual-payment** platform the server never sees the money. Auto-verifying means **any logged-in user can inflate any campaign's raised total** by posting fake donations. `proofUrl` is optional and unchecked. This is the single biggest integrity hole in the campaign system.
- `verifyTransaction`/`rejectTransaction` exist and expect `status === 'pending'` — they are effectively dead code for the donation path because nothing is ever pending.
- **Fix:** Default manual donations to `pending`; require creator/admin confirmation ("I received this") to move to `verified`; only count `verified` toward goal `current_amount` and public meters. See U-1 for the verification UX.

### F-2 — `rejectTransaction` does not revert metrics for verified donations
- Revert logic is gated on `if (!wasVerified)` ([TransactionService.js:545](src/services/TransactionService.js#L545)). Since donations are created as `verified` (F-1), rejecting one **never** decrements `metrics.total_donation_amount`, `total_donations`, removes the unique supporter, **or rolls back the goal `current_amount`**. Rejected/charged-back donations leave permanently inflated totals.
- **Fix:** Revert metrics whenever the transaction was counted (i.e., was `verified`), and reverse the `goals.current_amount` increment that `recordDonation` applied.

### F-3 — `increaseGoal` is permanently broken
- It checks `campaign.need_type !== 'fundraising'` ([CampaignService.js:1429](src/services/CampaignService.js#L1429)). `need_type` is the 67-value category enum (`medical_surgery`, `family_rent`, …) and is **never literally `'fundraising'`**. The correct field is `campaign_type`. Result: the endpoint always throws "Goal increase is only available for fundraising campaigns."
- **Fix:** Check `campaign.campaign_type === 'fundraising'` and target the `fundraising` goal in `goals[]` (not blindly `goals[0]`).

### F-4 — `DonationService.getCampaignDonationMetrics` funded % is always 0
- Reads `campaign.goals.goal_amount_cents` ([DonationService.js:394](src/services/DonationService.js#L394)) but `goals` is an **array** with no `goal_amount_cents` field. `goalAmount` is always 0, so `fundedPercentage` is always 0 on this endpoint.
- **Fix:** Resolve the goal the same way `sanitizeCampaignForResponse` does — find the `fundraising` goal and use `target_amount`.

### F-5 — Populate-without-null-guard crashes on deleted users
- `getCampaignDonationAnalytics` dereferences `d.supporter_id._id` / `.full_name` after `.populate` ([DonationService.js:197,213](src/services/DonationService.js#L197)). A donation whose donor was deleted yields `supporter_id === null` → `TypeError`, breaking the entire analytics call. `getDonationById` and `generateDonationReceipt` have the same pattern.
- **Fix:** Null-guard populated refs (`d.supporter_id?._id`) and fall back to "Deleted user".

### F-6 — Two parallel/duplicated donation-metrics implementations diverge
- `getCampaignDonationAnalytics` sums `net_amount_cents` for "raised"; `getCampaignDonationMetrics` sums `amount_cents`; `TransactionService` writes goal progress using `amount_cents` (gross). The numbers a creator sees depend on which endpoint the UI calls.
- **Fix:** Pick one canonical "raised" definition (recommend **gross `amount_cents`** for goal/meter display, with fees shown separately) and route all reads through one service method.

### F-7 — Goal progress double-source of truth
- `current_amount` lives both inside `goals[].current_amount` (updated by `recordDonation`) and is *also* recomputed in `sanitizeCampaignForResponse` from `metrics.total_donation_amount`. If a transaction is rejected/refunded, `goals[].current_amount` is not reversed (F-2), so the two drift.
- **Fix:** Make `goals[].current_amount` a **derived** value recomputed from verified transactions (or reverse it on every status change), and document a single source of truth.

### F-8 — `completeCampaign` initiates a "payout" that doesn't exist under manual payments
- On complete it calls `PayoutService.initiatePayout(campaign._id, creator_id)` ([CampaignService.js:1313](src/services/CampaignService.js#L1313)). Under the manual model the **platform never held the donation money** — donors paid the creator's PayPal/Venmo/bank directly. There is nothing to pay out; at most there is a platform-fee *invoice owed by the creator*. This conflates two different money flows (donation funds vs. platform fees vs. sharer-reward escrow).
- **Fix:** Remove/disable creator donation-payouts for manual fundraising. Replace with (a) a **fee-settlement ledger** (creator owes 20% of verified donations) and (b) keep payout only for the **sharer-reward wallet**, which *is* platform-held (creator pre-funds the share budget).

### F-9 — Platform fee rate is inconsistent with stated policy
- Code applies **20%** to donations (`feeEngine.PLATFORM_FEE_RATE = 0.20`, `TransactionService.platformFeePercent = 0.2`, `DonationController` hardcodes `0.2` / `platform_fee_percentage: 20`). The product feature sheet states **5% on donations** (20% only on share-budget reloads).
- **Fix:** Decide the real policy and make it a **single config value** consumed everywhere (no hardcoded `0.2` in controllers). Today the same fee is computed in at least three places.

### F-10 — Status enum / code mismatches
- `completeCampaign` and `increaseGoal` branch on `status === 'archived'` ([CampaignService.js:1288,1435](src/services/CampaignService.js#L1288)) but the schema enum has **no `archived`** value (`draft|active|paused|completed|cancelled|rejected`). Dead branches; "archive" is referenced but unimplemented.
- **Fix:** Either add `archived` to the enum and implement it, or remove the dead checks.

---

## 3. 🟠 What needs UPDATING (works, but weak / risky / incomplete)

### U-1 — Manual-donation verification UX (the missing half of F-1)
Manual payments need a deliberate confirmation loop the product currently lacks end-to-end:
- Donor submits intent + **proof of payment** (screenshot/reference) — make `proofUrl` effectively required for amounts over a threshold.
- Creator (and/or admin) gets a **"Confirm received / Reject"** queue per campaign. Only confirmed donations count publicly.
- Donor sees status: `pending → confirmed/rejected`, with reason on rejection.
- This turns the already-built (but bypassed) `verifyTransaction`/`rejectTransaction` into the real flow.

### U-2 — Payment method security
- `payment_methods[]` (bank account #, routing #, crypto wallet, CashApp) are **stored and returned as plain text** by explicit design ([CampaignService.js:370,1228](src/services/CampaignService.js#L370)). For a public-facing donate page this is acceptable for *handles* (Venmo @, $cashtag) but **bank account + routing numbers in plaintext** is a real PII/PCI-adjacent risk.
- **Update:** Encrypt at rest, restrict which fields render publicly, and consider dropping raw bank/routing capture in favor of payment links.

### U-3 — Campaign editing is too restrictive
- `updateCampaign` only allows edits in `draft` (`isEditable()` returns `status === 'draft'`). Creators cannot fix a typo, add a payment method, or extend an active campaign. Real platforms allow controlled edits to live campaigns (with audit/version history for trust).
- **Update:** Allow a safe subset of fields to be edited while `active` (description, image, video, adding payment methods, tags) and log changes to `AuditLog`.

### U-4 — Moderation vs. publish are disconnected
- `moderation.review_status` defaults to `pending`, but `publishCampaign` lets a creator go `draft → active` **without any moderation gate**. The trust-&-safety state is recorded but not enforced on visibility.
- **Update:** Gate public listing/donations on `moderation.review_status !== 'rejected'` (and optionally require `approved` for high-risk need types), or auto-approve low-risk and queue the rest.

### U-5 — Share-reward funding model needs to be explicit
- Sharer rewards are platform-held wallet balances funded by the creator's `share_config.total_budget`. Under manual payments the creator must **actually pre-pay** that budget (and the 20% reload fee) before rewards are real money. The reload flow exists (`/reload-share`, admin-verified) but nothing prevents `is_paid_sharing_active: true` with an **unfunded** (or only "intended") budget at creation time ([CampaignService.js:486](src/services/CampaignService.js#L486) sets it active immediately).
- **Update:** Don't mark `is_paid_sharing_active` until a verified reload has actually funded the budget; show sharers "rewards funded ✓" vs "pending funding".

### U-6 — `end_date` is set but not enforced
- Publish computes `end_date`, but no scheduler flips an expired campaign to `completed` or stops accepting donations. `scheduled_activation_at`/`scheduled_activation_job_id` fields exist but there's no visible worker. Campaigns run forever unless the creator manually completes.
- **Update:** Add a cron/worker to auto-complete past `end_date` and reject donations to expired campaigns (`recordDonation` only checks `status === 'active'`, not the date).

### U-7 — Verbose `console.log` / PII in logs
- `listCampaigns`, `createCampaign`, and the payment-method handlers log full objects (including payment fields and emails) at `info`. Noisy and a compliance liability.
- **Update:** Drop to `debug`, redact payment fields, remove raw `console.log`.

### U-8 — Refund/receipt assumptions
- `generateDonationReceipt` hardcodes `taxDeductible: true` and `taxId: 'TBD'` ([DonationService.js:513](src/services/DonationService.js#L513)). Most peer-to-peer manual donations are **not** tax-deductible. Issuing receipts that imply deductibility is a legal risk.
- **Update:** Make deductibility a campaign/org attribute; only claim it when the recipient is a verified 501(c)(3)-type entity.

---

## 4. ⚪ What should be REMOVED / consolidated

- **R-1 — Creator donation-payout path** (`PayoutService.initiatePayout` on complete): conceptually invalid for manual donations (F-8). Remove or convert to fee-settlement.
- **R-2 — Dead `archived` status branches** (F-10): remove until archive is a real feature.
- **R-3 — Duplicate donation-metrics methods** (F-6): collapse `getCampaignDonationAnalytics` + `getCampaignDonationMetrics` + `getDonationAnalytics` into one service with a `scope` param. Three near-identical aggregations are a maintenance trap.
- **R-4 — Hardcoded fee math in `DonationController`** (F-9): remove inline `* 0.2`; use the fee engine.
- **R-5 — Auto-verify line** (F-1): remove `status: 'verified'` default for manual donations.
- **R-6 — Sweepstakes vestiges:** `recordDonation` still references sweepstakes reversal in `rejectTransaction` while the recording path says sweepstakes "disabled." Pick one; remove the half-wired branch to avoid confusion.

---

## 5. 🟢 RECOMMENDED FEATURE INVENTORY (to make the campaign system complete)

Grouped by priority. ✅ = already in codebase (keep/finish), ➕ = new.

### P0 — Integrity & trust (do before launch; manual-payment model demands these)
| ID | Feature | Why it's essential |
|----|---------|--------------------|
| ➕ CF-1 | **Manual donation confirmation queue** (donor proof → creator/admin confirm → counts) | Closes F-1; without it, raised totals are unverifiable/fakeable. |
| ➕ CF-2 | **Proof-of-payment capture** (screenshot/reference upload on donate) | Gives confirmers something to verify; enables dispute resolution. |
| ➕ CF-3 | **Fee-settlement ledger** (track 20%/5% platform fee owed per verified donation; creator pays platform) | Correct money model for manual payments (replaces invalid payouts, F-8). |
| ✅ CF-4 | **Goal/meter recompute from verified-only transactions** | Fixes F-2/F-4/F-7 drift; one source of truth. |
| ➕ CF-5 | **Campaign expiry worker** (auto-complete at `end_date`, block expired donations) | Fixes U-6. |
| ✅ CF-6 | **Moderation gate on publish/visibility** (use existing `moderation.*`) | Fixes U-4; prevents abusive campaigns going live. |
| ➕ CF-7 | **Encrypt payment-method PII at rest; public-safe field whitelist** | Fixes U-2. |

### P1 — Creator & donor experience
| ID | Feature | Notes |
|----|---------|-------|
| ➕ CE-1 | **Controlled live-campaign editing + edit history** | Fixes U-3; builds donor trust via transparency. |
| ➕ CE-2 | **Donor dashboard**: my donations, statuses, receipts, refund requests | Surfaces the data `listDonations`/receipts already produce. |
| ✅ CE-3 | **Campaign updates / progress posts** (`campaignUpdateRoutes` exists) | Keep; ensure surfaced in donor feed (CA-18). |
| ✅ CE-4 | **Comments & encouragement** (CA-15, built) | Keep; add moderation tie-in. |
| ✅ CE-5 | **Milestone celebrations** (CA-19, built) | Keep; trigger only on *verified* totals (depends on CF-1/CF-4). |
| ➕ CE-6 | **Thank-you / receipt automation** with correct deductibility flag | Fixes U-8. |
| ➕ CE-7 | **Withdrawal/refund request flow for donors** (manual, creator-actioned) | Pairs with manual model; uses existing refund service. |

### P2 — Share-to-Earn completeness
| ID | Feature | Notes |
|----|---------|-------|
| ✅ SE-1 | **Funded-budget guard** before `is_paid_sharing_active` | Fixes U-5. |
| ✅ SE-2 | **Sharer rewards wallet + 30-day hold + withdrawal** (built) | Keep; verify hold-release worker exists (analogous to U-6). |
| ➕ SE-3 | **Reward-release worker** (move `pending_hold → available` after 30d) | The hold is set but confirm something releases it. |
| ✅ SE-4 | **Per-campaign share leaderboard & earning potential** (built) | Keep; good virality signal. |
| ➕ SE-5 | **Sharer fraud dashboard** (velocity, duplicate device/IP, conversion anomalies) | Extends existing 24h/10× checks into admin tooling. |
| ✅ SE-6 | **Referral click → visit → conversion analytics** (built) | Keep; ensure attribution survives auth/anon. |

### P3 — Growth & differentiation
| ID | Feature | Notes |
|----|---------|-------|
| ✅ G-1 | **Multi-meter campaigns** (funds + shares + prayer + volunteers, CA-12) | Already strong; make the UI first-class. |
| ✅ G-2 | **Prayer support** (CA-16, built) | Keep; differentiator. |
| ✅ G-3 | **Campaign video** (CA-17, built) | Keep. |
| ✅ G-4 | **Virality / viral-coefficient surfacing** (CA-13) | Keep; show creators their viral loop. |
| ✅ G-5 | **Miracle Mode** emergency boost (RG-19) | Keep; gate behind admin/moderation. |
| ➕ G-6 | **Campaign boosts** ($9.99–$59.99 paid visibility) | Monetization; `is_boosted`/`current_boost_tier` fields already exist — wire purchase + ranking. |
| ➕ G-7 | **Transformation Journey visualization** (CA-20, not built) | Before/after storytelling; P3 per PRD. |
| ➕ G-8 | **QR generation endpoint** (CA-11 partial) | Fields exist; finish dedicated generate route. |

---

## 6. Suggested execution order (the short version)
1. **F-1 + CF-1/CF-2 + F-2** — make manual donations verifiable and reversible. *(Nothing else matters if totals are fakeable.)*
2. **F-3, F-4, F-6/F-7, R-3** — correct goal math & consolidate metrics.
3. **F-8 / CF-3 / R-1** — fix the money model (fee ledger, not fake payouts).
4. **F-9 / R-4** — single fee config; reconcile 5% vs 20% policy.
5. **U-6/CF-5 **, U-4/CF-6, U-2/CF-7** — expiry worker, moderation gate, PII encryption.
6. **SE-1/SE-3/U-5** — make share rewards genuinely funded and releasable.
7. P1/P2/P3 

---
*Generated from a direct read of `Campaign.js`, `CampaignService.js`, `TransactionService.js`, `DonationService.js`, `ShareRewardService.js`, `campaignRoutes.js`, `shareRoutes.js`, and `feeEngine.js`. File-line citations reflect code as of 2026-06-20 and should be re-verified before implementation.*
