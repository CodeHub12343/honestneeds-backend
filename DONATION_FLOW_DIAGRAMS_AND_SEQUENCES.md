# Donation Flow - Visual Diagrams & Sequences

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DONATION SYSTEM ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────────┘

                            ┌─────────────────┐
                            │   Frontend      │
                            │  (Next.js/TS)   │
                            └────────┬────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                    │                    │
         ┌──────▼──────┐    ┌────────▼────────┐   ┌─────▼──────┐
         │  Donation    │    │  Donation       │   │  Campaign  │
         │  Wizard      │    │  List/History   │   │  Detail    │
         │  (3 steps)   │    │                 │   │  View      │
         └──────┬──────┘    └────────┬────────┘   └─────┬──────┘
                │                    │                   │
                └────────────────────┼───────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │   API Client (donationService)  │
                    │  - createDonation()             │
                    │  - getMyDonations()             │
                    │  - getDonation()                │
                    │  - getDonationStats()           │
                    └────────────────┬────────────────┘
                                     │ HTTP/REST
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
    ┌─────────────┐         ┌──────────────┐         ┌──────────────┐
    │ Donation    │         │ Transaction  │         │ Campaign     │
    │ Routes      │         │ Routes       │         │ Routes       │
    │ (11 routes) │         │              │         │              │
    └──────┬──────┘         └──────┬───────┘         └──────┬───────┘
           │                       │                        │
           └───────────┬───────────┴────────────┬───────────┘
                       │                       │
        ┌──────────────▼───────┐   ┌──────────▼────────────┐
        │ DonationController   │   │ TransactionController│
        │ - createDonation()   │   │ - recordDonation()   │
        │ - listDonations()    │   │ - getUserTransactions()
        │ - getDonation()      │   │                       │
        │ - getDonationStats() │   │                       │
        │ - getAnalytics()     │   │                       │
        │ - exportDonations()  │   │                       │
        │ - refundDonation()   │   │                       │
        └──────────────┬───────┘   └──────────┬────────────┘
                       │                      │
        ┌──────────────┼──────────────────────┼───────────────┐
        │              │                      │               │
        ▼              ▼                      ▼               ▼
    ┌────────┐  ┌────────────┐         ┌────────┐      ┌──────────┐
    │Transaction  │FeeTracking  │         │Campaign │      │EmailService
    │Service  │  │Service      │         │Model    │      │(MISSING)
    │         │  │             │         │         │      │
    └────┬────┘  └────┬────────┘         └────┬────┘      └──────────┘
         │             │                      │
         └─────────────┼──────────────────────┘
                       │
        ┌──────────────▼────────────────┐
        │      MongoDB Database         │
        │  - Transactions (donations)   │
        │  - Campaigns                  │
        │  - Users                      │
        │  - Fee tracking records       │
        └───────────────────────────────┘
```

## Complete Donation Creation Sequence

```
ACTOR TIMELINE - Donation Creation Flow

