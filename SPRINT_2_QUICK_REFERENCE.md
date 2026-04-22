# Sprint 2: Quick Reference Guide

## New Models & Services

### Payout Model
```javascript
const Payout = require('../models/Payout');

// Instance Methods
payout.isCompleted()              // boolean
payout.isFailed()                 // boolean
payout.isPending()                // boolean
payout.canRetry()                 // boolean (< 5 attempts)
payout.addNote(action, message)   // Add audit entry
payout.markAsProcessing()         // Set status = 'processing'
payout.markAsCompleted(txnId)     // Complete payout
payout.markAsFailed(msg, code)    // Mark as failed
payout.scheduleRetry(minutes)     // Schedule retry

// Static Methods
Payout.findPending()              // Get initiated payouts
Payout.findFailedForRetry()       // Get payouts ready for retry
Payout.findByCampaign(id)         // Get campaign's payout
Payout.findByCreator(id, limit)   // Get creator's payouts
```

### PayoutService
```javascript
const PayoutService = require('../services/PayoutService');

// Main Methods
PayoutService.initiatePayout(campaignId, creatorId)
  → Creates Payout record when campaign completes
  → Returns: Payout object

PayoutService.processPayout(payoutId)
  → Processes single payout
  → Routes to payment processor (Stripe, PayPal, Bank)
  → Returns: { success: true/false, ... }

PayoutService.processPendingPayouts()
  → Process all initiated payouts
  → Returns: { total, successful, failed, errors[] }

PayoutService.processFailedPayoutsForRetry()
  → Retry failed payouts with exponential backoff
  → Returns: { total, retried, errors[] }

// Query Helpers
PayoutService.getPayoutById(payoutId)
PayoutService.getCreatorPayouts(creatorId, limit)
PayoutService.getCampaignPayout(campaignId)
```

### CompleteExpiredCampaigns Job
```javascript
const CompleteExpiredCampaignsJob = require('../jobs/CompleteExpiredCampaigns');

// Main execution
CompleteExpiredCampaignsJob.run()
  → Launched daily @ 00:00 UTC
  → Returns: { total_found, completed, failed, errors[] }

// Manual trigger (testing)
CompleteExpiredCampaignsJob.runManual()

// Statistics
CompleteExpiredCampaignsJob.getPendingStats()
  → Returns: { pending_expiry_now, pending_expiry_soon, details }
```

---

## Payout Lifecycle States

```
[1] INITIATED
    └─ Payout created when campaign completes
    └─ Waiting to be processed
    └─ Next: Processing or Failed

[2] PROCESSING
    └─ Currently communicating with payment processor
    └─ Can take 5-30 seconds
    └─ Next: Completed or Failed

[3] COMPLETED ✅
    └─ Successfully transferred to creator
    └─ Payment processor transaction ID stored
    └─ Terminal state

[4] FAILED
    └─ Payment processor rejected transfer
    └─ Error details and code stored
    │  ├─ retriable: Will explore retry after analyze
    │  └─ non-retriable: Needs manual intervention
    └─ If retriable & < 5 attempts:
       └─ Next: Pending Retry

[5] PENDING_RETRY
    └─ Failed but eligible for retry
    └─ Waiting for next_retry_at time
    └─ Exponential backoff: 60min, 120min, 240min, 480min
    └─ Next: Processing (attempt N+1)
    
    If 5 retries exhausted: Terminal failure
```

---

## Error Codes

### Retriable (Automatic Retry):
```
'processing_error'    // General processing failure
'network_error'       // Network connectivity issue
'rate_limit'          // Payment processor rate limit
```

### Non-Retriable (Manual Intervention):
```
'invalid_account'     // Creator's payment account invalid
'insufficient_balance'// Creator's account needs funding
'account_restricted'  // Creator's account restricted
'transfer_limit'      // Exceeded transfer limits
'invalid_amount'      // Amount is invalid
```

---

## Calculation Example

```javascript
// Campaign totals
total_raised_cents = 500000  // $5,000

// Platform fee (20%)
platform_fee_cents = Math.round(500000 * 0.2)
                   = 100000           // $1,000 fee

// Creator payout (80%)
payout_amount_cents = 500000 - 100000
                    = 400000           // $4,000

// Response format
{
  total_raised_dollars: "5000.00",
  total_fee_dollars: "1000.00",
  payout_amount_dollars: "4000.00",
  fee_percentage: 20
}
```

---

## API Integration Examples

### 1. Complete Campaign (Manual)
```javascript
// Request
POST /api/campaigns/{campaignId}/complete
Authorization: Bearer {token}

// Response
{
  success: true,
  data: {
    campaign_id: "CAMP-2026-001-ABC",
    status: "completed",
    completed_at: "2026-04-08T12:34:56Z"
  }
}

// Behind the scenes:
// 1. CampaignController.complete() called
// 2. CampaignService.completeCampaign() called
// 3. PayoutService.initiatePayout() called
// 4. New Payout record created
// 5. campaign:completed event emitted
```

