# Share-to-Earn — Trust-Based Flow (Recommended Design + Implementation Plan)

**Date:** 2026-06-22
**Author:** Design spec for HonestNeed Share-to-Earn rework
**Status:** Proposed — not yet implemented
**Scope:** Replace the platform-escrow Share-to-Earn model with a **trust-based, creator-settled** model.

---

## 1. Goal & Philosophy

Today Share-to-Earn is an **escrow model**: the platform takes a 20% fee, holds the
reward money, requires admin-verified budget reloads before activation, and holds each
reward for 30 days before it becomes withdrawable.

The new model is **trust-based / peer-settled**:

- The platform is a **ledger and tracking system**, not a money custodian.
- **No platform fee** on Share-to-Earn.
- The creator declares a budget + per-share reward **in the campaign wizard**, and paid
  sharing is **active immediately** — no admin reload, no funding gate.
- When a sharer requests a payout, **the creator pays them directly, off-platform**
  (bank transfer, mobile money, etc.), then **confirms the payment** against the
  tracked share/conversion evidence for that sharer on that campaign.
- The sharer confirms receipt, closing the loop.

The platform's job is to make this **verifiable and honest**: accurate tracking of who
shared what, which shares converted, what is owed, who has been paid, and how reliably
each creator settles.

> **Trade-off accepted (for now):** the platform does not guarantee sharer payment. Trust
> is enforced socially via **transparency + a creator reliability reputation**, not via
> escrow. This is explicitly a v1 "trust-based" stage; an escrow/managed-payout option can
> be layered on later.

---

## 2. Current vs. New (Delta)

| Concern | Current (escrow) | New (trust-based) |
|---|---|---|
| Platform fee | 20% on every budget reload | **0% — removed** |
| Budget setup | `requestShareBudgetReload` → admin `verifyShareBudgetReload` | Set in **campaign wizard**, instant |
| Activation | Only after funded balance ≥ reward AND goal ≥ $100 | **Active on save** when `amount_per_share > 0` and budget declared |
| "Funded" money | `current_budget_remaining` = real escrowed money | Budget is a **declared liability pool**, not held money |
| Reward on conversion | `Transaction` status `pending_hold`, 30-day hold | `Transaction` status **`owed`** (claimable immediately) |
| Hold release | `ProcessShareHolds` cron flips `pending_hold → approved` | **No money hold**; cron repurposed/retired |
| Payout | Admin/platform processes payment | **Creator pays sharer directly** + confirms |
| Receipt | n/a | **Sharer confirms received** |
| Trust mechanism | Escrow guarantees money | **Creator reliability score + full tracking transparency** |

---

## 3. New End-to-End Flow

### Phase A — Creator sets up Share-to-Earn (in the campaign wizard)
1. In the wizard's Share-to-Earn step, the creator enters:
   - **Reward per converting share** (`amount_per_share`, cents) — capped at $100/share.
   - **Total reward budget** (`total_budget`, cents) — the pool they commit to pay out.
2. On save, the system sets `share_config`:
   - `amount_per_share`, `total_budget`
   - `committed_budget_remaining = total_budget` (new liability counter, see §5)
   - `is_paid_sharing_active = true` **immediately** (no admin, no reload).
3. Disclaimer shown + stored: *"You agree to pay sharers directly from this budget when
   they request payout. HonestNeed tracks shares and payments but does not hold or
   guarantee funds."* (consent timestamp recorded.)

### Phase B — Sharer shares (unchanged mechanics)
4. Sharer hits `POST /campaigns/:id/share` → `ShareRecord` with unique `referral_code`.
5. Visitor clicks referral link → `referral/click` records visit in `ReferralTracking`.

### Phase C — Conversion → reward owed
6. Visitor donates carrying the `referral_code`; donation is verified.
7. Post-commit, `verifyTransaction` calls `ShareRewardService.processShareConversion`.
8. Anti-fraud gauntlet still runs (self-referral block, account-age ≥ 24h, donation ≥ 10×
   reward, idempotency, campaign match, active + budget remaining).
9. A reward `Transaction` is created:
   - `transaction_type: 'share_reward'`, `platform_fee_cents: 0`,
   - **`status: 'owed'`** (no hold), `creator_id` = who must pay.
   - `committed_budget_remaining -= amount_per_share`; auto-disable paid sharing when it
     hits 0.

### Phase D — Sharer requests payout
10. Sharer views `GET /sharer/rewards` (owed + paid totals, per campaign) and requests a
    payout via `POST /sharer/payout-requests`.
