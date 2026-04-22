# Day 5: Admin Flow Tutorial - Step-by-Step Guide

**Document Version:** 1.0  
**Status:** Production Ready  
**Audience:** Admin Users, Platform Operations  
**Last Updated:** April 2, 2026  

---

## Table of Contents

1. [Admin Dashboard Overview](#admin-dashboard-overview)
2. [Daily Admin Workflow](#daily-admin-workflow)
3. [Verification Process](#verification-process-step-by-step)
4. [Settlement Process](#settlement-process-step-by-step)
5. [Report Generation](#report-generation)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Admin Dashboard Overview

### What Admins Can Do

- ✅ View all fee transactions
- ✅ Filter and search transactions
- ✅ Verify individual fees
- ✅ Batch verify fees
- ✅ Settle fees (manual payout process)
- ✅ View settlement history
- ✅ Generate financial reports
- ✅ View fee dashboard/analytics

### What Admins Cannot Do

- ❌ Edit donation amounts (trace back to creator instead)
- ❌ Delete transactions (soft deletes only, audit trail maintained)
- ❌ Process refunds (must handle through separate refund flow)
- ❌ Modify settled transactions (immutable ledger)
- ❌ Override system validations (work with engineer if needed)

### Admin Portal Access

**URL:** `https://admin.honestneed.com/dashboard`

**Login Requirements:**
- Admin email address
- Admin password (2FA enabled)
- Valid admin role in system

---

## Daily Admin Workflow

### Morning Routine (10 min)

#### Step 1: Check Fee Dashboard

**Goal:** Understand payment volume and pending work

**Instructions:**
```
1. Login to admin portal
2. Click "Dashboard" → "Fee Overview"
3. Check metrics for today:
   - Total donations received
   - Platform fees collected
   - Pending settlements
   - Settlement status breakdown
```

**What You'll See:**
```
Period: Today (April 2, 2026)

SUMMARY
├─ Total Donations: 127
├─ Total Donated: $15,847.50
├─ Platform Fees: $3,169.50 (20%)
├─ Creator Payouts: $12,678.00
│
└─ Settlement Status
   ├─ Pending Settlement: 42 donations ($8,923.45)
   ├─ Verified: 28 donations ($5,431.20)
   ├─ Settled: 57 donations ($11,394.85)
   └─ Rejected: 2 donations ($98)

TOP CAMPAIGNS TODAY
├─ Save the Local Library: $4,200 raised, $840 platform fee
├─ Community Food Bank: $3,150 raised, $630 platform fee
└─ Youth Center Renovation: $2,800 raised, $560 platform fee
```

**Action Items:**
- Note any major campaigns
- Check if any donations are stuck
- Identify verification backlog

#### Step 2: Review Pending Donations

**Goal:** Identify donations needing verification

**Instructions:**
```
1. Click "Transactions" → "Fee Transactions"
2. Filter: Status = "pending_settlement"
3. Sort by: Created date (oldest first)
4. Review approximately 10-15 oldest donations
```

**What You'll See:**
```
PENDING SETTLEMENTS (Oldest First)

├─ Transaction ft_001
│  ├─ Donation: $50.00 to "Save Library"
│  ├─ Platform Fee: $10.00
│  ├─ Donor: John Smith (john@example.com)
│  ├─ Payment Method: credit_card
│  ├─ Payment Ref: pi_2026_04_02_001
│  ├─ Status: pending_settlement (2 hours old)
│  └─ Actions: [Verify] [Reject] [View Details]
│
└─ Transaction ft_002
   ├─ Donation: $100.00 to "Food Bank"
   ├─ Platform Fee: $20.00
   ├─ Donor: Anonymous
   ├─ Payment Method: bank_transfer
   ├─ Payment Ref: BT_2026_04_02_001
   ├─ Status: pending_settlement (30 min old)
   └─ Actions: [Verify] [Reject] [View Details]
```

---

## Verification Process (Step-by-Step)

### Understanding Fee Status Workflow

```
New Donation
    ↓
Payment Received by Creator
    ↓
pending_settlement (Unverified by Admin)
    ├─ ✅ Admin Verifies → verified
    │   │  (Ready to settle)
    │   └─ → settled (after settlement batch)
    │
    └─ ❌ Admin Rejects → rejected
       (Donation denied, fees rolled back)
```

### Single Donation Verification

**Scenario:** Admin wants to verify one specific donation

**Step-by-Step Instructions:**

```
STEP 1: Navigate to Transaction
├─ Click: Dashboard → Fee Transactions
├─ Filter: Status = "pending_settlement"
└─ Search or find transaction
   └─ Example: Donation $50 to "Save Library"

STEP 2: Review Transaction Details
├─ Click on transaction row
├─ Page opens showing full details:
│  ├─ Donation Amount: $50.00
│  ├─ Platform Fee: $10.00
│  ├─ Creator Receives: $40.00
│  ├─ Donor Name: John Smith
│  ├─ Payment Method: credit_card
│  ├─ Payment Reference: pi_2026_04_02_001
│  ├─ Campaign: "Save Library"
│  ├─ Creator: "Sarah Johnson"
│  └─ Recorded At: 2026-04-02 14:30:45 UTC

STEP 3: Verify Payment Reference
├─ Cross-check with payment processor:
│  ├─ For credit_card: Check Stripe dashboard
│  │  └─ Search: pi_2026_04_02_001
│  │     ├─ Status: SUCCEEDED ✅
│  │     ├─ Amount: $50.00
│  │     └─ Timestamp matches
│  │
│  ├─ For bank_transfer: Check bank statement
│  │  └─ Find transfer with reference
│  │     ├─ Amount: $50.00 received
│  │     └─ Timestamp within expected range
│  │
│  └─ For paypal: Check PayPal account
│     └─ Verify transaction exists and received

STEP 4: Make Verification Decision
├─ IF verified (matches payment processor):
│  └─ STEP 5A: Approve Donation
│
└─ IF suspicious or incomplete:
   └─ STEP 5B: Reject Donation
```

**STEP 5A: Approve Donation (IF Verified)**

```
1. Click: [Verify] button
2. Modal/Form appears:
   
   ┌─────────────────────────────────────────┐
   │ Verify Fee Transaction                  │
   ├─────────────────────────────────────────┤
   │                                         │
   │ Transaction: $50 donation               │
   │ Fee Amount: $10                         │
   │                                         │
   │ Verification Notes (required):          │
   │ ┌─────────────────────────────────────┐ │
   │ │ Verified against Stripe dashboard   │ │
   │ │ Payment succeeded on 2026-04-02     │ │
   │ │ Amount matches: $50.00              │ │
   │ │ Reference: pi_2026_04_02_001        │ │
   │ │                                     │ │
   │ │ (500 characters max)                │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ Reference Number (optional):            │
   │ ┌─────────────────────────────────────┐ │
   │ │ STRIPE_BAT_20260402_001             │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │           [Cancel]  [Verify]           │
   └─────────────────────────────────────────┘

3. Type verification notes (Example):
   "Verified against Stripe dashboard. 
    Payment succeeded on 2026-04-02. 
    Amount matches exactly."

4. Click: [Verify] button

5. Success Response:
   ✅ Status updated to "verified"
   ✅ Verification timestamp: 2026-04-02 14:35:10 UTC
   ✅ Verified by: admin@honestneed.com
   ✅ Fee is now ready for settlement batch
```

**STEP 5B: Reject Donation (IF Suspicious)**

```
1. Click: [Reject] button
2. Modal/Form appears:
   
   ┌─────────────────────────────────────────┐
   │ Reject Transaction                      │
   ├─────────────────────────────────────────┤
   │                                         │
   │ ⚠️  This will:                          │
   │ • Mark donation as rejected             │
   │ • Reverse platform fee                  │
   │ • Notify donor                          │
   │ • Clear sweepstakes entry (if present)  │
   │                                         │
   │ Reason for Rejection:                   │
   │ ┌─────────────────────────────────────┐ │
   │ │ ⭕ Payment failed verification      │ │
   │ │ ⭕ Suspicious activity detected     │ │
   │ │ ⭕ Duplicate transaction            │ │
   │ │ ⭕ Fraud detected                   │ │
   │ │ ⭕ Other (explain below)            │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ Admin Notes (required):                 │
   │ ┌─────────────────────────────────────┐ │
   │ │ Payment reference not found in      │ │
   │ │ Stripe dashboard. Possible fake     │ │
   │ │ or modified reference ID.           │ │
   │ │                                     │ │
   │ │ (500 characters max)                │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │           [Cancel]  [Reject]            │
   └─────────────────────────────────────────┘

3. Select rejection reason
4. Type admin notes explaining why
5. Click: [Reject] button
6. Result:
   ❌ Status updated to "rejected"
   ❌ Campaign metrics reversed
   ❌ Notification sent to donor
```

---

### Batch Verification (Multiple Donations)

**Scenario:** Verify 20 donations at once

**Process:**

```
1. Navigate: Dashboard → Fee Transactions
2. Filter: Status = "pending_settlement"
3. Select Time Period: "Today" (April 2, 2026)
4. Check Verification Sources:
   ├─ Stripe Dashboard (for credit cards)
   │  └─ Check all transactions for payment success
   │
   ├─ Bank Statements (for bank transfers)
   │  └─ Verify funds received
   │
   └─ PayPal Account (for PayPal donations)
      └─ Confirm transactions completed

5. Create Verification Batch:
   ├─ Click: [Batch Actions] → [Verify All]
   ├─ Modal appears:
   │  
   │  ┌─────────────────────────────────────┐
   │  │ Batch Verify Transactions           │
   │  ├─────────────────────────────────────┤
   │  │ Count: 20 transactions              │
   │  │ Total Amount: $2,500.00             │
   │  │ Total Platform Fees: $500.00        │
   │  │                                     │
   │  │ Verification Notes (required):      │
   │  │ ┌─────────────────────────────────┐ │
   │  │ │ Batch verification for April 2  │ │
   │  │ │ Daily batch: BATCH_20260402_001 │ │
   │  │ │ All payments verified in        │ │
   │  │ │ Stripe/Bank/PayPal              │ │
   │  │ └─────────────────────────────────┘ │
   │  │                                     │
   │  │       [Cancel]  [Verify All]        │
   │  └─────────────────────────────────────┘
   │
   └─ Click: [Verify All]

6. View Results:
   ✅ 20 transactions verified in batch
   ✅ Total fees verified: $500.00
   ✅ Ready for settlement
   ✅ Batch ID: BATCH_20260402_001
```

---

## Settlement Process (Step-by-Step)

### Understanding Settlement

**What is Settlement?**
- Taking verified fees from verified status
- Moving them to settled status
- Recording when/how payout was made
- Creating permanent ledger record

**Frequency:**
- Daily (for daily processing)
- Weekly (typical)
- Monthly (for monthly payouts)
- Ad-hoc (as needed)

### Step-by-Step Settlement

**STEP 1: Verify All Fees Are Ready**

```
Navigate: Dashboard → Fee Transactions

Filter Settings:
├─ Status: "verified" (not pending_settlement)
├─ Period: "This Week"
├─ Sort by: Created date (oldest first)

View Summary:
├─ Total Verified Fees: $1,250.50
├─ Transaction Count: 62
├─ Ready to Settle: Yes ✅
└─ Issues: None

If any pending_settlement remain:
├─ Option 1: Verify those first
├─ Option 2: Settle only verified fees
└─ Option 3: Wait until all verified
```

**STEP 2: Prepare Settlement Batch**

```
1. Click: Dashboard → [Settlements] → [New Settlement]
2. Settlement Form Opens:

   ┌─────────────────────────────────────────┐
   │ Create Settlement Batch                 │
   ├─────────────────────────────────────────┤
   │                                         │
   │ Settlement Period:                      │
   │ ├─ Start Date: [2026-04-01]            │
   │ ├─ End Date:   [2026-04-07]            │
   │ └─ Type: [Weekly Settlement]           │
   │                                         │
   │ Select Transactions:                    │
   │ ├─ ☑ All verified for this period      │
   │ │  (62 transactions, $1,250.50)        │
   │ │                                      │
   │ ├─ ☐ Specific transactions:            │
   │ │  └─ [Select From List...]            │
   │ │                                      │
   │ └─ ☐ Custom date range:                │
   │    └─ From [__] To [__]                │
   │                                         │
   │ Settlement Method:                      │
   │ ├─ ⭕ Bank Transfer (ACH/Wire)        │
   │ ├─ ⭕ Check                            │
   │ └─ ⭕ Other (specify)                  │
   │                                         │
   │ Banking Details:                        │
   │ ┌─────────────────────────────────────┐ │
   │ │ Transfer to operating account:      │ │
   │ │ Account: ****4242                   │ │
   │ │ Bank: Chase                         │ │
   │ │ Amount: $1,250.50                   │ │
   │ │                                     │ │
   │ │ Note: Amount will be transferred    │ │
   │ │ to this account by [date]           │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ Settlement Notes (required):            │
   │ ┌─────────────────────────────────────┐ │
   │ │ Weekly platform fee settlement      │ │
   │ │ Period: April 1-7, 2026             │ │
   │ │ Batch: SETTLE_WEEKLY_W14_2026       │ │
   │ │                                     │ │
   │ │ (500 characters max)                │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │     [Cancel]  [Preview]  [Confirm]     │
   └─────────────────────────────────────────┘

3. Complete all fields
4. Click: [Preview]
```

**STEP 3: Review Settlement Preview**

```
┌─────────────────────────────────────────┐
│ Settlement Summary                      │
├─────────────────────────────────────────┤
│                                         │
│ Settlement Batch: SETTLE_WEEKLY_W14     │
│ Period: April 1-7, 2026                 │
│ Method: Bank Transfer (ACH)             │
│ Status: Ready to Confirm                │
│                                         │
│ FINANCIAL SUMMARY                       │
│ ├─ Transaction Count: 62                │
│ ├─ Total Fees: $1,250.50                │
│ ├─ Transfer Amount: $1,250.50           │
│ ├─ Account: Chase ****4242              │
│ └─ ETA: April 8, 2026 (1-2 days)       │
│                                         │
│ TOP CAMPAIGNS INCLUDED                  │
│ ├─ Save Library: $200.50 fees           │
│ ├─ Food Bank: $180.75 fees              │
│ └─ Youth Center: $165.25 fees           │
│                                         │
│ FEES BEING SETTLED                      │
│ ├─ Verified Fees: 62                    │
│ ├─ Pending Fees: 0 (none)               │
│ └─ Verified Total: $1,250.50            │
│                                         │
│ Once confirmed:                         │
│ ✓ All fees marked as "settled"          │
│ ✓ Settlement ledger created             │
│ ✓ You responsible for transfer          │
│ ✓ Audit trail recorded                  │
│                                         │
│     [Edit]  [Cancel]  [Confirm]        │
└─────────────────────────────────────────┘

Review:
├─ Verify amounts are correct
├─ Confirm banking details
├─ Check transaction list
└─ If correct, proceed to confirmation
```

**STEP 4: Confirm Settlement**

```
1. Click: [Confirm] button
2. Final Confirmation Dialog:

   ┌─────────────────────────────────────┐
   │ Confirm Settlement Batch?            │
   ├─────────────────────────────────────┤
   │                                     │
   │ About to settle:                    │
   │ • 62 transactions                   │
   │ • $1,250.50 in fees                 │
   │ • To Chase account ****4242         │
   │                                     │
   │ This action:                        │
   │ ✓ Cannot be undone                  │
   │ ✓ Creates permanent ledger record   │
   │ ✓ Requires manual fund transfer     │
   │                                     │
   │ Type "CONFIRM" to proceed:          │
   │ ┌─────────────────────────────────┐ │
   │ │ [CONFIRM________________]        │ │
   │ └─────────────────────────────────┘ │
   │                                     │
   │  [Cancel]  [Confirm Settlement]     │
   └─────────────────────────────────────┘

3. Type: "CONFIRM"
4. Click: [Confirm Settlement]
```

**STEP 5: Manual Fund Transfer**

```
Settlement Created ✅

Batch ID: SETTLE_WEEKLY_W14_2026
Amount: $1,250.50
Status: COMPLETED (Manual transfer required)

NOW YOU MUST:
1. Go to your bank's website
2. Initiate ACH transfer to:
   ├─ From: Your business account
   ├─ To: Stripe/PayPal settlement account
   └─ Amount: $1,250.50

3. Record the transfer:
   ├─ Date transferred: [date]
   ├─ Reference/Confirmation: [number]
   ├─ Amount: $1,250.50
   └─ Method: ACH Transfer

Note: This is currently manual in Phase 1.
Phase 2 will automate via Stripe Connect.
```

**STEP 6: Settlement Complete**

```
Settlement Status: SETTLED ✅

├─ Settlement ID: SETTLE_WEEKLY_W14_2026
├─ Created At: 2026-04-07 09:00:00 UTC
├─ By Admin: admin@honestneed.com
├─ Transaction Count: 62
├─ Total Settled: $1,250.50
├─ Method: Bank Transfer
├─ Status: Completed
│
└─ All 62 fees now marked: "settled"
   ├─ Cannot be re-settled
   ├─ Audit trail maintained
   └─ Permanent ledger record created
```

---

## Report Generation

### Financial Report

**Scenario:** Generate monthly revenue report

```
STEP 1: Navigate to Reports
├─ Dashboard → [Reports] → [Financial]

STEP 2: Configure Report
├─ Period: [Month]
├─ Month: [April 2026]
├─ Format: [JSON / CSV]
├─ Include: [Detailed Breakdown ✓]

STEP 3: Generate
├─ Click: [Generate Report]
├─ System processes...

STEP 4: View/Download
├─ Option 1: View in browser
│  └─ Access HTML formatted report
│
├─ Option 2: Download CSV
│  └─ fees_report_2026_04.csv (download)
│
└─ Option 3: Download JSON
   └─ fees_report_2026_04.json (raw data)
```

**Report Contents:**
```
HONESTNEED PLATFORM - FEE REPORT
Report Period: April 2026
Generated: 2026-04-30 10:00:00 UTC

SUMMARY METRICS
├─ Total Donations: 3,247
├─ Total Donated: $162,350.00
├─ Platform Fees (20%): $32,470.00
├─ Creator Payouts: $129,880.00
├─ Average Donation: $50.02
├─ Largest Donation: $5,000.00

BREAKDOWN BY CAMPAIGN
├─ Save the Local Library
│  ├─ Donation Count: 287
│  ├─ Total Raised: $14,350.00
│  ├─ Platform Fees: $2,870.00
│  └─ Creator Receives: $11,480.00
│
├─ Community Food Bank
│  ├─ Donation Count: 245
│  ├─ Total Raised: $12,250.00
│  ├─ Platform Fees: $2,450.00
│  └─ Creator Receives: $9,800.00
│
└─ [25+ more campaigns...]

SETTLEMENT DATA
├─ Settled Fees: $28,500.00 (87.7%)
├─ Pending Settlement: $3,970.00 (12.3%)
├─ Settlement Batches: 4
│
└─ Batch Dates
   ├─ April 7: $7,125.00
   ├─ April 14: $7,350.00
   ├─ April 21: $7,050.00
   └─ April 28: $6,975.00

FRAUD/REJECTION SUMMARY
├─ Rejected Donations: 3
├─ Rejection Reason: Suspicious activity
├─ Fees Reversed: $180.00
└─ Donors Notified: Yes

NOTES FOR ACCOUNTING TEAM
- Stripe processing fees: 2.9%+$0.30 per transaction
- PayPal processing fees: 3.49%+$0.49 per transaction
- All settlements completed by due date
- No chargebacks reported this period
```

---

## Best Practices

### Verification Best Practices

✅ **DO:**
- Verify daily to keep backlog small
- Check payment processor for each transaction
- Note the reference ID used for verification
- Batch verify similar payment methods
- Maintain consistent verification standards

❌ **DON'T:**
- Approve without checking payment processor
- Settle unverified transactions
- Change verification notes after approval
- Verify the same transaction twice
- Process settlements manually outside system

### Settlement Best Practices

✅ **DO:**
- Settle weekly to maintain consistent payout rhythm
- Verify all fees before settling
- Use consistent settlement notes
- Record bank transfer confirmation
- Update records immediately after transfer
- Keep settlement batches organized by date

❌ **DON'T:**
- Forget to make the actual bank transfer
- Settle unverified fees
- Create multiple overlapping settlement batches
- Lose track of confirmation numbers
- Process settlements when tired (error prone)

### General Admin Best Practices

✅ **DO:**
- Review dashboard each morning
- Keep audit trail clean and detailed
- Use template messages for common notes
- Double-check before settlement
- Document any unusual transactions
- Communicate with creators about issues

❌ **DON'T:**
- Rush verification process
- Approve suspicious transactions
- Leave notes vague ("looks ok")
- Forget to document rejections
- Settle during peak traffic times
- Make changes without audit trail

---

## Troubleshooting

### Problem: Transaction Shows as "Pending" Too Long

**Symptoms:**
- Transaction stuck in pending_settlement
- Been pending for >24 hours
- Dashboard shows old unverified transaction

**Solution:**
1. Find transaction in Fee Transactions list
2. Click to view details
3. Check: Was it already verified? 
   - If yes, reason might be settlement delay
4. Check payment reference in payment processor
5. If payment successful but not verified:
   - Click [Verify] and add to verification batch
6. If payment failed:
   - Click [Reject] with appropriate reason

### Problem: Cannot Settle Button Greyed Out

**Symptoms:**
- Settlement button disabled/greyed out
- Cannot create new settlement batch

**Causes & Solutions:**
1. No verified fees available
   - Solution: Verify some fees first
2. In middle of another settlement
   - Solution: Wait for previous settlement to complete
3. Insufficient permissions
   - Solution: Contact admin to verify role is set correctly
4. System error/timeout
   - Solution: Refresh page and try again

### Problem: Settlement Amount Doesn't Match

**Symptoms:**
- Expected $5,000 but showing $4,500
- Count of fees different than expected

**Investigation Steps:**
1. Re-filter transactions to confirm count
2. Check if any fees were rejected
3. Look at settlement details for exact fee list
4. Cross-check fee amounts ($50 = 5000 cents)
5. If still wrong, check payment processor
6. Contact engineer if data mismatch confirmed

### Problem: Donation Shows as Rejected Unexpectedly

**Symptoms:**
- Transaction marked as rejected
- Didn't intend to reject
- Creator complaining about missing payout

**Solution:**
1. Cannot undo rejection (immutable)
2. Contact donor to re-submit donation
3. Contact creator to explain what happened
4. Document what happened and why
5. Future: Be more careful during batch operations

### Problem: Performance Degradation

**Symptoms:**
- Dashboard loads slowly
- Filters taking >5 seconds
- Settlement processing slower than usual

**Potential Causes:**
- Large dataset (many transactions)
- Browser cache issues
- Network latency
- Server performance issue

**Solutions:**
1. Try filtering by date range (narrows dataset)
2. Clear browser cache (Ctrl+Shift+Delete)
3. Try different browser
4. Check if other users report slowness
5. Restart admin session
6. Contact technical support if persists

---

## Admin Checklists

### Daily Checklist

- [ ] Login to admin dashboard
- [ ] Check fee dashboard for overview
- [ ] Review pending settlements (oldest first)
- [ ] Verify 10-20 donations against payment processor
- [ ] Check for any error alerts
- [ ] Reject any suspicious transactions
- [ ] Note any issues for escalation
- [ ] Logout securely

### Weekly Checklist (Friday)

- [ ] Complete all daily tasks for the week
- [ ] Prepare settlement batch
- [ ] Review all unverified fees
- [ ] Verify any remaining fees
- [ ] Generate weekly report
- [ ] Reconcile fees vs actual payments received
- [ ] Note any discrepancies
- [ ] Confirm settlement ready to go

### Monthly Checklist

- [ ] Complete all weekly tasks for the month
- [ ] Generate full monthly financial report
- [ ] Reconcile with accounting department
- [ ] Review rejection rate (should be <1%)
- [ ] Analyze top campaigns
- [ ] Check for fraud patterns
- [ ] Update documentation if processes changed
- [ ] Schedule system maintenance if needed

---

**Tutorial Complete**  
**Status:** Ready for Admin Use  
**Questions?** Contact support@honestneed.com or engineering@honestneed.com

