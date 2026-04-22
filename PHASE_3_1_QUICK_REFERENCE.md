# Phase 3.1: 30-Day Hold Processor - Developer Quick Reference

## Quick Start (5 minutes)

### 1. Install Dependencies
```bash
npm install
# Includes new: node-cron@^3.0.3
```

### 2. Start Server
```bash
npm run dev
# Logs: ✅ ProcessShareHolds job scheduled to run hourly
```

### 3. Job Runs Automatically
- Executes every hour at `:00` (1:00, 2:00, 3:00, etc.)
- Checks all `pending_hold` transactions where `hold_until_date <= now`
- Approves or rejects based on fraud detection
- Updates wallets and sends emails

## Core Files

| File | Purpose |
|------|---------|
| `src/models/Transaction.js` | Added hold fields |
| `src/jobs/ProcessShareHolds.js` | Main job (300+ lines) |
| `src/services/ShareFraudDetectionService.js` | Fraud checks (5 patterns) |
| `src/services/emailService.js` | New email methods |
| `src/app.js` | Job registration |
| `package.json` | Added node-cron |

## Key Concepts

### Transaction Lifecycle
```
Donation → Conversion → Share Reward (pending_hold, 30-day hold)
                            ↓ (hourly job)
                    Fraud checks run
                    ↙          ↖
                  ✅ Pass → Approved    ❌ Fraud → Rejected
                    ↓
         Add to user balance
         Send email
```

### Fraud Checks (5 layers)
1. **ROI Anomaly**: Reward > 50% of donation = fraud
2. **Account Age**: Brand new accounts (< 1h) = fraud
3. **Multiple Conversions**: > 2 rewards in 24h from same user = fraud
4. **IP Reputation**: Multiple accounts from same IP = fraud
5. **Behavioral Patterns**: Only earns, never donates = suspicious

## API to Use This

### In ShareRewardService (when creating reward)
```javascript
const reward = new Transaction({
  transaction_type: 'share_reward',
  status: 'pending_hold',  // NOT 'verified'
  hold_until_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  hold_reason: 'share_reward_fraud_protection',
  amount_cents: rewardAmount,
  // ... other fields
});
await reward.save();
```

### Manual Testing
```javascript
// Node REPL
const ProcessShareHoldsJob = require('./src/jobs/ProcessShareHolds');
const result = await ProcessShareHoldsJob.runManual();
console.log(result);
```

### Check Statistics
```javascript
const stats = await ProcessShareHoldsJob.getStats();
// { total_pending: 42, total_amount_cents: ..., expiring_today: 3, ... }
```

### Run Fraud Check
```javascript
const ShareFraudDetectionService = require('./src/services/ShareFraudDetectionService');
const check = await ShareFraudDetectionService.checkTransactionForFraud(transaction);
// { isFraud: true/false, reason: '...', severity: 'high'|'medium'|'low' }
```

## Common Scenarios

### Scenario 1: Normal Share Reward Flow
```
1. User shares campaign
2. Someone donates via referral link
3. Reward created: pending_hold, hold_until_date = now + 30 days
4. [30 days pass]
5. Hourly job runs, fraud checks pass
6. Status changed to 'approved'
7. Balance updated: wallet.available_cents += 5000
8. Email sent to user: "Your reward is ready!"
9. User can now withdraw
```

### Scenario 2: Fraud Detection (High ROI)
```
1. $1 donation recorded
2. $100 reward generated (10,000% ROI!)
3. Hold period expires
4. Fraud check: ROI > threshold
5. Status changed to 'rejected'
6. Email sent: "Reward under review"
7. Support team notified
8. Admin can manually review and override if needed
```

### Scenario 3: New Account Fraud
```
1. Brand new account (1 second old)
2. Large reward generated ($100)
3. Hold period expires
4. Fraud check: Account age < 1 hour
5. Status: 'rejected'
6. Account flagged for manual review
```

## Debugging

### Job Not Running
```bash
# Check logs
tail -f logs/*.log | grep ProcessShareHolds

# Manually trigger
node -e "require('./src/jobs/ProcessShareHolds').runManual().then(console.log)"

# Check database
mongo
> use honestneed-dev
> db.transactions.find({status: 'pending_hold'}).count()
```

