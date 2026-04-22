# Phase 1 Implementation - Complete Code Changes

**Status**: Ready for implementation  
**Date**: April 8, 2026  
**Priority**: CRITICAL - Blocking production launch

---

## Step 1: Update Transaction Model with New Fields

**File**: `src/models/Transaction.js`

**Location**: After `sweepstakes_entries_awarded` field

**ADD**:
```javascript
// ✅ ADDED in Phase 1.2: Sweepstakes entries created from this donation
sweepstakes_entries_created: {
  type: Number,
  default: 0,
  min: 0,
  description: 'Number of sweepstakes entries created ($1 = 1 entry)',
},

// ✅ ADDED in Phase 1.4: Idempotency key for preventing duplicate donations
idempotency_key: {
  type: String,
  unique: true,
  sparse: true, // Allow null for existing transactions
  index: true,
  description: 'Unique key for preventing duplicate donations on retry',
},
```

**ADD To Indexes**:
```javascript
// ✅ ADDED: Index for idempotency key lookup (for Phase 1.4)
transactionSchema.index(
  { idempotency_key: 1 },
  { unique: true, sparse: true, name: 'idempotency_key_idx' }
);
```

---

## Step 2: Create SweepstakesEntry Model

**File**: `src/models/SweepstakesEntry.js` (NEW)

See `PHASE_1_IMPLEMENTATION_GUIDE.md` for full model code.

---

## Step 3: Update DonationController

**File**: `src/controllers/DonationController.js`

### Change 3.1: Add Idempotency Check at Start of createDonation

**Location**: At the beginning of `createDonation` after input validation

**ADD BEFORE** `const campaign = await Campaign.findById(campaignId)`:

```javascript
    // ✅ ADDED Phase 1.4: Generate or extract idempotency key
    let idempotencyKey = req.body.idempotency_key;
    if (!idempotencyKey) {
      // Generate deterministic key from request metadata
      idempotencyKey = `${supporterId}-${campaignId}-${amount}-${paymentMethod}-${Math.floor(Date.now() / 1000)}`;
    }

    logger.info('💱 DonationController: Checking idempotency', {
      idempotency_key: idempotencyKey,
      campaignId,
      amount,
      supporterId,
    });

    // ✅ ADDED Phase 1.4: Check for existing donation with same idempotency key
    const Transaction = require('../models/Transaction');
    const existingDonation = await Transaction.findOne({ idempotency_key: idempotencyKey });
    if (existingDonation) {
      logger.info('♻️ DonationController: Idempotency - Returning cached result', {
        idempotency_key: idempotencyKey,
        existing_transaction_id: existingDonation._id,
        existing_transaction_ref: existingDonation.transaction_id,
      });

      // Return cached response
      const feeBreakdown = {
        gross_cents: existingDonation.amount_cents,
        fee_cents: existingDonation.platform_fee_cents,
        net_cents: existingDonation.net_amount_cents,
        platform_fee_percentage: 20,
      };

      return res.status(200).json({
        success: true,
        message: 'Donation already processed (cached result)',
        data: {
          transaction_id: existingDonation.transaction_id,
          transaction_db_id: existingDonation._id,
          amount_dollars: (existingDonation.amount_cents / 100).toFixed(2),
          fee_breakdown: {
            gross: feeBreakdown.gross_cents,
            fee: feeBreakdown.fee_cents,
            net: feeBreakdown.net_cents,
            fee_percentage: feeBreakdown.platform_fee_percentage,
          },
          sweepstakes_entries: existingDonation.sweepstakes_entries_created || 0,
          tracking_id: existingDonation._id.toString(),
          cached: true,
        },
      });
    }
```

### Change 3.2: Pass idempotency_key to TransactionService

**Location**: Where `TransactionService.recordDonation` is called

**CHANGE FROM**:
```javascript
      const donationResult = await TransactionService.recordDonation(
        campaignId,
        supporterId,
        amount,
        paymentMethod,
        {
          proofUrl,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          referralCode: refCode,
        }
      );
```

**CHANGE TO**:
```javascript
      const donationResult = await TransactionService.recordDonation(
        campaignId,
        supporterId,
        amount,
        paymentMethod,
        {
          proofUrl,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          referralCode: refCode,
          idempotency_key: idempotencyKey, // ✅ ADDED Phase 1.4
        }
      );
```

### Change 3.3: Add Sweepstakes Entry Creation

