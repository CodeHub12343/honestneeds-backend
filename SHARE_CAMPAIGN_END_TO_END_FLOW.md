# Share Campaign End-to-End Flow Documentation
**Last Updated:** April 10, 2026 | **Status:** Comprehensive Analysis | **Analysis Depth:** Thorough

---

## 📋 Executive Summary

The HonestNeed share campaigns feature enables creators to incentivize supporters to share campaigns in exchange for monetary rewards. The system manages budget allocation, real-time reward calculations, rate limiting, and multi-platform sharing with automatic payment distribution.

**Key Metrics:**
- Platforms supported: 8 (Facebook, Twitter, LinkedIn, Email, WhatsApp, Telegram, Instagram, Reddit, TikTok, SMS, Direct Link, Other)
- Reward range: $0.10 - $100 per share
- Budget range: $10 - $1,000,000
- Rate limit: 10 shares per IP address per hour
- Earning model: Immediate credit (if budget available) or pending verification

---

## 🔄 Complete End-to-End Flow

```
PHASE 1: CREATOR SETUP
  Creator logs in → Dashboard → Create Campaign
    ↓
  Create Campaign Wizard (5-Step Process)
    Step 1: Select Campaign Type → "Get Paid to Share" (sharing type)
    Step 2: Basic Info (title, description, image)
    Step 3: Sharing Configuration
           ├─ Select Platforms (checkboxes: 8 options)
           ├─ Set Reward Amount ($0.10-$100/share)
           ├─ Set Total Budget ($10-$1,000,000)
           └─ Start Date + Duration (7-90 days)
    Step 4: Review Campaign Settings
    Step 5: Publish Campaign
    ↓
  Frontend Conversion:
    ├─ All monetary values × 100 (dollars → cents)
    ├─ Platforms array → CSV string (comma-separated)
    ├─ Create FormData with image file
    └─ POST /campaigns (multipart/form-data)
    ↓
  Backend Processing (CampaignController.createCampaign):
    ├─ Parse FormData
    ├─ Convert CSV platforms → array
    ├─ Convert cents → store in database
    ├─ Create Campaign document
    ├─ Status: "draft" initially
    ├─ Activate via PUT /campaigns/:id/activate
    └─ Status: "active" → ready for sharing
    ↓
  Campaign Live Status:
    ├─ Visible on browse campaigns page
    ├─ "Get Paid to Share" badge displayed
    ├─ Reward amount visible ($X per share)
    └─ Share button enabled

─────────────────────────────────────────────────────────

PHASE 2: SUPPORTER DISCOVERY
  Supporter logs in → Browse Campaigns page
    ↓
  Campaign Display (Campaign Cards):
    ├─ Title, description, image
    ├─ Creator info
    ├─ "Get Paid to Share" badge
    ├─ Reward amount: "$X per share"
    ├─ Total shares so far
    ├─ [Share to Earn] button (green CTA)
    └─ Campaign type indicator
    ↓
  Click [Share to Earn] button
    ↓
  Share Recording Flow Initiated

─────────────────────────────────────────────────────────

PHASE 3: SHARE RECORDING (Core Business Logic)

  Component: ShareWizard Modal (3-Step)
    ├─ Step 1: Select Platform
    │  ├─ Display 8 supported social platforms
    │  ├─ Icons + platform names
    │  └─ User selects one platform
    ├─ Step 2: Confirmation
    │  ├─ Show campaign title
    │  ├─ Show reward amount for this share
    │  ├─ Show potential earnings to date
    │  └─ [Confirm Share] button
    └─ Step 3: Share Dialog
       └─ Platform-specific share dialog opens
    ↓
  Frontend: User confirms share
    ↓
  Frontend triggers: POST /campaigns/:campaignId/share
    Request Body:
    {
      "channel": "telegram" | "facebook" | "twitter" | "email" | "whatsapp" | "linkedin" | "instagram" | "reddit" | "tiktok" | "sms" | "link" | "other",
      "referral_code": "ABCD1234" (URL-safe code)
    }
    ↓
  Backend: ShareController.recordShare()
    ├─ Authentication: Verify JWT token
    ├─ Extract: supporter_id from token
    ├─ Extract: campaign_id from URL parameter
    │
    ├─ Validation Layer:
    │  ├─ Campaign exists?
    │  ├─ Campaign status === "active"?
    │  ├─ Campaign type === "sharing"?
    │  ├─ Selected channel in campaign.share_config.platforms?
    │  ├─ Rate limit check: ≤ 10 shares per IP per 60 minutes?
    │  ├─ Duplicate check: Same supporter + same campaign + same hour?
    │  └─ Return 400 if any validation fails
    │
    ├─ Reward Calculation (ShareService.recordShare()):
    │  │
    │  ├─ Get campaign.share_config
    │  │  ├─ reward_amount (cents)
    │  │  ├─ total_budget (cents)
    │  │  └─ shares_recorded (count)
    │  │
    │  ├─ Calculate potential_earnings:
    │  │   potential = reward_amount × shares_recorded
    │  │
    │  ├─ Check budget availability:
    │  │   if potential_earnings > total_budget:
    │  │     is_paid = false (pending verification/review)
    │  │     reward_amount = 0 (for now)
    │  │   else:
    │  │     is_paid = true (immediate credit)
    │  │     reward_amount = campaign.share_config.reward_amount
    │  │
    │  └─ Generate Share ID:
    │      format: "SHARE-YYYY-XXXXXX" (e.g., "SHARE-2026-207584")
    │
    ├─ Persist to Database (ShareRecord):
    │  {
    │    share_id: "SHARE-2026-207584",
    │    campaign_id: ObjectId,
    │    supporter_id: ObjectId,
    │    channel: "telegram",
    │    referral_code: "343DF47C",
    │    is_paid: true | false,
    │    reward_amount: 1300 (cents),
    │    status: "completed" | "pending_verification",
    │    device_info: { ... },
    │    ip_address: "::1",
    │    user_agent: "Mozilla/5.0 ...",
    │    sweepstakes_entries_awarded: 0.5,
    │    created_at: ISO timestamp,
    │    updated_at: ISO timestamp
    │  }
    │
    ├─ Update Campaign Metrics:
    │  ├─ shares_recorded += 1
    │  ├─ total_reward_distributed += reward_amount (if is_paid)
    │  ├─ remaining_budget -= reward_amount (if is_paid)
    │  ├─ If remaining_budget ≤ 0: set campaign status = "completed"
    │  └─ Update engagement metrics
    │
    ├─ Emit Events:
    │  ├─ 'shareRecorded' → trigger sweepstakes logic
    │  ├─ 'reward_earned' → trigger reward distribution
    │  ├─ 'budget_alert' → if budget < threshold
    │  └─ 'campaign_completed' → if budget depleted
    │
    └─ Response to Frontend:
       {
         success: true,
         data: {
           share_id: "SHARE-2026-207584",
           reward_earned: 1300 (cents) | 0,
           is_paid: true | false,
           message: "$13.00 earned!" | "Share recorded! Pending verification"
         }
       }
    ↓
  Frontend: Handle Response
    ├─ If is_paid === true:
    │  ├─ Show success toast: "$X.XX earned from this share!"
    │  ├─ Update user's total earnings in UI
    │  ├─ Increment share counter
    │  └─ Possible: Open platform-specific share dialog
    ├─ If is_paid === false:
    │  ├─ Show info toast: "Share recorded! Pending verification"
    │  └─ Inform user rewards pending admin review
    └─ Close ShareWizard modal
    ↓
  User Action: Actually share on platform
    └─ Platform-specific share dialog handles

─────────────────────────────────────────────────────────

PHASE 4: CONVERSION & REFERRAL TRACKING

  Note: Referral tracking mechanism is partially visible in codebase.
        Exact conversion attribution flow needs clarification.
  
  Potential Flow:
    Supporter gets referral_code: "343DF47C"
    ↓
    Share link includes referral_code as parameter
    ↓
    Someone clicks referral link → New supporter lands on campaign
    ↓
    New supporter makes donation (if fundraising) or registers
    ↓
    Backend tracks referral → marks as conversion
    ↓
    Original sharer potentially earns conversion bonus
    
  Database Tracking:
    ├─ ShareRecord has: referral_code
    ├─ Share has: conversions counter
    ├─ Could have: DonationRecord.referred_by_share_id
    └─ Could track: click_count, conversion_count

─────────────────────────────────────────────────────────

PHASE 5: REWARD DISTRIBUTION (Partial Implementation)

  Timeline: Based on is_paid flag
  
  If is_paid === true (Immediate):
    ├─ ShareRecord.status = "completed"
    ├─ Reward amount added to supporter's wallet/balance
    ├─ User sees updated total earnings instantly
    └─ Transaction recorded
  
  If is_paid === false (Pending):
    ├─ ShareRecord.status = "pending_verification"
    ├─ Goes to admin review queue
    ├─ Admin verifies:
    │  ├─ Campaign is legitimate
    │  ├─ Share actually occurred
    │  └─ Reward amount reasonable
    ├─ Admin approves/rejects
    ├─ If approved: status = "verified" → add to wallet
    └─ If rejected: status = "rejected" → inform user
  
  Sweepstakes Integration:
    ├─ Each share grants sweepstakes_entries
    ├─ Current: 0.5 entries per share
    ├─ Could also have: bonus entries for conversions
    └─ Sweepstakes drawing selects entries → award prizes

─────────────────────────────────────────────────────────

PHASE 6: ANALYTICS & REPORTING

  Creator View: Campaign Analytics
    Location: /campaigns/:id/analytics
    Components: ShareAnalyticsDashboard, CampaignDetailPage
    Displays:
      ├─ Total shares recorded (count)
      ├─ Total rewards distributed ($)
      ├─ Remaining budget ($)
      ├─ Conversion rate (if tracking enabled)
      ├─ Shares by platform (breakdown with counts)
      ├─ Top performers (individual supporters)
      ├─ Engagement trend (chart over time)
      └─ Real-time metrics (auto-refresh)
    
    Data Flow:
      GET /campaigns/:id → Returns share_config + metrics
      GET /campaigns/:id/shares → Returns list of shares
      GET /campaigns/:id/analytics → Returns aggregated metrics

  Supporter View: My Earnings Dashboard
    Location: /supporter/shares
    Components: MySharAnalyticsDashboard, ShareList
    Displays:
      ├─ Total rewards earned ($)
      ├─ Total shares recorded (count)
      ├─ Total referrals (clickthrough count)
      ├─ Conversions (people who donated)
      ├─ Shares by platform (breakdown with counts)
      ├─ Top performing campaign
      ├─ Conversion rate %
      └─ Individual share history (paginated list)
    
    Data Flow:
      GET /user/shares → Returns supporter's shares list (paginated)
      GET /user/referral-performance → Returns referral metrics
      Individual share records show:
        ├─ Campaign title
        ├─ Platform
        ├─ Reward amount
        ├─ Date/time
        ├─ Status (completed, verified, pending, rejected)
        └─ Referral code for that share

─────────────────────────────────────────────────────────

PHASE 7: CAMPAIGN LIFECYCLE MANAGEMENT

  Status Transitions (Sharing Campaigns):
    
    DRAFT → ACTIVE:
      ├─ Creator clicks [Publish/Activate]
      ├─ PUT /campaigns/:id/activate
      ├─ Campaign becomes visible to supporters
      └─ Sharing becomes enabled
    
    ACTIVE → PAUSED:
      ├─ Creator pauses campaign (e.g., budget concern)
      ├─ PUT /campaigns/:id/pause
      ├─ Sharing disabled (404 if supporter tries to share)
      ├─ Existing shares still count
      └─ Can be reactivated
    
    ACTIVE/PAUSED → COMPLETED:
      ├─ Automatic: When remaining_budget ≤ 0
      ├─ Manual: Creator completes campaign
      ├─ PUT /campaigns/:id/complete
      ├─ Sharing disabled permanently
      ├─ Final metrics frozen
      └─ Archive or show as completed
    
    ANY STATUS → REJECTED:
      ├─ Admin rejects campaign (violates policies)
      ├─ Sharing permanently disabled
      ├─ Creator notified
      └─ Shares may be refunded

  Budget Depletion Scenario:
    ├─ Campaign has $100 budget, $10 per share
    ├─ 10 supporters share
    ├─ Budget: 10 × $10 = $100 depleted
    ├─ System automatically sets status = "completed"
    ├─ 11th supporter cannot earn reward
    ├─ ShareRecord.is_paid = false
    └─ Creator can reload budget from payment processor

```