11. A `ShareWithdrawal` is created with `campaign_withdrawals[]` slices — **one slice per
    campaign**, each owned by that campaign's creator. (Model already supports this.)

### Phase E — Creator confirms & pays (the trust core)
12. Creator opens **their campaign's sharer-payout queue** → sees each pending claim.
13. For a claim, creator opens the **tracking proof view** for that sharer on that
    campaign (new endpoint, §5): the sharer's shares, channels, clicks, the converting
    donations (id + amount + date), and the exact reward owed. This is what the creator
    inspects to decide the claim is legitimate.
14. Creator pays the sharer **off-platform**, then marks the slice:
    - `status: 'paid'`, `paid_by`, `paid_at`, `transaction_reference`,
      `payment_proof_url` (optional screenshot).
    - Corresponding reward `Transaction`(s) flip `owed → paid`.
    - Or `cancelled`/disputed with a reason.

### Phase F — Sharer confirms receipt
15. Sharer confirms via `POST /sharer/payouts/:withdrawalId/campaigns/:campaignId/received`
    → `received_at` set. When **all** slices are `paid` + received, the parent
    `ShareWithdrawal.status → completed`.
16. The exchange updates the **creator reliability score** (§4.1).

---

## 4. Recommended Additions (to make it complete & safe)

These are my recommendations on top of your described flow — they keep it trust-based but
close the gaps that would otherwise make it exploitable or confusing.

### 4.1 Creator Reliability / Reputation (the trust signal)
Since money isn't escrowed, sharers need a way to judge risk **before** sharing.
- Track per creator: `payouts_confirmed`, `payouts_pending`, `payouts_disputed`,
  `avg_time_to_pay_hours`, `on_time_rate`.
- Surface a **"Creator pays reliably" badge / score** on the campaign page and in the
  share CTA. New creators start as "Unrated."
- Derived from `ShareWithdrawal` slice transitions; recomputed on each confirm/receive.

### 4.2 Budget as a liability ledger (not escrow, but still tracked)
- Keep decrementing `committed_budget_remaining` as rewards accrue so the creator sees
  outstanding liability and the campaign auto-stops rewarding when the pool is exhausted.
- Show creators a **"You owe $X to N sharers"** banner. Prevents runaway promises.
- Allow the creator to **top up** the declared budget anytime (instant, no admin) to keep
  sharing active.

### 4.3 Keep anti-fraud, drop money-hold
- The 30-day hold existed for chargeback protection on escrowed money. With no escrow it's
  unnecessary friction → **reward is `owed` immediately**.
- BUT keep the cheap fraud checks (self-referral, account age, donation/reward ratio,
  idempotency). They protect the *creator* from paying for fake conversions.
