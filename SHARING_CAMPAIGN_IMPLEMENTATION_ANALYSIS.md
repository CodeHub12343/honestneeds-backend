# Sharing/Referral Campaign Implementation Analysis

**Analysis Date:** April 8, 2026  
**Status:** ⚠️ INCOMPLETE IMPLEMENTATION - Critical Gaps Identified

---

## Executive Summary

The sharing/referral campaign feature has a **fundamental architectural gap**: the frontend is collecting sharing-specific data (platforms, budget, reward per share, max shares) but **NOT sending them to the backend**, and the backend has no mechanism to store or use these fields during campaign creation.

---

## 1. FRONTEND DATA COLLECTION & CONVERSION

### Files Analyzed
- **Frontend Service:** [honestneed-frontend/api/services/campaignService.ts](honestneed-frontend/api/services/campaignService.ts)

### Frontend Data Capture (from campaignService.ts)
For sharing campaigns, the wizard collects:
```javascript
sharingData = {
  platforms: [],           // e.g., ['facebook', 'twitter', 'instagram']
  budget: 0,              // in dollars (converted to cents at API boundary)
  rewardPerShare: 0,      // in dollars (converted to cents at API boundary)
  maxShares: 100          // maximum shares per person or total
}
```

### Frontend Conversion Process (lines 603-627)

**What's Being Created:**
```javascript
// For sharing campaigns, frontend creates:
1. goals array with sharing_reach goal:
   {
     goal_type: 'sharing_reach',
     goal_name: 'Social Sharing Goal',
     target_amount: sharingData.maxShares || 100,  // ❌ WRONG FIELD - This is shares count, not budget
     current_amount: 0
   }

2. payment_methods array (hardcoded to Stripe):
   [{ type: 'stripe', is_primary: true }]

3. tags array (empty for sharing)
   []
```

**Critical Issue:** The `sharingData` fields are being partially ignored:
- ❌ `sharingData.platforms` → NOT SENT TO BACKEND
- ❌ `sharingData.budget` → NOT SENT TO BACKEND  
- ❌ `sharingData.rewardPerShare` → NOT SENT TO BACKEND
- ⚠️  `sharingData.maxShares` → ONLY used for goal's target_amount (incorrect field)

### FormData Being Sent to Backend (lines 643-780)

```javascript
const formData = new FormData();

// Basic fields (sent as strings)
formData.append('title', backendData.title);
formData.append('description', backendData.description);
formData.append('need_type', backendData.need_type);

// Complex fields (stringified as JSON)
formData.append('location', JSON.stringify(backendData.location));
formData.append('goals', JSON.stringify(backendData.goals));
formData.append('payment_methods', JSON.stringify(backendData.payment_methods));

// Tags (CSV string)
formData.append('tags', backendData.tags.join(','));

// Optional fields
formData.append('category', backendData.category);
formData.append('start_date', backendData.start_date);
formData.append('end_date', backendData.end_date);
formData.append('language', backendData.language || 'en');
formData.append('currency', backendData.currency || 'USD');

// File upload
if (imageFile) {
  formData.append('image', imageFile);
}
```

**Notice:** NO sharing-specific fields are appended to FormData.

---

## 2. BACKEND CAMPAIGN CREATION HANDLER

### Files Analyzed
- **Routes:** [src/routes/campaignRoutes.js](src/routes/campaignRoutes.js) (lines 33-76)
- **Controller:** [src/controllers/campaignController.js](src/controllers/campaignController.js) (lines 1-150)
- **Service:** [src/services/CampaignService.js](src/services/CampaignService.js) (lines 194-500)
- **Model:** [src/models/Campaign.js](src/models/Campaign.js)

### Backend Campaign Creation Flow

**POST /campaigns endpoint (routes line 48):**
```
Request → uploadMiddleware → authMiddleware → CampaignController.create
```

**CampaignController.create handler (controller lines 7-75):**
1. Extracts userId from JWT
2. Logs request body and file details
3. Calls `CampaignService.createCampaign(userId, req.body)`

**CampaignService.createCampaign method (service lines 194-424):**
1. Parses FormData fields back to objects/arrays:
   - `tags`: CSV string → array
   - `location`: JSON string → object
   - `goals`: JSON string → array
   - `payment_methods`: JSON string → array

2. Validates against `validateCampaignCreation` schema

3. Normalizes data via `CampaignService.normalizeCampaignData()`

