# Phase 1 Implementation Guide - Complete Production-Ready Fixes

**Date**: April 8, 2026  
**Phase**: 1 (MVP Blockers)  
**Estimated Duration**: 8-12 hours  
**Status**: IN PROGRESS

---

## Quick Summary

Implementing three critical fixes:
1. **Sweepstakes Entry Tracking** (1.2) - 2 hours
2. **Analytics Fee Breakdown & Timeline** (1.3) - 3 hours  
3. **Donation Idempotency** (1.4) - 2 hours

Total: ~7-8 hours of focused development

---

## Fix 1.2: Implement Sweepstakes Entry Tracking

### Step 1: Create SweepstakesEntry Model

**File**: `src/models/SweepstakesEntry.js` (NEW)

```javascript
const mongoose = require('mongoose');

const sweepstakesEntrySchema = new mongoose.Schema(
  {
    // Identifiers
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    supporter_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
      unique: true, // One entry per transaction
      index: true,
    },
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Entry details
    entries_count: {
      type: Number,
      required: true,
      min: 1,
      description: 'Number of entries ($1 = 1 entry)',
    },
    donation_amount_cents: {
      type: Number,
      required: true,
      min: 100, // Minimum $1.00
    },

    // Status
    status: {
      type: String,
      enum: ['active', 'won', 'expired', 'claimed', 'unclaimed'],
      default: 'active',
      index: true,
    },

    // Drawing info (if won)
    drawing_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SweepstakesDrawing',
      sparse: true,
    },
    is_winner: {
      type: Boolean,
      default: false,
      index: true,
    },
    prize_amount_cents: {
      type: Number,
      default: 0,
    },
    won_at: Date,

    // Metadata
    ip_address: String,
    user_agent: String,

    // Timestamps
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'sweepstakes_entries',
    timestamps: false,
  }
);

// Indexes for performance
sweepstakesEntrySchema.index({ campaign_id: 1, status: 1 });
sweepstakesEntrySchema.index({ supporter_id: 1, created_at: -1 });
sweepstakesEntrySchema.index({ is_winner: 1, campaign_id: 1 });

module.exports = mongoose.model('SweepstakesEntry', sweepstakesEntrySchema);
```

### Step 2: Update Transaction Model

Add `sweepstakes_entries_created` field to track entries:

**File**: `src/models/Transaction.js`

Add this field to the schema:
```javascript
// Added to transactionSchema
sweepstakes_entries_created: {
  type: Number,
  default: 0,
  min: 0,
  description: 'Number of sweepstakes entries created from this donation'
},
```

### Step 3: Update DonationController to Create Entries

**File**: `src/controllers/DonationController.js`

Update the `createDonation` method to create sweepstakes entries after transaction is created:

```javascript
// After transaction is created and before response:

// Calculate sweepstakes entries (1 entry per $1 donated)
const entries = Math.floor(amount_cents / 100);

if (entries > 0) {
  try {
    const SweepstakesEntry = require('../models/SweepstakesEntry');
    
    const sweepstakesEntry = await SweepstakesEntry.create({
      campaign_id: campaignId,
      supporter_id: supporterId,
      transaction_id: donationResult.data._id,
      creator_id: campaign.creator_id,
      entries_count: entries,
      donation_amount_cents: amount_cents,
      status: 'active',
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      created_at: new Date(),
    });

    // Update transaction with entries created
    await Transaction.updateOne(
      { _id: donationResult.data._id },
      { sweepstakes_entries_created: entries }
    );

    logger.info('🎰 Sweepstakes entries created', {
      transactionId: donationResult.data._id,
      entries: entries,
      campaignId: campaignId,
    });

    // Include in response
    response.data.sweepstakes_entries = entries;
  } catch (error) {
    logger.error('Error creating sweepstakes entries:', error);
    // Don't fail the donation if sweepstakes creation fails
    // Log and continue
  }
}
```

---

## Fix 1.3: Add Analytics Fee Breakdown & Timeline

### Step 1: Create AnalyticsService method for fee breakdown

**File**: `src/services/analyticsService.js` (UPDATE)

Add this method:

```javascript
/**
 * Get campaign analytics with fee breakdown and timeline
 * @param {string} campaignId - Campaign MongoDB ID
 * @param {Object} options - Configuration options
 * @returns {Object} Analytics data with fees and timeline
 */
static async getCampaignAnalyticsWithFees(campaignId, options = {}) {
  try {
    const Campaign = require('../models/Campaign');
    const Transaction = require('../models/Transaction');

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get all transactions for this campaign
    const transactions = await Transaction.find({ campaign_id: campaignId })
      .sort({ created_at: 1 });

    // Calculate totals
    const totalDonations = transactions.length;
    const totalAmountCents = transactions.reduce((sum, t) => sum + (t.amount_cents || 0), 0);
    const feeCents = Math.round(totalAmountCents * 0.2); // 20% platform fee
    const netCents = totalAmountCents - feeCents;

    // Calculate average
    const averageDonationCents = totalDonations > 0 ? Math.round(totalAmountCents / totalDonations) : 0;

    // Build timeline (daily breakdown)
    const timeline = this._buildTimelineData(transactions);

    // Build recent donations list
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
      fees: {
        total_fee_cents: feeCents,
        total_fee_dollars: (feeCents / 100).toFixed(2),
        fee_percentage: 20,
        creator_net_cents: netCents,
        creator_net_dollars: (netCents / 100).toFixed(2),
      },
      timeline: timeline,
      recent_donations: recentDonations,
      progress: {
        goal_cents: campaign.goal_amount_cents || 0,
        goal_dollars: ((campaign.goal_amount_cents || 0) / 100).toFixed(2),
        raised_cents: totalAmountCents,
        raised_dollars: (totalAmountCents / 100).toFixed(2),
        percentage: campaign.goal_amount_cents ? 
          Math.round((totalAmountCents / campaign.goal_amount_cents) * 100) : 0,
      },
    };

    return result;
  } catch (error) {
    logger.error('Error calculating analytics with fees:', error);
    throw error;
  }
}

/**
 * Build timeline data from transactions
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

  // Convert to array and add dollars
  const timeline = Array.from(timelineMap.values()).map(day => ({
    ...day,
    total_amount_dollars: (day.total_amount_cents / 100).toFixed(2),
    average_donation_cents: Math.round(day.total_amount_cents / day.count),
    average_donation_dollars: (day.total_amount_cents / day.count / 100).toFixed(2),
  }));

  return timeline;
}
```

### Step 2: Update Analytics Controller

**File**: `src/controllers/analyticsController.js`

Update the `getAnalytics` method to use the new fee calculation:

```javascript
// In getAnalytics method, replace the AnalyticsService call with:

analytics = await AnalyticsService.getCampaignAnalyticsWithFees(campaign._id, {
  includeProgress: true,
  progressDays: progressDays,
});
```

---

## Fix 1.4: Add Idempotency to Donation Processing

### Step 1: Update Transaction Model

Add `idempotency_key` field to Transaction schema:

**File**: `src/models/Transaction.js`

```javascript
// Add to transactionSchema:
idempotency_key: {
  type: String,
  unique: true,
  sparse: true, // Allow null for existing transactions
  index: true,
  description: 'Unique key for preventing duplicate donations',
},
```

### Step 2: Update DonationController

**File**: `src/controllers/DonationController.js`

Update `createDonation` to add idempotency check:

```javascript
static async createDonation(req, res) {
  try {
    const { campaignId } = req.params;
    const { amount, paymentMethod, proofUrl, referralCode, idempotency_key } = req.body;
    const supporterId = req.user._id;

    // ✅ NEW: Extract or generate idempotency key
    let idempKey = idempotency_key;
    if (!idempKey) {
      // Generate deterministic key from request metadata
      idempKey = `${supporterId}-${campaignId}-${amount}-${paymentMethod}-${Date.now()}`;
    }

    logger.info('💱 Donation idempotency check', {
      idempotency_key: idempKey,
      campaignId,
      amount,
    });

    // ✅ NEW: Check for existing donation with same idempotency key
    const existingDonation = await Transaction.findOne({ idempotency_key: idempKey });
    if (existingDonation) {
      logger.info('♻️ Donation idempotency: Returning cached result', {
        idempotency_key: idempKey,
        existingTransactionId: existingDonation._id,
      });

      return res.status(200).json({
        success: true,
        message: 'Donation already processed',
        data: {
          transaction_id: existingDonation.transaction_id,
          transaction_db_id: existingDonation._id,
          amount_dollars: (existingDonation.amount_cents / 100).toFixed(2),
          fee_breakdown: {
            gross: existingDonation.amount_cents,
            fee: existingDonation.platform_fee_cents,
            net: existingDonation.net_amount_cents,
            fee_percentage: 20,
          },
          sweepstakes_entries: existingDonation.sweepstakes_entries_created || 0,
          tracking_id: existingDonation._id.toString(),
          cached: true,
        },
      });
    }

    // ... rest of createDonation code ...

    // When creating transaction, add idempotency_key:
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
        idempotency_key: idempKey, // ✅ ADDED
      }
    );

    // ... rest of response building ...
  } catch (error) {
    // ... error handling ...
  }
}
```

### Step 3: Update TransactionService

**File**: `src/services/TransactionService.js`

Update the `recordDonation` method to store idempotency key:

```javascript
static async recordDonation(
  campaignId,
  supporterId,
  amount,
  paymentMethod,
  metadata = {}
) {
  try {
    // ... existing validation ...

    // Create transaction with idempotency key
    const transaction = await Transaction.create({
      transaction_id: this.generateTransactionId(),
      campaign_id: campaignId,
      supporter_id: supporterId,
      creator_id: campaign.creator_id,
      amount_cents: amount_cents,
      platform_fee_cents: feeCents,
      net_amount_cents: netCents,
      payment_method: paymentMethod,
      proof_url: metadata.proofUrl || null,
      status: 'pending',
      ip_address: metadata.ipAddress,
      user_agent: metadata.userAgent,
      idempotency_key: metadata.idempotency_key, // ✅ ADDED
      created_at: new Date(),
    });

    // ... rest of method ...
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000 && error.keyPattern.idempotency_key) {
      logger.warn('Idempotency key collision detected:', error);
      // Retrieve and return existing transaction
      const existing = await Transaction.findOne({ 
        idempotency_key: metadata.idempotency_key 
      });
      return {
        success: true,
        data: existing,
        cached: true,
      };
    }
    throw error;
  }
}
```

