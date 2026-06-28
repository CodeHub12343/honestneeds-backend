# HonestNeed — Share-&-Earn ("Sharing Campaign") System: Critical Analysis
**Date:** 2026-06-21
**Question being answered:** *What is a sharing campaign, should it take donations, is sharing tracked correctly, and why does the dashboard show $0 / $1 / $2 / $100 for the same campaign?*

---

## 0. The one-paragraph answer (read this first)

**A "sharing campaign" is not a different kind of campaign — it's a normal fundraising campaign with a paid-virality layer bolted on.** People still **donate** to it; "share-to-earn" just means the creator pre-funds a small budget so that whoever shares the link earns a tiny reward **when their share converts into a verified donation**. The confusion you're feeling is real and it's the system's fault: the code models `fundraising` and `sharing` as two *mutually exclusive campaign types*, gives the sharing one a non-monetary "sharing_reach" goal, and then **renders a dollar "raised" number against that non-dollar goal** on one screen while a different screen reads a different goal. That's why you see `$0 of $1` in one place and `$2 of $100` in another for the same campaign. Nothing about the money is actually broken — the **goal/meter semantics are broken for sharing campaigns**.

---

## 1. What the two campaign types mean today (as built)

| | `fundraising` | `sharing` |
|---|---|---|
| Primary `goals[]` entry | `goal_type: 'fundraising'`, `target_amount` = **dollars** | `goal_type: 'sharing_reach'`, `target_amount` = **a share/reach count** (but stored in the same `target_amount` field as dollars) |
| Accepts donations? | Yes | **Yes** (donations are how a share "converts" and how a sharer earns) |
| Extra config | — | `share_config` (budget, `amount_per_share`, `is_paid_sharing_active`) |
| Meter the UI draws | dollars raised / dollars goal ✓ coherent | **dollars raised / sharing_reach target ✗ category error** |

The critical realization: **both types take money.** The `sharing` type does *not* turn off donations — `ShareRewardService.processShareConversion` literally pays a sharer only when a **donation** with their `referral_code` is verified, and the anti-fraud rule "donation ≥ 10× reward" only makes sense because a donation is involved. So a sharing campaign is a fundraiser **plus** an incentive to spread it.

---

## 2. Current end-to-end flow (what actually happens)

### 2.1 Creator sets up a sharing campaign
1. Wizard sends `campaign_type: 'sharing'` + `platforms[]`, `budget`, `reward_per_share`, `max_shares_per_person`, **and** a `goals[]` array.
2. `CampaignService.createCampaign` stores `share_config` (budget/reward) and the goals. The sharing campaign ends up with a `sharing_reach` goal whose `target_amount` is some small number (your **"1"**) — and possibly a stray fundraising goal too (your **"$100"**).
3. Paid sharing only becomes *real* once a **verified reload** funds the budget (SE-1 guard, added earlier). Until then `is_paid_sharing_active` stays false.

### 2.2 Sharer shares
1. `POST /campaigns/:id/share/generate` → unique **referral link + QR**.
2. `POST /campaigns/:id/share` (or the generate step) records a `ShareRecord` and bumps `metrics.shares_by_channel[channel]` and `share_count`.

### 2.3 Visitor converts
1. Visitor lands via the referral link → `referral/click` / `referral/visit` tracked.
2. Visitor **donates** → donation is recorded `pending` → creator confirms → on verify, `ShareRewardService.processShareConversion` fires: it checks the share record, anti-fraud (donation ≥ 10× reward, sharer ≥ 24h old, self-referral block, idempotency), and if the budget covers it, creates a **`share_reward` transaction** in `pending_hold` for 30 days, deducting `amount_per_share` from `current_budget_remaining`.

### 2.4 Reward releases
1. `ProcessShareHolds` job (hourly) finds `pending_hold` rewards past 30 days, runs fraud detection, and moves them `→ approved`, crediting the sharer's wallet `available_cents`.
2. Sharer withdraws via the payout-request flow; creator marks paid (manual model).

**So the loop is: fund budget → share → referral click → donation → (confirm) → reward held 30d → released → withdrawn.** That loop is actually wired end-to-end. The breakage is in **goals/meters/analytics presentation**, not the money loop.

---

## 3. Why your dashboard shows $0 / $1 / $2 / $100 (the actual bugs)