4. **Creates campaign object with ONLY these fields:**
   ```javascript
   const campaignData = {
     campaign_id,
     creator_id,
     title,
     description,
     need_type,
     goals,
     location,
     payment_methods,
     tags,
     category,
     image_url,
     start_date,
     end_date,
     language,
     currency,
     status: 'draft',
     view_count: 0,
     share_count: 0,
     engagement_score: 0
   };
   ```

5. Saves to database: `Campaign.create(campaignData)`

### Backend Campaign Model Schema

**File:** [src/models/Campaign.js](src/models/Campaign.js)

**Share Configuration Field (lines 340-371):**
```javascript
share_config: {
  total_budget: {
    type: Number,           // in cents
    default: 0,
    min: 0,
  },
  current_budget_remaining: {
    type: Number,           // in cents
    default: 0,
    min: 0,
  },
  amount_per_share: {
    type: Number,           // in cents
    default: 0,
    min: 0,
  },
  is_paid_sharing_active: {
    type: Boolean,
    default: false,
  },
  share_channels: [
    {
      type: String,
      enum: ['email', 'facebook', 'twitter', 'instagram', 'linkedin', 'sms', 
             'whatsapp', 'telegram', 'reddit', 'tiktok', 'other'],
    },
  ],
  last_config_update: {
    type: Date,
    default: () => new Date(),
  },
  config_updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}
```

**Critical Discovery:** The `share_config` field exists in the schema but is **NEVER POPULATED during campaign creation**. It remains at default values (all zeros, false, empty array).

---

## 3. DATA FLOW COMPARISON

### What Frontend Sends for Sharing Campaign Creation

| Field | Value | Format | Sent to Backend |
|-------|-------|--------|-----------------|
| `title` | "Help Build School" | String | ✅ YES |
| `description` | "We need..." | String | ✅ YES |
| `need_type` | "education_tuition" | String | ✅ YES |
| `location` | {...} | JSON string | ✅ YES |
| `category` | "education" | String | ✅ YES |
| `tags` | [] | CSV string | ✅ YES (empty) |
| `payment_methods` | [{type:'stripe',...}] | JSON string | ✅ YES |
| `language` | "en" | String | ✅ YES |
| `currency` | "USD" | String | ✅ YES |
| `image` | imageFile | FormData File | ✅ YES |
| `goals` | [{goal_type:'sharing_reach', target_amount:100, ...}] | JSON string | ✅ YES |
| **`sharingData.platforms`** | ['facebook', 'twitter', ...] | Array | ❌ **NOT SENT** |
| **`sharingData.budget`** | 10000 (in cents) | Number | ❌ **NOT SENT** |
| **`sharingData.rewardPerShare`** | 50 (in cents) | Number | ❌ **NOT SENT** |
| **`sharingData.maxShares`** | 1000 | Number | ⚠️ **PARTIAL** (used only for goal target_amount) |

### What Backend Stores for Sharing Campaigns

When a sharing campaign is created, the backend stores:
```javascript
{
  _id: ObjectId,
  campaign_id: "CAMP-2026-XXX-XXXXXX",
  creator_id: ObjectId,
  title: "Help Build School",
  description: "We need...",
  need_type: "education_tuition",
  goals: [
    {
      goal_type: 'sharing_reach',
      goal_name: 'Social Sharing Goal',
      target_amount: 100,           // ← maxShares value
      current_amount: 0
    }
  ],
  payment_methods: [{type: 'stripe', is_primary: true, details_encrypted: null}],
  tags: [],
  location: {...},
  image_url: "...",
  // ❌ NO sharing-specific fields in share_config (all defaults):
  share_config: {
    total_budget: 0,                // ← SHOULD BE budget value
    current_budget_remaining: 0,    // ← SHOULD BE budget value
    amount_per_share: 0,            // ← SHOULD BE rewardPerShare value
    is_paid_sharing_active: false,  // ← SHOULD BE true if budget > 0
    share_channels: [],             // ← SHOULD BE platforms array
    last_config_update: Date,
    config_updated_by: null,
  },
  status: 'draft',
  // ... other fields
}
```

---

## 4. CRITICAL GAPS & MISMATCHES

### Gap 1: Missing Backend Field for Campaign Type
- **Frontend tracks:** `campaignType` ('sharing' vs 'fundraising')
- **Backend stores:** NO `campaign_type` or equivalent field
- **Impact:** Backend cannot differentiate campaign types
- **Workaround:** Backend infers type from `goals[].goal_type`

### Gap 2: Share Configuration Never Populated at Creation
- **Frontend collects:** platforms, budget, rewardPerShare, maxShares
- **Backend expected:** These should populate `share_config` during creation
- **What happens:** share_config remains at default (zeroed out)
- **Result:** Share feature is non-functional for new campaigns