┌─────────────────────────────────────────────────────────────────────────────┐
│ USER (Supporter)          │  FRONTEND              │ BACKEND               │
├─────────────────────────────────────────────────────────────────────────────┤
│                           │                        │                       │
│ 1. Browse campaigns       │                        │                       │
│    (view campaign list)   │ GET /campaigns         │ Query campaigns       │
│                           │◄──────────────────────►│ Return list (with     │
│                           │                        │ status, goal, image)  │
│ 2. Click on campaign      │                        │                       │
│    (view detail)          │ GET /campaigns/:id     │ Query campaign        │
│                           │◄──────────────────────►│ Return full detail    │
│                           │                        │ (incl payment methods)│
│ 3. Click "Donate"         │                        │                       │
│    (opens wizard)         │ Show DonationWizard    │                       │
│                           │ Load auto-saved draft  │                       │
│                           │ (if exists)            │                       │
│ 4. WIZARD STEP 1          │                        │                       │
│    Enter amount: $50      │ Calculate fee:         │                       │
│                           │  Fee = $50 × 0.20     │                       │
│                           │  NetAmount = $40       │                       │
│                           │ Show breakdown        │                       │
│    Click NEXT             │ Save to Zustand store │                       │
│                           │ (auto-save draft)     │                       │
│ 5. WIZARD STEP 2          │                        │                       │
│    Payment methods shown  │ Display: PayPal, Venmo│                       │
│    Select PayPal          │ Update selection       │                       │
│                           │ Show instructions      │                       │
│    Click NEXT             │ Save selection         │                       │
│                           │ (auto-save draft)     │                       │
│ 6. WIZARD STEP 3          │                        │                       │
│    Review summary         │ Show:                  │                       │
│    Upload screenshot      │  - Donation amount     │                       │
│    Check boxes            │  - Fee breakdown       │                       │
│                           │  - Payment method     │                       │
│    Click SUBMIT           │                        │                       │
│                           │ Validation:            │                       │
│                           │  ✓ amount valid       │                       │
│                           │  ✓ method selected    │                       │
│                           │  ✓ agreement checked  │                       │
│                           │                        │                       │
│                           │ isSubmitting = true    │                       │
│                           │ (disable button)       │                       │
│                           │                        │                       │
│                           │ POST /campaigns/:id/   │ Receive donation      │
│                           │      donate            │ Validate inputs:      │
│                           │ Payload:               │  • amount: $1-999K   │
│                           │  {amount: 50,          │  • method in enum    │
│                           │   paymentMethod:       │  • campaign exists   │
│                           │   "paypal",            │  • user not creator  │
│                           │   proofUrl: ...}       │                       │
│                           │────────────────────►  │ Create Transaction:   │
│                           │                        │ {                     │
│                           │                        │  amount_cents: 5000, │
│                           │                        │  fee_cents: 1000,   │
│                           │                        │  net_cents: 4000,   │
│                           │                        │  status: pending,   │
│                           │                        │  payment_method:... │
│                           │                        │ }                     │
│                           │                        │                       │
│                           │                        │ Save to MongoDB       │
│                           │                        │ Generate transaction │
│                           │                        │ ID: TRANS-...        │
│                           │                        │                       │
│                           │ ◄──────────────────    │ Return response:      │
│                           │ Response:              │ {                     │
│                           │ {success: true,        │  transactionId,       │
│                           │  transactionId,        │  amount,              │
│                           │  fee_breakdown,        │  fee_breakdown,       │
│                           │  instructions}         │  instructions         │
│                           │                        │ }                     │
│                           │ isSubmitting = false   │                       │
│                           │                        │                       │
│ 7. Success Modal shows    │ Show DonationSuccess   │                       │
│    - Transaction ID       │ Modal with:            │                       │
│    - Amount + fee         │  ✓ Checkmark icon    │                       │
│    - Download receipt     │  ✓ Thank you message  │                       │
│                           │  ✓ Amount breakdown   │                       │
│ 8. User options:          │  ✓ Next step buttons  │                       │
│    - View receipt         │                        │                       │
│    - View campaign        │ React Query:           │                       │
│    - View donations       │  • Invalidate lists   │                       │
│    - Browse more          │  • Invalidate stats   │                       │
│                           │                        │                       │
│                           │ Zustand:               │                       │
│                           │  • Clear draft         │                       │
│                           │  • Reset wizard step 1 │                       │
│                           │                        │                       │
│ OUTSIDE SYSTEM            │                        │                       │
│                           │                        │                       │
│ 9. User manually sends    │ (No action in app)     │                       │
│    payment via PayPal     │                        │                       │
│    OR Venmo, etc.         │                        │                       │
│                           │                        │                       │
│ 10. Mark payment sent     │ POST /donations/{id}/  │ Update transaction    │
│     (user clicks "Sent")  │      mark-sent         │ status: process       │
│                           │ ◄────────────────────►│ Send email to creator │
│                           │                        │                       │
│                           │ Return: {success: true}│                       │
│                           │                        │                       │
│                           │                        │                       │
│ ADMIN WORKFLOW            │                        │                       │
│ (happens later)           │                        │                       │
│                           │                        │                       │
│ 11. Admin verifies payment│                        │                       │
│     (manual check)        │ POST /donations/{id}/  │ Update transaction    │
│                           │      verify            │ status: verified      │
│                           │                        │ Mark verified_at      │
│                           │                        │ Approve sweepstakes   │
│                           │                        │ entries (1 per $1)    │
│                           │ ◄────────────────────►│ Return: {success: ...}│
│                           │                        │                       │
│ (Payment not charged by   │                        │                       │
│  system - manual flow!)   │                        │                       │
│                           │                        │                       │