### B-1 — Dollars raised are drawn against a non-dollar "sharing_reach" goal *(this is the `$0 of $1`)*
`sanitizeCampaignForResponse` resolves the meter goal by **campaign type**:
```
sharing  → goal_amount = goals.find(g => g.goal_type === 'sharing_reach').target_amount   // = 1
raised   = metrics.total_donation_amount (verified dollars)                                // = 0
```
So the card renders **`$0 (dollars) of $1 (a reach count)`**. The "$1" was never a dollar goal — it's the sharing_reach target being formatted with a `$`. **Category error**, not a math error. ([CampaignService.js:1216‑1226](src/services/CampaignService.js#L1216))

### B-2 — A different screen reads a *different* goal *(this is the `$2 of $100`)*
The dashboard **Health Score** card and the **campaign card** don't go through the same goal-resolution path. One reads the `sharing_reach` goal (target 1), another reads a fundraising goal / `goals[0]` (target 100) and a `current_amount` that was incremented by a different code path → **`$2 of $100`**. Same campaign, two goals, two readers, two answers. There is **no single "what is this campaign's goal" function** that every surface calls.

### B-3 — `Total Shares 2` but every platform shows `0`
`CampaignAnalyticsService` computes the two numbers from **different fields**:
```
totalShares    = campaign.shares_paid + campaign.shares_free || campaign.share_count   // top-level → 2
sharesByChannel= campaign.shares_by_channel                                            // top-level → undefined
```
…but the per-channel counts actually live at **`campaign.metrics.shares_by_channel`** (nested), not `campaign.shares_by_channel`. So the breakdown reads an undefined object and every platform renders `0`, while the total reads the top-level `share_count`. ([CampaignAnalyticsService.js:402,419](src/services/CampaignAnalyticsService.js#L402)) Also, `share/generate` (making a link) and `share/record` (logging a share) don't both update the **same** counters, so totals and per-channel can legitimately diverge.

### B-4 — "10000.0% funded / Goal Progress Hit!" on the fundraising campaign
Your **fundraising** campaign ("Our Family…") shows `$100 of $1` = `10000%`. That campaign's **fundraising goal target is $1** (a placeholder/typo at creation), and the real $18,201 you see elsewhere is a *second* goal. Same root cause as B-2: multiple goals in `goals[]`, no canonical "the goal."

### B-5 — Viral score 16, referral 0%, QR 0 — **mostly not bugs**
These are legitimately zero: no one has clicked a referral link, scanned the QR, or re-shared yet. The viral score is low because share velocity/coefficient are 0. The only *misleading* part is that they sit next to the broken share-count, so the whole panel "feels" wrong. The prayer analytics showing 132 prayers / 9.4-a-day appears to be **mock/seed data** (it doesn't match a 1-day-old campaign with 0 of everything else) — worth confirming that dashboard isn't rendering placeholder series.

---

## 4. Is sharing tracked correctly? — partially

| Signal | Tracked? | Notes |
|---|---|---|
| Share recorded (ShareRecord) | ✅ | channel, ip, device, referral_code all captured |
| `share_count` total | ✅ | top-level counter increments |
| Per-channel breakdown | ⚠️ | **stored** at `metrics.shares_by_channel`, but the analytics reader looks at the wrong path (B-3) |
| Referral click → visit → conversion | ✅ | `ReferralTracking` pipeline exists |
| Conversion → reward | ✅ | `processShareConversion`, anti-fraud, 30-day hold |
| Reward release | ✅ | `ProcessShareHolds` hourly |
| Sharer leaderboard / earning potential | ✅ | endpoints exist |
| **Goal / progress meter** | ❌ | category error (B-1/B-2) |

So: **the money + virality plumbing is largely correct; the goal/meter/analytics *presentation* is the broken part.**

---

## 5. Recommended end-to-end flow (the fix that removes the confusion)

### 5.1 Core decision: **stop modeling `fundraising` vs `sharing` as exclusive types**
A campaign is **always a fundraiser**. "Share-to-Earn" is an **optional incentive layer**, represented entirely by `share_config.is_paid_sharing_active` (+ funded budget). Keep `campaign_type` only as a *label/affordance* if you must, but it should never change how money or goals are computed.

**Why this fixes everything:** every screen then reads **one** dollar goal (the fundraising goal) and **one** dollar raised number. The `sharing_reach` "goal" becomes a *separate, clearly-labelled, non-dollar reach meter* ("327 of 1,000 shares") — never mixed with dollars.

### 5.2 Recommended flow
```
Creator creates a campaign (always has a $ fundraising goal)
        │
        ├─(optional) turns ON Share-to-Earn:
        │     set reward_per_share + share_channels
        │     pre-fund budget via reload (admin-verified, 20% fee)  → is_paid_sharing_active = true
        │
Supporter shares → referral link/QR  (tracked by channel, correctly)
        │
Visitor clicks → lands on the SAME donate page
        │
Visitor donates → pending → creator confirms → VERIFIED
        │     ├─ counts toward the $ goal meter (one number, everywhere)
        │     └─ if referral present + budget funded → sharer reward (30-day hold)
        │
Reward auto-releases after 30d (fraud-checked) → wallet → withdrawal
```

### 5.3 What each meter shows after the fix
- **Funds meter:** `$raised / $fundraising_goal` — the only dollar meter.
- **Reach meter (optional):** `shares / sharing_reach_target` — labelled in *shares*, never `$`.
- **Earnings panel:** budget remaining, rewards held, rewards paid — sharer-facing.

---

## 6. Fix / Update / Remove / Add

### 🔴 Fix (bugs causing the weird numbers)
- **SF-1 (B-1/B-2):** One canonical goal resolver used by *every* surface (dashboard card, health score, analytics, detail). For dollars, always use the **fundraising** goal; render `sharing_reach` as a **separate reach meter** with unit "shares", never `$`. Kill the "draw dollars against sharing_reach" path.
- **SF-2 (B-3):** Point the analytics reader at `campaign.metrics.shares_by_channel` (and make `share/generate` vs `share/record` update the same counters) so Total Shares and the per-platform breakdown reconcile.
- **SF-3 (B-4):** Validate goal `target_amount` at creation (min $1 is fine, but a sharing campaign should not silently get a `$1` fundraising goal); block obviously-placeholder goals.
- **SF-4 (B-5):** Confirm the Prayer Analytics panel isn't rendering seeded/mock series on a real campaign.

### 🟠 Update
- **SU-1:** Make the **goal you created in the wizard** explicit: for a Share-to-Earn campaign, ask for *both* a dollar fundraising goal **and** (optionally) a reach target — and label them distinctly in the UI so `$` and *shares* never share a meter.
- **SU-2:** On the campaign **Stats** page for a sharing campaign, lead with the **Earnings/Budget** panel (funded? remaining? rewards held/paid?) since that's the creator's real concern, then show reach + funds meters separately.
- **SU-3:** Show sharers a clear **"rewards funded ✓ / pending funding"** badge driven by `is_paid_sharing_active` + funded budget (the SE-1 guard already computes this).

### ⚪ Remove / collapse
- **SR-1:** Remove the assumption that `campaign_type === 'sharing'` disables/!replaces the fundraising goal. Treat share-to-earn as a feature flag, not a type. (Biggest single win.)
- **SR-2:** Remove the `$`-formatting of `sharing_reach` targets anywhere it appears.

### 🟢 Add (to make it complete)
- **SA-1:** A **Share-to-Earn setup checklist** on the campaign page: ① set reward/share ② fund budget ③ activate — with the current step highlighted, so creators understand the funding requirement.
- **SA-2:** A **per-sharer earnings view** for supporters ("you've earned $X from N campaigns, $Y pending 30-day hold") — the data exists (`/sharer/rewards`), surface it.
- **SA-3:** **Conversion attribution display** on the creator dashboard: shares → clicks → donations → rewards funnel, so "is sharing working?" has a real answer.
- **SA-4:** Confirmation queue + refund queue on **sharing** campaigns too (today they're gated to fundraising), since sharing campaigns take donations.

---

## 7. TL;DR for the dashboard you're staring at
- **"Bridges of Hope" $0 of $1** → it's `$0 donations` vs a **sharing_reach target of 1** mis-rendered as `$1`. Not money. (SF-1)
- **Health Score "$2 of $100"** → a *different* goal read by a *different* component. (SF-2 / one resolver)
- **"Our Family" 10000% funded** → that campaign's fundraising goal target is **$1** (placeholder); your real $18,201 is a second goal. (SF-3)
- **Total Shares 2 / all platforms 0** → reader looks at `campaign.shares_by_channel` but data is at `campaign.metrics.shares_by_channel`. (SF-2)
- **Viral 16 / referral 0 / QR 0** → genuinely zero activity, not bugs.
- **Biggest fix:** stop treating "sharing" as a separate campaign type — it's a fundraiser with a paid-share layer. One dollar goal, one raised number, a separate reach meter, everywhere. (SR-1)

---
*Grounded in `CampaignService.sanitizeCampaignForResponse` (goal resolution), `CampaignAnalyticsService` (share metrics), `ShareService`/`ShareRewardService` (record + conversion), `ProcessShareHolds` (release), and the live dashboard you shared. Line references reflect code as of 2026-06-21.*