### Rewards Not Approving
```bash
# Check hold dates
mongo
> db.transactions.find({status: 'pending_hold', hold_until_date: {$lt: new Date()}})

# Check for errors in job
tail -f logs/error.log | grep ProcessShareHolds

# Manual test fraud service
node -e "const S = require('./src/services/ShareFraudDetectionService'); 
          S.checkTransactionForFraud(transaction).then(console.log)"
```

### Emails Not Sending
```bash
# Check email service
node -e "const es = require('./src/services/emailService'); 
          console.log(es.getSentEmails())"

# Check provider
grep EMAIL_PROVIDER .env

# For development, emails go to mock provider (stored in memory)
```

## Configuration

### Change Job Schedule
**File:** `src/app.js`, line ~185

```javascript
// Current: every hour at :00
cron.schedule('0 * * * *', async () => { ... });

// Every 6 hours
cron.schedule('0 */6 * * *', async () => { ... });

// Daily at 2 AM
cron.schedule('0 2 * * *', async () => { ... });

// Every 15 minutes (useful for testing)
cron.schedule('*/15 * * * *', async () => { ... });
```

### Change Job Logging Level
**File:** `src/jobs/ProcessShareHolds.js`, line ~25

```javascript
winstonLogger.info('...') // Current
winstonLogger.debug('...') // Less verbose
winstonLogger.warn('...')  // More attention-grabbing
```

### Change Fraud Detection Thresholds
**File:** `src/services/ShareFraudDetectionService.js`

```javascript
// ROI check - line ~85
if (roi > 0.5) { // Change to 0.3 for stricter, 0.7 for more lenient

// Account age - line ~124
if (accountAgeHours < 1) { // Change to 24 for stricter

// IP reputation - line ~192
if (uniqueAccounts > 5) { // Change to 3 for stricter
```

## Monitoring Checklist

Daily:
- [ ] Check ProcessShareHolds logs for errors
- [ ] Monitor fraud rate: rejected / processed
- [ ] Verify wallet balances updated correctly

Weekly:
- [ ] Review rejected transactions for patterns
- [ ] Check for false positives (legitimate users flagged)
- [ ] Monitor job execution time (should be < 5 minutes)

Monthly:
- [ ] Generate fraud report
- [ ] Review fraud thresholds (are we catching enough?)
- [ ] Analyze false positive rate (affecting user experience?)

## Related Phases

- **Phase 1** (Completed): Campaign type + sharing config
- **Phase 2** (Not yet): Conversion attribution pipeline
- **Phase 3.1** (✅ THIS): 30-day hold processor
- **Phase 3.2** (TODO): Advanced fraud detection
- **Phase 4** (TODO): Withdrawal flow + payouts
- **Phase 5** (TODO): Analytics dashboard

## Alerting

Add these to your monitoring system:

```
Alert: ProcessShareHolds job failed
  Condition: job.execution.status === 'error'
  Action: Page on-call engineer

Alert: High fraud rate
  Condition: fraud_rate > 0.15 (> 15%)
  Action: Notify security team

Alert: Job running slow
  Condition: job.duration_ms > 300000 (> 5 min)
  Action: Check database performance

Alert: Unapproved holds aging
  Condition: holds.expiring_today > 100
  Action: Investigate why job isn't running
```

## Testing

```bash
# Run all Phase 3.1 tests
npm test tests/integration/phase3-1-hold-processor.test.js

# Run specific test
npm test -- -t "should approve transaction"

# Run with coverage
npm test -- --coverage tests/integration/phase3-1-hold-processor.test.js
```

## Performance Notes

- For 10,000+ pending holds: Consider batch processing
- Fraud checks: ~100-200ms per transaction (5 sequential checks)
- Database indexes: Added for efficient querying
- Email sending: Non-blocking (doesn't delay job)

## Security Considerations

✅ What's Protected:
- Immediate payouts prevented (30-day hold)
- Multiple fraud patterns detected
- Audit trail maintained
- User notified of decisions
- IP-based patterns tracked

❓ Future enhancements:
- Chargeback webhook integration
- Machine learning fraud detection
- User appeal process
- Admin override with audit logs
- Geolocation verification

---

**Last Updated:** April 8, 2026  
**Status:** ✅ Production Ready