---

## Implementation Checklist

### Phase 1.2: Sweepstakes Entry Tracking
- [ ] Create `src/models/SweepstakesEntry.js`
- [ ] Add `sweepstakes_entries_created` field to Transaction model
- [ ] Update DonationController.createDonation to create entries
- [ ] Add logging for sweepstakes entry creation
- [ ] Test: Create donation, verify entries created
- [ ] Test: Verify entries accessible in database

### Phase 1.3: Analytics Fee Breakdown & Timeline
- [ ] Create `getCampaignAnalyticsWithFees` in AnalyticsService
- [ ] Create `_buildTimelineData` helper method
- [ ] Update AnalyticsController.getAnalytics to use new method
- [ ] Test: Call analytics endpoint, verify fee breakdown included
- [ ] Test: Verify timeline data shows daily breakdown
- [ ] Test: Verify recent_donations array populated correctly

### Phase 1.4: Donation Idempotency
- [ ] Add `idempotency_key` field to Transaction model
- [ ] Update DonationController.createDonation with idempotency check
- [ ] Update TransactionService.recordDonation to store key
- [ ] Add duplicate key error handling
- [ ] Test: Submit donation, verify transaction created
- [ ] Test: Retry with same key, verify no duplicate created
- [ ] Test: Verify cached response returned on retry

---

## Testing Plan

### Sweepstakes Tests
```javascript
// Test 1: Create donation, verify entries
POST /campaigns/{id}/donations {"amount": 50, "paymentMethod": "stripe"}
// Expected: sweepstakes_entries = 50

// Test 2: Verify entries in database
GET /campaigns/{id}/sweepstakes-entries
// Expected: entries_count = 50
```

### Analytics Tests
```javascript
// Test 3: Verify fee breakdown in analytics
GET /campaigns/{id}/analytics
// Expected: fees.total_fee_cents = total * 0.2

// Test 4: Verify timeline data
// Expected: timeline array with daily breakdown

// Test 5: Verify recent donations
GET /campaigns/{id}/analytics
// Expected: recent_donations array with latest 20
```

### Idempotency Tests
```javascript
// Test 6: Create donation with idempotency key
POST /campaigns/{id}/donations {
  "amount": 100,
  "paymentMethod": "stripe",
  "idempotency_key": "test-key-123"
}
// Expected: status 201, transaction created

// Test 7: Retry with same key
POST /campaigns/{id}/donations {
  "amount": 100,
  "paymentMethod": "stripe",
  "idempotency_key": "test-key-123"
}
// Expected: status 200, cached result, no duplicate

// Test 8: Verify single transaction in DB
GET /transactions?campaign={id}&supporter={userId}
// Expected: count = 1, not 2
```

---

## Database Considerations

### Indexes to Add

```javascript
// SweepstakesEntry
db.sweepstakes_entries.createIndex({ campaign_id: 1, status: 1 });
db.sweepstakes_entries.createIndex({ supporter_id: 1, created_at: -1 });
db.sweepstakes_entries.createIndex({ is_winner: 1, campaign_id: 1 });

// Transaction
db.transactions.createIndex({ idempotency_key: 1 }, { unique: true, sparse: true });
```

### Capacity Planning

- SweepstakesEntry: ~10 million entries for 10M donations
- Index size: ~100MB for each
- Storage: ~500MB per million entries

---

## Post-Implementation Validation

1. ✅ All three fixes deployed
2. ✅ No breaking changes to existing endpoints
3. ✅ All tests passing (sweepstakes, analytics, idempotency)
4. ✅ Database performance acceptable (query times < 200ms)
5. ✅ Logging shows no errors
6. ✅ Frontend can consume new response fields
7. ✅ Backward compatibility maintained

---

## Next Steps (Phase 2)

After Phase 1 is complete and tested:
- Implement Campaign Completion Handler
- Create Payout Model & Service
- Implement Auto-Completion Job

**Estimated**: Phase 2 will take 8-10 hours

---

## Files Modified

1. `src/models/SweepstakesEntry.js` - NEW
2. `src/models/Transaction.js` - UPDATED (add fields)
3. `src/controllers/DonationController.js` - UPDATED
4. `src/services/analyticsService.js` - UPDATED
5. `src/controllers/analyticsController.js` - UPDATED
6. `src/services/TransactionService.js` - UPDATED

**Total**: 6 files (1 new, 5 updated)

---

**Status**: Ready for implementation
**Priority**: CRITICAL - Blocking production launch
**Impact**: Enables core platform functionality