---

## 🔗 Complete API Endpoint Reference

### Campaign Management

#### Create Campaign (with sharing configuration)
```
POST /api/campaigns
Content-Type: multipart/form-data
Headers: Authorization: Bearer {JWT}

Form Fields:
  - title: string (required, min 5 chars)
  - description: string (required, max 2000 chars)
  - image: File (optional, max 10MB)
  - campaignType: "sharing" (required)
  - share_config: JSON object containing:
      {
        "platforms": ["telegram", "facebook", ...],
        "reward_amount": 1300,  // in cents
        "total_budget": 100000, // in cents
        "duration": 30
      }
  - start_date: ISO date string (optional)

Response 201:
{
  success: true,
  data: {
    campaign_id: "69d6543be914c2763f86f491",
    status: "draft",
    share_config: { ... },
    created_at: timestamp,
    ...
  }
}
```

#### Activate Campaign
```
PUT /api/campaigns/:id/activate
Headers: Authorization: Bearer {JWT}

Response 200:
{
  success: true,
  data: {
    campaign_id: "...",
    status: "active"
  }
}
```

#### Get Campaign Details (with share metrics)
```
GET /api/campaigns/:id
Headers: Authorization: Bearer {JWT} (optional)

Response 200:
{
  success: true,
  data: {
    _id: "69d6543be914c2763f86f491",
    title: "Help us reach 1000 people",
    description: "...",
    campaignType: "sharing",
    share_config: {
      platforms: ["telegram", "facebook", "twitter", ...],
      reward_amount: 1300,     // cents
      total_budget: 100000,    // cents
      shares_recorded: 15,
      status: "active"
    },
    status: "active",
    creator_id: "69d445b4f5e17db08c440246",
    created_at: "2026-04-08T...",
    updated_at: "2026-04-08T...",
    metrics: {
      total_shares: 15,
      total_reward_distributed: 19500,  // cents
      remaining_budget: 80500,          // cents
      average_reward_per_share: 1300,
      platform_breakdown: {
        telegram: 8,
        facebook: 5,
        twitter: 2
      }
    }
  }
}
```

