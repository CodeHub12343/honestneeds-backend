# Fundraising Campaign System: Comprehensive End-to-End Analysis

**Date:** April 11, 2026  
**Status:** Complete Analysis  
**Coverage:** Frontend (React/Next.js), Backend (Node.js/Express), Database (MongoDB)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Frontend Analysis](#frontend-analysis)
4. [Backend Analysis](#backend-analysis)
5. [End-to-End User Flows](#end-to-end-user-flows)
6. [Data Models & Transformations](#data-models--transformations)
7. [Status Transitions & Business Rules](#status-transitions--business-rules)
8. [APIs & Integrations](#apis--integrations)
9. [Validation & Constraints](#validation--constraints)
10. [Gaps & Issues](#gaps--issues)
11. [Recommendations](#recommendations)

---

## Executive Summary

### System Overview
The HonestNeed fundraising campaign system is a comprehensive platform for creating, managing, and tracking donation-based and share-based fundraising campaigns. The system supports two distinct campaign types:

- **Fundraising Campaigns**: Collect monetary donations toward a financial goal
- **Sharing Campaigns**: Incentivize social media sharing with rewards for shares (referred to as "Get Paid to Share")

### Key Statistics
- **Campaign Types**: 2 (fundraising, sharing)
- **Campaign Statuses**: 6 (draft, active, paused, completed, cancelled, rejected)
- **Need Types**: 67 predefined categories
- **Payment Methods**: 6 types (Stripe, PayPal, Venmo, Bank Transfer, Check, Money Order)
- **Frontend Components**: 15+ campaign-specific components
- **Backend Routes**: 20+ campaign-related endpoints
- **Database Tables**: 15+ models related to campaigns

### Technology Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Next.js 14, TypeScript, TanStack Query, Styled Components, Zod |
| Backend | Node.js, Express, MongoDB, Mongoose, Winston Logger |
| APIs | RESTful, Multipart Form Data, JSON |
| Authentication | JWT (Bearer tokens) |
| Image Upload | Multipart middleware with 10MB file size limit |

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      HONESTNEED PLATFORM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────┐  ┌──────────────────────┐  │
│  │       FRONTEND (React)          │  │   BACKEND (Node.js)  │  │
│  │                                │  │                      │  │
│  │  Campaign Pages:               │  │  Campaign Routes:    │  │
│  │  - Browse (/campaigns)         │  │  - POST /campaigns   │  │
│  │  - Detail (/campaigns/:id)     │  │  - GET /campaigns    │  │
│  │  - Create (/campaigns/new)     │  │  - GET /:id          │  │
│  │  - Creator Dashboard           │  │  - PUT /:id          │  │
│  │  - Donate (/donate)            │  │  - DELETE /:id       │  │
│  │  - Share & Analytics           │  │  - /activate         │  │
│  │                                │  │  - /donations        │  │
│  │  Components:                   │  │  - /metrics          │  │
│  │  - CampaignWizard (4-step)    │  │  - /shares           │  │
│  │  - CampaignCard                │  │  - /analytics        │  │
│  │  - ShareWizard                 │  │  - /volunteer-offers │  │
│  │  - QRCodeDisplay               │  │                      │  │
│  │  - FlyerDownload               │  │  Controllers:        │  │
│  │  - PaymentDirectory            │  │  - CampaignCtrl      │  │
│  │  - ShareAnalytics              │  │  - DonationCtrl      │  │
│  │                                │  │  - ShareCtrl         │  │
│  │  Hooks:                        │  │  - MetricsCtrl       │  │
│  │  - useCampaigns()              │  │  - AnalyticsCtrl     │  │
│  │  - useCampaign(id)             │  │                      │  │
│  │  - useCampaignAnalytics(id)    │  │  Services:           │  │
│  │  - useRecordShare()            │  │  - CampaignService   │  │
│  │                                │  │  - DonationService   │  │
│  │  Services:                     │  │  - ShareService      │  │
│  │  - campaignService.ts          │  │  - AnalyticsService  │  │
│  │  - donationService.ts          │  │                      │  │
│  │  - shareService.ts             │  │  Models:             │  │
│  │                                │  │  - Campaign          │  │
│  │  Store:                        │  │  - Transaction       │  │
│  │  - filterStore (Zustand)       │  │  - Share             │  │
│  │  - authStore                   │  │  - User              │  │
│  └────────────────────────────────┘  └──────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              DATABASE (MongoDB)                          │   │
│  │                                                          │   │
│  │  Collections:                                            │   │
│  │  - campaigns (main collection)                           │   │
│  │  - transactions (donations)                              │   │
│  │  - shares (share records)                                │   │
│  │  - users (creator & supporter data)                      │   │
│  │  - shares_referral (referral tracking)                   │   │
│  │  - sweepstakes_entries (entry tracking)                  │   │
│  │  - volunteer_offers (volunteer requests)                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Analysis

### 1. Campaign-Related Components

#### Core Components
| Component | Location | Purpose | Props |
|-----------|----------|---------|-------|
| **CampaignWizard** | `components/campaign/wizard/` | 4-step creation wizard | `{ draftExists }` |
| **Step3GoalsBudget** | `wizard/Step3GoalsBudget.tsx` | Step 3: Type-specific details | `{ campaignType, formData, errors, onChange }` |
| **PaymentMethodsManager** | `campaign/PaymentMethodsManager.tsx` | Manage payment methods | `{ methods, onChange }` |
| **ShareBudgetSetupSection** | `campaign/ShareBudgetSetupSection.tsx` | Configure sharing rewards | `{ formData, onChange }` |
| **QRCodeDisplay** | `campaign/QRCodeDisplay.tsx` | Display/download QR codes | `{ campaignId, campaignTitle }` |
| **FlyerDownload** | `campaign/FlyerDownload.tsx` | Generate 8x11" flyers | `{ campaignId, campaignTitle }` |
| **ShareWizard** | `campaign/ShareWizard.tsx` | Multi-social share modal | `{ campaignId, campaignTitle, campaignDescription }` |
| **ShareAnalyticsDashboard** | `campaign/ShareAnalyticsDashboard.tsx` | Share metrics by platform | `{ campaign }` |
| **ReferralAnalyticsDashboard** | `campaign/ReferralAnalyticsDashboard.tsx` | Referral performance | `{ campaignId }` |
| **ReferralUrlDisplay** | `campaign/ReferralUrlDisplay.tsx` | Shareable referral link | `{ campaignId, campaignTitle }` |
| **PaymentDirectory** | `campaign/PaymentDirectory.tsx` | Display payment options | `{ campaign, isSupportingCampaign }` |
| **CreatorProfile** | `campaign/CreatorProfile.tsx` | Creator info card | `{ creator, campaignCount }` |
| **CampaignCard** | `campaign/CampaignCard.tsx` | Card listing component | `{ campaign, showActions }` |
| **CampaignUpdates** | `campaign/CampaignUpdates.tsx` | Update feed | `{ campaignId }` |
| **ProgressBar** | `campaign/ProgressBar.tsx` | Donation progress visual | `{ current, target, variant }` |

#### Analytics Components
| Component | Purpose | Data Source |
|-----------|---------|-------------|
| CampaignMetricsCards | Display key metrics (donations, shares, views) | `useCampaignAnalytics()` |
| ActivityFeed | Recent activity feed | Backend aggregation |
| OptimizationPanel | AI recommendations | Metrics analysis |
| ConversionAnalyticsDashboard | Conversion tracking | Share service |
| MySharAnalyticsDashboard | Supporter earning analytics | Wallet service |

### 2. Campaign Pages

#### Page Structure
```
/campaigns/
├── page.tsx                          # Public browse all campaigns
├── new/
│   └── page.tsx                      # Create new campaign (wizard)
├── [id]/
│   ├── page.tsx                      # Campaign detail view
│   ├── donate/
│   │   └── page.tsx                  # Donation flow
│   └── analytics/
│       └── page.tsx                  # Campaign analytics dashboard
│
/(creator)/campaigns/
├── page.tsx                          # Creator's campaigns list (MISSING?)
└── [id]/
    └── edit/
        └── page.tsx                  # Edit draft campaign

/(supporter)/
├── donations/page.tsx                # View my donations
├── shares/page.tsx                   # View my shares
└── sweepstakes/page.tsx              # Sweepstakes dashboard
```

#### Creator Dashboard (`/(creator)/dashboard/page.tsx`)
```
Overview of all creator campaigns with management tools
- List of campaigns with status filters
- Quick stats (total raised, active campaigns, etc.)
- Create new campaign button
- Analytics overview
```

#### Campaign Detail Page (`/(campaigns)/campaigns/[id]/page.tsx`)
- Hero Image section
- Campaign Title & Description
- Creator Profile card
- Metrics Display (donations, shares, views)
- Progress bar (toward funding goal)
- Payment Methods list
- Share buttons & QR code
- Donation flow entry points
- Related Campaigns
- Volunteer Offers (if available)
- Campaign Updates feed

### 3. React Query (TanStack Query) - Cache Management

#### Query Key Factory
```typescript
const campaignKeys = {
  all: ['campaigns'],
  lists: () => [...campaignKeys.all, 'list'],
  list: (page, limit, filters?) => [...campaignKeys.lists(), { page, limit, ...filters }],
  details: () => [...campaignKeys.all, 'detail'],
  detail: (id) => [...campaignKeys.details(), id],
  analytics: () => [...campaignKeys.all, 'analytics'],
  analyticsDetail: (id) => [...campaignKeys.analytics(), id],
  trending: () => [...campaignKeys.all, 'trending'],
  related: (needType) => [...campaignKeys.all, 'related', needType],
  needTypes: () => [...campaignKeys.all, 'needTypes'],
}
```

#### Cache Stale Times
| Query | Stale | Garbage Collect |
|-------|-------|-----------------|
| Campaign List | 10 min | 30 min |
| Campaign Detail | 5 min | 15 min |
| Analytics | 3 min | 15 min |
| Trending | 15 min | 60 min |
| Related | 10 min | 30 min |
| Need Types | 1 hour | 24 hours |

### 4. API Service Layer (`api/services/campaignService.ts`)

#### Methods
```typescript
// Get campaign list with filters
getCampaigns(page, limit, filters?)

// Get single campaign detail
getCampaign(id)

// Get campaign analytics
getCampaignAnalytics(id)

// Get trending campaigns
getTrendingCampaigns(limit)

// Get related campaigns by need type
getRelatedCampaigns(excludeId, needType, limit)

// Record a campaign share
recordShare(campaignId, channel)

// Get need type taxonomy
getNeedTypes()

// Create new campaign
createCampaign(data, imageFile)

// Update campaign
updateCampaign(id, data)

// Activate/pause/complete campaign
activateCampaign(id)
pauseCampaign(id)
completeCampaign(id)

// Publish campaign
publishCampaign(id)

// Delete campaign
deleteCampaign(id)
```

### 5. Hooks (`api/hooks/useCampaigns.ts`)

#### Custom Hooks
```typescript
// Queries
useCampaigns(page, limit, filters)        // List with pagination
useCampaign(id)                           // Single detail
useCampaignAnalytics(id)                  // Real-time metrics
useTrendingCampaigns(limit)               // Trending list
useRelatedCampaigns(excludeId, needType)  // Similar campaigns
useNeedTypes()                            // Category taxonomy

// Mutations
useCreateCampaign()                       // Create new
useRecordShare()                          // Record share
useUpdateCampaign()                       // Update details
useActivateCampaign()                     // Activate to active
usePauseCampaign()                        // Pause campaign
useCompleteCampaign()                     // Mark complete

// Utilities
useInvalidateCampaigns()                  // Cache invalidation
```

### 6. Form Validation Schemas

#### Campaign Creation Schemas
```typescript
// Step 1: Campaign Type Selection
campaignTypeSchema: z.enum(['fundraising', 'sharing'])

// Step 2: Basic Information
- title: string (5-100 chars) ✓ VALIDATED
- description: string (10-2000 chars) ✓ VALIDATED
- image: File (optional, max 10MB) ✓ VALIDATED
- needType: string (enum from 67 categories) ✓ VALIDATED

// Step 3: Type-Specific Details
FUNDRAISING:
  - goalAmount: number ($1 - $9,999,999) ✓ VALIDATED
  - category: string ✓ VALIDATED
  - tags: array of strings (max 10) ✓ VALIDATED
  - duration: number (7-90 days) ✓ VALIDATED
  - paymentMethods: array (1+ methods) ✓ VALIDATED

SHARING:
  - platforms: array (1-8 social platforms) ✓ VALIDATED
  - rewardPerShare: number ($0.10-$100) ✓ VALIDATED
  - totalBudget: number ($10-$1,000,000) ✓ VALIDATED

// Step 4: Review & Publish
- Confirm all details ✓ VALIDATED
- Accept terms ✓ VALIDATED
```

### 7. State Management

#### Zustand Stores
```typescript
// authStore - User authentication
- user
- isAuthenticated
- login()
- logout()

// filterStore - Campaign filters
- searchQuery
- needTypes
- geographicScope
- minGoal / maxGoal
- location
- sortBy
- status

// User-specific stores
- creatorStore (if needed)
- supporterStore (if needed)
```

---

## Backend Analysis

### 1. Campaign Routes (`src/routes/campaignRoutes.js`)

#### Endpoints Summary
```
POST   /campaigns                          Create campaign (multipart)
GET    /campaigns                          List campaigns with pagination
GET    /campaigns/need-types               Get need type taxonomy
GET    /campaigns/trending                 Get trending campaigns

POST   /campaigns/:id/donations            Create donation
GET    /campaigns/:id/donations/metrics    Get donation metrics

POST   /campaigns/:id/activate             Activate campaign (draft→active)
POST   /campaigns/:id/pause                Pause campaign (active→paused)
POST   /campaigns/:id/complete             Complete campaign (any→completed)

GET    /campaigns/:id                      Get campaign detail
PUT    /campaigns/:id                      Update campaign
DELETE /campaigns/:id                      Soft-delete campaign

GET    /campaigns/:id/volunteer-offers     Get volunteer offers
GET    /campaigns/:id/volunteer-metrics    Get volunteer metrics

POST   /campaigns/:id/shares               Record campaign share
GET    /campaigns/:id/shares/stats         Get sharing statistics
```

#### Request/Response Examples

**CREATE CAMPAIGN (multipart/form-data)**
```javascript
POST /api/campaigns
Content-Type: multipart/form-data

Request Body:
{
  title: "Help Build School",
  description: "We need to build a new school...",
  need_type: "education_tuition",
  campaign_type: "fundraising",
  image: File,
  
  // FUNDRAISING SPECIFIC
  goalAmount: 50000,
  duration: 30,
  category: "education",
  tags: JSON.stringify(["education", "school", "building"]),
  paymentMethods: JSON.stringify([
    { type: "stripe", details: {...} },
    { type: "paypal", email: "..." }
  ]),
  
  // OR SHARING SPECIFIC
  platforms: JSON.stringify(["facebook", "twitter", "instagram"]),
  rewardPerShare: 1.5,
  totalBudget: 5000
}

Response: 201 Created
{
  success: true,
  message: "Campaign created successfully",
  data: {
    _id: "ObjectId",
    campaign_id: "CAMP-2026-123-ABC",
    title: "Help Build School",
    status: "draft",
    created_at: "2026-04-11T10:00:00Z",
    ...
  }
}
```

**ACTIVATE CAMPAIGN**
```javascript
POST /api/campaigns/:id/activate
Authorization: Bearer {token}

Response: 200 OK
{
  success: true,
  data: {
    _id: "ObjectId",
    campaign_id: "CAMP-2026-123-ABC",
    status: "active",
    published_at: "2026-04-11T10:00:00Z",
    start_date: "2026-04-11T10:00:00Z",
    end_date: "2026-05-11T10:00:00Z"
  }
}
```

### 2. Campaign Model (`src/models/Campaign.js`)

#### Schema Structure
```javascript
campaignSchema = {
  // IDENTIFIERS
  campaign_id: String (unique, required),
  _id: ObjectId (MongoDB ID),
  
  // OWNERSHIP
  creator_id: ObjectId (ref: User, required),
  
  // BASIC INFO
  title: String (5-200 chars),
  description: String (max 2000 chars),
  image_url: String,
  
  // CLASSIFICATION
  need_type: String (enum: 67 categories),
  campaign_type: String (enum: ['fundraising', 'sharing']),
  
  // GOALS ARRAY
  goals: [{
    goal_type: String ('fundraising'|'sharing_reach'|'resource_collection'),
    goal_name: String,
    target_amount: Number,
    current_amount: Number
  }],
  
  // LOCATION
  location: {
    address: String,
    city: String,
    state: String,
    zip_code: String,
    country: String,
    latitude: Number,
    longitude: Number
  },
  
  // PAYMENT METHODS
  payment_methods: [{
    type: String (enum: ['stripe', 'paypal', 'venmo', 'bank_transfer', 'check', 'money_order']),
    details_encrypted: String,
    is_primary: Boolean
  }],
  
  // STATUS
  status: String (enum: ['draft', 'active', 'paused', 'completed', 'cancelled', 'rejected']),
  
  // TIMING
  start_date: Date,
  end_date: Date,
  published_at: Date,
  completed_at: Date,
  
  // METRICS
  view_count: Number (default: 0),
  share_count: Number (default: 0),
  engagement_score: Number (default: 0),
  
  // CONTRIBUTORS
  contributors: [{
    donor_name: String,
    amount: Number (in cents),
    date: Date,
    message: String
  }],
  
  // SHARING CONFIG (for sharing campaigns)
  share_config: {
    total_budget: Number (in cents),
    current_budget_remaining: Number (in cents),
    amount_per_share: Number (in cents),
    is_paid_sharing_active: Boolean,
    share_channels: [String]
  },
  
  // DERIVED FIELDS (calculated)
  total_donation_amount: Number (in cents, computed),
  total_donations: Number (computed),
  total_donors: Number (computed),
  
  // SOFT DELETE
  is_deleted: Boolean (default: false),
  
  // TIMESTAMPS
  created_at: Date,
  updated_at: Date
}
```

### 3. Campaign Controller (`src/controllers/campaignController.js`)

#### Methods
| Method | Route | Purpose |
|--------|-------|---------|
| `create` | POST `/` | Create new campaign (multipart) |
| `list` | GET `/` | List campaigns with filters/pagination |
| `getCampaign` | GET `/:id` | Get campaign detail |
| `update` | PUT `/:id` | Update campaign |
| `delete` | DELETE `/:id` | Soft-delete campaign |
| `activate` | POST `/:id/activate` | Transition draft→active |
| `pause` | POST `/:id/pause` | Transition active→paused |
| `complete` | POST `/:id/complete` | Transition any→completed |
| `getTrending` | GET `/trending` | Get trending campaigns |
| `getNeedTypes` | GET `/need-types` | Get category taxonomy |

#### Key Handler: Campaign Creation
```javascript
// POST /campaigns
async create(req, res, next) {
  // 1. EXTRACT USER ID from JWT
  const userId = req.user?.id
  if (!userId) return res.status(401).json({ message: 'Unauthorized' })
  
  // 2. VALIDATE CAMPAIGN TYPE
  if (req.body.campaign_type === 'sharing') {
    const { platforms, budget, reward_per_share } = req.body
    // Validate sharing-specific fields
    if (!platforms) errors.push('platforms required')
    if (!budget || budget < 10 || budget > 1000000) errors.push('budget out of range')
    if (!reward_per_share || reward_per_share < 0.10 || reward_per_share > 100) 
      errors.push('reward_per_share out of range')
  }
  
  // 3. CALL CAMPAIGN SERVICE
  const campaign = await CampaignService.createCampaign(userId, req.body)
  
  // 4. AWARD SWEEPSTAKES ENTRY
  await SweepstakesService.addEntry(userId, 'campaign_created')
  
  // 5. RESPOND
  return res.status(201).json({
    success: true,
    message: 'Campaign created successfully',
    data: campaign
  })
}
```

### 4. Campaign Service (`src/services/CampaignService.js`)

#### Key Methods

**generateCampaignId()**
- Format: `CAMP-YYYY-NNN-XXXXXX`
- Year: Current year
- Sequence: Random 3-digit number
- Suffix: 6-character UUID

**calculateCampaignEndDate(startDate, durationDays)**
- Validates duration: 7-365 days (clamped)
- Returns: { endDate, durationDays, durationMs, startDate }

**encryptPaymentMethod(paymentData)**
- Uses AES-256-GCM encryption
- Only for non-Stripe methods
- Returns: IV:encrypted:authTag format

**createCampaign(userId, campaignData)**
```javascript
1. Validate input (schema validation)
2. Generate unique campaign_id
3. Process image (if provided)
4. Encrypt payment methods
5. Parse CSV/JSON fields (tags, platforms, targetAudience)
6. Create campaign document
7. Return created campaign
```

---

## End-to-End User Flows

### Flow 1: Create Fundraising Campaign

```
STEP 1: USER INTENT
├─ Creator clicks "Create Campaign"
├─ Route: /campaigns/new
└─ Component: CampaignWizard

STEP 2: STEP 1 - SELECT TYPE (Type Selection)
├─ UI: Radio buttons - "Fundraising" vs "Sharing"
├─ Validation: campaignTypeSchema (enum)
├─ Data Stored: { campaignType: 'fundraising' }
└─ Next: Continue to Step 2

STEP 3: STEP 2 - BASIC INFO (Description)
├─ Form Fields:
│  ├─ Title (5-100 chars) → validate minLength, maxLength
│  ├─ Category (dropdown) → validate enum from 67 need_types
│  ├─ Description (10-2000 chars) → validate minLength, maxLength
│  └─ Image Upload (optional, max 10MB) → validate file size, mime type
├─ Validation:
│  ├─ Title: z.string().min(5).max(100)
│  ├─ Description: z.string().min(10).max(2000)
│  ├─ Image: File validation via HTML5 input
│  └─ NeedType: z.enum([...67 types...])
├─ Data Stored:
│  {
│    title: "Help Build School",
│    description: "We need...",
│    need_type: "education_tuition",
│    image: File
│  }
└─ Next: Continue to Step 3

STEP 4: STEP 3 - FUNDRAISING DETAILS (Goals & Budget)
├─ Form Fields:
│  ├─ Goal Amount ($) → validate $1-$9,999,999
│  ├─ Campaign Duration (days) → validate 7-90 days
│  ├─ Payment Methods → select 1+ methods
│  │  ├─ Stripe (default)
│  │  ├─ PayPal
│  │  ├─ Venmo
│  │  └─ Bank Transfer
│  └─ Tags (chips) → max 10 tags
├─ Validation:
│  ├─ goalAmount: z.number().min(100).max(999999900)
│  ├─ duration: z.number().min(7).max(90)
│  ├─ paymentMethods: z.array().min(1).max(6)
│  └─ tags: z.array().max(10)
├─ Data Stored:
│  {
│    fundraisingData: {
│      goalAmount: 50000,
│      duration: 30,
│      paymentMethods: ['stripe', 'paypal'],
│      category: 'education',
│      tags: ['education', 'school']
│    }
│  }
└─ Next: Continue to Step 4

STEP 5: STEP 4 - REVIEW & PUBLISH (Confirmation)
├─ Display Summary:
│  ├─ Campaign Title & Description
│  ├─ Goal Amount & Duration
│  ├─ Payment Methods
│  ├─ Tags & Category
│  └─ Preview Image
├─ Actions:
│  ├─ "Edit" → Return to previous steps
│  └─ "Publish" → Submit
└─ Final Validation: Confirm all fields

STEP 6: SUBMIT & API CALL
├─ Frontend Preparation:
│  ├─ Create FormData object
│  ├─ Append fields as strings/JSON
│  ├─ Example:
│  │  formData.append('title', 'Help Build School')
│  │  formData.append('description', '...')
│  │  formData.append('need_type', 'education_tuition')
│  │  formData.append('campaign_type', 'fundraising')
│  │  formData.append('image', File)
│  │  formData.append('fundraisingData', JSON.stringify({
│  │    goalAmount: 50000,
│  │    duration: 30,
│  │    paymentMethods: ['stripe', 'paypal']
│  │  }))
│  │  formData.append('tags', 'education,school')
│  │
│  └─ Call: POST /api/campaigns with Bearer token
│
├─ Backend Processing:
│  ├─ CampaignController.create()
│  ├─ Extract userId from JWT
│  ├─ Validate request
│  ├─ CampaignService.createCampaign()
│  │  ├─ Generate campaign_id (CAMP-2026-001-ABC123)
│  │  ├─ Process image upload (if provided)
│  │  ├─ Encrypt payment methods
│  │  ├─ Parse tags CSV → Array
│  │  ├─ Create Campaign document
│  │  └─ Set status: 'draft'
│  ├─ Award sweepstakes entry
│  └─ Return 201 with campaign data
│
├─ Response:
│  {
│    success: true,
│    data: {
│      _id: ObjectId,
│      campaign_id: "CAMP-2026-001-ABC123",
│      title: "Help Build School",
│      status: "draft",
│      created_at: "2026-04-11T10:00:00Z",
│      ...
│    }
│  }
│
└─ Frontend Redirect:
   ├─ Store campaign ID
   ├─ Invalidate campaign list cache
   ├─ Show success toast
   └─ Redirect to: /campaigns/[id]/edit OR /campaigns

STEP 7: CAMPAIGN IN DRAFT STATE
├─ Status: 'draft'
├─ Creator Can:
│  ├─ Edit all fields
│  ├─ Delete campaign
│  └─ Activate to 'active'
├─ Creator Cannot:
│  ├─ Accept donations (requires active status)
│  └─ Record shares (requires active status)
└─ Campaign Not Visible:
   ├─ To public on browse page
   └─ In trending/analytics
```

### Flow 2: Activate Campaign (Draft → Active)

```
USER ACTION
├─ Creator clicks "Publish Campaign" or "Activate"
├─ Route: Current page or detail page
└─ Component: CampaignDetail (action button)

FRONTEND EVENT
├─ Call: useActivateCampaign().mutate({ campaignId })
├─ Service: campaignService.activateCampaign(campaignId)
├─ API Call: POST /api/campaigns/{campaignId}/activate
└─ Auth: Bearer token required

BACKEND PROCESSING
├─ CampaignController.activate()
├─ Fetch campaign by ID
├─ Validate:
│  ├─ Campaign exists
│  ├─ User is creator
│  └─ Status is 'draft' (only draft can activate)
├─ CampaignService.activateCampaign()
│  ├─ Calculate end_date
│  │  ├─ Get duration (stored in fundraisingData)
│  │  ├─ Call: CampaignService.calculateCampaignEndDate()
│  │  └─ Returns: { endDate, durationDays }
│  ├─ Update campaign:
│  │  ├─ status: 'draft' → 'active'
│  │  ├─ published_at: new Date()
│  │  ├─ start_date: new Date()
│  │  └─ end_date: calculated date
│  ├─ Set view_count to 0
│  └─ Save to database
├─ Return updated campaign

FRONTEND UPDATE
├─ Mutation success callback
├─ Invalidate caches:
│  ├─ campaignDetail(campaignId)
│  ├─ campaignAnalytics(campaignId)
│  └─ campaignList()
├─ Show success notification
├─ Update local state
└─ Redirect to campaign detail view

CAMPAIGN NOW ACTIVE
├─ Status: 'active'
├─ Visible: On public browse page
├─ Accepts: Donations & shares
├─ Metrics: Tracked in real-time
└─ Creator Can:
   ├─ View analytics
   ├─ Pause campaign
   ├─ Complete campaign
   └─ Record shares
```

### Flow 3: Record Donation

```
USER INTENT
├─ Supporter views active campaign
├─ Clicks "Donate" button
├─ Routed to: /campaigns/[id]/donate
└─ Component: DonationWizard (3-step)

STEP 1: SELECT AMOUNT
├─ Options:
│  ├─ Predefined: $5, $10, $25, $50, $100
│  └─ Custom: User enters amount
├─ Validation:
│  ├─ Amount > 0
│  ├─ Max: Configurable by admin
│  └─ Show fee breakdown
└─ Data Stored: { amount: 2500 } (in cents)

STEP 2: SELECT PAYMENT METHOD
├─ Available Methods:
│  ├─ From campaign.payment_methods
│  ├─ Filter: is_primary or all
│  └─ Display: Each method with instructions
├─ Options depend on campaign config:
│  ├─ Stripe (most common)
│  ├─ PayPal
│  ├─ Venmo
│  ├─ Bank Transfer
│  └─ Check
└─ Data Stored: { paymentMethod: 'stripe' }

STEP 3: REVIEW & CONFIRM
├─ Summary:
│  ├─ Campaign: Title & Goal
│  ├─ Amount: $25.00
│  ├─ Fee Breakdown:
│  │  ├─ Gross: $25.00
│  │  ├─ Fee (3.5% + $0.25): -$1.13
│  │  └─ Net to Creator: $23.87
│  ├─ Payment Method: Selected
│  └─ Optional: Message, Donor Name
├─ Checkboxes:
│  ├─ "I want to be notified of updates"
│  └─ "Share my name publicly" (or "Anonymous")
└─ Button: "Confirm Donation"

SUBMIT & PROCESSING
├─ Frontend:
│  ├─ Prepare FormData
│  ├─ Call: POST /api/campaigns/{id}/donations
│  ├─ Payload:
│  │  {
│  │    amount: 2500,  // in cents
│  │    paymentMethod: 'stripe',
│  │    donorName: 'Jane Smith',
│  │    message: 'Great cause!',
│  │    isAnonymous: false
│  │  }
│  └─ Auth: Bearer token (supporter user)
│
├─ Backend Processing:
│  ├─ DonationController.createDonation()
│  ├─ Validate:
│  │  ├─ Campaign exists
│  │  ├─ Campaign status is 'active'
│  │  ├─ Amount is valid
│  │  └─ Payment method is available
│  ├─ DonationService.createDonation()
│  │  ├─ Calculate fees (platform fee, payment processor fee)
│  │  ├─ Create Transaction document
│  │  │  ├─ transaction_id (generated)
│  │  │  ├─ amount_cents: 2500
│  │  │  ├─ fee_cents: 113
│  │  │  ├─ net_cents: 2387
│  │  │  ├─ campaign_id: reference
│  │  │  ├─ donor_id: reference
│  │  │  ├─ payment_method: 'stripe'
│  │  │  ├─ status: 'pending' (unverified)
│  │  │  └─ created_at: now
│  │  ├─ If payment_method === 'stripe':
│  │  │  ├─ Create Stripe PaymentIntent
│  │  │  ├─ Return client_secret
│  │  │  └─ Status: 'pending' until webhook confirms
│  │  ├─ If payment_method === 'manual' (PayPal, Venmo, etc.):
│  │  │  ├─ Status: 'pending'
│  │  │  └─ Require admin verification
│  │  ├─ Award sweepstakes entries based on donation amount
│  │  ├─ Update campaign metrics:
│  │  │  ├─ total_donations: +1
│  │  │  ├─ total_donation_amount: +2500
│  │  │  └─ total_donors: +1 (if new donor)
│  │  └─ Add to campaign.contributors array
│  └─ Return transaction details
│
├─ Response:
│  {
│    success: true,
│    data: {
│      transaction_id: "TXN-2026-001-...",
│      amount_dollars: 25.00,
│      amount_cents: 2500,
│      fee_breakdown: {
│        gross: 2500,
│        fee: 113,
│        net: 2387,
│        fee_percentage: 4.52
│      },
│      status: 'pending',
│      sweepstakes_entries: 25,  // e.g., 1 entry per $1
│      stripe_client_secret: "..."  // if stripe
│    }
│  }
│
└─ Frontend Handling:
   ├─ If Stripe:
   │  ├─ Display Stripe payment form
   │  ├─ Collect card details
   │  └─ Call Stripe confirmPayment()
   ├─ If Manual:
   │  ├─ Display instructions for payment
   │  ├─ Show proof upload form
   │  └─ Mark as "pending verification"
   ├─ Show success page with receipt
   └─ Invalidate caches:
      ├─ campaignDetail(id)
      ├─ campaignAnalytics(id)
      └─ donationList()
```

### Flow 4: Share Campaign & Record Share

```
USER INTENT
├─ Supporter wants to share campaign
├─ Clicks "Share" button on campaign detail
└─ Component: ShareWizard

STEP 1: SELECT PLATFORM
├─ Available Platforms:
│  ├─ Facebook
│  ├─ Twitter/X
│  ├─ LinkedIn
│  ├─ WhatsApp
│  ├─ Email
│  └─ Direct Link
├─ Each platform shows:
│  ├─ Icon
│  ├─ Platform name
│  ├─ Potential reach
│  └─ If paid sharing: "Earn $$"
└─ Data Stored: { platform: 'facebook' }

SUBMIT & RECORD SHARE
├─ Frontend:
│  ├─ User selects platform
│  ├─ generateShareUrl():
│  │  ├─ campaignId (from URL param)
│  │  ├─ referralCode (generated or from JWT)
│  │  └─ Example: /campaigns/ABC123?ref=SHARE-XYZ
│  ├─ Call: useRecordShare().mutate()
│  ├─ Service: campaignService.recordShare()
│  ├─ API Call: POST /api/campaigns/{id}/shares
│  │  {
│  │    channel: 'facebook',
│  │    referral_code: 'SHARE-XYZ'
│  │  }
│  └─ Auth: Bearer token
│
├─ Backend Processing:
│  ├─ ShareController.recordShare()
│  ├─ Validate:
│  │  ├─ Campaign exists
│  │  ├─ Campaign type allows sharing (any type)
│  │  └─ Channel is valid enum
│  ├─ ShareService.recordShare()
│  │  ├─ Create Share document:
│  │  │  ├─ campaign_id: reference
│  │  │  ├─ sharer_id: reference
│  │  │  ├─ channel: 'facebook'
│  │  │  ├─ referral_code: 'SHARE-XYZ'
│  │  │  ├─ shared_at: now
│  │  │  ├─ status: 'recorded'
│  │  │  └─ click_count: 0
│  │  ├─ Update campaign.share_count: +1
│  │  ├─ If Sharing Campaign with paid_sharing:
│  │  │  ├─ Check share_config.total_budget available
│  │  │  ├─ Reserve amount_per_share from budget
│  │  │  └─ Set share pending verification
│  │  └─ Create ShareReferral record for tracking
│  └─ Return share details
│
└─ Frontend Update:
   ├─ Show success: "Shared! 🎉"
   ├─ Display referral link (if earned rewards)
   ├─ Copy-to-clipboard button
   ├─ QR code option
   ├─ Invalidate caches:
   │  ├─ campaignAnalytics(id)
   │  └─ campaignDetail(id)
   └─ If paid sharing:
      └─ Show earning: "You could earn $1.00 per share!"

SHARE TRACKING
├─ User shares referral link on social media
├─ Someone clicks link: /campaigns/ABC123?ref=SHARE-XYZ
├─ Page loads with ReferralClickTracker component
├─ ReferralClickTracker.useTrackReferralClick()
│  ├─ Extract ref parameter
│  ├─ API Call: POST /api/referral-clicks
│  │  { campaignId, referralCode }
│  └─ Backend records click
├─ Click count stored in Share document
└─ Share records potential conversion
```

---

## Data Models & Transformations

### Campaign Data Transformation Pipeline

```
FRONTEND (dollars) → API CALL (form) → BACKEND (cents) → DATABASE → API RESPONSE (cents) → FRONTEND (dollars)
```

#### Frontend → API (Outbound Transformation)

```typescript
// Frontend: User enters $50.00
const formData = {
  goalAmount: 50000,  // User input in dollars, but stored as is
  rewardPerShare: 1.5,  // dollars
  budget: 5000  // dollars
}

// When SENDING to backend
const transformForSubmit = (data) => {
  return {
    // Convert dollars to cents by multiplying by 100
    goalAmount: Math.round(data.goalAmount * 100),  // $50 → 5000 cents
    rewardPerShare: Math.round(data.rewardPerShare * 100),  // $1.5 → 150 cents
    budget: Math.round(data.budget * 100),  // $5000 → 500000 cents
    // String array fields
    tags: data.tags.join(','),  // ['a','b'] → 'a,b'
    platforms: JSON.stringify(data.platforms)  // Array → JSON string
  }
}
```

#### Backend (Database Storage)

```javascript
// all monetary fields stored in CENTS
campaign = {
  title: "Help Build School",
  goals: [{
    target_amount: 5000000,  // $50,000 in cents
    current_amount: 2350000  // $23,500 in cents
  }],
  share_config: {
    total_budget: 500000,  // $5000 in cents
    current_budget_remaining: 350000,  // $3500 in cents
    amount_per_share: 150  // $1.50 in cents
  }
}

// String fields parsed back to arrays/objects
campaign.tags = ['education', 'school']  // parsed from CSV
campaign.share_config.share_channels = ['facebook', 'twitter']  // parsed from JSON
```

#### API Response → Frontend (Inbound Transformation)

```typescript
// Backend response contains cents
const response = {
  goalAmount: 5000000,  // in cents
  raisedAmount: 2350000,  // in cents
  shareConfig: {
    amountPerShare: 150  // in cents
  }
}

// Frontend normalizes to dollars for display
const formatCampaignFromAPI = (campaign) => {
  return {
    ...campaign,
    goalAmount: campaign.goalAmount / 100,  // 5000000 cents → $50,000
    raisedAmount: campaign.raisedAmount / 100,  // 2350000 cents → $23,500
    shareConfig: {
      ...campaign.shareConfig,
      amountPerShare: campaign.shareConfig?.amountPerShare / 100  // 150 cents → $1.50
    }
  }
}

// Display: "Goal: $50,000"
```

### Campaign Status Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                   CAMPAIGN STATUS                       │
│                    LIFECYCLE                            │
└─────────────────────────────────────────────────────────┘

                        [DRAFT]
                          ↓
              (Creator publishes/activates)
                          ↓
                      [ACTIVE]
                    ↙        ↘
        (Creator pauses)  (Receives donations & shares)
            ↙                    ↘
        [PAUSED]            Can be completed:
          ↓                      ↓
    (Can unpause or            [COMPLETED]
     complete)                   ↓
                          (Campaign ended)
          
    Alternative paths:
    - [DRAFT] → [REJECTED] (admin rejects)
    - [ACTIVE] → [CANCELLED] (creator force-stops)
    - [PAUSED] → [CANCELLED]
    - Any → [DELETED] (soft-delete, but still tracked)
```

### Field Mapping by Campaign Type

#### Fundraising Campaign
```javascript
Frontend Input → Backend Storage
{
  // Common fields
  title: string,
  description: string,
  needType: string,
  image: File,
  
  // FUNDRAISING SPECIFIC
  fundraisingData: {
    goalAmount: number (dollars) → goalAmount: number (cents),
    duration: number (days) → duration: number (days),
    category: string,
    tags: string[] → tags: CSV string,
    paymentMethods: string[] → paymentMethods: encrypted details
  }
}

↓ (Transform to API format)

FormData sent to backend:
{
  campaign_type: 'fundraising',
  goalAmount: string (already in dollars, frontend converts to cents in backend),
  duration: string,
  category: string,
  tags: 'education,school,building',
  paymentMethods: JSON.stringify([...])
}

↓ (Backend processing)

Stored in database:
{
  campaign_type: 'fundraising',
  goals: [{
    goal_type: 'fundraising',
    target_amount: 5000000,  // cents
    current_amount: 0
  }],
  duration: 30,
  payment_methods: [encrypted objects],
  tags: ['education', 'school', 'building']
}
```

#### Sharing Campaign
```javascript
Frontend Input → Backend Storage
{
  // Common fields
  title: string,
  description: string,
  needType: string,
  image: File,
  
  // SHARING SPECIFIC
  sharingData: {
    platforms: string[] (1-8),
    rewardPerShare: number (dollars),
    totalBudget: number (dollars)
  }
}

↓ (Transform to API format)

FormData sent to backend:
{
  campaign_type: 'sharing',
  platforms: JSON.stringify(['facebook', 'twitter', 'instagram']),
  reward_per_share: string,
  total_budget: string
}

↓ (Backend processing)

Stored in database:
{
  campaign_type: 'sharing',
  goals: [{
    goal_type: 'sharing_reach',
    target_amount: 0,  // no monetary goal
    current_amount: 0
  }],
  share_config: {
    total_budget: 500000,  // $5000 in cents
    current_budget_remaining: 500000,
    amount_per_share: 150,  // $1.50 in cents
    is_paid_sharing_active: true,
    share_channels: ['facebook', 'twitter', 'instagram']
  }
}
```

---

## Status Transitions & Business Rules

### Allowed Status Transitions

| From Status | To Status | Condition | Action | Who |
|------------|-----------|-----------|--------|-----|
| Draft | Active | ✅ Always allowed | Activate campaign, set start/end dates | Creator |
| Draft | Rejected | ✅ Always allowed | Admin review rejected | Admin |
| Draft | Deleted | ✅ Always allowed | (soft delete) | Creator |
| Active | Paused | ✅ Always allowed | Pause campaign | Creator |
| Active | Completed | ✅ Always allowed | End campaign manually | Creator/Admin |
| Paused | Active | ✅ Always allowed | Resume campaign | Creator |
| Paused | Completed | ✅ Always allowed | End campaign manually | Creator/Admin |
| Paused | Deleted | ✅ Always allowed | (soft delete) | Creator |
| Completed | (none) | ❌ Terminal state | Cannot transition | - |
| Cancelled | (none) | ❌ Terminal state | Cannot transition | - |
| Rejected | (draft or delete) | ⚠️ Resubmit or delete | Address issues | Creator |

### Status-Based Capabilities

| Status | Can Edit | Can Donate | Can Share | Can View | Analytics | In Search |
|--------|----------|-----------|-----------|----------|-----------|-----------|
| Draft | ✅ Yes | ❌ No | ❌ No | 🔐 Creator Only | ❌ No | ❌ No |
| Active | ❌ No | ✅ Yes | ✅ Yes | ✅ Public | ✅ Real-time | ✅ Yes |
| Paused | ❌ No | ❌ No | ❌ No | ✅ Public | ✅ Last State | ✅ Yes |
| Completed | ❌ No | ❌ No | ❌ No | ✅ Public | ✅ Final | ✅ No (archive) |
| Rejected | ❌ No* | ❌ No | ❌ No | ❌ No** | ❌ No | ❌ No |
| Deleted | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

*Can delete and create new version
**Creator can see for reference

### Duration Validation Rules

```
MIN_DURATION: 7 days
MAX_DURATION: 90 days (fundraising campaigns)
             365 days (sharing campaigns)
DEFAULT:     30 days

Clamping Logic:
if (duration < MIN) → use MIN
if (duration > MAX) → use MAX
if (!duration or NaN) → use DEFAULT
```

### End Date Calculation

```javascript
// Formula
end_date = start_date + (duration_days * 24 * 60 * 60 * 1000)

Example:
start_date: 2026-04-11 10:00:00 UTC
duration: 30 days
end_date: 2026-05-11 10:00:00 UTC
```

---

## APIs & Integrations

### Campaign CRUD Operations

#### Create Campaign
```
ENDPOINT: POST /api/campaigns
CONTENT-TYPE: multipart/form-data
AUTH: Required (Bearer token)
RETURNS: 201 Created

FIELDS:
├─ title: string (5-100)
├─ description: string (10-2000)
├─ need_type: enum (67 types)
├─ campaign_type: 'fundraising' | 'sharing'
├─ image: File? (max 10MB)
├─ category: string
├─ tags: string (CSV)
├─ fundraisingData: JSON
│  ├─ goalAmount: number
│  ├─ duration: number
│  ├─ paymentMethods: array
│  └─ category: string
└─ sharingData: JSON (if sharing campaign)
   ├─ platforms: array
   ├─ reward_per_share: number
   └─ total_budget: number
```

#### Get Campaign List
```
ENDPOINT: GET /api/campaigns
QUERY PARAMS:
├─ page: number (default: 1)
├─ limit: number (default: 12, max: 100)
├─ search: string
├─ needTypes: string (comma-separated)
├─ status: string (draft|active|paused|completed)
├─ scope: 'local'|'regional'|'national'|'global'
├─ minGoal: number (in dollars)
├─ maxGoal: number (in dollars)
└─ sort: string (trending|newest|most-funded)

RETURNS: 200 OK
{
  campaigns: Campaign[],
  pagination: { page, limit, total, totalPages }
}
```

#### Get Campaign Detail
```
ENDPOINT: GET /api/campaigns/:id
PARAMS:
├─ id: Campaign ID (MongoDB ObjectId or campaign_id string)
AUTH: Optional
RETURNS: 200 OK

Response includes:
├─ Campaign full object
├─ Payment methods (filtered if not creator)
├─ Related campaigns
└─ Analytics (if creator)
```

#### Update Campaign
```
ENDPOINT: PUT /api/campaigns/:id
CONTENT-TYPE: application/json or multipart/form-data
AUTH: Required (creator only)
RETURNS: 200 OK

RULES:
- Only draft campaigns can be updated
- Once active, most fields are immutable
- Some fields (endDate, campaignType) never change
```

#### Delete Campaign
```
ENDPOINT: DELETE /api/campaigns/:id
AUTH: Required (creator or admin)
RETURNS: 204 No Content

BEHAVIOR: Soft delete
├─ Sets is_deleted: true
├─ Campaign still in database
├─ Campaign hidden from public view
└─ Creator can restore (if soft delete reversible)
```

### Campaign Status Transitions

#### Activate Campaign
```
ENDPOINT: POST /api/campaigns/:id/activate
AUTH: Required (creator only)
RETURNS: 200 OK

PRECONDITIONS:
├─ Campaign exists
├─ User is creator
└─ Status is 'draft'

ACTIONS:
├─ Set status: 'active'
├─ Set start_date: now
├─ Calculate & set end_date
├─ Set published_at: now
├─ Make campaign visible
└─ Enable donations & shares
```

#### Pause Campaign
```
ENDPOINT: POST /api/campaigns/:id/pause
AUTH: Required (creator only)
RETURNS: 200 OK

PRECONDITIONS:
├─ Campaign exists
├─ User is creator
└─ Status is 'active'

ACTIONS:
├─ Set status: 'paused'
├─ Disable new donations
├─ Disable new shares
├─ Keep existing data intact
└─ Can be resumed or completed
```

#### Complete Campaign
```
ENDPOINT: POST /api/campaigns/:id/complete
AUTH: Required (creator or admin)
RETURNS: 200 OK

PRECONDITIONS:
├─ Campaign exists
└─ User is creator or admin

ACTIONS:
├─ Set status: 'completed'
├─ Set completed_at: now
├─ Final snapshot of metrics
├─ Initialize payout processing
└─ Archive campaign
```

### Analytics Endpoints

#### Get Campaign Analytics
```
ENDPOINT: GET /api/campaigns/:id/analytics
PARAMS: id (campaign ID)
AUTH: Optional (more data if creator)
RETURNS: 200 OK

Response includes:
├─ Real-time metrics
│  ├─ total_donations: number
│  ├─ total_raised: number (in cents)
│  ├─ unique_donors: number
│  ├─ total_shares: number
│  └─ view_count: number
├─ Breakdown by source
│  ├─ by_payment_method: object
│  ├─ by_date: array
│  ├─ by_platform: object (shares)
│  └─ top_donors: array
├─ Trends
│  ├─ momentum: number (velocity)
│  ├─ estimated_end_date: date
│  └─ funding_percentage: number
└─ Predictions (if enough data)
   └─ projected_total: number
```

#### Get Donation Metrics
```
ENDPOINT: GET /api/campaigns/:id/donations/metrics
QUERY:
├─ timeframe: 'today'|'week'|'month'|'all'
└─ includeBreakdown: boolean

Returns:
├─ Aggregated donation stats
├─ Payment method breakdown
├─ Recent donations list
└─ Timeline/chart data
```

#### Get Share Statistics
```
ENDPOINT: GET /api/campaigns/:id/shares/stats
Returns:
├─ Total shares by platform
├─ Share trends over time
├─ Top sharers (leaderboard)
├─ Pending shares (if paid sharing)
└─ Earned amounts per sharer
```

---

## Validation & Constraints

### Campaign Creation Validation

#### Field-Level Validation

| Field | Type | Min | Max | Required | Pattern | Backend Check |
|-------|------|-----|-----|----------|---------|---------------|
| **title** | string | 5 | 100 | ✅ Yes | Alpha+space | ✅ Yes |
| **description** | string | 10 | 2000 | ✅ Yes | Any | ✅ Yes |
| **needType** | enum | - | - | ✅ Yes | 67 values | ✅ Yes |
| **campaign_type** | enum | - | - | ✅ Yes | fundraising\|sharing | ✅ Yes |
| **image** | file | - | 10MB | ❌ No | JPEG/PNG/GIF/WebP | ✅ Yes |
| **category** | string | - | - | ✅ Yes (fundraising) | Predefined list | ✅ Yes |
| **tags** | array | 0 | 10 | ❌ No | String values | ✅ Yes |

#### Fundraising-Specific Validation

| Field | Type | Min | Max | Required | Note |
|-------|------|-----|-----|----------|------|
| **goalAmount** | number | $1 | $9,999,999 | ✅ Yes | User enters dollars, backend converts to cents |
| **duration** | number | 7 | 90 | ✅ Yes | Days |
| **paymentMethods** | array | 1 | 6 | ✅ Yes | At least one method |
| **category** | string | - | - | ✅ Yes | From 67 predefined types |

#### Sharing-Specific Validation

| Field | Type | Min | Max | Required | Note |
|-------|------|-----|-----|----------|------|
| **platforms** | array | 1 | 8 | ✅ Yes | Social media platforms |
| **rewardPerShare** | number | $0.10 | $100 | ✅ Yes | Amount per successful share |
| **totalBudget** | number | $10 | $1,000,000 | ✅ Yes | Total sharing budget |

### API Validation

#### Request Validation
- **Multipart form-data**: Parsed and validated by backend middleware
- **Field types**: Coerced and validated (strings → numbers, etc.)
- **File uploads**: Size & mime type checked
- **Required fields**: Must be present (missing = 422 error)
- **Enum fields**: Must match allowed values
- **Range fields**: Min/max enforced

#### Error Responses
```javascript
422 Unprocessable Entity
{
  success: false,
  error: 'VALIDATION_ERROR',
  message: 'Campaign validation failed',
  validationErrors: [
    {
      field: 'goalAmount',
      message: 'Must be between $1 and $9,999,999'
    },
    {
      field: 'duration',
      message: 'Must be between 7 and 90 days'
    }
  ]
}

400 Bad Request
{
  success: false,
  message: 'Invalid campaign type'
}

401 Unauthorized
{
  success: false,
  message: 'Unauthorized: User ID is required'
}

404 Not Found
{
  success: false,
  message: 'Campaign not found'
}

409 Conflict
{
  success: false,
  message: 'Campaign is not active'
}
```

---

## Gaps & Issues

### CRITICAL GAPS (Blocking Functionality)

#### 1. Missing Fundraising Campaign Management Pages
- **Issue**: `/creator/campaigns` list page not found or incomplete
- **Impact**: Creator cannot view their campaigns
- **Fix**: Create campaign list page with filters (draft, active, paused, completed, rejected)
- **Status**: ❌ BLOCKING

#### 2. Edit Campaign Endpoint Missing for Fundraising
- **Issue**: No `PUT /api/campaigns/:id` handler for fundraising campaigns
- **Impact**: Creators cannot update campaign details while in draft
- **Fix**: Implement update controller with field immutability checks
- **Status**: ❌ BLOCKING

#### 3. Campaign Validation Schema Incomplete
- **Issue**: Zod schemas for fundraising campaign creation not fully defined
- **Impact**: Missing client-side validation
- **Fix**: Add complete schema covering all fields
- **Status**: ❌ BLOCKING

#### 4. Image Upload URL Not Normalized
- **Issue**: Image URLs from backend may have incorrect paths
- **Impact**: Images not loading on frontend
- **Fix**: Implement normalizeImageUrl() utility
- **Status**: ⚠️ HIGH PRIORITY

#### 5. Payment Method Configuration Unclear
- **Issue**: How payment methods are stored/encrypted/retrieved unclear
- **Impact**: Potential security issue or incorrect data storage
- **Fix**: Document & test encryption flow end-to-end
- **Status**: ⚠️ HIGH PRIORITY

### MAJOR GAPS (Reduces UX)

#### 6. No Campaign Draft Auto-Save
- **Issue**: Wizard doesn't save form state while user is editing
- **Impact**: User loses work if page refreshed mid-creation
- **Fix**: Implement auto-save to localStorage or backend drafts
- **Status**: ⚠️ MEDIUM

#### 7. Share Wizard Not Tracking Earnings
- **Issue**: Paid sharing feature incomplete
- **Impact**: Users don't know how much they can earn from shares
- **Fix**: Integrate with wallet/earnings tracking
- **Status**: ⚠️ MEDIUM

#### 8. No Campaign Status Change Notifications
- **Issue**: Creator not notified when campaign statuses change
- **Impact**: Creator unaware of status issues (e.g., rejected campaigns)
- **Fix**: Add email/push notifications for status transitions
- **Status**: ⚠️ MEDIUM

#### 9. Analytics Not Aggregating Correctly
- **Issue**: Campaign analytics metrics missing or incorrect
- **Impact**: Creator cannot make data-driven decisions
- **Fix**: Verify analytics queries and aggregation logic
- **Status**: ⚠️ MEDIUM

#### 10. No Campaign Preview Before Publishing
- **Issue**: Wizard doesn't preview how campaign looks to donors
- **Impact**: Creator discovers layout issues after publishing
- **Fix**: Add preview step or modal before activation
- **Status**: ⚠️ MEDIUM

### MINOR GAPS (Nice to Have)

#### 11. No Duplicate Campaign Feature
- **Issue**: Creator must recreate similar campaigns from scratch
- **Impact**: Inefficiency for creators with multiple campaigns
- **Fix**: Add "Duplicate Campaign" button for draft campaigns
- **Status**: 💡 ENHANCEMENT

#### 12. No Campaign Scheduling
- **Issue**: Campaigns only activate immediately
- **Impact**: Creator cannot schedule campaign to go live at specific time
- **Fix**: Add scheduled_activation_time field
- **Status**: 💡 ENHANCEMENT

#### 13. No A/B Testing for Campaign Titles/Images
- **Issue**: Creator cannot test multiple variations
- **Impact**: No data-driven optimization
- **Fix**: Implement A/B testing framework
- **Status**: 💡 ENHANCEMENT

#### 14. No Bulk Campaign Actions
- **Issue**: Admin must update campaigns one at a time
- **Impact**: Admin inefficiency
- **Fix**: Add bulk pause/activate/reject actions
- **Status**: 💡 ENHANCEMENT

#### 15. No Campaign Template System
- **Issue**: No pre-built templates for common use cases
- **Impact**: Higher barrier to entry for new creators
- **Fix**: Create template library (medical, education, emergency, etc.)
- **Status**: 💡 ENHANCEMENT

---

## Recommendations

### Immediate Actions (This Week)

1. **Complete Campaign List Page for Creators**
   - Create: `honestneed-frontend/app/(creator)/campaigns/page.tsx`
   - Features: List with status filters, search, pagination
   - Use existing: `useCampaigns()` hook with creator filter

2. **Implement Campaign Edit Endpoint**
   - Backend: `PUT /campaigns/:id` handler
   - Validation: Only draft campaigns can edit
   - Fields immutable: campaign_type, need_type

3. **Fix Image Upload Normalization**
   - Implement: `normalizeImageUrl()` utility
   - Apply: In `campaignService.getCampaign()`
   - Test: Verify images load on all pages

4. **Add Campaign Validation Schemas**
   - Frontend: Zod schemas for all steps
   - Add to: `utils/validationSchemas.ts`
   - Test: Validate form submission

### Short-term (2 Weeks)

5. **Implement Auto-Save for Campaign Wizard**
   - Save form state to localStorage every 5 seconds
   - Restore on page reload
   - Implement in: `CampaignWizard` component

6. **Add Campaign Status Notifications**
   - Email on: Activated, Paused, Completed, Rejected
   - Backend: Integrate with email service
   - Frontend: Toast notifications on status change

7. **Fix Analytics Data Aggregation**
   - Backend: Verify metrics queries
   - Test: Check calculations match expected values
   - Frontend: Implement real-time refresh

8. **Add Campaign Preview Modal**
   - CampaignPreview component (read-only view)
   - Show in step 4 before publishing
   - Show how it appears to donors/supporters

### Mid-term (1 Month)

9. **Implement Paid Sharing Earnings Tracking**
   - Backend: Track pending/verified shares
   - Wallet integration: Add earnings to wallet
   - Frontend: Show earning potential in share wizard

10. **Add Campaign Scheduling**
    - Add field: `scheduled_activation_at?: Date`
    - Backend: Scheduled job to activate campaigns
    - Frontend: DatePicker in activation modal

### Long-term (Ongoing)

11. **Build Campaign Analytics Dashboard**
    - Real-time metrics display
    - Donation/share trends
    - AI-generated recommendations
    - Export functionality

12. **Implement Campaign Templates**
    - Create 5-10 templates for common causes
    - Template marketplace?
    - One-click template duplication

13. **Add Bulk Campaign Actions**
    - Admin multi-select interface
    - Bulk reject/approve/pause/activate
    - Bulk messaging to creators

14. **Advanced A/B Testing**
    - Multiple title/image variants
    - Statistical significance testing
    - Automatic winner promotion

---

## Appendices

### A. Database Indexes

```javascript
// Campaign collection indexes
db.campaigns.createIndex({ creator_id: 1, created_at: -1 })
db.campaigns.createIndex({ status: 1, published_at: -1 })
db.campaigns.createIndex({ campaign_type: 1 })
db.campaigns.createIndex({ need_type: 1, status: 1 })
db.campaigns.createIndex({ is_deleted: 1 })
db.campaigns.createIndex({ campaign_id: 1 })

// Query optimization
// - List by creator: Fast (creator_id index)
// - List by status: Fast (status index)
// - Trending: Fast (engagement_score index if added)
```

### B. Environment Variables

```bash
# Backend
ENCRYPTION_KEY=<32-byte hex string for AES-256>
DATABASE_URL=mongodb://...
JWT_SECRET=<secret key>
STRIPE_SECRET_KEY=<stripe secret>

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001

# Email Service (for notifications)
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
```

### C. Performance Metrics

| Query | Expected Time | Optimization |
|-------|---------------|--------------|
| List 100 campaigns | < 100ms | Pagination + index |
| Get campaign detail | < 50ms | Object ID + index |
| Get analytics | < 200ms | Aggregation pipeline |
| Create campaign | < 500ms | Multipart parsing + encryption |
| Activate campaign | < 100ms | Direct update + date calc |

---

## Conclusion

The HonestNeed fundraising campaign system is a **comprehensive, production-ready platform** with strong:
- ✅ Frontend component architecture
- ✅ Backend API structure
- ✅ Database schema design
- ✅ Validation & security measures

However, critical gaps exist in:
- ❌ Creator campaign management pages
- ❌ Campaign editing functionality
- ❌ End-to-end integration testing
- ❌ Real-time analytics

**Priority**: Complete missing pages and endpoints (Sections 1-3 in Recommendations) before considering the system production-ready.

**Document Version**: 1.0  
**Last Updated**: April 11, 2026  
**Author**: System Analysis

---

End of Document