### Gap 3: Missing Frontend FormData Fields
- **Frontend SHOULD send:** 
  ```javascript
  formData.append('platforms', JSON.stringify(sharingData.platforms));
  formData.append('budget', sharingData.budget.toString()); // cents
  formData.append('rewardPerShare', sharingData.rewardPerShare.toString()); // cents
  formData.append('maxShares', sharingData.maxShares.toString());
  ```
- **Frontend ACTUALLY sends:** NOTHING for these fields
- **Impact:** Backend cannot populate share_config

### Gap 4: Backend Creates Campaign Without Share Config Setup
- **Current code (service line 370-393):**
  ```javascript
  const campaignData = {
    campaign_id,
    creator_id,
    title,
    description,
    need_type,
    goals,
    location,
    payment_methods,  // ← Encrypted here
    tags,
    category,
    image_url,
    start_date,
    end_date,
    language,
    currency,
    status: 'draft',
    // ❌ No share_config setup
  };
  ```
- **Should be:**
  ```javascript
  const campaignData = {
    // ... existing fields
    share_config: {
      total_budget: normalizedData.share_config?.total_budget || 0,
      current_budget_remaining: normalizedData.share_config?.total_budget || 0,
      amount_per_share: normalizedData.share_config?.amount_per_share || 0,
      is_paid_sharing_active: (normalizedData.share_config?.amount_per_share > 0 && 
                               normalizedData.share_config?.total_budget > 0),
      share_channels: normalizedData.share_config?.share_channels || [],
    },
  };
  ```

### Gap 5: No Campaign Type Field for Differentiation
- **Backend should have:** `campaign_type: 'fundraising' | 'sharing'`
- **Current approach:** Infers from goals array (fragile)
- **Risk:** Cannot easily query "all sharing campaigns"

---

## 5. SHARING CONFIGURATION ENDPOINTS

### Current Endpoints Available

#### ✅ POST /campaigns/:campaignId/share
- **Purpose:** Record a share event (track when user shares campaign)
- **Requires:** Campaign must be ACTIVE
- **Does NOT set up:** Share budget or rewards
- **Handler:** [ShareController.recordShare](src/controllers/ShareController.js) (lines 12-56)

#### ✅ GET /campaigns/:campaignId/share-metrics
- **Purpose:** Get share metrics (total shares, by platform, earnings)
- **Handler:** [ShareController.getShareMetrics](src/controllers/ShareController.js)

#### ✅ POST /campaigns/:campaignId/share/generate
- **Purpose:** Generate referral link with QR code
- **Requires:** Campaign must be active, user must be authenticated
- **Handler:** [ShareController.generateReferralLink](src/controllers/ShareController.js)

#### ✅ POST /campaigns/:campaignId/track-qr-scan
- **Purpose:** Track QR scan with location data
- **Handler:** [ShareController.trackQRScan](src/controllers/ShareController.js)

### ❌ Missing Endpoint: Configure Share Rewards

**What's Needed:**
```
PUT /campaigns/:campaignId/share/config
OR
PATCH /campaigns/:campaignId/share-config
```

**Purpose:** Set or update sharing campaign budget and rewards

**Required After:** Campaign creation (during draft stage)

**ServiceExists:** ✅ `ShareConfigService.updateShareConfig()` implemented
**Endpoint:** ❌ NOT EXPOSED in routes

**Current Implementation:**
- [src/services/ShareConfigService.js](src/services/ShareConfigService.js) (lines 1-150+)
- Method: `static async updateShareConfig(params)` (lines 16-190)
- Validates: budget, amount per share, channels
- Enforces: rate limiting (1 update/hour), max increase ($100/update)
- ✅ Service is production-ready, just needs route exposure

**Why It's Important:**
- Share budget/rewards can only be configured AFTER campaign is created
- Cannot be sent during creation (not in FormData)
- Requires separate API call to set up

---

## 6. SHARE TRACKING & REWARD FLOW

### Share Recording Flow

**File:** [src/services/ShareService.js](src/services/ShareService.js)

**recordShare() method (lines 60-180):**

1. **Validates channel** against allowed list: email, facebook, twitter, instagram, linkedin, sms, whatsapp, telegram, reddit, tiktok, other

2. **Checks campaign is active** - shares only accepted if status === 'active'

3. **Rate limiting check** - max 10 shares per IP per campaign per hour