#### Pause Campaign
```
PUT /api/campaigns/:id/pause
Headers: Authorization: Bearer {JWT}

Response 200:
{
  success: true,
  data: {
    campaign_id: "...",
    status: "paused"
  }
}
```

#### Complete Campaign
```
PUT /api/campaigns/:id/complete
Headers: Authorization: Bearer {JWT}

Response 200:
{
  success: true,
  data: {
    campaign_id: "...",
    status: "completed"
  }
}
```

#### Reload Campaign Budget
```
POST /api/campaigns/:id/reload-budget
Headers: Authorization: Bearer {JWT}
Content-Type: application/json

Request Body:
{
  "payment_method": "stripe",
  "amount": 100000  // cents
}

Response 200:
{
  success: true,
  data: {
    campaign_id: "...",
    new_budget: 200000,     // old + new
    remaining_budget: 200000
  }
}
```

### Share Recording

#### Record a Share
```
POST /api/campaigns/:campaignId/share
Headers: Authorization: Bearer {JWT}
Content-Type: application/json

Request Body:
{
  "channel": "telegram",
  "referral_code": "343DF47C"
}

Response 200:
{
  success: true,
  data: {
    share_id: "SHARE-2026-207584",
    campaign_id: "69d6543be914c2763f86f491",
    reward_earned: 1300,      // cents, or 0 if pending
    is_paid: true,            // or false if pending verification
    message: "$13.00 earned!" // or "Share recorded! Pending verification"
  }
}

Response 400 (Validation Errors):
{
  success: false,
  error: {
    code: "RATE_LIMIT_EXCEEDED" | "INVALID_PLATFORM" | "CAMPAIGN_INACTIVE" | "DUPLICATE_SHARE",
    message: "You've shared this campaign too many times. Try again later."
  }
}

Response 404:
{
  success: false,
  error: {
    code: "CAMPAIGN_NOT_FOUND",
    message: "Campaign not found"
  }
}
```

### Share Analytics

#### Get Supporter's Shares (Paginated)
```
GET /api/user/shares?page=1&limit=25
Headers: Authorization: Bearer {JWT}

Response 200:
{
  success: true,
  data: [
    {
      share_id: "SHARE-2026-207584",
      campaign_id: "69d6543be914c2763f86f491",
      campaign_title: "Help us reach 1000 people",
      channel: "telegram",
      reward_amount: 1300,        // cents
      status: "completed",         // or "pending_verification", "rejected"
      is_paid: true,
      created_at: "2026-04-08T13:32:39.540Z",
      referral_code: "343DF47C",
      conversions: 2,              // if tracking enabled
      clicks: 45
    },
    ...
  ],
  pagination: {
    currentPage: 1,
    totalPages: 4,
    totalRecords: 87,
    recordsPerPage: 25
  }
}

Response 401:
{
  success: false,
  error: {
    code: "UNAUTHORIZED",
    message: "Please log in to view your shares"
  }
}
```

#### Get Referral Performance
```
GET /api/user/referral-performance?page=1&limit=25
Headers: Authorization: Bearer {JWT}

Response 200:
{
  success: true,
  data: {
    totalReferrals: 156,          // total clicks from all shares
    totalConversions: 12,         // people who donated from referrals
    conversionRate: 7.69,         // percentage
    totalRewardEarned: 31200,     // cents
    sharesByChannel: {
      telegram: 45,
      facebook: 32,
      twitter: 28,
      email: 21,
      whatsapp: 15,
      linkedin: 8,
      instagram: 5,
      reddit: 2
    },
    topPerformingCampaign: {
      campaign_id: "69d6543be914c2763f86f491",
      campaign_title: "Help us reach 1000 people",
      shares: 45,
      referrals: 78,
      revenue: 10400               // cents
    },
    timeSeriesData: [              // optional
      { date: "2026-04-01", shares: 5, referrals: 20, conversions: 2 },
      { date: "2026-04-02", shares: 8, referrals: 35, conversions: 3 }
    ]
  }
}

Response 404:
{
  success: true,
  data: null  // No shares yet
}
```

#### Get Campaign-Level Share Analytics
```
GET /api/campaigns/:id/shares
Headers: Authorization: Bearer {JWT}

Response 200:
{
  success: true,
  data: [
    {
      share_id: "SHARE-2026-207584",
      supporter_id: "69d445b4f5e17db08c440246",
      supporter_name: "John Doe",
      channel: "telegram",
      reward_amount: 1300,
      is_paid: true,
      status: "completed",
      created_at: "2026-04-08T13:32:39.540Z",
      conversions: 0,
      clicks: 5
    },
    ...
  ],
  metrics: {
    total_shares: 15,
    total_conversions: 3,
    total_rewards_distributed: 19500,   // cents
    remaining_budget: 80500,           // cents
    platform_distribution: { ... }
  }
}
```

---

## 🗄️ Database Schema Reference

### Campaign Model (Sharing Type)