TIME: ~30 seconds (automated) + 24-72 hours (manual verification)
```

## Campaign Donation Analytics Flow (MISSING)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CURRENT STATE: ❌ ENDPOINTS MISSING - Creator Cannot View Donations        │
└─────────────────────────────────────────────────────────────────────────────┘

INTENDED FLOW (if implemented):

┌─────────────────────────────────────────────────────────────────────────────┐
│ CREATOR (Campaign Owner)    │ FRONTEND              │ BACKEND             │
├─────────────────────────────────────────────────────────────────────────────┤
│                             │                      │                     │
│ 1. Navigate to /dashboard   │ Show campaigns list  │                     │
│    campaigns                │                      │                     │
│                             │ GET /campaigns?      │ Query campaigns     │
│                             │  filter=creator      │ (creator only)      │
│                             │ ◄─────────────────────►│ Return campaigns   │
│ 2. Select a campaign        │                      │                     │
│    Click "View Donations"   │                      │                     │
│                             │ GET /campaigns/:id/  │◄────────────────────│
│                             │  donations?page=1    │ Query donations for │
│                             │  ◄──────────────────►│ this campaign       │
│                             │  Response:           │ Return paginated    │
│                             │  [{                  │ donor list:         │
│                             │    donorName,        │ {                   │
│                             │    amount,           │  amount_cents,      │
│                             │    status,           │  payment_method,    │
│                             │    date,             │  status,            │
│                             │    ...               │  donor_name,        │
│                             │  }]                  │  created_at         │
│                             │                      │ }                   │
│ 3. View donation list       │ Display:             │                     │
│    - Donor names            │  • Donor list        │                     │
│    - Amounts                │  • Amounts           │                     │
│    - Status (pending/ver)   │  • Status badges     │                     │
│    - Date                   │  • Created date      │                     │
│                             │  • Action buttons:   │                     │
│ 4. Click "Analytics" tab    │    - Verify          │                     │
│                             │    - Refund          │                     │
│                             │    - View proof      │                     │
│                             │                      │                     │
│                             │ GET /campaigns/:id/  │ Aggregate donations:│
│                             │  donations/analytics │ {                   │
│                             │ ◄─────────────────────►│  totalAmount,      │
│                             │                      │  totalCount,        │
│                             │  Response:           │  avgAmount,         │
│                             │  {                   │  byPaymentMethod,   │
│                             │   totalDonations,    │  byStatus,          │
│                             │   totalRaised,       │  byDate,            │
│                             │   avgDonation,       │  topDonors,         │
│                             │   topDonor,          │  momentum            │
│                             │   donationsByDate,   │ }                   │
│                             │   byPaymentMethod,   │                     │
│                             │   ...                │                     │
│                             │  }                   │                     │
│                             │                      │                     │
│ 5. View metrics             │ Display dashboard:   │                     │
│    - Total raised           │  • Total: $5,000      │                     │
│    - Donation count         │  • Count: 100         │                     │
│    - Avg donation           │  • Average: $50       │                     │
│    - Chart by date          │  • Chart (last 30 d)  │                     │
│    - Payment method mix     │  • By method pie chart│                     │
│                             │  • Status breakdown   │                     │
│ 6. Filter donations         │ Apply filters:        │                     │
│    - By status              │  • status = verified  │                     │
│    - By method              │  • method = paypal    │                     │
│    - By date range          │  Send updated params  │                     │
│                             │ ◄─────────────────────►│ Return filtered     │
│                             │                      │ list                │
│                             │                      │                     │
│ 7. Download report          │ POST /donations/      │ Generate CSV/PDF    │
│    (CSV/PDF)                │  export?              │ with filtered data  │
│                             │  campaignId=...,      │                     │
│                             │  format=csv           │                     │
│                             │ ◄─────────────────────→│ Return file stream  │
│                             │ Download file         │                     │
│                             │                      │                     │

STATUS: 🔴 ENDPOINTS REQUIRED
Missing:
  - GET /campaigns/:id/donations
  - GET /campaigns/:id/donations/analytics
```

## Fee Calculation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DONATION FEE CALCULATION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

INPUT FROM USER:
  $50.00 donation