4. **Retrieves share config** from campaign:
   ```javascript
   const shareConfig = campaign.share_config || {
     is_paid_sharing_active: false,
     current_budget_remaining: 0,
     amount_per_share: 0,
   };
   ```

5. **Determines if paid:**
   ```javascript
   let isPaid = false;
   let rewardAmount = 0;
   
   if (shareConfig.is_paid_sharing_active && 
       shareConfig.current_budget_remaining >= shareConfig.amount_per_share) {
     isPaid = true;
     rewardAmount = shareConfig.amount_per_share;
   }
   ```

6. **Creates ShareRecord** with isPaid flag and rewardAmount

7. **Returns:** { shareId, isPaid, rewardAmount, ... }

### Potential Issues with Current Flow

| Issue | Impact | Severity |
|-------|--------|----------|
| share_config starts at all zeros | No rewards are ever paid | 🔴 CRITICAL |
| No configuration endpoint exposed | Users cannot set up rewards | 🔴 CRITICAL |
| Frontend doesn't send sharing fields | Backend never knows platforms/budget/rewards | 🔴 CRITICAL |
| Campaign type not tracked | Cannot filter sharing vs fundraising | 🟠 HIGH |
| Goals array used for type detection | Fragile, depends on goal_type enum | 🟠 HIGH |

---

## 7. MISSING IMPLEMENTATIONS CHECKLIST

### Frontend (campaignService.ts)

- [ ] **Add sharing fields to FormData:**
  ```javascript
  if (data.campaignType === 'sharing') {
    const sharingData = data.sharingData || {};
    formData.append('share_config', JSON.stringify({
      total_budget: Math.round(sharingData.budget * 100),
      amount_per_share: Math.round(sharingData.rewardPerShare * 100),
      share_channels: sharingData.platforms || [],
    }));
  }
  ```

- [ ] **Send campaign type to backend:**
  ```javascript
  formData.append('campaign_type', data.campaignType);  // 'sharing' or 'fundraising'
  ```

- [ ] **Validate sharing data before sending:**
  - Platforms must have at least 1 selection
  - Budget must be > 0 for paid sharing
  - Reward per share must be valid

### Backend: Models (Campaign.js)

- [ ] **Add campaign_type field:**
  ```javascript
  campaign_type: {
    type: String,
    enum: ['fundraising', 'sharing'],
    required: true,
    index: true,
  }
  ```

- [ ] **Add validators to share_config:**
  - total_budget must be > 0 for paid sharing
  - amount_per_share must be <= total_budget
  - share_channels must be non-empty

### Backend: Validators (campaignValidators.js)

- [ ] **Add share config schema:**
  ```javascript
  const shareConfigSchema = z.object({
    total_budget: z.number().min(0),  // cents
    amount_per_share: z.number().min(0).max(10000),  // max $100
    share_channels: z.array(z.enum([...VALID_CHANNELS])).min(1),
  });
  ```

- [ ] **Add campaign_type to creation schema:**
  ```javascript
  campaign_type: z.enum(['fundraising', 'sharing']),
  ```

- [ ] **Add conditional validation** for sharing campaigns

### Backend: Service (CampaignService.js)

- [ ] **Parse share_config from FormData:**
  ```javascript
  if (typeof data.share_config === 'string') {
    parsedData.share_config = JSON.parse(data.share_config);
  }
  ```

- [ ] **Populate share_config in campaignData:**
  ```javascript
  if (normalizedData.campaign_type === 'sharing' && normalizedData.share_config) {
    campaignData.share_config = {
      total_budget: normalizedData.share_config.total_budget,
      current_budget_remaining: normalizedData.share_config.total_budget,
      amount_per_share: normalizedData.share_config.amount_per_share,
      is_paid_sharing_active: (normalizedData.share_config.amount_per_share > 0 &&
                               normalizedData.share_config.total_budget > 0),
      share_channels: normalizedData.share_config.share_channels,
    };
  }
  ```

### Backend: Routes (campaignRoutes.js)

- [ ] **Expose PUT /campaigns/:campaignId/share-config endpoint:**
  ```javascript
  router.put(
    '/:campaignId/share-config',
    authMiddleware,
    ShareConfigController.updateShareConfig
  );
  ```

- [ ] **Create ShareConfigController** with:
  - `updateShareConfig` method
  - Validation middleware
  - Error handling for rate limiting

### Backend: Database

- [ ] **Index on campaign_type** for filtering queries
- [ ] **Add migration** to set campaign_type for existing campaigns based on goals

---