```javascript
{
  _id: ObjectId,
  
  // Basic Info
  title: String,
  description: String,
  image_url: String,
  creator_id: ObjectId (ref: User),
  
  // Campaign Type & Status
  campaignType: "fundraising" | "sharing",
  status: "draft" | "active" | "paused" | "completed" | "rejected",
  
  // Sharing Configuration (for campaignType: "sharing")
  share_config: {
    platforms: [String],  // ["telegram", "facebook", "twitter", ...]
    reward_amount: Number,      // cents (e.g., 1300 = $13.00)
    total_budget: Number,       // cents (e.g., 100000 = $1000)
    shares_recorded: Number,    // incrementing counter
    conversions: Number,        // if tracking enabled
    duration: Number            // days (7-90)
  },
  
  // Dates
  start_date: Date,
  end_date: Date,
  created_at: Date,
  updated_at: Date,
  
  // Metrics & Engagement
  metrics: {
    shares: Number,
    conversions: Number,
    clicks: Number,
    engagement_rate: Number,
    platform_breakdown: Map<String, Number>
  }
}
```

### ShareRecord Model

```javascript
{
  _id: ObjectId,
  
  // Identifiers
  share_id: String,             // "SHARE-YYYY-XXXXXX" format
  campaign_id: ObjectId (ref: Campaign),
  supporter_id: ObjectId (ref: User),
  
  // Share Details
  channel: String,              // "telegram", "facebook", etc.
  referral_code: String,        // "343DF47C" - URL-safe code
  
  // Rewards & Payment
  is_paid: Boolean,             // true = immediate, false = pending
  reward_amount: Number,        // cents
  status: String,               // "completed", "pending_verification", "verified", "rejected"
  
  // Engagement Tracking
  conversions: Number,          // count of people who converted
  clicks: Number,              // count of link clicks
  sweepstakes_entries_awarded: Number,  // 0.5 per share
  
  // Device & Location Info
  device_info: {
    os: String,
    browser: String,
    device_type: String
  },
  ip_address: String,
  user_agent: String,
  location: {
    country: String,
    city: String,
    latitude: Number,
    longitude: Number
  },
  
  // Additional Data
  notes: String,
  
  // Timestamps
  created_at: Date,
  updated_at: Date,
  
  // Indexes for performance
  // Index 1: { campaign_id, created_at }
  // Index 2: { supporter_id, created_at }
  // Index 3: { channel, created_at }
  // Index 4: { status, created_at }
}
```

---

## 📁 Frontend File Structure

### Pages
```
/app/(supporter)/shares/page.tsx
  ├─ Location: Supporter's share earnings dashboard
  ├─ Component: SharesPageContent
  ├─ Data: useMyShareAnalytics hook
  ├─ Displays: Analytics + Share list
  └─ Status: Recently integrated with MySharAnalyticsDashboard

/app/creator/campaigns/[id]/analytics/page.tsx
  ├─ Location: Creator's campaign analytics
  ├─ Displays: Share metrics (total, by platform, conversions)
  └─ Component: CampaignDetailPage + ShareAnalyticsDashboard

/app/creator/campaigns/new/page.tsx
  ├─ Location: Campaign creation wizard
  ├─ Component: CampaignWizard (5-step process)
  ├─ Step 3: Share config (platforms, reward, budget)
  └─ Submission: FormData to POST /campaigns
```

### Components

#### Campaign Creation & Configuration
```
components/campaign/
  ├─ CampaignWizard.tsx
  │  ├─ 5-step orchestration component
  │  ├─ Manages step navigation and form data
  │  └─ Calls campaignService.createCampaign() on finish
  │
  ├─ wizard/Step3GoalsBudget.tsx
  │  ├─ Sharing configuration step
  │  ├─ Platform selection (checkboxes)
  │  ├─ Reward amount input ($0.10-$100)
  │  ├─ Total budget input ($10-$1,000,000)
  │  └─ Duration selection (7-90 days)
  │
  └─ wizard/Step2BasicInfo.tsx
     ├─ Title, description, image upload
     └─ Used for both fundraising and sharing campaigns
```

#### Share Recording
```
components/campaign/
  ├─ ShareWizard.tsx
  │  ├─ Modal component for recording shares
  │  ├─ 3-step flow:
  │  │  1. Select platform
  │  │  2. Confirmation
  │  │  3. Platform-specific share dialog
  │  ├─ Calls: shareService.recordShare()
  │  ├─ Handles: Success toast, error handling
  │  └─ Emits: onShareSuccess for UI updates
  │
  ├─ ShareButton.tsx
  │  ├─ Green CTA button ("Share to Earn")
  │  ├─ Click handler opens ShareWizard
  │  └─ Shows reward amount on hover
  │
  └─ SharePlatformSelector.tsx
     ├─ Displays 8 platform options with icons
     └─ Platform-specific share dialogs
```

#### Analytics & Dashboard
```
components/campaign/
  ├─ ShareAnalyticsDashboard.tsx
  │  ├─ Creator view of share campaign metrics
  │  ├─ Displays:
  │  │  - Total shares
  │  │  - Total rewards distributed
  │  │  - Remaining budget
  │  │  - Shares by platform breakdown
  │  │  - Top performers
  │  │  - Engagement trend
  │  └─ Component: Card layout with metrics
  │
  ├─ MySharAnalyticsDashboard.tsx
  │  ├─ Supporter view of personal earnings
  │  ├─ Displays:
  │  │  - Total rewards earned (purple card)
  │  │  - Total shares, referrals, conversions
  │  │  - Platform breakdown (emoji icons)
  │  │  - Top performing campaign
  │  │  - Help section (4-step guide)
  │  ├─ Handles cents-to-dollars conversion
  │  └─ Empty state messaging
  │
  └─ ShareList.tsx
     ├─ Table/list component for individual shares
     ├─ Columns: Campaign, Platform, Reward, Status, Date
     ├─ Pagination: 25 records per page
     └─ Supports: Filtering, sorting by date
```

### Hooks

```
api/hooks/
  ├─ useCampaigns.ts (13 hooks)
  │  ├─ useCreateCampaign() - POST /campaigns
  │  ├─ useCampaign(id) - GET /campaigns/:id
  │  ├─ useActivateCampaign() - PUT /campaigns/:id/activate
  │  ├─ usePauseCampaign() - PUT /campaigns/:id/pause
  │  ├─ useCompleteCampaign() - PUT /campaigns/:id/complete
  │  └─ ... (10+ other methods)
  │
  ├─ useMyShareAnalytics.ts (NEW)
  │  ├─ useMyShares(page, limit) - GET /user/shares
  │  │  └─ Returns: { shares, pagination, isLoading, error }
  │  ├─ useMyReferralPerformance(page, limit) - GET /user/referral-performance
  │  │  └─ Returns: { data, isLoading, error }
  │  └─ useMyShareAnalytics(page, limit) - Combined
  │      └─ Returns: { shares, performance, isLoading, error, refetch }
  │
  └─ useShare.ts (utility)
     ├─ useRecordShare() - POST /campaigns/:id/share
     └─ useShareAnalytics(campaignId) - Campaign share metrics
```