**Location**: After transaction is successfully created, before response

**ADD AFTER** `await FeeTrackingService.recordFee({...})`:

```javascript
    // ✅ ADDED Phase 1.2: Create sweepstakes entries from donation
    const SweepstakesService = require('../services/SweepstakesService');
    const SweepstakesEntry = require('../models/SweepstakesEntry');
    
    const entries = Math.floor(amount_cents / 100); // $1 = 1 entry
    
    if (entries > 0) {
      try {
        const sweepstakesResult = await SweepstakesService.createEntriesFromDonation({
          campaignId,
          supporterId,
          creatorId: campaign.creator_id,
          transactionId: donationResult.data._id,
          amountCents: amount_cents,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });

        if (sweepstakesResult.success) {
          // Update transaction with created entries
          await Transaction.updateOne(
            { _id: donationResult.data._id },
            { sweepstakes_entries_created: entries }
          );

          logger.info('✅ 🎰 DonationController: Sweepstakes entries created', {
            transactionId: donationResult.data._id,
            entries: entries,
            campaignId,
          });

          // Include in response
          response.data.sweepstakes_entries = entries;
        } else {
          logger.error('❌ 🎰 DonationController: Failed to create sweepstakes entries', {
            error: sweepstakesResult.error,
            transaction_id: donationResult.data._id,
          });
          // Don't fail the donation if sweepstakes creation fails
          response.data.sweepstakes_entries = 0;
          response.warnings = response.warnings || [];
          response.warnings.push({
            code: 'SWEEPSTAKES_CREATE_FAILED',
            message: 'Donation recorded but sweepstakes entry creation failed',
          });
        }
      } catch (error) {
        logger.error('❌ 🎰 DonationController: Exception creating sweepstakes entries', {
          error: error.message,
          stack: error.stack,
          transaction_id: donationResult.data._id,
        });
        // Continue - don't fail the donation
        response.data.sweepstakes_entries = 0;
      }
    } else {
      response.data.sweepstakes_entries = 0;
    }
```

### Change 3.4: Update Response to Include sweepstakes_entries

**Location**: Response building section

**ENSURE response includes**:
```javascript
response.data.sweepstakes_entries = entries; // Added in Change 3.3
```

---

## Step 4: Create AnalyticsService Methods

**File**: `src/services/analyticsService.js`

### Add 4.1: Add Fee Breakdown and Timeline Method

**ADD** this new static method to the AnalyticsService class:

```javascript
/**
 * Get campaign analytics with fee breakdown and timeline data
 * ✅ ADDED Phase 1.3: Complete fee breakdown and daily timeline
 * 
 * @param {string} campaignId - Campaign MongoDB ID
 * @param {Object} options - Configuration options
 * @returns {Object} - Analytics data with fees and timeline
 */
static async getCampaignAnalyticsWithFees(campaignId, options = {}) {
  try {
    const Campaign = require('../models/Campaign');
    const Transaction = require('../models/Transaction');
    const logger = require('../utils/winstonLogger');

    logger.debug('📊 AnalyticsService: Fetching campaign for fee analysis', { campaignId });

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      logger.error('📊 AnalyticsService: Campaign not found', { campaignId });
      throw new Error('Campaign not found');
    }

    // Get all transactions for this campaign
    logger.debug('📊 AnalyticsService: Fetching transactions', { campaignId });
    const transactions = await Transaction.find({ campaign_id: campaignId })
      .sort({ created_at: 1 });

    logger.info('📊 AnalyticsService: Transactions retrieved', {
      campaignId,
      count: transactions.length,
    });

    // Calculate totals
    const totalDonations = transactions.length;
    const totalAmountCents = transactions.reduce((sum, t) => sum + (t.amount_cents || 0), 0);
    const feeCents = Math.round(totalAmountCents * 0.2); // 20% platform fee
    const netCents = totalAmountCents - feeCents;
    const averageDonationCents = totalDonations > 0 ? Math.round(totalAmountCents / totalDonations) : 0;

    logger.debug('📊 AnalyticsService: Totals calculated', {
      totalDonations,
      totalAmountCents,
      feeCents,
      netCents,
      averageDonationCents,
    });

    // Build timeline (daily breakdown)
    const timeline = this._buildTimelineData(transactions);

    // Build recent donations list (last 20)
    const recentDonations = transactions
      .slice(-20)
      .reverse()
      .map(t => ({
        id: t._id,
        transaction_id: t.transaction_id,
        donor_name: t.is_anonymous ? 'Anonymous Donor' : t.supporter_id?.display_name || 'Unknown',
        amount_dollars: (t.amount_cents / 100).toFixed(2),
        amount_cents: t.amount_cents,
        message: t.message || null,
        payment_method: t.payment_method,
        status: t.status,
        created_at: t.created_at,
      }));

    logger.info('📊 AnalyticsService: Recent donations built', { count: recentDonations.length });

    const result = {
      campaign: {
        _id: campaign._id,
        campaign_id: campaign.campaign_id,
        title: campaign.title,
        status: campaign.status,
        created_at: campaign.created_at,
      },
      donations: {
        total_count: totalDonations,
        total_amount_cents: totalAmountCents,
        total_amount_dollars: (totalAmountCents / 100).toFixed(2),
        average_donation_cents: averageDonationCents,
        average_donation_dollars: (averageDonationCents / 100).toFixed(2),
      },
      // ✅ ADDED Phase 1.3: Fee breakdown details
      fees: {
        total_fee_cents: feeCents,
        total_fee_dollars: (feeCents / 100).toFixed(2),
        fee_percentage: 20,
        creator_net_cents: netCents,
        creator_net_dollars: (netCents / 100).toFixed(2),
      },
      // ✅ ADDED Phase 1.3: Daily timeline breakdown
      timeline: timeline,
      // ✅ ADDED Phase 1.3: Recent donations array
      recent_donations: recentDonations,
      progress: {
        goal_cents: campaign.goal_amount_cents || 0,
        goal_dollars: ((campaign.goal_amount_cents || 0) / 100).toFixed(2),
        raised_cents: totalAmountCents,
        raised_dollars: (totalAmountCents / 100).toFixed(2),
        percentage: campaign.goal_amount_cents ? 
          Math.round((totalAmountCents / campaign.goal_amount_cents) * 100) : 0,
      },
      timestamp: new Date().toISOString(),
    };

    logger.info('✅ 📊 AnalyticsService: Analytics with fees calculated successfully', {
      campaignId,
      totalFees: feeCents,
      timelineLength: timeline.length,
    });

    return result;
  } catch (error) {
    logger.error('❌ 📊 AnalyticsService: Error calculating analytics with fees', {
      error: error.message,
      campaignId,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Build timeline data from transactions
 * ✅ ADDED Phase 1.3: Group donations by day
 * @private
 */
static _buildTimelineData(transactions) {
  const timelineMap = new Map();

  // Group transactions by day
  transactions.forEach(t => {
    const date = new Date(t.created_at);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format

    if (!timelineMap.has(dateKey)) {
      timelineMap.set(dateKey, {
        date: dateKey,
        donations: 0,
        total_amount_cents: 0,
        count: 0,
      });
    }

    const dayData = timelineMap.get(dateKey);
    dayData.donations += 1;
    dayData.total_amount_cents += (t.amount_cents || 0);
    dayData.count += 1;
  });

  // Convert to array and add calculated fields
  const timeline = Array.from(timelineMap.values())
    .map(day => ({
      ...day,
      total_amount_dollars: (day.total_amount_cents / 100).toFixed(2),
      average_donation_cents: Math.round(day.total_amount_cents / day.count),
      average_donation_dollars: (day.total_amount_cents / day.count / 100).toFixed(2),
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort by date ascending

  return timeline;
}
```

---

## Step 5: Update TransactionService

**File**: `src/services/TransactionService.js`

### Change 5.1: Add idempotency_key parameter

**Location**: In `recordDonation` method

**WHEN CREATING transaction**, ADD `idempotency_key` field:

```javascript
    const transaction = await Transaction.create({
      transaction_id: this.generateTransactionId(),
      campaign_id: campaignId,
      supporter_id: supporterId,
      creator_id: campaign.creator_id,
      amount_cents: amount_cents,
      platform_fee_cents: feeCents,
      net_amount_cents: netCents,
      payment_method: paymentMethod,
      proof_url: metadata?.proofUrl || null,
      status: 'pending',
      ip_address: metadata?.ipAddress,
      user_agent: metadata?.userAgent,
      idempotency_key: metadata?.idempotency_key, // ✅ ADDED Phase 1.4
      sweepstakes_entries_created: 0, // Will be updated by controller ✅ Phase 1.2
      created_at: new Date(),
    });
```