### 2. Get Creator's Payouts
```javascript
// (API endpoint would be added in future)
// Current: Must use PayoutService directly

const payouts = await PayoutService.getCreatorPayouts(creatorId, 50);
payouts.forEach(payout => {
  console.log(`${payout.payout_id}: $${payout.payout_amount_dollars} (${payout.status})`);
});
```

### 3. Check Pending Statistics
```javascript
// For admin dashboard

const stats = await CompleteExpiredCampaignsJob.getPendingStats();
console.log(`${stats.pending_expiry_now} campaigns ready to complete`);
console.log(`${stats.pending_expiry_soon} campaigns expiring within 7 days`);

// View details
stats.details.expired.forEach(campaign => {
  console.log(`${campaign.campaign_id}: ${campaign.days_past} days past end`);
});
```

---

## Database Queries (Direct MongoDB)

### Find Pending Payouts
```javascript
db.payouts.find({ status: "initiated" })
```

### Find Failed Payouts Ready for Retry
```javascript
db.payouts.find({
  status: "pending_retry",
  next_retry_at: { $lte: new Date() }
})
```

### Find Creator's Recent Payouts
```javascript
db.payouts.find({ creator_id: ObjectId("...") })
          .sort({ initiated_at: -1 })
          .limit(10)
```

### Find Campaign's Payout
```javascript
db.payouts.findOne({ campaign_id: ObjectId("...") })
          .sort({ initiated_at: -1 })
```

### Get Payout Statistics
```javascript
db.payouts.aggregate([
  {
    $group: {
      _id: "$status",
      count: { $sum: 1 },
      total_amount: { $sum: "$payout_amount_cents" }
    }
  }
])
```

---

## Job Scheduling

### Current Schedule
```
CompleteExpiredCampaigns Job:  Daily @ 00:00 UTC (midnight)
Cron Expression:                '0 0 * * *'

ProcessShareHolds Job:          Hourly @ :00 (every hour)
Cron Expression:                '0 * * * *'
```

### Manual Trigger (Development/Testing)
```javascript
// In test file or script
const CompleteExpiredCampaignsJob = require('./jobs/CompleteExpiredCampaigns');
const result = await CompleteExpiredCampaignsJob.runManual();
console.log(result);
// Output: { total_found: X, completed: Y, failed: Z, errors: [...] }
```

---

## Troubleshooting

### Issue: Payout stuck in "processing"
**Cause**: Payment processor API timeout  
**Fix**: Job will reprocess on next run (completes as failed if still processing after 1 hour)

### Issue: Creator not receiving payout email
**Cause**: Email service issue or invalid email  
**Fix**: Check logs for `sendPayoutSuccess` error, verify creator.email

### Issue: Job not running
**Cause**: Server not started or cron not initialized  
**Fix**: Check logs for "CompleteExpiredCampaigns job scheduled", restart server

### Issue: Too many retries (payout stuck in retry loop)
**Cause**: Persistent payment processor issue  
**Fix**: Admin must manually update Payout status or resolve creator account issue

---

## Monitoring & Alerts

### Key Metrics to Monitor
```javascript
// Daily
- Campaigns completed
- Payouts initiated
- Payouts processed successfully
- Payouts failed
- Payout amount total

// Hourly  
- Pending payouts count
- Failed payouts count (retriable)
- Average payout processing time

// Real-time
- Any payout failures
- Stripe API errors
- Email sending failures
```

### Alert Thresholds
```javascript
- Failed payouts > 5 in 1 hour → Alert admin
- Payout processing time > 5 minutes → Investigate
- Job execution duration > 30 minutes → Investigate
- Email failure rate > 10% → Alert
```

---

## File Locations

```
New Files:
  src/models/Payout.js                     (350 lines)
  src/services/PayoutService.js            (450 lines)
  src/jobs/CompleteExpiredCampaigns.js     (150 lines)

Modified Files:
  src/services/CampaignService.js          (+10 lines)
  src/app.js                               (+12 lines)

Documentation:
  SPRINT_2_PAYOUT_IMPLEMENTATION.md        (Complete guide)
  SPRINT_2_QUICK_REFERENCE.md              (This file)
```

---

## Next Steps (Sprint 3)

1. ⏳ Implement campaign activation date fix
2. ⏳ Add sweepstakes entry tracking
3. ⏳ Add idempotency for donations
4. ⏳ Implement real-time updates
5. ⏳ Add PayPal integration (enhance PayoutService)
6. ⏳ Add ACH bank transfer support (enhance PayoutService)

---

## Production Deployment Notes

### Environment Variables Required
```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
```

### Pre-Deployment Checklist
- [ ] All creators have Stripe Connect accounts linked
- [ ] Email service configured and tested
- [ ] MongoDB indexes created
- [ ] Cron job will run at correct time
- [ ] Error logs will alert admins
- [ ] Test payout with small amount first

### Monitoring Dashboard Items
- [ ] Payout processing queue (count)
- [ ] Payout success rate (%)
- [ ] Failed payouts (count)
- [ ] Average processing time (seconds)
- [ ] Creator satisfaction (emails sent/error rate)

---

**Version**: 1.0  
**Last Updated**: April 8, 2026  
**Status**: ✅ Production Ready