### Services

```
api/services/
  ├─ campaignService.ts (15+ methods)
  │  ├─ createCampaign(formData) - POST with multipart
  │  ├─ getCampaign(id) - GET /campaigns/:id
  │  ├─ updateCampaign(id, data) - PUT /campaigns/:id
  │  ├─ activateCampaign(id) - PUT /campaigns/:id/activate
  │  ├─ pauseCampaign(id) - PUT /campaigns/:id/pause
  │  ├─ completeCampaign(id) - PUT /campaigns/:id/complete
  │  └─ ... (9+ other methods)
  │
  └─ shareService.ts (if exists)
     ├─ recordShare(campaignId, channel) - POST /share
     ├─ getMyShares(page, limit) - GET /user/shares
     └─ getReferralPerformance(page, limit) - GET /user/referral-performance
```

### Validation Schemas

```
utils/validationSchemas.ts
  │
  ├─ campaignCreationSchema (Zod discriminated union)
  │  ├─ fundraisingCampaignSchema
  │  └─ sharingCampaignSchema
  │      ├─ campaignType: "sharing"
  │      ├─ title: string (5-100 chars)
  │      ├─ description: string (max 2000)
  │      ├─ share_config: object
  │      │  ├─ platforms: array (1-8 platforms)
  │      │  ├─ reward_amount: 10-10000 (cents)
  │      │  ├─ total_budget: 1000-100000000 (cents)
  │      │  └─ duration: 7-90 (days)
  │      ├─ image: File (optional, max 10MB)
  │      └─ start_date: date (optional)
  │
  └─ recordShareSchema
     ├─ channel: enum (8 platforms)
     └─ referral_code: string (alphanumeric)
```

---

## 🔙 Backend File Structure

### Controllers

```
src/controllers/
  ├─ CampaignController.js
  │  ├─ createCampaign(req, res)
  │  │  ├─ Parse FormData (multipart)
  │  │  ├─ Validate share_config
  │  │  ├─ Save to Campaign model
  │  │  └─ Return 201 with campaign data
  │  │
  │  ├─ getCampaign(req, res)
  │  │  ├─ Fetch by ID
  │  │  ├─ Aggregate: total shares, budget remaining
  │  │  └─ Return campaign with metrics
  │  │
  │  ├─ activateCampaign(req, res)
  │  │  ├─ Update status: "draft" → "active"
  │  │  └─ Validate: Can only activate drafts
  │  │
  │  ├─ pauseCampaign(req, res)
  │  │  ├─ Update status: "active" → "paused"
  │  │  └─ Disable sharing (404 on share attempts)
  │  │
  │  └─ completeCampaign(req, res)
  │     ├─ Update status: "active/paused" → "completed"
  │     └─ Freeze metrics
  │
  └─ ShareController.js
     ├─ recordShare(req, res)
     │  ├─ Authenticate request (required)
     │  ├─ Validate: campaign exists, active status, correct type
     │  ├─ Rate limit check: max 10 shares per IP per hour
     │  ├─ Call: ShareService.recordShare()
     │  ├─ Return: share_id, reward_earned, is_paid status
     │  └─ Error handling: 400, 404, 429 (rate limit)
     │
     ├─ getMyShares(req, res)
     │  ├─ Authenticate request
     │  ├─ Query: ShareRecord by supporter_id
     │  ├─ Pagination: page, limit
     │  └─ Return: shares array + pagination metadata
     │
     └─ getReferralPerformance(req, res)
        ├─ Authenticate request
        ├─ Aggregate: total referrals, conversions, earnings
        ├─ Group by platform
        ├─ Find top campaign
        └─ Return: ReferralPerformance object
```

### Services

```
src/services/
  ├─ CampaignService.js
  │  ├─ createCampaign(data)
  │  ├─ getCampaignWithMetrics(id)
  │  ├─ updateCampaignStatus(id, status)
  │  ├─ calculateRemainingBudget(campaign_id)
  │  └─ ... (more methods)
  │
  └─ ShareService.js (KEY BUSINESS LOGIC)
     ├─ recordShare(supporterId, campaignId, channel)
     │  ├─ 1. Fetch campaign (validate active, type=sharing)
     │  ├─ 2. Check rate limit (10/hour/IP)
     │  ├─ 3. Check platform valid (in campaign.share_config.platforms)
     │  ├─ 4. Calculate reward:
     │  │    if (budget_remaining ≥ reward_amount):
     │  │      is_paid = true
     │  │      deduct from budget
     │  │    else:
     │  │      is_paid = false
     │  │      pending verification
     │  ├─ 5. Generate share_id (format: SHARE-YYYY-XXXXXX)
     │  ├─ 6. Create ShareRecord document
     │  ├─ 7. Update campaign metrics (shares_recorded, budget)
     │  ├─ 8. If budget depleted: automatically set status = "completed"
     │  └─ 9. Return share_id, reward_earned, is_paid
     │
     ├─ getSharesBySupporter(supporterId, page, limit)
     │  ├─ Query: ShareRecord where supporter_id = userId
     │  ├─ Sort: by created_at descending
     │  ├─ Pagination: skip, limit
     │  └─ Return: shares array + pagination
     │
     └─ getReferralPerformance(supporterId)
        ├─ Aggregate total shares (count)
        ├─ Group by platform: count per platform
        ├─ Calculate total referrals (sum of clicks)
        ├─ Calculate conversions (sum of conversions per share)
        ├─ Calculate: conversionRate = (conversions / referrals) * 100
        ├─ Sum total rewards earned
        ├─ Find top performing campaign (by revenue)
        └─ Return: ReferralPerformance object
```

### Models & Schemas