FRONTEND PROCESSING (DonationStep1Amount.tsx):
  Gross = 5000 cents
  Fee = 5000 × 0.20 = 1000 cents ($10.00)
  Net = 5000 - 1000 = 4000 cents ($40.00)
  
  Display to user:
  ┌─────────────────────────────────┐
  │ Your Donation Breakdown         │
  ├─────────────────────────────────┤
  │ Amount:        $50.00           │
  │ Platform Fee:  $10.00 (20%)      │
  │ Creator Gets:  $40.00           │
  │                                 │
  │ Sweepstakes: 50 entries         │
  └─────────────────────────────────┘

BACKEND PROCESSING (DonationController.createDonation):
  Receives: { amount: 50, paymentMethod: "paypal" }
  
  Calculates:
  amount_cents = 50 × 100 = 5000
  platform_fee_cents = 5000 × 0.20 = 1000
  net_amount_cents = 5000 - 1000 = 4000
  
  TransactionService.recordDonation():
    Creates Transaction document:
    {
      amount_cents: 5000,
      platform_fee_cents: 1000,
      net_amount_cents: 4000,
      status: 'pending',
      payment_method: 'paypal'
    }
  
  FeeTrackingService.recordFee():
    Logs fee for admin dashboard:
    {
      amount_cents: 1000,
      campaign_id: '...',
      status: 'pending',
      created_at: now
    }

  Returns response:
  {
    transactionId: 'TRANS-...',
    amount: 5000,
    fee_breakdown: {
      gross: 5000,
      fee: 1000,
      net: 4000
    }
  }

FRONTEND DISPLAYS SUCCESS:
  ✓ Donation Success!
  Amount: $50.00
  Fee: $10.00
  Creator Gets: $40.00

ADMIN DASHBOARD (FeeTrackingService.getFeesDashboard):
  Fee tracking shows:
  ├─ Pending fees: 1000 cents ($10)
  ├─ After verification: 1000 cents ($10) → platform revenue
  └─ Creator payout: 4000 cents ($40)

CREATOR SETTLEMENT (Manual process):
  Creator sends manual payment (PayPal, Venmo, etc)
  OR platform initiates settlement
  Admin marks verified:
    Transaction.status = 'verified'
    Transaction.verified_at = now
    
  Creator payout scheduled:
    Settlement amount: $40.00
    Settlement date: [manual or automated]


⚠️ CURRENT ISSUE:
   20% fee is hardcoded in both frontend and backend
   ❓ Should it be configurable?
   ❓ Should it be different per campaign?
   ❓ Should platform policy define the fee?
   
   RECOMMENDATION: Make configurable in platform settings
```

## Payment Methods Support Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   DONATION PAYMENT METHODS SUPPORT                           │
└─────────────────────────────────────────────────────────────────────────────┘

CURRENT STATUS: ⚠️ MANUAL PAYMENT ONLY (No Stripe)

Supported Methods (Backend enum):
├─ paypal          ✅ Can accept (manual)
├─ venmo           ✅ Can accept (manual)
├─ bank_transfer   ✅ Can accept (manual)
├─ check           ✅ Can accept (manual)
├─ money_order     ✅ Can accept (manual)
├─ stripe          ❌ Not integrated
├─ credit_card     ❌ Not integrated
└─ crypto          ❓ Policy unclear

FRONTEND FLOW:
  Campaign Detail Page
    ├─ Fetch campaign.payment_methods
    ├─ Display accepted methods to user
    └─ User cannot donate unless method selected
    
  Donation Wizard Step 2:
    Display payment method choices from campaign:
    ┌─────────────────────────────────────┐
    │ How will you send payment?          │
    ├─────────────────────────────────────┤
    │ ○ PayPal                            │
    │   paypal.me/creatorname/40          │
    │                                     │
    │ ○ Venmo                             │
    │   @creatorusername                  │
    │                                     │
    │ ○ Bank Transfer                     │
    │   See instructions below            │
    │                                     │
    │ ○ Check                             │
    │   Mail to: [address]                │
    └─────────────────────────────────────┘

BACKEND VERIFICATION:
  DonationController.createDonation()
    ├─ Verify paymentMethod in enum ✓
    ├─ Verify campaign accepts method
    └─ Create Transaction with method
    
  Status Flow:
    pending → (user sends payment manually)
    ↓
    creator marks received OR
    admin manually verifies
    ↓
    verified

ADMIN DASHBOARD:
  Fee tracking shows:
    └─ By payment method:
       ├─ PayPal: 50 donations, $5,000 gross
       ├─ Venmo: 30 donations, $3,000 gross
       ├─ Bank: 15 donations, $2,000 gross
       └─ Check: 5 donations, $500 gross

⚠️ PAYMENT PROCESSING MISSING:
   No Stripe integration = No automated charging
   All payments manual = High friction and fraud risk
   
   NEEDED FOR PRODUCTION:
   1. Stripe API integration
   2. Card payment form (Stripe Elements)
   3. Webhook handler for payment confirmations
   4. Automated settlement
   5. Refund capability
```

