# Day 5: Troubleshooting Guide - Common Issues & Solutions

**Document Version:** 1.0  
**Status:** Production Ready  
**Audience:** Developers, DevOps, Support Team, Admins  
**Last Updated:** April 2, 2026  

---

## Table of Contents

1. [Frontend Issues](#frontend-issues)
2. [Backend Issues](#backend-issues)
3. [Database Issues](#database-issues)
4. [Integration Issues](#integration-issues)
5. [Performance Issues](#performance-issues)
6. [Payment Processing Issues](#payment-processing-issues)
7. [Admin Operational Issues](#admin-operational-issues)
8. [Emergency Procedures](#emergency-procedures)

---

## Frontend Issues

### Issue 1: "Donation amount must be at least $1"

**Symptom:**
```
Error: "Donation amount must be at least 100 cents ($1.00)"
Code: INVALID_AMOUNT
```

**Cause Analysis:**

| Root Cause | Symptom | Fix |
|-----------|---------|-----|
| Amount not converted to cents | Sending "5" instead of "500" | Multiply by 100 before sending |
| Decimal place error | Sending "5.0" instead of integer | Remove decimals, use integers |
| Amount typed wrong | User entered "0.50" | Validate input minimum is $1 |
| Browser compatibility | Amount type mismatch | Check number parsing works correctly |

**Debug Steps:**

```javascript
// ADD DEBUGGING
console.log('User input:', userInput);           // e.g., "5"
console.log('Parsed as number:', Number(userInput)); // 5
console.log('Multiply by 100:', Number(userInput) * 100); // 500

// EXPECTED: 500 cents (= $5.00)
// WRONG: 5, 5.0, 50, 5.00

// Correct implementation
const donationInDollars = Number(userInput);
const donationInCents = Math.round(donationInDollars * 100);

console.assert(donationInCents >= 100, 'Must be >= $1');
api.createDonation({ amount: donationInCents });
```

**Fix:**

```javascript
// ❌ WRONG - Frontend code
const amount = document.getElementById('donationAmount').value;
api.createDonation({ 
  campaign_id: campaignId,
  amount: amount  // Sending "5" not "500"
});

// ✅ CORRECT - Frontend code
const amountInDollars = parseFloat(
  document.getElementById('donationAmount').value
);
const amountInCents = Math.round(amountInDollars * 100);

// Validate
if (amountInCents < 100) {
  showError('Donation must be at least $1.00');
  return;
}

api.createDonation({ 
  campaign_id: campaignId,
  amount: amountInCents  // Sending "500" correctly
});
```

**Test:**
```javascript
console.log(getDonationInCents(1.00));    // Should be 100
console.log(getDonationInCents(5.50));    // Should be 550
console.log(getDonationInCents(100));     // Should be 10000
console.log(getDonationInCents(0.50));    // Should error (< 100)
```

---

### Issue 2: "Cannot donate to their own campaigns"

**Symptom:**
```
User cannot donate to campaign they created
Error: "Campaign creators cannot donate to their own campaigns"
```

**Cause Analysis:**
- System correctly preventing self-donations
- This is expected behavior (not a bug)

**Context:**
This is a business rule enforcement, not an error. The system is working correctly.

**Validation:**
```javascript
// Backend check (working as intended)
if (campaignCreatorId === donorId) {
  throw new BusinessLogicError(
    'SELF_DONATION_NOT_ALLOWED',
    'Campaign creators cannot donate to their own campaigns'
  );
}
```

**Solution:**
1. Use a different user account to donate
2. Create a test user to verify the feature
3. Donate to campaigns created by other users
4. If needed to bypass for testing, contact engineering team

---

### Issue 3: Authorization Header Missing

**Symptom:**
```
Error: "Missing or invalid authentication token"
Code: UNAUTHORIZED
HTTP Status: 401
```

**Cause Analysis:**
```javascript
// ❌ WRONG - No Authorization header
fetch('/api/donations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(donationData)
});

// ✅ CORRECT - With Authorization header
fetch('/api/donations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`  // Required
  },
  body: JSON.stringify(donationData)
});
```

**Debug Steps:**

```javascript
// Check if token exists
console.log('Token:', localStorage.getItem('auth_token'));

// Check token format
const token = localStorage.getItem('auth_token');
if (!token) {
  console.error('No token stored - user not logged in');
  redirectToLogin();
} else if (!token.startsWith('eyJ')) {
  console.error('Invalid token format - should be JWT');
  clearStorage();
  redirectToLogin();
}

// Check header being sent
console.log('Auth Header:', `Bearer ${token}`);
```

**Fix:**

```javascript
// Create axios instance with default header
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.honestneed.com',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to all requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Now all requests automatically include token
api.post('/donations', donationData);
```

---

## Backend Issues

### Issue 4: Fee Not Calculated Correctly

**Symptom:**
```
Donation: $100
Expected fee: $20 (20%)
Actual fee: $19.99 or $20.01
```

**Cause Analysis:**
- Floating point arithmetic error
- Backend should use cents (integers), not dollars (floats)

**Debugging:**

```javascript
// ❌ WRONG - Using floats
const platformFee = donationAmount * 0.2;  // 100.00 * 0.2 = 19.999...
const creatorGet = donationAmount - platformFee;  // 100.00 - 19.999 = 80.001

// ✅ CORRECT - Using cents (integers)
const donationCents = 10000;  // $100.00 in cents
const platformFeeCents = Math.round(donationCents * 0.2);  // 2000
const creatorGetCents = donationCents - platformFeeCents;  // 8000
// Result: $100, $20, $80 - exact
```

**Check Backend Code:**

```javascript
// Look for calculations like this in DonationController.js
const donation = {
  amount: 10000,  // cents
  platform_fee: Math.round(10000 * 0.2),  // ✅ CORRECT: 2000
  creator_receive: 10000 - Math.round(10000 * 0.2)  // ✅ CORRECT: 8000
};
```

**Verify in Database:**

```javascript
// Check stored values use cents
db.donations.findOne()
// Should show: { amount: 10000, fee: 2000 }
// NOT: { amount: 100.00, fee: 19.99 }

// Query to find floating point issues
db.donations.find({
  platform_fee: { $not: { $mod: [1, 0] } }  // Finds decimals
});
```

**Fix:**
1. Ensure all calculations use cents (integers)
2. Use `Math.round()` for any divisions
3. Never send float amounts to database
4. Validate in API response checking

---

### Issue 5: Donation Recorded But Fee Not Created

**Symptom:**
```
Campaign shows $100 donation
But no fee transaction in database
Admin dashboard shows $0 fees
```

**Cause Analysis:**
- Exception in FeeTrackingService
- Async operation not awaited
- Database transaction failed
- Service dependency issue

**Investigation:**

```bash
# Check error logs
tail -f logs/application.log | grep "donation\|fee"

# Look for patterns
[ERROR] Failed to create fee transaction: connection timeout
[ERROR] FeeTrackingService.recordFeeTransaction() failed
[WARN] Donation created but fee not recorded
```

**Check Code Flow:**

```javascript
// In DonationController.js - createDonation()

// STEP 1: Save donation
const donation = await Donation.create({...});
console.log('✅ Donation saved:', donation._id);

// STEP 2: Record fee (THIS MUST complete)
try {
  const fee = await FeeTrackingService.recordFeeTransaction(...);
  console.log('✅ Fee recorded:', fee._id);
} catch (err) {
  console.error('❌ Fee recording failed:', err);
  // If this fails, should we rollback donation?
  // Currently: no rollback (Phase 2 improvement)
}

// STEP 3: Create sweepstakes entry
const entry = await SweepstakesService.createEntry(...);
```

**Fix:**

```javascript
//Version 1: With error handling
async function createDonation(donationData) {
  const donation = await Donation.create(donationData);
  
  // Must not fail silently
  let fee;
  try {
    fee = await FeeTrackingService.recordFeeTransaction(
      donation._id,
      donation.amount,
      { campaign_id: donation.campaign_id }
    );
  } catch (error) {
    // Log critical error
    logger.error('Fee recording failed', {
      donation_id: donation._id,
      error: error.message,
      request_id: req.id
    });
    
    // Alert monitoring
    sendAlert('Fee creation failed', 'critical');
    
    // Return error (don't hide it)
    throw error;
  }

  return { donation, fee };
}

// Version 2: Verify after create
const donation = await Donation.create({...});
const fee = await FeeTransaction.findOne({
  donation_id: donation._id
});
if (!fee) {
  throw new Error('Fee was not recorded - critical error');
}
```

**Verify Fix:**

```javascript
// Query to find donations without fees
db.donations.find({
  _id: { $nin: db.feetransactions.find({}).map(f => f.donation_id) }
});

// Should return empty array if all fees recorded
```

---

### Issue 6: Campaign Metrics Not Updated

**Symptom:**
```
Donation created: $100
Campaign.current_raised: Still 0 (should be 100.00)
Campaign.donation_count: 0 (should be 1)
Campaign.total_donors: 0 (should be 1)
```

**Cause Analysis:**
- CampaignService update not called
- Async operation not awaited
- Update query didn't match campaign
- Race condition with concurrent updates

**Investigation:**

```javascript
// Check if update is being called
// In donationFlow or donation service...

// ❌ NOT CALLED
const donation = await Donation.create({...});
// Missing: await CampaignService.updateMetrics(...)

// ✅ CORRECT - Called and awaited
const donation = await Donation.create({...});
await CampaignService.updateMetrics(
  donation.campaign_id,
  {
    donation_amount: donation.amount,
    donor_count: 1
  }
);
```

**Debug Steps:**

```bash
# Check logs for metrics update
grep "updateMetrics\|metrics updated" logs/application.log

# Query campaign before/after
db.campaigns.findOne({ _id: ObjectId("...") })
// Check: current_raised, donation_count, total_donors

# Check if there's a separate metrics table
db.campaignmetrics.findOne({ campaign_id: ObjectId("...") })
```

**Fix:**

```javascript
async function createDonation(req, res) {
  const { campaign_id, amount, ...rest } = req.body;
  
  // 1. Create donation
  const donation = await Donation.create({
    campaign_id,
    amount,
    ...rest
  });

  // 2. Update campaign (must await)
  const updated = await Campaign.findByIdAndUpdate(
    campaign_id,
    {
      $inc: {
        current_raised: amount,
        donation_count: 1
      },
      $addToSet: { donor_ids: donation.donor_id }
    },
    { new: true }
  );

  // 3. Verify update
  if (!updated) {
    logger.error('Campaign update failed', { campaign_id });
    throw new Error('Campaign update failed');
  }

  // 4. Respond with updated campaign
  res.status(201).json({
    success: true,
    data: {
      donation,
      campaign: {
        current_raised: updated.current_raised,
        donation_count: updated.donation_count
      }
    }
  });
}
```

---

## Database Issues

### Issue 7: Database Connection Timeout

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:27017
Error: MongoNetworkError: failed to connect
HTTP 503: Service Unavailable
```

**Cause Analysis:**
- MongoDB service not running
- Connection string wrong
- Network issue
- MongoDB exceeded connection pool

**Check MongoDB Status:**

```bash
# Check if MongoDB is running
sudo systemctl status mongod

# Start MongoDB if stopped
sudo systemctl start mongod

# Check connection string
echo $MONGO_URI
# Should be: mongodb://user:pass@host:27017/database

# Test connection manually
mongosh --uri "mongodb://localhost:27017/honestneed"

# Check connection pool
db.serverStatus().connections
# { current: 5, available: 95, totalCreated: 12 }
```

**Fix:**

```javascript
// In database connection code
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,        // ✅ Set pool size
  serverSelectionTimeoutMS: 5000,  // ✅ Add timeout
  socketTimeoutMS: 45000,  // ✅ Socket timeout
  retryWrites: true
});

mongoose.connection.on('error', (err) => {
  logger.error('Database connection error', err);
  // Alert ops team
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Database disconnected - reconnecting...');
});
```

---

### Issue 8: Deadlock in Fee Settlement

**Symptom:**
```
Settlement stalled after 10 minutes
Multiple "waiting for lock" messages
CPU usage near 0%
```

**Cause Analysis:**
- Transaction holding lock too long
- Multiple admins settling simultaneously
- Query scanning too much data

**Check Active Operations:**

```javascript
// Connect to MongoDB
db = connect("mongodb://localhost:27017/honestneed");

// See current operations
db.currentOp();

// Kill problematic operation
db.killOp(opid);

// Check locks
db.adminCommand({ "currentOp": true });
```

**Prevention:**

```javascript
// Use session with timeout
const session = db.getMongo().startSession();

try {
  await FeeTransaction.updateMany(
    { fee_status: 'verified', _id: { $in: ids } },
    { $set: { fee_status: 'settled', settlement_id } },
    { session, new: true }
  );
  
  await session.commitTransaction();
} catch (err) {
  await session.abortTransaction();
  throw err;
} finally {
  await session.endSession();
}
```

---

## Integration Issues

### Issue 9: Payment Verification Failed

**Symptom:**
```
Transaction shows as pending but no payment in Stripe
OR
Payment in Stripe but system doesn't find it
Error: Payment reference not found
```

**Cause Analysis:**
- Wrong payment reference format
- Payment still processing
- Payment method mismatch
- Reference ID typo

**Verification Steps:**

```bash
# For Stripe payments
curl https://api.stripe.com/v1/charges/ch_1234567890 \
  -u sk_live_xxxxx:

# Check status
{
  "id": "ch_1234567890",
  "object": "charge",
  "amount": 5000,      # 5000 cents = $50
  "status": "succeeded"  # ✅ or "failed"
}

# For Bank transfers
# Check bank statement for amount and reference
# Amount: $50.00
# Reference: BT_2026_04_02_001
# Date: matches submission date
```

**Fix:**

```javascript
// Admin verification process
async function verifyPayment(transactionId, paymentRef) {
  // 1. Get the payment reference from system
  const fee = await FeeTransaction.findById(transactionId);
  
  // 2. Call payment processor
  let paymentExists = false;
  try {
    if (fee.payment_method === 'credit_card') {
      const charge = await stripe.charges.retrieve(paymentRef);
      paymentExists = charge.status === 'succeeded' && 
                      charge.amount === fee.donation_amount;
    } else if (fee.payment_method === 'paypal') {
      const payment = await paypal.getTransaction(paymentRef);
      paymentExists = payment.state === 'approved';
    }
  } catch (err) {
    console.error('Payment lookup failed:', err);
    return { verified: false, error: 'Payment processor error' };
  }

  // 3. Result
  if (paymentExists) {
    fee.fee_status = 'verified';
    await fee.save();
    return { verified: true };
  } else {
    return { verified: false, error: 'Payment not found' };
  }
}
```

---

## Performance Issues

### Issue 10: Slow Dashboard Load

**Symptom:**
```
Dashboard takes 5-10 seconds to load
Admin sees "Loading..." spinner forever
Transactions list takes >3 seconds
```

**Cause Analysis:**
- Too many transactions to aggregate
- Missing database indexes
- N+1 query problem
- Aggregation pipeline inefficient

**Check Indexes:**

```javascript
// Connect to database
db = connect("mongodb://localhost:27017/honestneed");
use honestneed;

// List indexes on feetransactions
db.feetransactions.getIndexes();

// Should see:
[
  { "_id_": { "v": 2 } },
  { "campaign_id_1_fee_status_1": { "v": 2 } },  // ✅ Good
  { "created_at_-1": { "v": 2 } },                // ✅ Good
  { "settlement_id_1": { "v": 2 } }               // ✅ Good
]

// If missing, create them
db.feetransactions.createIndex({ campaign_id: 1, fee_status: 1 });
db.feetransactions.createIndex({ created_at: -1 });
db.feetransactions.createIndex({ settlement_id: 1 });
```

**Optimize Queries:**

```javascript
// ❌ SLOW N+1 query
const fees = await FeeTransaction.find({ status: 'pending_settlement' });
for (const fee of fees) {
  fee.campaign = await Campaign.findById(fee.campaign_id);  // N queries!
}

// ✅ FAST - Use populate or aggregation
const fees = await FeeTransaction
  .find({ status: 'pending_settlement' })
  .populate('campaign_id', 'title')        // Join in single query
  .lean()                                   // Don't hydrate documents
  .limit(100);                              // Pagination
```

**Check Query Execution:**

```javascript
// Add query timing
const start = Date.now();
const fees = await FeeTransaction.find({...});
const duration = Date.now() - start;

logger.info('Query took', { query: 'getFeeTransactions', duration });

// If duration > 1000ms, investigate:
// 1. Add indexes
// 2. Use pagination
// 3. Use aggregation pipeline
// 4. Cache results
```

---

## Payment Processing Issues

### Issue 11: Concurrent Donation Amount Race Condition

**Symptom:**
```
Two $50 donations submitted simultaneously
Campaign raised: $150 (should be $100)
OR
Campaign raised: $50 (should be $100)
```

**Cause Analysis:**
- Database not atomic (read-modify-write not atomic)
- Race condition between two concurrent requests

**Prevent Race Condition:**

```javascript
// ❌ WRONG - Not atomic
const campaign = await Campaign.findById(id);
campaign.current_raised += amount;
await campaign.save();  // Another request can read old value before this

// ✅ CORRECT - Atomic operation
await Campaign.findByIdAndUpdate(
  id,
  { $inc: { current_raised: amount } },  // Atomic increment
  { new: true }
);
```

**Test Race Condition:**

```javascript
// Simulated concurrent updates
async function testRaceCondition() {
  const campaignId = 'test_campaign';
  
  // Reset
  await Campaign.updateOne({ _id: campaignId }, { current_raised: 0 });
  
  // Send 100 concurrent donations of $10 each
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(
      Donation.create({ 
        campaign_id: campaignId, 
        amount: 1000  // $10
      }).then(() => 
        Campaign.findByIdAndUpdate(
          campaignId,
          { $inc: { current_raised: 1000 } }
        )
      )
    );
  }
  
  await Promise.all(promises);
  
  // Check result
  const campaign = await Campaign.findById(campaignId);
  console.assert(
    campaign.current_raised === 100000,  // 100 * $10
    `Race condition detected: ${campaign.current_raised}`
  );
}
```

---

## Admin Operational Issues

### Issue 12: Cannot Create Settlement

**Symptom:**
```
Error: "Insufficient data to process request"
Settlement button disabled
OR
Settlement fails during confirmation
```

**Cause Analysis:**
- No verified fees available
- Already in settlement process
- Admin doesn't have permission
- System error

**Debug Steps:**

```javascript
// 1. Check verified fees exist
const verifiedCount = await FeeTransaction.countDocuments({
  fee_status: 'verified'
});
console.log('Verified fees:', verifiedCount);
// If 0, no fees to settle

// 2. Check admin permissions
const admin = await User.findById(req.userId);
console.log('Admin role:', admin.role);  // Should be 'admin'

// 3. Check active settlement
const active = await SettlementLedger.findOne({
  status: { $ne: 'completed' }
});
if (active) {
  console.error('Settlement already in progress:', active._id);
}

// 4. Check for errors
db.settlementledgers.find({ status: 'failed' }).pretty();
```

**Fix:**

```javascript
// Improve error messaging
async function createSettlement(req, res) {
  const { fee_ids, ...data } = req.body;

  // 1. Validate
  if (!fee_ids || fee_ids.length === 0) {
    return res.status(400).json({
      error: {
        code: 'INSUFFICIENT_DATA',
        message: 'Must select at least one fee to settle',
        details: { provided: fee_ids?.length || 0, minimum: 1 }
      }
    });
  }

  // 2. Check all fees are verified
  const unverified = await FeeTransaction.countDocuments({
    _id: { $in: fee_ids },
    fee_status: { $ne: 'verified' }
  });

  if (unverified > 0) {
    return res.status(400).json({
      error: {
        code: 'CANNOT_SETTLE_UNVERIFIED_FEES',
        message: 'All fees must be verified before settlement',
        details: { unverified }
      }
    });
  }

  // 3. Check admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Only admins can create settlements'
      }
    });
  }

  // 4. Proceed with settlement
  ...
}
```

---

## Emergency Procedures

### Emergency 1: Data Corruption Detected

**When to Use:**
- Donation amounts don't match database
- Campaign metrics completely wrong
- Fee calculations impossible

**Steps:**

```bash
# 1. Alert team
Slack: #incidents
"Data corruption detected in fees. Disabling settlement until resolved."

# 2. Stop all writes (if severe)
# Temporarily disable endpoints
# Only allow reads for investigation

# 3. Backup database
mongodump --db honestneed --out /backups/honestneed_$(date +%s)

# 4. Investigate scope
# How many records affected?
db.feetransactions.count({
  fee_amount: { $gt: donation_amount }  // Impossible condition
})

# 5. Contact engineering
# Don't attempt to fix manually
# Wait for engineer to analyze and restore from backup
```

---

### Emergency 2: Database Down

**Symptoms:**
- All requests return 503
- "MongoDB connection failed"
- Dashboard inaccessible

**Steps:**

```bash
# 1. Check MongoDB health
sudo systemctl status mongod

# 2. If stopped, restart
sudo systemctl restart mongod

# 3. Wait for it to come back
# Watch logs: tail -f /var/log/mongodb/mongod.log

# 4. Verify it's healthy
mongosh -u admin -p --eval "db.adminCommand('ping')"
# Should see: { ok: 1 }

# 5. Check replication status (if replica set)
rs.status()

# 6. If corrupted, restore from backup
# Contact DevOps - this is manual and requires downtime
```

---

### Emergency 3: Cascading Fee Update Failure

**Symptom:**
- Settlement started but many fees not updating
- Some marked settled, others still pending
- Partial settlement state

**Prevention:**

```javascript
// Use transaction (atomic) for settlement
async function settleFees(feeIds, adminId) {
  const session = mongoose.startSession();
  session.startTransaction();

  try {
    // Everything happens together or nothing
    const result = await FeeTransaction.updateMany(
      { _id: { $in: feeIds }, fee_status: 'verified' },
      { 
        $set: { 
          fee_status: 'settled',
          settlement_id: settlementId,
          settled_at: new Date()
        }
      },
      { session }
    );

    const ledger = await SettlementLedger.create(
      [{
        fee_ids: feeIds,
        total: feeIds.length,
        settled_by: adminId,
        status: 'completed'
      }],
      { session }
    );

    await session.commitTransaction();
    return ledger;
  } catch (err) {
    // All changes rolled back
    await session.abortTransaction();
    throw err;
  } finally {
    await session.endSession();
  }
}
```

---

## Incident Response Checklist

Use this checklist when issues occur:

- [ ] Identify severity (P1/P2/P3)
- [ ] Alert relevant team(s)
- [ ] Document timeline of events
- [ ] Attempt basic remedy (restart, clear cache)
- [ ] Review recent deployments/changes
- [ ] Check error logs for patterns
- [ ] Query database for affected data
- [ ] If data issue: Stop writes immediately
- [ ] Contact engineering for code issues
- [ ] Contact DevOps for infrastructure issues
- [ ] Keep stakeholders updated every 15 min
- [ ] Document resolution and root cause
- [ ] Schedule post-mortem

---

**Troubleshooting Guide Complete**  
**For immediate support:** support@honestneed.com  
**For technical issues:** engineering@honestneed.com  
**For emergency escalation:** Page on-call engineer  