```
src/models/
  ├─ Campaign.js
  │  ├─ Fields:
  │  │  ├─ title: String (required, minlength: 5)
  │  │  ├─ description: String (maxlength: 2000)
  │  │  ├─ campaignType: enum ["fundraising", "sharing"]
  │  │  ├─ status: enum ["draft", "active", "paused", "completed", "rejected"]
  │  │  ├─ share_config: {
  │  │  │    platforms: [String],
  │  │  │    reward_amount: Number (cents),
  │  │  │    total_budget: Number (cents),
  │  │  │    shares_recorded: { type: Number, default: 0 }
  │  │  │  }
  │  │  ├─ creator_id: ObjectId (required)
  │  │  ├─ created_at, updated_at
  │  │  └─ Image URL or base64
  │  │
  │  ├─ Indexes:
  │  │  ├─ { creator_id, created_at }
  │  │  ├─ { status, created_at }
  │  │  └─ { campaignType }
  │  │
  │  └─ Virtuals:
  │     ├─ remaining_budget: total_budget - distributed
  │     └─ metrics: { total_shares, total_distributed, ... }
  │
  └─ ShareRecord.js
     ├─ Fields:
     │  ├─ share_id: String (unique, format: SHARE-YYYY-XXXXXX)
     │  ├─ campaign_id: ObjectId (required, ref: Campaign)
     │  ├─ supporter_id: ObjectId (required, ref: User)
     │  ├─ channel: String (required, enum: [platforms])
     │  ├─ referral_code: String (unique)
     │  ├─ is_paid: Boolean (default: false initially)
     │  ├─ reward_amount: Number (cents)
     │  ├─ status: enum ["completed", "pending_verification", "verified", "rejected"]
     │  ├─ conversions: { type: Number, default: 0 }
     │  ├─ clicks: { type: Number, default: 0 }
     │  ├─ sweepstakes_entries_awarded: Number
     │  ├─ device_info, ip_address, user_agent
     │  ├─ created_at, updated_at
     │  └─ notes
     │
     ├─ Indexes (for performance):
     │  ├─ { campaign_id, created_at }
     │  ├─ { supporter_id, created_at }
     │  ├─ { share_id } (unique)
     │  ├─ { status, created_at }
     │  └─ { channel, created_at }
     │
     └─ Methods:
        ├─ calculateConversionRate()
        └─ isExpired()
```

### Routes

```
src/routes/
  ├─ campaignRoutes.js
  │  ├─ POST /campaigns - Create (authMiddleware)
  │  ├─ GET /campaigns - List all
  │  ├─ GET /campaigns/:id - Get one
  │  ├─ PUT /campaigns/:id - Update (authMiddleware, ownership check)
  │  ├─ PUT /campaigns/:id/activate - Activate (authMiddleware)
  │  ├─ PUT /campaigns/:id/pause - Pause (authMiddleware)
  │  ├─ PUT /campaigns/:id/complete - Complete (authMiddleware)
  │  └─ DELETE /campaigns/:id - Delete (authMiddleware, ownership check)
  │
  └─ shareRoutes.js (NEWLY MOUNTED in app.js)
     ├─ POST /campaigns/:campaignId/share - Record share (authMiddleware)
     ├─ GET /user/shares - Get my shares (authMiddleware)
     ├─ GET /user/referral-performance - Get referral metrics (authMiddleware)
     ├─ GET /campaigns/:id/shares - Get campaign shares (authMiddleware, ownership check)
     └─ GET /campaigns/:id/analytics - Campaign analytics (authMiddleware, ownership check)
```

### Middleware

```
src/middleware/
  ├─ authMiddleware.js
  │  ├─ Verify JWT token
  │  ├─ Extract user_id from token
  │  ├─ Set req.user = { _id, email, role, ... }
  │  ├─ Return 401 if token invalid/missing
  │  └─ USED FOR: All write operations, user-specific reads
  │
  ├─ errorHandler.js
  │  ├─ Format error responses
  │  ├─ Log errors with correlation ID
  │  └─ Return standardized error JSON
  │
  └─ rateLimit.js (if implemented)
     ├─ Check: IP address + endpoint
     ├─ Limit: 10 shares per hour per IP
     ├─ Return 429 if exceeded
     └─ USED FOR: Share recording endpoint
```

### Validation

```
src/validators/
  ├─ campaignValidators.js
  │  ├─ validateCampaignCreation(data)
  │  ├─ validateShareConfig(config)
  │  │  ├─ platforms: array of valid strings
  │  │  ├─ reward_amount: 10-10000 (cents)
  │  │  ├─ total_budget: 1000-100000000 (cents)
  │  │  └─ duration: 7-90
  │  └─ validateCampaignUpdate(data, campaign)
  │
  └─ shareValidators.js
     ├─ validateShareRecording(data, campaign)
     │  ├─ channel: must be in campaign.share_config.platforms
     │  ├─ campaign.status must be "active"
     │  ├─ campaign.campaignType must be "sharing"
     │  └─ Rate limit not exceeded
     └─ validateReferralCode(code)
```

### Utils & Helpers

```
src/utils/
  ├─ shareIdGenerator.js
  │  └─ generateShareId() → "SHARE-2026-XXXXXX" format
  │
  ├─ currencyUtils.js
  │  ├─ fromCents(cents) → dollars (1300 → 13.00)
  │  ├─ toCents(dollars) → cents (13.00 → 1300)
  │  └─ formatCurrency(cents) → "$13.00"
  │
  ├─ rewardCalculator.js
  │  ├─ calculateRewardAmount(campaign, shareCount)
  │  └─ determinePaidStatus(reward, remainingBudget)
  │
  └─ rateLimitChecker.js
     ├─ checkShareRateLimit(ipAddress, campaignId)
     └─ getShareCountLastHour(ipAddress)
```

---

## 🚨 Known Gaps & Missing Implementation

### 1. Referral URL Generation & Tracking
**Status:** Partially implemented
- ✅ `referral_code` field exists in ShareRecord
- ❌ URL generation logic not visible
- ❌ Click tracking for referral links unclear
- ❌ Conversion attribution mechanism not fully shown

**Required for full functionality:**
```javascript
// Generate tracking URL with referral code
const trackingUrl = `${campaignUrl}?ref=${referralCode}`
// When someone clicks: track click, attribute to share
// When they donate: mark as conversion in ShareRecord
```

### 2. Reward Payout Mechanism
**Status:** Initiated but not complete
- ✅ Reward calculated and added to wallet
- ❌ Payment processor integration unclear
- ❌ Payout to bank account flow not shown
- ❌ User withdrawal/redemption flow missing

**Required:**
```javascript
// When is_paid = true:
//   - Reward added to wallet
//   - Entry point to Stripe/PayPal payout?
//   - Or accumulated for monthly payouts?
```

### 3. Admin Verification Workflow
**Status:** Schema field exists but flow missing
- ✅ ShareRecord.status field: "pending_verification", "verified", "rejected"
- ❌ Admin review interface
- ❌ Rejection reason tracking
- ❌ Appeal process

### 4. Budget Reload Payment Processing
**Status:** Endpoint skeleton defined
- ✅ Route: POST /campaigns/:id/reload-budget
- ❌ Payment processor integration
- ❌ Transaction recording
- ❌ Success/failure handling

### 5. Real-time Updates
**Status:** Not implemented
- ❌ WebSocket for live metrics
- ❌ Share count updates without refresh
- ❌ Reward notifications

**Current:** 5-minute React Query stale time

### 6. Conversion Tracking Completion
**Status:** Database fields exist but logic unclear
- ✅ ShareRecord.conversions field
- ✅ ShareRecord.clicks field
- ❌ Actual click logging mechanism
- ❌ Conversion attribution logic