## Status Transition Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   DONATION TRANSACTION STATUS FLOW                           │
└─────────────────────────────────────────────────────────────────────────────┘

Initial State (upon creation):
  pending ← User creates donation

From PENDING:
  pending
    ├─► verified    (Admin verifies payment received)
    │   └─► approved (If fraud check passes - share rewards)
    ├─► rejected    (Admin rejects for any reason)
    ├─► refunded    (Admin refunds after verification)
    └─► pending_hold (Share reward hold period - 30 days)

From PENDING_HOLD (Share Rewards):
  pending_hold
    ├─► verified    (Hold period expires, fraud check passes)
    ├─► flagged     (Fraud detected)
    └─► rejected    (Admin rejects)

From VERIFIED:
  verified
    ├─► refunded    (Admin approves refund)
    └─► approved    (Payout scheduled)

Failed States:
  ├─► failed       (Transaction failed)
    └─ No transition possible (terminal)
  
  ├─► rejected     (Admin rejected)
    └─ No transition possible (terminal)
    
  ├─► refunded     (Admin refunded)
    └─ No transition possible (terminal)

Email Notifications on Transitions:
  created      → Send confirmation to supporter
  verified     → Send verified notification
  rejected     → Send rejection reason to supporter
  refunded     → Send refund confirmation to supporter
  pending_hold → Send hold notification to supporter

Database Index Strategy:
  Index on: status
  Reason: Fast queries for "pending", "verified", etc.
  
Queries:
  "Get all pending donations"    → status = 'pending'
  "Get verified donations"        → status = 'verified'
  "Get refunded donations this month" → status = 'refunded' AND created_at > date
  "Get donations on hold"         → status = 'pending_hold'
```

## Data Model Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DONATION DATA MODEL RELATIONSHIPS                         │
└─────────────────────────────────────────────────────────────────────────────┘

User (supporter)
├─ One ──→ Many ──┐
│                 │
│           ┌─────▼──────────┐
│           │  Transaction   │
│           │  (donation)    │
│           ├─ amount_cents  │
│           ├─ status        │
│           ├─ payment_method│
│           ├─ created_at    │
│           └─ proof_url     │
│                 │
│                 ├─ One ──→ campaign_id
│                 │         (ref: Campaign)
│                 │
│                 ├─ One ──→ creator_id
│                 │         (ref: User)
│                 │
│                 └─ Many ──→ sweepstakes_entries_created
│                            (computed: amount / 100)

Campaign
├─ One ──→ Many ──────────┐
│                         │
│                    Transaction (donations)
│                    ├─ All donations to this campaign
│                    ├─ Aggregated for metrics
│                    └─ Filtered by status

FEE TRACKING:
  FeeTransaction (implied/possible)
  ├─ transaction_id (ref)
  ├─ amount_cents
  ├─ status (pending/verified/settled)
  └─ settlement_date

SWEEPSTAKES INTEGRATION:
  Transaction
  └─ sweepstakes_entries_created = amount_cents / 100
    └─ Creates SweepstakesEntry records
      ├─ supporter_id
      ├─ transaction_id
      ├─ campaign_id
      └─ entry_date

AGGREGATIONS:
  Campaign.metrics (denormalized):
  ├─ total_donations (count)
  ├─ total_raised_cents (sum)
  ├─ average_donation_cents (avg)
  └─ last_donation_at (max date)

User.statistics (computed):
  ├─ donations_made (count)
  ├─ total_donated_cents (sum)
  ├─ average_donation_cents (avg)
  └─ favorite_cause (most donated campaign type)
```

---

**Generated:** April 11, 2026  
**For:** HONESTNEED Platform  
**Status:** Analysis Complete