### Change 5.2: Add Duplicate Key Error Handling

**Location**: In the catch block of `recordDonation`

**ADD**:
```javascript
    } catch (error) {
      // ✅ ADDED Phase 1.4: Handle duplicate idempotency key
      if (error.code === 11000 && error.keyPattern?.idempotency_key) {
        logger.warn('♻️ TransactionService: Idempotency key collision - retrieving existing transaction', {
          idempotency_key: metadata?.idempotency_key,
          error: error.message,
        });
        
        const existing = await Transaction.findOne({ 
          idempotency_key: metadata?.idempotency_key 
        });
        
        if (existing) {
          return {
            success: true,
            data: existing,
            cached: true,
            message: 'Transaction already exists for this idempotency key',
          };
        }
      }
      
      // ... existing error handling ...
      throw error;
    }
```

---

## Step 6: Update AnalyticsController

**File**: `src/controllers/analyticsController.js`

### Change 6.1: Update getAnalytics to use new method

**Location**: In `getAnalytics` method where `AnalyticsService.getAnalytics` is called

**CHANGE FROM**:
```javascript
      analytics = await AnalyticsService.getAnalytics(campaign._id, {
        includeProgress: true,
        progressDays,
      });
```

**CHANGE TO**:
```javascript
      // ✅ UPDATED Phase 1.3: Use new method with fee breakdown and timeline
      analytics = await AnalyticsService.getCampaignAnalyticsWithFees(campaign._id, {
        includeProgress: true,
        progressDays,
      });
```

---

## Testing Commands

### Test 1: Create Donation and Verify Sweepstakes Entries

```bash
curl -X POST http://localhost:3000/campaigns/{campaignId}/donations \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50,
    "paymentMethod": "stripe"
  }'

# Expected response includes:
# "sweepstakes_entries": 50
```

### Test 2: Check Analytics with Fee Breakdown

```bash
curl -X GET http://localhost:3000/campaigns/{campaignId}/analytics \
  -H "Authorization: Bearer {token}"

# Expected response includes:
# {
#   "fees": {
#     "total_fee_cents": ...,
#     "creator_net_cents": ...
#   },
#   "timeline": [ { "date": "2026-04-08", "donations": 5, ... } ],
#   "recent_donations": [ ... ]
# }
```

### Test 3: Test Idempotency

```bash
# First request
curl -X POST http://localhost:3000/campaigns/{campaignId}/donations \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "paymentMethod": "stripe",
    "idempotency_key": "test-key-123"
  }'
# Returns 201

# Retry with same key
curl -X POST http://localhost:3000/campaigns/{campaignId}/donations \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "paymentMethod": "stripe",
    "idempotency_key": "test-key-123"
  }'
# Returns 200 with "cached": true
```

---

## Verification Checklist

### Phase 1.2: Sweepstakes Entry Tracking
- [ ] SweepstakesEntry model created
- [ ] DonationController creates entries
- [ ] Entries stored in database
- [ ] Response includes sweepstakes_entries count
- [ ] Zero entries for donations < $1
- [ ] Proper logging at info and error levels

### Phase 1.3: Analytics Fee Breakdown & Timeline
- [ ] getCampaignAnalyticsWithFees method added
- [ ] Fee calculation correct (20% of total)
- [ ] Timeline generated with daily breakdown
- [ ] Recent donations array populated
- [ ] All amounts in both cents and dollars
- [ ] Analytics controller updated

### Phase 1.4: Donation Idempotency
- [ ] idempotency_key field added to Transaction
- [ ] Unique index created
- [ ] Idempotency check in DonationController
- [ ] Cached results returned on retry
- [ ] No duplicate transactions created
- [ ] Error handling for duplicate keys

---

## Database Migration

If deploying to existing environment:

```javascript
// Run in MongoDB:

// Add idempotency_key index
db.transactions.createIndex(
  { idempotency_key: 1 },
  { unique: true, sparse: true }
);

// Add sweepstakes_entries index for campaign
db.sweepstakes_entries.createIndex({ campaign_id: 1, status: 1 });
db.sweepstakes_entries.createIndex({ supporter_id: 1, created_at: -1 });
```

---

**Status**: Ready for implementation  
**Complexity**: Medium    
**Risk**: Low (backwards compatible)  
**Effort**: 7-8 hours  
**Impact**: Enables core features