### 7. Sweepstakes Integration
**Status:** ✅ COMPLETE & INTEGRATED
- ✅ sweepstakes_entries_awarded: 0.5 per share (+ 1 per donation, 1 per campaign creation)
- ✅ Entries consumed: Monthly drawing on 1st of month at 2 AM UTC via scheduled job
- ✅ Winner selection: Vose's Alias Method (fair, O(1), reproducible, weighted)
- ✅ Prize distribution: Email notification + wallet update + 30-day claim window
- ✅ Entry locking: After drawing executes, old entries immutable, new entries tracked separately
- ✅ Multi-source tracking: ShareRecord.sweepstakes_entries_awarded, Transaction.sweepstakes_entries_awarded
- ✅ Frontend display: SweepstakesEntryCounter, SweepstakesLeaderboard, ClaimPrizeModal components ready

### 8. Metrics & Reporting Gaps
**Status:** ✅ COMPLETE & PRODUCTION-READY
- ✅ Basic metrics (totalShares, totalRewards)
- ✅ Time-series data for charts (daily, weekly, monthly)
- ✅ Trend analysis (direction, momentum, forecasting)
- ✅ Cohort analysis (acquisition, channel, retention)
- ✅ Performance predictions (forecasting, optimization, activity prediction)

**Implementation Details:**

#### Backend Services Created:
1. **TimeSeriesAnalyticsService** - Historical data aggregation
   - `getShareTimeSeries()` - Daily/weekly/monthly share counts
   - `getDonationTimeSeries()` - Donation amounts over time
   - `getEngagementTimeSeries()` - Views, shares, conversions combined
   - `getSupporterEarningsTimeSeries()` - Individual supporter earnings
   - `getPeriodComparison()` - Week-over-week, month-over-month, year-over-year

2. **TrendAnalysisService** - Trend detection & forecasting
   - `analyzeCampaignTrends()` - Growth rate, moving averages, momentum, forecasts
   - `analyzeDonationTrends()` - Donation amount trends
   - `detectSeasonality()` - Best days/hours for engagement
   - `getPlatformTrendAnalysis()` - Which channels trending up/down
   - `getSeasonalTrendAnalysis()` - Week-of-day performance patterns

3. **CohortAnalysisService** - Supporter group analysis
   - `analyzeCampaignCohorts()` - Group supporters by acquisition period, track retention
   - `analyzeAcquisitionCohorts()` - All supporter cohorts across campaigns
   - `analyzeChannelCohorts()` - Performance by acquisition channel
   - Metrics: retention rate, lifetime value, channel effectiveness

4. **PredictiveAnalyticsService** - Forecasting & optimization
   - `predictCampaignPerformance()` - 14-day forecast with confidence intervals
   - `predictSupporterActivity()` - Will supporter continue engaging?
   - `optimizeRewardStrategy()` - What reward amount maximizes shares?
   - Uses: Linear regression, exponential smoothing, RMSE confidence intervals

#### API Endpoints (20+ endpoints):
**Prefix: `/api/metrics`**

1. **Time-Series Analytics**
   - `GET /campaigns/:id/time-series?period=daily|weekly|monthly&days=7|30|90`
   - Returns: Shares, donations, engagement data with aggregations

2. **Trend Analysis**
   - `GET /campaigns/:id/trends?days=30`
   - Returns: Direction, momentum, volatility, moving averages, forecasts
   - `GET /campaigns/:id/platform-trends?days=30`
   - Returns: Which platforms trending up/down

3. **Seasonal Analysis**
   - `GET /campaigns/:id/seasonal?days=60`
   - Returns: Best days and hours for engagement

4. **Period Comparison**
   - `GET /campaigns/:id/compare-periods?type=WoW|MoM|YoY`
   - Returns: Performance comparison across time periods, growth percentage

5. **Cohort Analysis**
   - `GET /campaigns/:id/cohorts?days=90`
   - Returns: Supporter cohorts, retention rates, lifetime values
   - `GET /campaigns/:id/channel-cohorts`
   - Returns: Performance by acquisition channel
   - `GET /user/cohorts?days=180` [ADMIN]
   - Returns: All supporter acquisition cohorts

6. **Predictive Analytics**
   - `GET /campaigns/:id/predict?forecastDays=14`
   - Returns: 14-day forecast, confidence intervals, success probability, budget timeline
   - `GET /campaigns/:id/optimize-rewards`
   - Returns: Optimal reward amount, expected growth
   - `GET /user/:id/activity-predict?campaignId=...`
   - Returns: Activity score, next share prediction

7. **Comprehensive Dashboard**
   - `GET /campaigns/:id/comprehensive?days=30`
   - Returns: All analytics (time-series, trends, cohorts, predictions) in one call

8. **Data Export**
   - `GET /analytics/export?campaignId=...&format=json|csv&days=30`
   - Returns: Analytics data in CSV or JSON format

#### Key Algorithms Implemented:
- **Linear Regression** - Trend line calculation for forecast
- **Exponential Smoothing** - Seasonality-aware forecasting
- **Moving Averages** - 7-day, 30-day, 90-day smoothing
- **Anomaly Detection** - Identify unusual days
- **Volatility Calculation** - Standard deviation of metrics
- **Confidence Intervals** - 95% confidence bounds on forecasts
- **Momentum Calculation** - Rate of change acceleration

#### Frontend Ready Components:
- **TimeSeriesChart** - Display daily/weekly trends
- **TrendIndicator** - Show direction, momentum, forecast
- **CohortTable** - Display cohort retention and lifetime value
- **PredictionChart** - Show forecast with confidence bands
- **OptimizationPanel** - Show reward optimization recommendations
- **SeasonalHeatmap** - Show best days/hours for engagement

#### Metrics Available:
- Share count trends
- Revenue trends
- Supporter retention rates by cohort
- Channel ROI comparison
- Conversion rates over time
- Budget spend forecast
- Success probability
- Growth rate percentage
- Volatility/stability scoring
- Forecast confidence levels

---

## 🔐 Security Considerations

### Authentication
- ✅ JWT token-based authentication required for share recording
- ✅ User ID extracted from token and validated
- ❌ Token refresh mechanism not shown
- ❌ Session expiration handling unclear

### Authorization
- ✅ Campaign creator can only edit own campaigns
- ❌ Re-verify ownership in update endpoints
- ❌ Admin vs creator permissions not granular

### Data Validation
- ✅ Platform enum validation
- ✅ Budget/reward range validation
- ❌ SQL injection protection (Mongoose helps but verify)
- ❌ Rate limiting IP masking for proxies

### Privacy
- ⚠️ IP address and user agent stored per share
- ❌ GDPR compliance unclear
- ❌ Data retention policy not shown
- ❌ User deletion flow (cascade deletes?)