## 8. IMPLEMENTATION PRIORITIES

### Priority 1 (BLOCKING)
1. Add `campaign_type` field to Campaign model
2. Add sharing config parsing in CampaignService
3. Populate share_config during campaign creation
4. Frontend: Send sharing fields in FormData
5. Add validation schema for sharing campaigns

### Priority 2 (CRITICAL)
6. Expose PUT /campaigns/:campaignId/share-config endpoint
7. Update campaign creation flow to handle sharing validation
8. Add comprehensive logging for share config setup

### Priority 3 (HIGH)
9. Create migration for existing campaigns
10. Add frontend UI for configuring share rewards before publishing
11. Add share config preview in campaign detail view

---

## 9. CODE REFERENCES

### Frontend Files
- Service: [honestneed-frontend/api/services/campaignService.ts](honestneed-frontend/api/services/campaignService.ts#L603-L627) - convertWizardDataToBackendFormat
- Service: [honestneed-frontend/api/services/campaignService.ts](honestneed-frontend/api/services/campaignService.ts#L651-L780) - createCampaign FormData preparation

### Backend Files
- Routes: [src/routes/campaignRoutes.js](src/routes/campaignRoutes.js#L33-L76) - POST /campaigns endpoint
- Controller: [src/controllers/campaignController.js](src/controllers/campaignController.js#L7-L75) - create handler
- Service: [src/services/CampaignService.js](src/services/CampaignService.js#L194-L424) - createCampaign method
- Service: [src/services/ShareConfigService.js](src/services/ShareConfigService.js#L16-L190) - updateShareConfig method
- Model: [src/models/Campaign.js](src/models/Campaign.js#L340-L371) - share_config schema
- Validators: [src/validators/campaignValidators.js](src/validators/campaignValidators.js) - campaign validation

---

## 10. TESTING RECOMMENDATIONS

### Frontend Testing
```javascript
// Test 1: Verify sharing fields are collected
test('sharing campaign collects platforms, budget, rewardPerShare, maxShares');

// Test 2: Verify sharing fields are sent in FormData
test('createCampaign appends sharing config to FormData for sharing campaigns');

// Test 3: Verify campaign type is sent
test('createCampaign sends campaign_type field');
```

### Backend Testing
```javascript
// Test 1: Campaign created with share_config populated
test('createCampaign populates share_config for sharing campaigns');

// Test 2: Share config validation
test('validateCampaignCreation rejects invalid share_config');

// Test 3: Share recording respects config
test('recordShare calculates rewards based on populated share_config');

// Test 4: Configuration endpoint works
test('PUT /campaigns/:id/share-config updates share_config');
```

### Integration Testing
```javascript
// End-to-end: Create sharing campaign, configure rewards, record share, verify reward
test('E2E: Create sharing campaign → Configure rewards → Record share → Verify reward calculated');
```

---

## 11. SECURITY CONSIDERATIONS

1. **Budget validation:** Prevent exceeding max budget ($10,000) per update
2. **Rate limiting:** 1 config update per hour (already implemented in ShareConfigService)
3. **Authorization:** Only campaign creators can update share config
4. **Campaign status:** Share config updates only allowed for active campaigns
5. **Amount validation:** Reward per share capped at $100 per share

---

## Summary Table

| Aspect | Frontend | Backend | Status |
|--------|----------|---------|--------|
| Collect sharing data | ✅ YES | - | ✅ DONE |
| Send to backend | ❌ NO | - | ❌ MISSING |
| Parse in service | - | ❌ NO | ❌ MISSING |
| Store in model | - | ❌ NO | ❌ MISSING |
| Validate schema | - | ❌ NO | ❌ MISSING |
| Track campaign type | ✅ YES | ❌ NO | ⚠️ PARTIAL |
| Share config service | - | ✅ YES | ✅ DONE |
| Share config endpoint | - | ❌ NO | ❌ MISSING |
| Record share logic | - | ✅ YES | ✅ DONE |
| Track QR scans | - | ✅ YES | ✅ DONE |
| Generate referral links | - | ✅ YES | ✅ DONE |

---

## Conclusion

The sharing/referral campaign feature is **50% implemented**. The backend infrastructure (share tracking, QR generation, configuration service) exists but is not wired to campaign creation. The frontend collects the right data but doesn't send it. **Three critical missing pieces** prevent the feature from working:

1. Frontend must send sharing config fields in FormData
2. Backend must accept and parse these fields during creation
3. Backend must expose the share config update endpoint

**Estimated effort to complete:** 4-6 hours of focused development
