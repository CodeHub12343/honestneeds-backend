# HonestNeed Platform - Comprehensive End-to-End Documentation
**Last Updated:** April 7, 2026  
**Version:** 1.0  
**Status:** Production Ready

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Core Data Models](#core-data-models)
5. [Backend Architecture](#backend-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [End-to-End User Flows](#end-to-end-user-flows)
8. [API Reference](#api-reference)
9. [Authentication & Security](#authentication--security)
10. [Database Schema & Relationships](#database-schema--relationships)
11. [Infrastructure & Deployment](#infrastructure--deployment)

---

## Executive Summary

### What is HonestNeed?

HonestNeed is a community-powered fundraising platform designed to empower creators and enable supporters to make transparent, meaningful impact. The platform features:

- **Campaign Management**: Users create campaigns to raise funds for community needs
- **Multi-Method Fundraising**: Support for donations, sharing/referrals, and volunteering
- **Transparent Tracking**: Real-time analytics, QR codes, and donor engagement metrics
- **Gamification**: Sweepstakes drawings, referral rewards, and donation milestones
- **Creator Tools**: Dashboard, analytics, campaign editing, payment tracking
- **Admin Oversight**: Platform management, user moderation, fraud detection

### Key Statistics
- **Campaigns Launched**: 2,400+
- **Active Community**: 145K+
- **Funds Raised**: $12.5M+
- **Payment Methods**: 10+ (PayPal, Stripe, Venmo, Cash App, Bank Transfer, Crypto, Check, etc.)

---

## System Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                           │
│                     (Next.js 14, React, TypeScript)              │
│  ┌──────────────────┐ ┌──────────────────┐ ┌────────────────┐   │
│  │  Campaign Browse │ │  Creator Hub     │ │  User Profile  │   │
│  │  & Discovery     │ │  & Dashboard     │ │  & Settings    │   │
│  └──────────────────┘ └──────────────────┘ └────────────────┘   │
│  ┌──────────────────┐ ┌──────────────────┐ ┌────────────────┐   │
│  │  Donation Flow   │ │  Sharing & QR    │ │  Sweepstakes   │   │
│  │  & Payment       │ │  Tracking        │ │  & Analytics   │   │
│  └──────────────────┘ └──────────────────┘ └────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    API CLIENT LAYER                              │
│   Axios HTTP Client + React Query (Data Fetching & Caching)     │
├─────────────────────────────────────────────────────────────────┤
│                    BACKEND API LAYER                             │
│                 (Express.js, Node.js, TypeScript)                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  REST API Endpoints                      │    │
│  │  /campaigns, /donations, /auth, /analytics, /admin      │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                    SERVICES LAYER                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │  Campaign    │ │  Donation    │ │  Analytics & QR      │    │
│  │  Service     │ │  Service     │ │  Code Service        │    │
│  └──────────────┘ └──────────────┘ └──────────────────────┘    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │  Share/      │ │  Sweepstakes │ │  Payment Processing  │    │
│  │  Referral    │ │  Service     │ │  Service (Stripe)    │    │
│  │  Service     │ │              │ │                      │    │
│  └──────────────┘ └──────────────┘ └──────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                  PERSISTENCE LAYER                               │
│           MongoDB (Mongoose ODM) + Redis (Optional)              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Users | Campaigns | Transactions | Donations | Shares   │    │
│  │ Sweepstakes | QRCodes | Analytics | Audit Logs         │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                   EXTERNAL SERVICES                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │  Stripe      │ │  Email       │ │  Cloud Storage       │    │
│  │  Payment API │ │  Service     │ │  (Images/Files)      │    │
│  └──────────────┘ └──────────────┘ └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Language**: JavaScript (vanilla) + TypeScript support
- **Database**: MongoDB (Atlas or Local)
- **ODM**: Mongoose 7.x
- **Authentication**: JWT (Bearer tokens)
- **Validation**: Zod + Custom validators
- **Logging**: Winston
- **Testing**: Jest
- **DevOps**: Docker, Docker Compose
- **Payment Processing**: Stripe API
- **Email**: NodeMailer (Mock in dev, real in prod)

### Frontend Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI Library**: React 18
- **State Management**: Zustand (Filter Store) + React Context
- **Data Fetching**: React Query v5 + Axios
- **Styling**: Styled Components
- **Component Library**: Custom UI Components
- **Icons**: Lucide React
- **Image Optimization**: Next.js Image Component
- **Build Tool**: Webpack (via Next.js)
- **Package Manager**: npm

### Deployment
- **Frontend Hosting**: Vercel (or AWS S3 + CloudFront)
- **Backend Hosting**: AWS EC2 / Heroku / Self-hosted
- **Database**: MongoDB Atlas
- **CDN**: Cloudflare / AWS CloudFront
- **Container Orchestration**: Docker Compose (local), Kubernetes (prod ready)

---

## Core Data Models

### 1. User Model
```javascript
{
  _id: ObjectId,
  user_id: String, // Unique identifier (format: USER-YYYY-NNN-XXXXXX)
  auth_provider: String, // 'email', 'google', 'github', etc.
  email: String, // Unique, lowercase
  password_hash: String, // Bcrypt hashed only for email auth
  first_name: String,
  last_name: String,
  display_name: String,
  bio: String,
  profile_image_url: String,
  phone_number: String,
  
  // Address & Location
  address: {
    street: String,
    city: String,
    state: String,
    zip_code: String,
    country: String,
    latitude: Number,
    longitude: Number,
  },
  
  // Account Status
  account_status: String, // 'active', 'suspended', 'deactivated'
  verification_status: String, // 'unverified', 'email_verified', 'phone_verified', 'fully_verified'
  is_email_verified: Boolean,
  email_verified_at: Date,
  
  // Role & Permissions
  role: String, // 'user', 'creator', 'admin', 'moderator'
  permissions: [String],
  
  // Financial Info
  bank_account: {
    account_holder: String,
    account_number: String, // Encrypted
    routing_number: String, // Encrypted
    account_type: String,
    is_verified: Boolean,
  },
  
  // Preferences
  notification_preferences: {
    email_notifications: Boolean,
    sms_notifications: Boolean,
    marketing_emails: Boolean,
    campaign_updates: Boolean,
  },
  
  // Metadata
  created_at: Date,
  updated_at: Date,
  last_login: Date,
  is_deleted: Boolean,
}
```

### 2. Campaign Model
```javascript
{
  _id: ObjectId,
  campaign_id: String, // Unique identifier (format: CAMP-YYYY-NNN-XXXXXX)
  creator_id: ObjectId, // Reference to User
  creator_name: String,
  
  // Basic Info
  title: String, // 5-100 chars
  description: String, // 10-2000 chars
  status: String, // 'draft', 'active', 'paused', 'completed', 'rejected'
  
  // Campaign Type
  campaign_type: String, // 'fundraising', 'sharing'
  need_type: String, // 'education', 'health', 'emergency', etc.
  category: String,
  tags: [String], // Max 10 tags
  
  // Goals & Targets
  goals: [
    {
      type: String,
      target_amount: Number, // In cents
      current_amount: Number, // In cents
      deadline: Date,
      description: String,
    }
  ],
  
  // Fundraising-Specific
  goal_amount: Number, // In cents (primary goal)
  raised_amount: Number, // In cents
  target_donors: Number,
  
  // Sharing Campaign-Specific
  reward_per_share: Number, // In cents
  budget: Number, // In cents
  max_shares: Number,
  platforms: [String], // ['twitter', 'facebook', 'instagram', etc.]
  
  // Campaign Duration
  start_date: Date,
  end_date: Date,
  duration_days: Number,
  
  // Media
  image: {
    url: String,
    alt: String,
    uploaded_at: Date,
  },
  
  // Payment Methods
  payment_methods: [
    {
      type: String, // 'paypal', 'venmo', 'cashapp', 'stripe', etc.
      enabled: Boolean,
      account_details: String, // Encrypted
    }
  ],
  
  // Geographic & Targeting
  geographic_scope: String, // 'local', 'regional', 'national', 'global'
  target_states: [String],
  target_countries: [String],
  target_audience: {
    age_range: String,
    interests: [String],
    demographics: Object,
  },
  
  // Analytics
  total_donations: Number,
  total_donation_amount: Number, // In cents
  total_donors: Number,
  total_shares: Number,
  total_volunteers: Number,
  engagement_score: Number,
  
  // Engagement Metrics
  views: Number,
  shares: Number,
  comments: Number,
  
  // Trending & Featured
  is_trending: Boolean,
  is_featured: Boolean,
  trending_score: Number,
  
  // Metadata
  created_at: Date,
  updated_at: Date,
  is_deleted: Boolean,
  deletion_reason: String,
}
```

### 3. Donation Model
```javascript
{
  _id: ObjectId,
  transaction_id: String, // Unique identifier
  campaign_id: ObjectId, // Reference to Campaign
  donor_id: ObjectId, // Reference to User (optional, can be anonymous)
  
  // Donation Details
  amount_cents: Number, // Amount in cents (e.g., 2550 for $25.50)
  amount_dollars: Number, // Amount in dollars
  currency: String, // 'USD', 'EUR', etc.
  payment_method: String, // 'paypal', 'venmo', 'cashapp', 'stripe', 'crypto', 'check', 'other'
  
  // Status & Verification
  status: String, // 'pending', 'verified', 'failed', 'refunded'
  verified_at: Date,
  verification_notes: String,
  
  // Fee Breakdown
  gross_amount: Number, // Amount before fees
  fee_amount: Number, // Platform fee
  net_amount: Number, // Amount after fees
  fee_percentage: Number, // Fee as percentage
  
  // Proof & Documentation
  proof_url: String, // Screenshot or receipt URL
  proof_type: String, // 'screenshot', 'receipt', 'bank_transfer', etc.
  
  // Donor Info
  donor_name: String, // Display name or anonymous
  donor_email: String,
  is_anonymous: Boolean,
  public_message: String, // Message to campaign creator
  
  // Sweepstakes Integration
  sweepstakes_entries: Number, // Number of raffle entries generated
  
  // Metadata
  created_at: Date,
  updated_at: Date,
  refunded_at: Date,
  refund_reason: String,
}
```

### 4. Transaction Model
```javascript
{
  _id: ObjectId,
  transaction_id: String, // Unique identifier
  user_id: ObjectId, // Reference to User
  campaign_id: ObjectId, // Reference to Campaign (optional)
  
  // Transaction Type
  type: String, // 'donation', 'withdrawal', 'refund', 'fee', 'reward', 'payout'
  sub_type: String, // More specific type
  
  // Amount Details
  amount_cents: Number,
  currency: String,
  
  // Status
  status: String, // 'pending', 'completed', 'failed', 'reversed'
  status_reason: String,
  
  // Payment Method
  payment_method: String,
  
  // Related Entity IDs
  related_transaction_id: ObjectId, // For refunds, reversals, etc.
  source_transaction_id: ObjectId,
  
  // Metadata
  description: String,
  metadata: Object,
  created_at: Date,
  completed_at: Date,
}
```

### 5. Share/Referral Model
```javascript
{
  _id: ObjectId,
  campaign_id: ObjectId,
  sharer_id: ObjectId,
  
  // Share Details
  share_id: String, // Unique share identifier
  platform: String, // 'twitter', 'facebook', 'tiktok', 'instagram', 'email', 'link', etc.
  share_url: String, // URL that was shared
  
  // Tracking
  qr_code: String, // QR code identifier if applicable
  clicks: Number, // Number of clicks on shared link
  conversions: Number, // Number of donations from shares
  
  // Rewards
  earnings_cents: Number, // Reward earned from this share
  status: String, // 'pending', 'approved', 'paid', 'rejected'
  
  // Metadata
  created_at: Date,
  expires_at: Date,
  validated_at: Date,
}
```

### 6. QR Code Model
```javascript
{
  _id: ObjectId,
  qr_id: String,
  campaign_id: ObjectId,
  
  // QR Code Data
  code_data: String, // Encoded URL with tracking params
  code_image_url: String,
  
  // Tracking
  scans: Number,
  clicks: Number,
  conversions: Number,
  
  // Analytics
  last_scanned_at: Date,
  scanned_devices: [String], // Device types: 'mobile', 'desktop', etc.
  scanned_locations: [Object], // Geolocation data
  
  // Metadata
  created_at: Date,
  is_active: Boolean,
}
```

### 7. Sweepstakes Model
```javascript
{
  _id: ObjectId,
  sweepstakes_id: String,
  campaign_id: ObjectId,
  
  // Sweepstakes Config
  total_entries: Number,
  drawing_date: Date,
  number_of_winners: Number,
  
  // Entries
  entries: [
    {
      entry_id: String,
      donor_id: ObjectId,
      donation_id: ObjectId,
      num_entries: Number,
      created_at: Date,
    }
  ],
  
  // Drawing Results
  drawing_status: String, // 'scheduled', 'completed', 'cancelled'
  winners: [
    {
      entry_id: String,
      donor_id: ObjectId,
      prize_id: String,
      prize_amount: Number,
      claimed: Boolean,
      claimed_at: Date,
    }
  ],
  drawing_date: Date,
  drawing_completed_at: Date,
  
  // Metadata
  created_at: Date,
}
```

---

## Backend Architecture

### Directory Structure
```
src/
├── app.js                          # Main application entry point
├── config/
│   ├── database.js                 # MongoDB connection config
│   ├── environment.js              # Environment validation
│   └── index.js
├── controllers/                    # Request handlers
│   ├── authController.js
│   ├── campaignController.js
│   ├── donationController.js
│   ├── analyticsController.js
│   └── ... [12+ controllers]
├── models/                         # MongoDB schemas
│   ├── User.js
│   ├── Campaign.js
│   ├── Transaction.js
│   ├── Donation.js
│   └── ... [20+ models]
├── services/                       # Business logic
│   ├── CampaignService.js
│   ├── DonationService.js
│   ├── PaymentProcessingService.js
│   ├── analyticsService.js
│   └── ... [20+ services]
├── routes/                         # API endpoint definitions
│   ├── campaignRoutes.js
│   ├── donationRoutes.js
│   ├── authRoutes.js
│   ├── analyticsRoutes.js
│   └── ... [15+ route files]
├── middleware/
│   ├── authMiddleware.js           # JWT verification
│   ├── errorHandler.js             # Global error handling
│   ├── uploadMiddleware.js         # File upload handling
│   ├── requestLogger.js            # Request/response logging
│   └── rateLimit.js
├── validators/                     # Input validation
│   ├── campaignValidators.js
│   ├── donationValidators.js
│   └── ... [validation schemas]
├── utils/
│   ├── winstonLogger.js            # Logging configuration
│   ├── errorTracker.js             # Error tracking
│   ├── encryptionUtils.js
│   └── ... [utility functions]
├── events/                         # Event emitters
├── jobs/                           # Scheduled jobs
└── tests/                          # Test suites
```

### Backend Request Flow

#### Example: Creating a Campaign

```
1. CLIENT REQUEST
   POST /api/campaigns
   Headers: Authorization: Bearer <JWT_TOKEN>
   Body: FormData {
     title: "Help Build School",
     description: "...",
     need_type: "education",
     image: <File>,
     tags: "education,school,community",
     goals: JSON.stringify([...]),
   }

2. EXPRESS MIDDLEWARE CHAIN
   → CORS middleware (verify origin)
   → Rate limiter (check rate limit)
   → Body parser (parse multipart)
   → uploadMiddleware (process file upload to cloud storage)
   → authMiddleware (verify JWT token, extract user ID)
   → Request logger (log incoming request)

3. ROUTE MATCHING
   → Match POST /campaigns route
   → Invoke campaignController.create()

4. CONTROLLER LAYER
   campaignController.create():
   ├── Extract and normalize request data
   ├── Call validators (campaignValidators.validateCampaignCreation)
   ├── If validation fails → Return 422 with errors
   ├── Extract user_id from JWT
   ├── Prepare formData object:
   │  ├── Convert Base64 image to S3 URL
   │  ├── Parse goals JSON string
   │  ├── Parse payment_methods JSON string
   │  ├── Parse tags CSV to array
   │  └── Set default values (status='draft', created_at=now)
   └── Call CampaignService.createCampaign(formData)

5. SERVICE LAYER
   CampaignService.createCampaign():
   ├── Generate unique campaign_id (CAMP-YYYY-NNN-XXXXXX)
   ├── Encrypt sensitive payment method data
   ├── Validate against database constraints
   ├── Save to MongoDB:
   │  └── db.campaigns.insertOne(campaignObject)
   ├── Emit 'campaign:created' event
   │  └── Event listeners: analytics, notifications, indexing
   ├── Return created campaign object
   └── Catch any database errors

6. REPOSITORY PATTERN (Optional)
   CampaignRepository.save(campaign):
   └── Mongoose Campaign.create(campaignData)
       └── Validates schema
       └── Saves to MongoDB
       └── Returns _id

7. ERROR HANDLING
   If error:
   ├── Log error with Winston
   ├── Track with errorTracker
   ├── Pass to errorHandler middleware
   └── Return 400/422/500 response

8. RESPONSE TO CLIENT
   {
     success: true,
     message: "Campaign created successfully",
     data: {
       _id: "...",
       campaign_id: "CAMP-2026-123-ABC123",
       title: "Help Build School",
       status: "draft",
       created_at: "2026-04-07T12:00:00Z",
       ...
     }
   }

9. LOGGING & MONITORING
   → Winston log: "Campaign created: CAMP-2026-123-ABC123"
   → Metrics: Increment campaign_created counter
   → Audit log: Record user action
```

### Key Backend Services

#### 1. CampaignService
**Responsibilities:**
- Campaign CRUD operations
- Campaign status transitions (draft → active → paused → completed)
- Campaign filtering and search
- Campaign analytics aggregation

**Key Methods:**
```javascript
CampaignService.createCampaign(formData)
CampaignService.listCampaigns(filters, pagination)
CampaignService.getCampaignDetail(campaignId)
CampaignService.updateCampaign(campaignId, updates)
CampaignService.activateCampaign(campaignId)
CampaignService.pauseCampaign(campaignId)
CampaignService.completeCampaign(campaignId)
```

#### 2. DonationService
**Responsibilities:**
- Donation creation and tracking
- Fee calculation and breakdown
- Donation verification
- Sweepstakes entry assignment

**Key Methods:**
```javascript
DonationService.createDonation(campaignId, donationData)
DonationService.calculateFees(amount)
DonationService.verifyDonation(transactionId)
DonationService.refundDonation(transactionId, reason)
DonationService.generateSweepstakesEntries(donationAmount)
```

#### 3. ShareService
**Responsibilities:**
- Share/referral tracking
- QR code generation and tracking
- Reward calculation
- Share validation

**Key Methods:**
```javascript
ShareService.createShare(campaignId, shareData)
ShareService.trackShare(shareId, platform)
ShareService.recordClick(qrCodeId)
ShareService.recordConversion(shareId, donationAmount)
ShareService.calculateRewards(shareData)
```

#### 4. PaymentProcessingService
**Responsibilities:**
- Payment method processing
- Stripe integration
- Alternative payment method handling
- Transaction settlement

**Key Methods:**
```javascript
PaymentProcessingService.processPayment(paymentData)
PaymentProcessingService.createStripePaymentIntent(amount)
PaymentProcessingService.handleWebhook(event)
PaymentProcessingService.refundPayment(transactionId)
```

#### 5. AnalyticsService
**Responsibilities:**
- Campaign statistics collection
- Engagement metrics calculation
- Trending algorithm
- Data aggregation

**Key Methods:**
```javascript
AnalyticsService.getCampaignAnalytics(campaignId)
AnalyticsService.calculateEngagementScore(campaignId)
AnalyticsService.getTrendingCampaigns(timeframe)
AnalyticsService.aggregateMetrics(campaignId)
```

---

## Frontend Architecture

### Directory Structure
```
honestneed-frontend/
├── app/                            # Next.js App Router
│   ├── (auth)/                     # Authentication routes
│   │   ├── login/
│   │   ├── signup/
│   │   ├── forgot-password/
│   │   └── password-reset/
│   ├── (campaigns)/                # Campaign routes
│   │   ├── campaigns/              # Browse & discovery
│   │   ├── campaigns/[id]/         # Campaign detail
│   │   ├── campaigns/[id]/donate/  # Donation flow
│   │   └── campaigns/[id]/analytics/
│   ├── (creator)/                  # Creator dashboard
│   │   ├── dashboard/              # Creator home
│   │   ├── campaigns/              # My campaigns
│   │   ├── campaigns/create/       # Create wizard
│   │   ├── campaigns/[id]/         # Campaign detail
│   │   ├── campaigns/[id]/edit/    # Edit campaign
│   │   └── analytics/              # Campaign analytics
│   ├── (supporter)/                # Supporter dashboard
│   │   ├── dashboard/
│   │   ├── my-donations/
│   │   ├── my-shares/
│   │   └── sweep stakes-entries/
│   ├── admin/                      # Admin panel
│   ├── page.tsx                    # Home page
│   ├── layout.tsx                  # Root layout
│   ├── error.tsx                   # Error boundary
│   ├── loading.tsx                 # Loading state
│   └── globals.css
├── components/                     # React components
│   ├── campaign/
│   │   ├── CampaignCard.tsx        # Campaign list item
│   │   ├── CampaignGrid.tsx        # Campaign grid
│   │   ├── CampaignDetail.tsx      # Campaign detail view
│   │   ├── CampaignWizard.tsx      # Create/edit wizard
│   │   └── ... [campaign components]
│   ├── donation/
│   │   ├── DonationWizard.tsx
│   │   ├── PaymentMethodSelector.tsx
│   │   ├── DonationStep1.tsx
│   │   ├── DonationStep2.tsx
│   │   └── DonationConfirmation.tsx
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── SignupForm.tsx
│   │   └── ProtectedRoute.tsx
│   ├── ui/                         # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Card.tsx
│   │   └── ... [ui components]
│   └── layout/                     # Layout components
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
├── api/                            # API integration
│   ├── services/
│   │   ├── campaignService.ts      # Campaign API calls
│   │   ├── donationService.ts
│   │   ├── authService.ts
│   │   ├── analyticsService.ts
│   │   └── ... [services]
│   ├── hooks/                      # React Query hooks
│   │   ├── useCampaigns.ts
│   │   ├── useDonation.ts
│   │   ├── useAuth.ts
│   │   └── ... [hooks]
│   └── index.ts                    # Combined exports
├── lib/
│   ├── api.ts                      # Axios configuration
│   ├── httpClient.ts               # HTTP client setup
│   └── utils.ts
├── store/                          # State management (Zustand)
│   ├── authStore.ts                # Auth state
│   ├── filterStore.ts              # Campaign filters
│   ├── uiStore.ts                  # UI state
│   └── ... [stores]
├── hooks/                          # Custom React hooks
│   ├── useAuth.ts
│   ├── useLocalStorage.ts
│   ├── usePagination.ts
│   └── ... [hooks]
├── utils/                          # Utility functions
│   ├── validationUtils.ts
│   ├── currencyUtils.ts
│   ├── dateUtils.ts
│   └── ... [utils]
├── styles/                         # Global styles
│   ├── globals.css
│   ├── variables.css
│   └── ... [stylesheets]
├── public/                         # Static assets
│   ├── images/
│   ├── icons/
│   └── fonts/
└── package.json
```

### Frontend Data Flow

#### React Query + Zustand Pattern

```
┌─────────────────────────┐
│   React Component       │
│   (Page or Component)   │
└────────────┬────────────┘
             │
             ├──► useAuth() [Zustand Store]
             │    └─► authStore: { user, token, isAuthenticated }
             │
             ├──► useFilterStore() [Zustand Store]
             │    └─► filterStore: { status, page, limit, ... }
             │
             ├──► useCampaigns() [React Query Hook]
             │    ├─► queryKey: ['campaigns', page, limit, filters]
             │    ├─► queryFn: campaignService.getCampaigns()
             │    ├─► Cache: 10 minutes (staleTime)
             │    └─► Returns: { data, isLoading, error }
             │
             └──► useMutation() [React Query]
                  ├─► mutationFn: campaignService.createCampaign()
                  ├─► onSuccess: Invalidate cache, navigate
                  └─► Returns: { mutate, isPending, error }

EXAMPLE: Campaign Listing Page
┌────────────────────────────────────────────┐
│ /campaigns/page.tsx (CampaignBrowsePage)  │
├────────────────────────────────────────────┤
│ 1. Mount Component                         │
│    └─► Check auth: useAuth() → get token  │
│                                             │
│ 2. Initialize filters: useFilterStore()    │
│    └─► { status: 'active', page: 1 }      │
│                                             │
│ 3. Fetch campaigns: useCampaigns()         │
│    ├─► Parameters: page, limit, filters    │
│    ├─► apiClient.get('/campaigns', {...}) │
│    ├─► Axios interceptor adds auth header │
│    ├─► Response: { data: [...], pagination }
│    └─► Component re-renders with data     │
│                                             │
│ 4. User interactions                       │
│    ├─► Filter change → updateFilters()    │
│    │   └─► useCampaigns() refetches       │
│    ├─► Pagination → setPage() →           │
│    │   └─► useCampaigns() refetches       │
│    └─► Search → setSearchQuery() →        │
│        └─► useCampaigns() refetches       │
│                                             │
│ 5. Render UI                               │
│    ├─► Loading: <SkeletonLoader />        │
│    ├─► Data: <CampaignGrid campaigns={} />│
│    ├─► Error: <ErrorBoundary />           │
│    └─► Empty: <EmptyState />              │
└────────────────────────────────────────────┘
```

### Frontend API Integration Layer

```typescript
// lib/api.ts - Axios Configuration

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 30000,
});

// Request Interceptor: Add auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor: Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      authStore.logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// api/services/campaignService.ts

class CampaignService {
  // GET /campaigns - List campaigns with filters
  async getCampaigns(page, limit, filters) {
    const response = await apiClient.get('/campaigns', {
      params: {
        page,
        limit,
        status: filters?.status,
        search: filters?.searchQuery,
        // ...
      },
    });
    // Extract from wrapper: { success, message, data, pagination }
    return {
      campaigns: response.data.data,
      total: response.data.pagination.totalCount,
      page: response.data.pagination.page,
    };
  }

  // POST /campaigns - Create campaign
  async createCampaign(formData) {
    const response = await apiClient.post('/campaigns', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  }

  // GET /campaigns/:id - Get campaign detail
  async getCampaign(id) {
    const response = await apiClient.get(`/campaigns/${id}`);
    return response.data.data;
  }

  // PUT /campaigns/:id - Update campaign
  async updateCampaign(id, updates) {
    const response = await apiClient.put(`/campaigns/${id}`, updates);
    return response.data.data;
  }
}
```

---

## End-to-End User Flows

### Flow 1: Campaign Creation & Publishing

```
CREATOR PERSPECTIVE:

1. Creator navigates to /dashboard/campaigns/create
   └─► CampaignWizard component loads

2. Step 1: Select Campaign Type
   ├─► Choose: "Fundraising" or "Sharing"
   ├─► Store selection in wizard state
   └─► Next

3. Step 2: Basic Information
   ├─► Form fields:
   │   ├─► Title (5-100 chars)
   │   ├─► Description (10-2000 chars)
   │   ├─► Upload image (JPEG/PNG/GIF, max 10MB)
   │   ├─► Select need type (education, health, etc.)
   │   └─► Add tags (max 10)
   ├─► Validation: Zod schema validates all fields
   ├─► Image upload: FormData sent to AWS S3 via uploadMiddleware
   └─► Next

4. Step 3: Type-Specific Details
   
   IF Fundraising:
   ├─► Goal amount ($1-$9,999,999)
   ├─► Target donors
   ├─► Duration (7-90 days)
   ├─► Category
   ├─► Payment methods (PayPal, Venmo, etc.)
   └─► Geographic scope (local/regional/national/global)
   
   IF Sharing:
   ├─► Platforms to share on (Twitter, Facebook, etc.)
   ├─► Reward per share ($0.10-$100)
   ├─► Budget ($10-$1M)
   ├─► Max shares
   └─► Target audience

5. Step 4: Review & Submit
   ├─► Display all entered data
   ├─► Final validation
   ├─► Creator clicks "Publish"
   
6. Campaign Created (Backend):
   ├─► POST /campaigns with FormData
   ├─► Backend saves to MongoDB (status: 'draft')
   ├─► Returns campaign_id: "CAMP-2026-123-ABC123"
   ├─► Emit 'campaign:created' event
   └─► Async: Generate QR codes, index for search

7. Redirect to Campaign Detail
   └─► Navigate to /dashboard/campaigns/CAMP-2026-123-ABC123

8. Creator Activates Campaign
   ├─► Click "🚀 Activate Campaign" button
   ├─► POST /campaigns/{id}/activate
   ├─► Backend updates status: 'draft' → 'active'
   ├─► Campaign now visible on /campaigns (public browse)
   ├─► Show success toast: "Campaign published!"
   └─► Update analytics page

RESULT:
✅ Campaign is now visible to supporters on public /campaigns page
✅ Campaign accepts donations & shares
✅ Creator can view real-time analytics
```

### Flow 2: Browse & Donate

```
SUPPORTER PERSPECTIVE:

1. Supporter lands on /campaigns
   ├─► Page mounts
   ├─► Default filters: status='active' (only show published)
   ├─► Fetch campaigns: GET /campaigns?status=active&page=1
   ├─► Backend query: db.campaigns.find({ status: 'active', is_deleted: false })
   ├─► Returns paginated results with metadata
   └─► CampaignGrid displays 12 campaigns per page

2. Browse Campaigns
   ├─► View campaign cards with:
   │   ├─► Campaign image
   │   ├─► Title & creator name
   │   ├─► Progress bar ($X raised of $Y goal)
   │   ├─► Metrics: donations, shares, supporters
   │   ├─► Status badge (geographic scope)
   │   └─► Action buttons: Donate, Share
   ├─► Filter/Search:
   │   ├─► Search: "education" → GET /campaigns?search=education
   │   ├─► Need type: Select → updates filter store
   │   ├─► Location: Enter ZIP → calculates radius
   │   ├─► Goal range: $100-$50,000 → filters by goal_amount
   │   └─► Sort: Trending, Newest, Most Raised
   └─► Pagination: Next/Previous or page numbers

3. Select Campaign to Donate
   ├─► Click campaign card or "Donate" button
   ├─► Navigate to /campaigns/{campaignId}/donate
   └─► DonationWizard loads

4. Donation Flow - Step 1: Amount
   ├─► Supporter enters donation amount
   ├─► Client-side validation: min $1, max $999,999
   ├─► Show fee breakdown: Platform fee (3-5%), net to creator
   ├─► Show sweepstakes entries: "$25 = 1 entry in $5,000 drawing"
   └─► Next

5. Donation Flow - Step 2: Payment Method
   ├─► Select payment method:
   │   ├─► Stripe (credit/debit card) - Most common
   │   ├─► PayPal
   │   ├─► Venmo
   │   ├─► Cash App
   │   ├─► Bank transfer
   │   ├─► Cryptocurrency
   │   ├─► Check
   │   └─► Other
   ├─► For Stripe:
   │   ├─► Component embeds Stripe Elements
   │   ├─► User enters card details
   │   └─► Create payment intent on backend
   ├─► For PayPal:
   │   ├─► User handles auth in popup
   │   └─► Return token to frontend
   └─► Next

6. Donation Flow - Step 3: Confirmation
   ├─► Display summary:
   │   ├─► Campaign title & creator
   │   ├─► Amount: $25.00
   │   ├─► Platform fee: -$1.25
   │   ├─► Creator receives: $23.75
   │   ├─► Payment method: Stripe
   │   ├─► Sweepstakes entries: 1
   │   └─► Can add message: "Great cause!"
   ├─► Supporter confirms
   └─► Submit donation

7. Backend Processing:
   ├─► POST /campaigns/{campaignId}/donations
   ├─► Validation: Campaign exists, is active, amount within limits
   ├─► Create Transaction record (status: 'pending')
   ├─► Process payment (Stripe API):
   │   ├─► GET /stripe/payment-intent with amount
   │   ├─► Stripe charges card
   │   └─► Returns status: 'succeeded' or 'failed'
   ├─► If payment failed:
   │   ├─► Update Transaction: status='failed'
   │   ├─► Return error to frontend
   │   └─► Show error message to supporter
   ├─► If payment succeeded:
   │   ├─► Create Donation record
   │   ├─► Update Campaign: total_donations++, raised_amount += $25
   │   ├─► Assign sweepstakes entries
   │   ├─► Create fee transaction for platform
   │   ├─► Send confirmation email to supporter
   │   └─► Emit 'donation:succeeded' event
   └─► Return success with transaction ID

8. Frontend Shows Confirmation
   ├─► DonationSuccessModal displays:
   │   ├─► "Donation received! ✅"
   │   ├─► Transaction ID for records
   │   ├─► Sweepstakes info: "You're entered to win $5,000!"
   │   └─► Share this campaign button
   ├─► Supporter can:
   │   ├─► View campaign (still live)
   │   ├─► Share campaign (earn referral rewards)
   │   ├─► Make another donation
   │   └─► Return to browse
   └─► Campaign analytics update in real-time

RESULT:
✅ Donation recorded in database
✅ Payment processed via Stripe
✅ Creator notified of new donation
✅ Supporter receives confirmation email
✅ Supporter entered into sweepstakes drawing
✅ Campaign progress bar updated
```

### Flow 3: Share & Earn Rewards

```
SHARER PERSPECTIVE:

1. Supporter sees campaign on /campaigns
   ├─► Clicks "Share" button
   └─► ShareModal or share dialog opens

2. Select Share Platform
   ├─► Options:
   │   ├─► Twitter / X
   │   ├─► Facebook
   │   ├─► TikTok
   │   ├─► Instagram (link copy)
   │   ├─► Email
   │   ├─► WhatsApp
   │   ├─► SMS
   │   └─► Copy link
   └─► User selects platform

3. Generate Referral Link
   ├─► Frontend calls: POST /campaigns/{campaignId}/shares/generate-link
   ├─► Backend:
   │   ├─► Generate share_id (e.g., "SHR-ABC123XYZ")
   │   ├─► Create ReferralLink document
   │   ├─► Generate tracking URL: yourdomain.com/ref/SHR-ABC123XYZ
   │   ├─► Create QR code
   │   └─► Return shareable link & QR code image
   └─► Frontend displays link ready to share

4. Sharer Posts on Social Media
   ├─► Platform-specific sharing:
   │   ├─► Twitter: Opens compose with pre-filled text + link
   │   ├─► Facebook: Opens share dialog with image & description
   │   ├─► Email: Opens email client with subject & link
   │   └─► Direct copy: User copies and pastes link manually
   └─► Share timestamp recorded: created_at

5. Supporter Clicks Shared Link
   
   A. Click from URL:
   └─► User clicks yourdomain.com/ref/SHR-ABC123XYZ
       ├─► Frontend intercepts, tracks click
       ├─► Backend: POST /campaigns/{campaignId}/shares/track-click
       │   ├─► Update Share.clicks++
       │   ├─► Record click timestamp
       │   ├─► Geo-tag the click
       │   └─► Store device info (mobile/desktop/tablet)
       └─► Redirect to /campaigns/{campaignId}
   
   B. Scan QR Code:
   └─► Scanner app opens QR
       ├─► Backend: GET /qr/{qrId}/scan
       ├─► Similar to click tracking
       └─► Navigate to campaign

6. Referred User Donates
   ├─► Clicked link takes user to campaign
   ├─► User donates $25 via POST /campaigns/{campaignId}/donations
   ├─► Backend:
   │   ├─► Donation created successfully
   │   ├─► Check for referrer: Query ReferralLink via share_id in URL
   │   ├─► Update conversion: Share.conversions++
   │   ├─► Calculate reward:
   │   │   └─► reward = donation_amount * 0.10 (10% referral rate)
   │   │   └─► $25 * 10% = $2.50 reward
   │   ├─► Credit sharer's account:
   │   │   ├─► Create Transaction (type: 'referral_reward')
   │   │   ├─► amount: $2.50
   │   │   ├─► status: 'pending' → 'approved'
   │   │   └─► Add to creator's pending_withdrawals
   │   └─► Record in ShareTracking model
   └─► Sharer eventually paid out in monthly settlement

7. View Share Statistics (Creator Dashboard)
   ├─► Creator navigates to /dashboard/campaigns/{campaignId}/analytics
   ├─► Share section displays:
   │   ├─► Total shares: 42
   │   ├─► Total clicks: 156
   │   ├─► Total conversions: 8 donations from shares
   │   ├─► Total earned from shares: $18.50 (8 × $2.50)
   │   └─► Top platforms: Twitter (4 conversions), Email (3 conversions)
   ├─► Individual share tracking:
   │   ├─► Share ID, platform, date shared
   │   ├─► Clicks & conversions
   │   ├─► Earned amount & status
   │   └─► QR code image
   └─► Export analytics report (CSV/PDF)

RESULT:
✅ Share logged and tracked
✅ Link/QR code generated with unique identifier
✅ Clicks recorded with geolocation data
✅ Conversions attributed to sharer
✅ Rewards calculated and credited
✅ Referral incentives motivate sharing
```

### Flow 4: Admin Moderation & Campaign Verification

```
ADMIN PERSPECTIVE:

1. Admin logs in at /admin
   ├─► Email: admin@honestneed.com
   ├─► Password: admin password
   ├─► JWT token with role: 'admin'
   ├─► Access admin dashboard
   └─► Can view all admin panels

2. Campaign Moderation Queue
   ├─► Navigate to /admin/campaigns/moderation
   ├─► Display campaigns pending review:
   │   ├─► Newly created campaigns (automatic flag)
   │   ├─► Flagged campaigns (user reports)
   │   ├─► High-donation campaigns ($50K+, automatic review)
   │   └─► Campaigns from new creators
   └─► Admin selects campaign to review

3. Review Campaign Details
   ├─► Display full campaign info:
   │   ├─► Title, description, image
   │   ├─► Creator profile & history
   │   ├─► Donation history & patterns
   │   ├─► Shares & engagement metrics
   │   ├─► User reports (if any)
   │   └─► Previous campaigns by creator
   ├─► Admin checks:
   │   ├─► Legitimate need (not spam)?
   │   ├─► Appropriate content (no hate speech)?
   │   ├─► Valid payment methods?
   │   ├─► Compliance with terms?
   │   └─► Creator credibility?
   └─► Admin decision

4. Admin Decision: Approve Campaign
   ├─► Click "Approve" button
   ├─► POST /admin/campaigns/{campaignId}/approve
   ├─► Backend:
   │   ├─► Update Campaign: verification_status='approved'
   │   ├─► Set is_verified=true
   │   ├─► Log action: audit_log.insert({
   │   │    admin_id, action: 'approve', campaign_id, timestamp })
   │   ├─► Send notification to creator:
   │   │    "Your campaign 'Help Build School' has been approved!"
   │   └─► Campaign now live on platform
   └─► Status: ✅ Live

5. Admin Decision: Reject Campaign
   ├─► Click "Reject/Flag" button
   ├─► Modal opens for rejection reason:
   │   ├─► "Spam/frivolous"
   │   ├─► "Inappropriate content"
   │   ├─► "Suspicious activity"
   │   ├─► "Missing documentation"
   │   ├─► "Other" (free text)
   │   └─► Optional detailed message
   ├─► Submit rejection:
   │   ├─► PATCH /admin/campaigns/{campaignId}/reject
   │   ├─► Backend:
   │   │   ├─► Update Campaign: status='rejected'
   │   │   ├─► Set rejection_reason
   │   │   ├─► Log action in audit_log
   │   │   ├─► Notify creator:
   │   │   │    "Campaign rejected. Reason: ..."
   │   │   │    "Contact support for more info"
   │   │   └─► Campaign hidden from public
   │   └─► Creator can appeal or create new campaign
   └─► Status: ❌ Rejected

6. Admin Panel Statistics
   ├─► Dashboard displays:
   │   ├─► Total campaigns: 2,400
   │   │   ├─► Active: 1,850
   │   │   ├─► Draft: 280
   │   │   ├─► Pending review: 42
   │   │   ├─► Rejected: 128
   │   │   └─► Completed: 500+
   │   │
   │   ├─► Financial metrics:
   │   │   ├─► Total funds raised: $12.5M
   │   │   ├─► Platform fees collected: $625K (5%)
   │   │   ├─► Creator payouts: $11.875M
   │   │   └─► Outstanding balances: $42K
   │   │
   │   ├─► User statistics:
   │   │   ├─► Total users: 145K
   │   │   ├─► Creators: 24K
   │   │   ├─► Supporters: 121K
   │   │   └─► Flagged users: 8
   │   │
   │   └─► Fraud alerts:
   │       ├─► Suspicious donations: 3
   │       ├─► Duplicate accounts: 1
   │       ├─► Chargebacks: 2
   │       └─► Reported accounts: 12

RESULT:
✅ Campaign quality maintained through moderation
✅ Fraud prevented via review process
✅ Creator receives feedback
✅ Platform reputation protected
```

---

## API Reference

### Authentication Endpoints

```
POST /api/auth/signup
- Create new user account
- Body: { email, password, firstName, lastName }
- Response: { success, data: { user, token } }
- Status: 201 Created

POST /api/auth/login
- Authenticate user with credentials
- Body: { email, password }
- Response: { success, data: { user, token } }
- Status: 200 OK

POST /api/auth/refresh
- Refresh expired JWT token
- Headers: Authorization: Bearer <refresh_token>
- Response: { success, data: { token } }
- Status: 200 OK

POST /api/auth/logout
- Invalidate user session
- Headers: Authorization: Bearer <token>
- Response: { success }
- Status: 200 OK
```

### Campaign Endpoints

```
POST /api/campaigns
- Create new campaign (draft)
- Auth: Required
- Body: FormData { title, description, image, goals, ... }
- Response: { success, data: { campaign } }
- Status: 201 Created

GET /api/campaigns
- List campaigns with filters
- Query: ?page=1&limit=12&status=active&search=education
- Response: { success, data: [...], pagination: {...} }
- Status: 200 OK

GET /api/campaigns/:id
- Get campaign detail
- Response: { success, data: { campaign } }
- Status: 200 OK

PUT /api/campaigns/:id
- Update campaign (draft only)
- Auth: Required (creator only)
- Body: { title, description, ... }
- Response: { success, data: { campaign } }
- Status: 200 OK

DELETE /api/campaigns/:id
- Delete/archive campaign
- Auth: Required (creator only)
- Response: { success }
- Status: 204 No Content

POST /api/campaigns/:id/activate
- Activate campaign (draft → active)
- Auth: Required (creator only)
- Response: { success, data: { campaign } }
- Status: 200 OK

POST /api/campaigns/:id/pause
- Pause active campaign
- Auth: Required (creator only)
- Response: { success, data: { campaign } }
- Status: 200 OK

POST /api/campaigns/:id/complete
- Mark campaign as complete
- Auth: Optional (creator or admin)
- Response: { success, data: { campaign } }
- Status: 200 OK
```

### Donation Endpoints

```
POST /api/campaigns/:campaignId/donations
- Create donation
- Auth: Required
- Body: { amount, paymentMethod, message, isAnonymous }
- Response: { success, data: { transaction_id, status, ...} }
- Status: 201 Created

GET /api/campaigns/:campaignId/donations
- List donations for campaign
- Query: ?page=1&limit=50&verified=true
- Response: { success, data: [...], pagination: {...} }
- Status: 200 OK

GET /api/donations/:transactionId
- Get donation details
- Auth: Optional (donor or creator or admin)
- Response: { success, data: { donation } }
- Status: 200 OK

PATCH /api/donations/:transactionId/verify
- Verify donation (admin action)
- Auth: Required (admin only)
- Body: { verified: true, notes }
- Response: { success, data: { donation } }
- Status: 200 OK

POST /api/donations/:transactionId/refund
- Refund donation
- Auth: Required (creator or admin)
- Body: { reason }
- Response: { success, data: { transaction } }
- Status: 200 OK
```

### Analytics Endpoints

```
GET /api/campaigns/:id/analytics
- Get campaign analytics
- Auth: Optional (creator or public if campaign published)
- Query: ?timeframe=7days
- Response: { success, data: { analytics } }
- Status: 200 OK

GET /api/analytics/dashboard
- Get creator dashboard analytics
- Auth: Required
- Response: { success, data: { stats } }
- Status: 200 OK

GET /api/analytics/trending
- Get trending campaigns
- Query: ?timeframe=7days&limit=10
- Response: { success, data: [...] }
- Status: 200 OK
```

### Payment Endpoints

```
POST /api/payments/stripe/intent
- Create Stripe payment intent
- Auth: Required
- Body: { amount, campaignId }
- Response: { success, data: { clientSecret, intentId } }
- Status: 201 Created

POST /api/payments/stripe/webhook
- Handle Stripe webhooks
- No auth required (webhook signature verified)
- Body: Stripe event JSON
- Response: { success }
- Status: 200 OK

GET /api/payment-methods
- List available payment methods
- Response: { success, data: [...] }
- Status: 200 OK
```

### Share/Referral Endpoints

```
POST /api/campaigns/:campaignId/shares/generate-link
- Generate referral share link
- Auth: Required
- Body: { platform }
- Response: { success, data: { shareId, url, qrCode } }
- Status: 201 Created

POST /api/campaigns/:campaignId/shares/track-click
- Track share link click
- Query: ?shaId=...
- Response: { success }
- Status: 200 OK

GET /api/campaigns/:campaignId/shares/analytics
- Get share analytics for campaign
- Auth: Optional (creator or public)
- Response: { success, data: { analytics } }
- Status: 200 OK
```

---

## Authentication & Security

### JWT Token Structure

```
Header:
{
  "alg": "RS256",
  "typ": "JWT"
}

Payload:
{
  "userId": "USER-2026-001-ABC123",
  "email": "user@example.com",
  "role": "creator",
  "permissions": ["create_campaign", "view_analytics"],
  "iat": 1712527200,
  "exp": 1712613600,  // 24 hours from issue
  "iss": "honestneed-api",
  "sub": "user-auth"
}

Signature:
RSASHA256(base64UrlEncode(header) + "." + base64UrlEncode(payload), PUBLIC_KEY)
```

### Security Features

1. **Password Security**
   - Bcrypt hashing (salt rounds: 10)
   - Min 8 chars, requires: uppercase, lowercase, number, special char
   - Reset tokens expire in 1 hour
   - Failed login lockout after 5 attempts (30 min)

2. **API Security**
   - HTTPS only (enforced in production)
   - CORS configured (whitelist specific origins)
   - Rate limiting: 100 requests/minute per IP, 1000/hour per user
   - Request validation & sanitization
   - CSRF tokens for state-changing operations

3. **Data Encryption**
   - Sensitive payment data encrypted with AES-256-GCM
   - Bank account info encrypted
   - Database encryption at rest (MongoDB Atlas encryption)
   - HTTPS in transit

4. **Authorization**
   - Role-based access control (RBAC)
   - Creator can only edit own campaigns
   - Admin approval required for certain actions
   - Audit logging for all sensitive operations

5. **Fraud Detection**
   - Duplicate account detection
   - Unusual donation patterns flagged
   - Chargeback tracking
   - IP-based velocity checks
   - Email domain validation

---

## Database Schema & Relationships

### Relationships Diagram

```
User (1) ──────→ (Many) Campaign [via creator_id]
User (1) ──────→ (Many) Donation [via donor_id]
User (1) ──────→ (Many) Share [via sharer_id]
User (1) ──────→ (Many) Transaction [via user_id]

Campaign (1) ──────→ (Many) Donation [via campaign_id]
Campaign (1) ──────→ (Many) Transaction [via campaign_id]
Campaign (1) ──────→ (Many) Share [via campaign_id]
Campaign (1) ──────→ (Many) QRCode [via campaign_id]
Campaign (1) ──────→ (Many) SweepstakesDrawing [via campaign_id]

Donation (1) ──────→ (1) Transaction [via transaction_id]
Donation (1) ──────→ (Many) SweepstakesSubmission [via donation_id]

Share (1) ──────→ (Many) QRCode [via share_id]
Share (1) ──────→ (Many) ShapeTracking [via share_id]

SweepstakesDrawing (1) ──────→ (Many) SweepstakesSubmission [via drawing_id]
SweepstakesSubmission (1) ──────→ (1) Donation [via donation_id]
```

### Indexes

```javascript
// User
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ user_id: 1 }, { unique: true })
db.users.createIndex({ created_at: -1 })

// Campaign
db.campaigns.createIndex({ creator_id: 1, created_at: -1 })
db.campaigns.createIndex({ status: 1, is_deleted: 1 })
db.campaigns.createIndex({ campaign_type: 1, need_type: 1 })
db.campaigns.createIndex({ title: "text", description: "text" })
db.campaigns.createIndex({ geographic_scope: 1 })
db.campaigns.createIndex({ created_at: -1 })

// Donation
db.donations.createIndex({ campaign_id: 1, created_at: -1 })
db.donations.createIndex({ donor_id: 1, created_at: -1 })
db.donations.createIndex({ status: 1 })
db.donations.createIndex({ transaction_id: 1 }, { unique: true })

// Transaction
db.transactions.createIndex({ user_id: 1, created_at: -1 })
db.transactions.createIndex({ campaign_id: 1, created_at: -1 })
db.transactions.createIndex({ status: 1 })
db.transactions.createIndex({ transaction_id: 1 }, { unique: true })

// Share
db.shares.createIndex({ campaign_id: 1, created_at: -1 })
db.shares.createIndex({ sharer_id: 1, created_at: -1 })
db.shares.createIndex({ share_id: 1 }, { unique: true })
```

---

## Infrastructure & Deployment

### Docker Deployment

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb+srv://user:pwd@cluster.mongodb.net/honestneed
      - REDIS_URL=redis://redis:6379
      - JWT_PUBLIC_KEY=/keys/public.key
      - JWT_PRIVATE_KEY=/keys/private.key
    volumes:
      - ./keys:/keys
      - ./uploads:/app/uploads
    depends_on:
      - mongo
      - redis
    restart: always

  frontend:
    build:
      context: ./honestneed-frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=https://api.honestneed.com
    restart: always

  mongo:
    image: mongo:6.0
    volumes:
      - mongo_data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=password

  redis:
    image: redis:7.0
    volumes:
      - redis_data:/data

volumes:
  mongo_data:
  redis_data:
```

### Environment Variables

```bash
# Backend .env
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://honestneed.com

# Database
MONGODB_URI=mongodb+srv://...
REDIS_URL=redis://...

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRY=24h

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=honestneed-uploads

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...

# Encryption
ENCRYPTION_KEY=your_32_byte_hex_key

# Admin
ADMIN_EMAIL=admin@honestneed.com
ADMIN_PASSWORD=secure_password
```

### Monitoring & Logging

```javascript
// Logging Stack
- Winston: File logging (error.log, combined.log)
- Sentry: Error tracking & alerts
- DataDog: APM & infrastructure monitoring
- ELK Stack: Log aggregation & visualization

// Logging Levels
- error: Error events (500 errors, failures)
- warn: Warning events (rate limits, suspicious activity)
- info: Informational (campaign created, user signed up)
- debug: Debug information (request params, response data)
- trace: Very detailed tracing

// Key Metrics
- Campaign creation rate
- Donation success rate
- API response times
- Database query performance
- User authentication success rate
- Payment processing failures
```

---

## Conclusion

This comprehensive documentation provides a complete end-to-end view of the HonestNeed platform architecture, from user interactions through frontend components down to backend services and database operations.

### Key Takeaways:

1. **Layered Architecture**: Clear separation between presentation, business logic, and data layers
2. **Type Safety**: TypeScript throughout for fewer runtime errors
3. **Scalability**: MongoDB + Indexed queries for performance, Redis for caching
4. **Security**: JWT auth, encryption, RBAC, audit logging
5. **User-Centric Design**: Intuitive flows for creating campaigns, donating, sharing
6. **Real-Time Engagement**: Analytics, QR tracking, sweepstakes integration
7. **Admin Control**: Moderation, fraud detection, compliance oversight

The platform successfully bridges the gap between donors, creators, and campaigns through a transparent, secure, and engaging experience.

**Repository**: HonestNeed Web Application  
**Last Updated**: April 7, 2026  
**Status**: Production Ready  
**Version**: 1.0