---

## 📊 Performance Considerations

### Database Indexes
```
ShareRecord:
  ├─ { campaign_id, created_at } - for campaign analytics
  ├─ { supporter_id, created_at } - for user's shares list
  ├─ { share_id } - unique lookup
  ├─ { status, created_at } - for admin reviews
  └─ { channel, created_at } - for platform breakdown

Campaign:
  ├─ { creator_id, created_at } - list creator's campaigns
  ├─ { status, created_at } - filter by status
  └─ { campaignType } - if mixed types in collection
```

### Query Optimization
- ✅ Pagination implemented (25 records per page)
- ✅ React Query caching (5min stale time)
- ❌ Aggregation pipelines for metrics not shown
- ❌ Batch queries for bulk operations

### Caching Strategy
- **24-hour cache:** Campaign list
- **5-minute cache:** Single campaign details
- **3-minute cache:** Share analytics
- **No cache:** User shares (real-time)

---

## 🎯 Testing Scenarios

### End-to-End Test Flow
```
1. Creator Setup Phase
   - Login as creator
   - Create sharing campaign
   - Set: platforms (2+), reward ($13/share), budget ($130 for 10 shares)
   - Publish campaign
   - Verify: Campaign visible on browse page

2. Share Recording Phase
   - Login as supporter (different user)
   - Navigate to campaign
   - Click [Share to Earn]
   - Select platform: "telegram"
   - Confirm share
   - Verify: "$13.00 earned!" message displays
   - Check database: ShareRecord created with reward_amount: 1300, is_paid: true

3. Analytics Verification Phase
   - Check database: Campaign.share_config.shares_recorded = 1
   - Check database: Campaign.share_config.total_budget reduced by 1300
   - Supporter: Navigate to /supporter/shares
   - Verify: Dashboard shows $13.00 earned, 1 share count
   - Creator: Navigate to campaign analytics
   - Verify: Campaign shows 1 share, $13 distributed, $117 remaining

4. Budget Depletion Phase
   - Repeat share recording 9 more times
   - After 10th share: budget should be depleted
   - Verify: Campaign auto-completes (status = "completed")
   - 11th attempt: Should get "budget exhausted" error

5. Rate Limiting Phase
   - Attempt more than 10 shares from same IP in 60 minutes
   - Verify: 429 error "rate_limit_exceeded"
```

---

## 📝 Implementation Checklist

| Component | Status | Priority | Notes |
|-----------|--------|----------|-------|
| Campaign creation with share config | ✅ | High | Complete |
| Share recording endpoint | ✅ | High | Complete |
| Basic reward calculation | ✅ | High | Complete |
| Budget depletion auto-completion | ✅ | High | Complete |
| Rate limiting | ✅ | Medium | 10 shares/IP/hour |
| Supporter shares list (GET /user/shares) | ⏳ | High | Endpoint defined, needs mounting |
| Referral performance metrics | ⏳ | High | Endpoint defined, needs mounting |
| Referral URL tracking | ⏳ | Medium | Mechanism unclear |
| Conversion attribution (click→donation) | ⏳ | Medium | Fields exist, logic missing |
| Admin verification workflow | ⏳ | Medium | Skeleton only |
| Budget reload (payment integration) | ⏳ | Low | Skeleton only |
| Real-time updates (WebSocket) | ⏳ | Low | Not started |
| Sweepstakes integration | ⏳ | Low | Entries awarded but drawdown missing |
| Payout mechanism | ⏳ | High | Critical for trust |
| Analytics dashboard (supporter) | ✅ | High | Recently integrated |
| Analytics dashboard (creator) | ✅ | Medium | Exists |

---

## 🎓 Key Learnings & Patterns

### Pattern 1: Currency Handling (Cents-based)
```javascript
// Frontend sends: dollars
// Wire: * 100 to cents (1300 = $13.00)
// Database: stores cents
// Response: return cents, frontend divides by 100
// Display: formatCurrency(cents) → "$13.00"
```

### Pattern 2: Campaign Type Discrimination
```javascript
// Sharing campaigns have different fields than fundraising
// Use Zod discriminated unions to validate based on type
// Separate field sets: share_config vs fundraise_config
// Service methods: if (type === 'sharing') { ... }
```

### Pattern 3: Reward Calculation at Share Time
```javascript
// Not at creation, but at actual share recording
// Check available budget at moment of share
// Determine: is_paid = (reward ≤ remaining_budget)
// Deduct immediately if paid
// Emit events for sweepstakes, notifications, etc.
```

### Pattern 4: React Query Key Factory
```javascript
const keys = {
  all: ['campaigns'],
  lists: () => [...keys.all, 'list'],
  list: (page) => [...keys.lists(), { page }],
  details: () => [...keys.all, 'detail'],
  detail: (id) => [...keys.details(), id]
}
// Allows: invalidateQueries(['campaigns']) - all keys
// Or: invalidateQueries(['campaigns', 'detail']) - just details
```

### Pattern 5: FormData for Image Upload
```javascript
// Multipart form-data required for image + JSON data
const formData = new FormData()
formData.append('title', data.title)
formData.append('share_config', JSON.stringify(config))
formData.append('image', imageFile)
// Backend: req.file, req.body (parsed)
```

---

## 📞 Next Steps & Recommendations

### Immediate (Critical Path)
1. ✅ **Mount shareRoutes in app.js** - Endpoints defined but not registered
2. ✅ **Test GET /user/shares endpoint** - Verify data structure matches frontend
3. ✅ **Test GET /user/referral-performance** - Return performance metrics
4. **Verify reward payout** - Where do earned rewards go?

### Short-term (1-2 weeks)
5. Implement referral URL generation & click tracking
6. Complete conversion attribution flow
7. Build admin verification workflow
8. Add real-time updates (WebSocket optional)

### Medium-term (1-2 months)
9. Implement budget reload payment processing
10. Complete payout/redemption mechanism
11. Add comprehensive analytics & reporting
12. Performance optimization & caching

### Long-term (Ongoing)
13. Fraud detection (duplicate shares, bot detection)
14. A/B testing for reward amounts
15. Machine learning for predicting high-conversion supporters
16. Compliance auditing (GDPR, tax reporting)

---

## 🔗 Related Documentation

- **Campaign Management:** See `CAMPAIGN_*.md` files
- **Authentication:** See `AUTH_*.md` files
- **API Reference:** See `API_REFERENCE_*.md` files
- **Backend Architecture:** See `BACKEND_*.md` files

---

**Document Version:** 1.0  
**Generated:** April 10, 2026  
**Scanned by:** Explore Agent (Thorough Depth)