- Optional: a short **creator review window** (e.g. allow the creator to dispute a
  specific conversion as fraudulent before it's payable) instead of a blanket hold.

### 4.4 Dispute path
- Add a `disputed` state on a `campaign_withdrawals` slice (creator) and an
  appeal/`disputed` flag on the sharer side.
- Disputes are visible to admin for **optional** mediation (admin advises, does not pay).

### 4.5 Notifications
- Sharer: "Your share converted — $X owed", "Payout marked paid — confirm receipt".
- Creator: "New payout request", "You owe $X", unpaid-claim reminders
  (`last_reminder_at`/`reminder_count` already in the model).

### 4.6 Transparency / disclaimers
- Explicit creator consent at wizard setup (stored with timestamp).
- Sharer-facing copy on every campaign: *"Rewards are paid directly by the campaign
  creator. HonestNeed tracks and verifies shares but does not hold or guarantee these
  funds."*

---

## 5. Data Model Changes

### `Campaign.share_config` (src/models/Campaign.js)
- **Repurpose** `current_budget_remaining` → rename intent to **declared liability pool**.
  Recommend adding `committed_budget_remaining` (or reuse `current_budget_remaining` with
  new semantics) seeded from `total_budget` at setup.
- Add `committed_total` (cumulative rewards accrued) for reporting.
- Add `creator_payout_consent_at` (Date) — wizard disclaimer acceptance.
- **Drop reliance on** `total_budget_allocated` (was "funded gross from reloads").
- Keep `amount_per_share`, `is_paid_sharing_active`, `share_channels`.

### `Transaction` (src/models/Transaction.js)
- Extend `status` enum with **`owed`** and **`paid`** (Share-to-Earn lifecycle),
  keeping legacy `pending_hold`/`approved` for back-compat during migration.

### `ShareWithdrawal` (src/models/ShareWithdrawal.js) — **already mostly ready**
- `campaign_withdrawals[]` already has `status` (`pending|paid|cancelled`), `paid_by`,
  `paid_at`, `transaction_reference`, `payment_proof_url`, `received_at`, reminders.
- Add `disputed` to the slice `status` enum + `dispute_reason`.

### `User` (or new `CreatorReliability` doc)
- Add reputation counters from §4.1.

---

## 6. Implementation Flow (file-by-file, phased)

### Phase 1 — Remove fee & escrow gating (backend) — ✅ DONE (2026-06-22)
> Implemented: `ShareService.requestShareBudgetReload` is now an instant, fee-free
> top-up (no 20% fee, no admin); `verifyShareBudgetReload`/`rejectShareBudgetReload`
> return 410 (deprecated). `ShareConfigService.updateShareConfig`/`enablePaidSharing`
> activate on `amount_per_share > 0 && committed_budget_remaining >= amount_per_share`
> (no funded-balance gate, no $100 goal floor — matches wizard creation).
> `getFundingStatus` simplified to `active|paused|exhausted|inactive`. Frontend
> `ShareBudgetReloadModal` updated (fee removed, instant copy).
> **⚠️ Still required for rewards to actually accrue: Phase 2** —
> `ShareRewardService.processShareConversion` still reads/writes the legacy
> `current_budget_remaining` (always 0 now), so conversions return "budget
> exhausted" until it's switched to `committed_budget_remaining` + status `owed`.

1. **`src/services/ShareService.js`**
   - `requestShareBudgetReload()` (L357): remove `PLATFORM_FEE_PERCENTAGE` math; either
     retire the endpoint or repurpose it as an **instant budget top-up** (no admin, no
     fee) that adds to the declared pool and re-activates sharing.
   - `verifyShareBudgetReload()` / `rejectShareBudgetReload()` (L456/L561): **deprecate**
     (admin no longer gates funding). Keep as no-ops/410 during migration.
2. **`src/services/ShareConfigService.js`**
   - `updateShareConfig()` (L53): activation no longer requires funded balance — set
     `is_paid_sharing_active = true` once `amount_per_share > 0` and a budget is declared.
     Remove `INSUFFICIENT_FUNDED_BUDGET` and the funded-vs-declared split. Decide whether
     to keep the `MIN_GOAL_TO_ENABLE_REWARDS_CENTS` ($100 goal) gate — **recommend keep**
     as a sanity floor, but it's optional per your "everything activates" ask.
   - `enablePaidSharing()` (L304): drop the `INSUFFICIENT_FUNDED_BUDGET` check.
   - `getFundingStatus()` (L23): simplify to `active | paused | exhausted | inactive`.

### Phase 2 — Reward becomes "owed", no hold — ✅ DONE (2026-06-22)
> Implemented: `Transaction.status` enum gained `owed`/`paid` (legacy
> `pending_hold`/`approved` kept). `processShareConversion` now spends against
> `committed_budget_remaining`, increments `committed_total`, creates the reward
> as `owed` (no `hold_until_date`/`hold_reason`), and auto-pauses when the pool
> can't cover another reward — all fraud checks retained. Earnings ledger
> (`getEarningsLedger`) + all sharer balance reads (`getUserEarnings`,
> `getUserCampaignEarnings`, `getSharerRewardsDashboard`, `getShareStats`,
> `getPendingRewards`) now recognise `owed`/`paid`; available = owed − in-flight −
> legacy-withdrawn. Budget reads/writes off the legacy field were migrated:
> `campaignEngagementController` (updateShareBudget + share-budget meter),
> `CampaignPayoutController` owed-ledger, `SpamDetectionService` clawback,
> `AdvancedAnalyticsService`. `DonationController` success copy de-holded.
> `ProcessShareHolds` retained as legacy-drain-only (documented). Result:
> conversions now actually accrue and surface as claimable sharer balance.

3. **`src/services/ShareRewardService.js`**
   - `processShareConversion()` (L40): set reward `status: 'owed'` (drop `pending_hold`,
     `hold_until_date`, `hold_reason`). Keep `platform_fee_cents: 0`. Keep all fraud
     checks. Decrement `committed_budget_remaining`; auto-disable when exhausted.
4. **`src/jobs/ProcessShareHolds.js`**: retire or repurpose (no money hold to release).

### Phase 3 — Wizard activation (frontend + backend) — ✅ DONE (2026-06-22)
> Wizard create + backend persistence of `share_config` + `creator_payout_consent_at`
> landed in Phase A; the post-creation editor goes through the trust-based PUT
> `/share-budget` (Phase 2). This phase finished the creator-facing setup UI:
> the "🚀 Share-to-Earn setup" card (`ShareSetupChecklist`) now reads
> `committed_budget_remaining` and reframes step 2 ("Set your reward budget —
> instant, fee-free, you pay sharers directly"; no admin reload / "not real
> money"); `ShareBudgetSetupSection` fee breakdown shows **$0 fee / full budget =
> reward pool**; `ShareBudgetReloadModal` (Phase 1) already de-feed. Activation is
> immediate (set reward + budget → live).
> **Follow-ups since done:** (a) added the missing **GET `/campaigns/:id/share-budget`**
> (`CampaignEngagementController.getShareBudget`, public) returning trust-based
> `{ totalBudget, usedBudget, remainingBudget, amountPerShare, isPaidSharingActive }`
> so `ShareBudgetBadge` renders. (b) **Post-creation consent**: `updateShareBudget`
> now accepts `payout_consent`, persists `creator_payout_consent_at`, and BLOCKS
> activation (`PAYOUT_CONSENT_REQUIRED`) until consent exists; `ShareSetupChecklist`
> shows a consent checkbox at the activate step for campaigns that didn't consent
> via the wizard, and passes `payout_consent: true`.

5. **Campaign wizard** (`Desktop\aniother-1` — Next.js): add/confirm a Share-to-Earn step
   capturing `amount_per_share` + `total_budget`, with the consent disclaimer; on submit,
   call `PUT /campaigns/:id/share-config`. (Wizard step files live alongside
   `components/campaign/wizard/Step2BasicInfo.tsx`.) Use `apiClient` per the project's
   apiClient convention.
6. **Backend create/update campaign**: persist `share_config` + `creator_payout_consent_at`
   on creation so sharing is live the moment the campaign is.

### Phase 4 — Creator-settled payout queue — ✅ DONE (2026-06-22)
> Built on the existing `CampaignPayoutController` (not ShareController — that's
> where the creator queue already lived). **Critical fix:** `PayoutService.allocateAcrossCampaigns`
> matched only `status:'approved'` → trust-model `owed` rewards were invisible and
> sharers couldn't even request a payout; now matches `{$in:['owed','approved']}`.
> **Settlement wiring:** `markPayoutAsPaid` now flips the sharer's `owed` rewards
> for that campaign → `paid` (oldest-first, up to the slice amount, via
> `settleOwedRewards`) and decrements `metrics.total_share_rewards_pending` — so
> the earnings ledger and owed-liability stay correct. **New endpoints:**
> `GET /campaigns/:campaignId/sharers/:sharerId/tracking` (proof view: shares,
> clicks, conversions, converting donations, owed/paid totals) and
> `POST /campaigns/:campaignId/payouts/:withdrawalId/dispute` (creator contests a
> slice → slice `disputed` + reason + sharer notification). `ShareWithdrawal`
> slice enum gained `disputed` + `dispute_reason`/`disputed_at`/`disputed_by`.
> Frontend hooks added: `useSharerTracking`, `useDisputePayout` (mark-paid already
> wired). Existing sharer routes (`/sharer/payout-requests`, `/sharer/payouts`,
> `.../received`) reused unchanged. Full loop now works: owed → request → creator
> inspects tracking → pays + marks paid (owed→paid) or disputes → sharer confirms.

7. **`src/controllers/ShareController.js` + `src/routes/shareRoutes.js`**: add
   creator-facing endpoints:
   - `GET /campaigns/:campaignId/payout-requests` — list pending sharer claims for the
     creator's campaign.
   - `GET /campaigns/:campaignId/sharers/:sharerId/tracking` — the **proof view**: shares,
     clicks, converting donations, reward owed (build on `ReferralTracking` +
     `ShareRecord` + reward `Transaction`s).
   - `POST /campaigns/:campaignId/payout-requests/:withdrawalId/confirm` — creator marks
     the slice `paid` (+ proof/reference); flips reward `Transaction`s `owed → paid`.
   - `POST .../dispute` — creator disputes a claim with reason.
   - Authorize all by `campaign.creator_id === req.user`.
8. Reuse existing sharer-side routes: `POST /sharer/payout-requests`, `GET /sharer/payouts`,
   `POST /sharer/payouts/:withdrawalId/campaigns/:campaignId/received`.

### Phase 5 — Reliability & notifications — ✅ DONE (2026-06-22)
> **Reliability:** `User.creator_reliability` counters added (payouts_confirmed/
> received/disputed, total_pay_time_hours, on_time_count, total_paid_cents,
> last_payout_at). New `CreatorReliabilityService` records on settle
> (`markPayoutAsPaid` → recordPaid with on-time-within-7d), dispute
> (`disputePayout` → recordDisputed), and receipt (`confirmPayoutReceived` →
> recordReceived); `getScore` derives a 0–100 score + rating/label
> (unrated→building→fair→good→excellent, unrated < 3 payouts). Exposed on the
> campaign payload via `getDetail` (`campaign.creator_reliability`). Frontend:
> `CreatorReliabilityBadge` rendered in the campaign hero by the creator name.
> **Notifications** (existing `Notification` model, enum extended with
> `payout_disputed`/`payout_requested`/`share_reward_owed`): sharer gets
> `share_reward_owed` on conversion (ShareRewardService); each creator gets
> `payout_requested` when a sharer claims (PayoutService.createPayoutRequest);
> `payout_sent`/`payout_disputed`/`payout_received` already fire from Phase 4.
> Note: the `payout_disputed` enum value was missing — Phase 4 disputes would
> have failed validation; fixed here.

9. Reputation counters (§4.1) updated on confirm/receive; expose via campaign payload.
10. Notifications (§4.5) using the existing `Notification` model.

### Phase 6 — Migration & cleanup — ✅ DONE (2026-06-22)
> **Migration script:** `src/scripts/migrate-share-to-earn-trust-based.js` (dry-run
> default, `--apply` to write, `--keep-holds` to skip Part B). Part A migrates
> legacy campaigns via a raw-collection pipeline update (avoids Mongoose applying
> schema defaults, so it's truly idempotent): committed_budget_remaining =
> current_budget_remaining ?? total_budget; total_budget := that pool;
> committed_total = 0; is_paid_sharing_active recomputed; back-fills
> creator_payout_consent_at for already-active campaigns. Part B flips
> `pending_hold` rewards → `owed` and clears hold fields. **Cleanup:** no admin
> reload UI exists in the frontend (only creator-side top-up, already trust-based);
> backend verify/reject reload endpoints already return 410 (Phase 1). Updated
> stale 30-day-hold / verification copy across sharer-facing surfaces
> (RewardConfirmationModal, SharePlatformModal, PendingRewardsList,
> VerifiedRewardsList, SharerRewardsOverview/Dashboard, RewardEarningCard, the
> share-rewards and supporter/shares pages) to "owed / claimable now / creator
> pays directly". Historical audit `.md` files left as point-in-time records.

#### (original plan)
11. Migrate live campaigns: treat existing `current_budget_remaining` as the declared
    pool; set `is_paid_sharing_active` per new rules. Mark any `pending_hold` rewards as
    `owed` (or let them clear normally, then switch).
12. Remove admin reload UI references; update docs that describe the 20% fee / 30-day hold.

---

## 7. Edge Cases & Decisions Needed

1. **Goal floor:** keep the $100 fundraising-goal requirement to enable rewards, or drop
   it? (Recommend keep.)
2. **Budget exhaustion:** when `committed_budget_remaining` < `amount_per_share`, pause new
   rewards (current behavior) — confirm copy tells sharers "rewards paused, budget used up".
3. **Per-share max:** keep the $100/share cap? (Recommend keep.)
4. **Creator never pays:** with no escrow, the only lever is reputation + reminders +
   optional admin mediation. Confirm that's acceptable for v1.
5. **Existing escrowed balances:** any campaigns that already paid the 20% reload fee /
   hold real money — decide refund vs. honor-as-declared-pool during migration.
6. **Partial payments / multiple sharers per withdrawal:** model supports per-campaign
   slices; confirm UX for a sharer who has owed rewards across several creators.

---

## 8. Summary

You're moving from *"platform holds and guarantees money"* to *"platform proves who earned
what, and creators settle directly."* The heavy lifting in your data model
(`ShareWithdrawal.campaign_withdrawals` slices, proof URLs, receipt confirmation,
reminders) is **already there** — this rework is mostly **subtracting** escrow logic (fee,
reload approval, 30-day hold) and **adding** two things: instant wizard activation and a
creator payout-confirmation view backed by share tracking, plus a reliability score so the
trust model is legible to sharers.
