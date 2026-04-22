# HonestNeed Platform
## Backend Implementation Document

**Document Version:** 1.0  
**Target Audience:** Backend Development Team  
**Scope:** Production Backend Architecture & Development Roadmap  
**Status:** Ready for Development (Sprint Planning)  
**Date Prepared:** April 1, 2026

---

## EXECUTIVE SUMMARY

This document transforms the HonestNeed PRD into a comprehensive, actionable backend implementation plan. It provides:
- Critical analysis of PRD ambiguities and risks
- Concrete backend architecture decisions
- MongoDB schema specifications with indexing
- Complete API endpoint specifications
- End-to-end workflow implementations
- Security & compliance strategy
- Testing and deployment roadmaps
- Build execution plan (phases & sprints)

**Key Implementation Principle:** Keep the MVP lean, honor-system driven, and P2P-focused. Add verification/enforcement layers in Phase 2 when patterns emerge.

**Target Launch Complexity:** Moderate - 3-4 developer team for 8-week MVP sprint to April 1, 2026 (or 8 weeks from current date).

**Estimated Backend LOC:** ~8,000 lines of production Node.js/Express code for MVP

---

## 1. BACKEND PROJECT OVERVIEW

### 1.1 Core Architecture Philosophy

**HonestNeed Backend** is built as a **monolithic Node.js service** (not microservices initially) with:
- **Single Express.js application** serving all features
- **MongoDB** as primary datastore (flexible document structure for campaign variations)
- **JWT authentication** for stateless API calls
- **RESTful endpoints** (GraphQL planned for Phase 3+)
- **Webhook-ready** for future payment integrations
- **Event-based analytics** for platform insights

**Why Monolith for MVP:**
- Faster initial delivery
- Simpler debugging & deployment
- Easier to refactor into microservices later
- Team can stay focused on business logic
- Microservices added when scaling reveals bottlenecks

### 1.2 Technology Stack (Finalized)

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Runtime** | Node.js 18+ | JavaScript ecosystem, fast dev, PM2/Docker easy |
| **Framework** | Express.js 4.x | Lightweight, routing-focused, proven at scale |
| **Database** | MongoDB 5.x | Flexible schema (campaign types differ), document model natural fit |
| **Auth** | JSON Web Tokens (JWT) | Stateless, scalable, no session server needed |
| **Validation** | Zod or Joi | Type-safe schema validation before DB writes |
| **Password Hashing** | bcrypt | Industry standard, built-in salt rounds |
| **Deployment** | Docker + AWS/DigitalOcean | Containerized, reproducible, easy horizontal scale |
| **Database Hosting** | MongoDB Atlas | Managed, backups, replication automatic |
| **Caching** | Redis (Phase 2) | Campaign feed optimization, session store |
| **Job Queue** | Bull (Redis-backed) | Sweepstakes drawing, notifications, batch ops |
| **Logging** | Winston/Pino | Structured logs, easy filtering/alerts |
| **Monitoring** | CloudWatch or Data dog | Infrastructure + application metrics |

### 1.3 Development Team Structure (Proposed)

**MVP Sprint (8 weeks):**
- 1 Senior Backend Engineer (architecture, DB design, security)
- 1 API Developer (endpoints, validation, business logic)
- 1 DevOps/QA Engineer (deployment, testing, CI/CD)
- Technical Lead (PR reviews, sprint planning, unblocking)

**Post-MVP Growth:**
- Add 2-3 backend engineers for Phase 2 parallel features
- Add data engineer for analytics pipeline

---

## 2. CRITICAL ANALYSIS OF THE PRD

### 2.1 Identified Ambiguities & Resolutions

| Ambiguity | PRD Statement | Backend Impact | Resolution |
|-----------|---------------|-----------------|-----------|
| **Share verification** | "Honor system – no verification initially" | How do we prevent fraud? | Accept all share claims in MVP. Log suspicious patterns (same user 100x). Add proof layer in Phase 2 if >5% abuse detected. |
| **Campaign goal overflow** | "Can increase goal and continue" | Do we track overflow separately? | Single `goalAmount` field. When donations exceed it, show "GOAL REACHED" but continue accepting. No auto-archive. Creator manually ends. |
| **QR code analytics** | "Track origin stores" but no backend mechanism specified | How to associate scan with store? | Use URL parameter: `?origin=store_id`. Optionally add GPS check (store lat/long vs user GPS). Manual entry in store dashboard as fallback. |
| **Payment tracking** | "Manual entry" or "webhook verification" unspecified | How do we know donation was real? | Phase 1: User manual attestation ("I sent $X via [method]"). Phase 2: PayPal webhook integration if accessible. Trust but verify. |
| **Transaction fee collection** | "20% charged but collected manually" | How/when does HonestNeed get paid? | Track fee amount in transactions table. Admin dashboard shows outstanding fees. Phase 2: Auto-settlement via integrated payments. For MVP: Creators aware of fee, expected to account for it. |
| **Campaign completion logic** | "Creator manually ends or expires" but no expiry defined | Does campaign run forever? | No auto-expiry in MVP (can add 90-day soft warning in Phase 2). Campaigns live until explicitly ended by creator. Provides operational flexibility. |
| **Helping Hands tracking** | "Volunteers count" but no completion verification | How do we know volunteer actually helped? | Record volunteer offers (name, skill, date offered). Creator marks "Help received" when done. No verification – trust system. Dispute resolution added if needed. |
| **Geographic scope enforcement** | "Local = 5-mile radius" but how to filter feed | Should platform block out-of-scope supporters? | Calculate distance using haversine formula (lat/long). Show campaigns to supporters within scope. Don't block supporters – let them support anyway, just deprioritize in algorithm. Enables edge cases (friend visiting from out of state). |
| **Multi-meter logic** | "All meters operate independently" but interaction unclear | If creator selects both Money + Customers, how do we fund the "Customers" meter? | Money meter: direct donations. Customers meter: customer acquisition goal (tracked by referral code or manual entry). Helping Hands meter: volunteer count. Completely independent – no cross-funding. Simple. |
| **Share budget reload incentive** | Why would supporters donate specifically to share budget? | This seems artificial. | Actually powerful for "mutual aid" scenarios – sister donating to brother's share budget to amplify his message. Build it but don't force it. Optional feature. Tracked as separate transaction type. |

### 2.2 Design Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| **Honor system exploited (shares/help never happen)** | Revenue loss if platform perceived as unreliable | Medium | Phase 1: Log patterns, manual review of suspicious accounts. Phase 2: Add optional proof (screenshot, photo). Reward trusted users with badges. |
| **Payment method providers block HonestNeed** | Can't process transactions at all | Low | Diversify payment methods (if one blocks, others work). PayPal ToS allows "payment directory" model. Test with legal. |
| **QR code abuse (counterfeit campaigns in stores)** | Store customers scammed by fake campaigns | Medium | QR codes only for legitimate campaigns. Admin review before flyer download. Flag suspicious campaigns. Store partners vet before placement. |
| **Database scalability hits wall at 1M campaigns** | Feed randomization becomes slow | High (Phase 2+) | Use probabilistic algorithm (MySQL's weighted random). Add indexes on query hot paths. Shard by campaign_type or geographic region if needed. Build now, optimize Phase 2. |
| **Sweepstakes compliance violations** | Legal/regulatory penalties | Medium | Legal review of terms. Geo-block restricted states (simple IP check). Document compliance per jurisdiction. Annual review. |
| **Creator payment info exposed** | Fraud/identity theft risk | High | Encrypt sensitive fields at rest. Show only to verified supporters (logged-in). Rate-limit display endpoint. Never log full payment details. |
| **New vs. existing user bias in algorithm** | Established campaigns dominated by algorithm | Low | Add freshness bonus to algorithm. New campaigns get +2-3 weight. Surfaces both new & trending content. |

### 2.3 MVP Simplifications & Deferrals

**MUST HAVE (MVP):**
- ✅ User registration & authentication (JWT)
- ✅ Campaign CRUD (create, read, list, update, soft-delete)
- ✅ Campaign payment directory (display info, no processing)
- ✅ Share tracking (record shares, honor system)
- ✅ Basic analytics (transaction counts, meter progress)
- ✅ QR code generation (URL + download)
- ✅ Admin dashboard (campaign flagging, basic monitoring)
- ✅ Sweepstakes entry tracking & monthly drawing

**DEFER TO PHASE 2:**
- ❌ Real-time notifications (WebSockets) → Use email/polling
- ❌ Video uploads → Image only
- ❌ Mobile app → Responsive web only
- ❌ Payment webhook integration → Manual verification
- ❌ Identity verification (ID photos) → Badges only
- ❌ Dispute resolution UI → Manual support emails
- ❌ AI-powered campaign recommendations → Weighted random algorithm only
- ❌ Influencer verification system → Manual tagging

**SAFE ARCHITECTURAL DECISIONS FOR DEFERRAL:**
- Build API assuming notifications exist (add middleware hook for future)
- Schema supports video_url field (just null in MVP)
- Admin dashboard has "verify_user" button (grayed out MVP)
- Share model has "proof_url" field for screenshots (optional MVP)

---

## 3. BACKEND ARCHITECTURE OVERVIEW

### 3.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Layer (React)                     │
│                   (Web Browser / Mobile)                    │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS/TLS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Gateway (Express)                     │
│  - Route matching                                           │
│  - CORS handling                                            │
│  - Rate limiting                                            │
│  - Request logging                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌────────┐    ┌──────────┐    ┌──────────┐
    │  Auth  │    │ Business │    │  Admin   │
    │ Routes │    │ Routes   │    │ Routes   │
    └────────┘    └──────────┘    └──────────┘
         │               │               │
         └───────────────┼───────────────┘
                         ▼
         ┌───────────────────────────────┐
         │   Business Logic Layer        │
         │  (Services, Controllers)      │
         │                               │
         │  - CampaignService            │
         │  - UserService               │
         │  - ShareService              │
         │  - TransactionService        │
         │  - SweepstakesService        │
         │  - AnalyticsService          │
         └───────────────┬───────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ MongoDB  │   │  Redis   │   │  File    │
    │Database  │   │ (Cache)  │   │  Storage │
    └──────────┘   └──────────┘   └──────────┘
         │               │               │
         └───────────────┼───────────────┘
                         ▼
    ┌─────────────────────────────────┐
    │   External Services (Phase 2+)  │
    │                                 │
    │  - PayPal API                   │
    │  - SendGrid Email               │
    │  - Google Analytics             │
    │  - Stripe (optional)            │
    └─────────────────────────────────┘
```

### 3.2 Request/Response Flow (Example: Create Campaign)

```
USER REQUEST
    │
    ├─ POST /campaigns
    ├─ Headers: { Authorization: "Bearer [JWT]" }
    ├─ Body: { title, description, campaignType, ... }
    │
    ▼
API CONTROLLER (campaignController.js)
    │
    ├─ Extract JWT → User ID
    ├─ Validate request body (Zod schema)
    ├─ Check user permissions (is creator?)
    │
    ▼
BUSINESS SERVICE (campaignService.js)
    │
    ├─ Generate campaign_id (UUID)
    ├─ Normalize data (trim strings, validate amounts in cents)
    ├─ Set default values (status: "draft", createdAt: now)
    ├─ Call repository to save
    ├─ Generate QR code (library call)
    ├─ Store QR in file system
    ├─ Return campaign with QR URL
    │
    ▼
DATA LAYER (campaignRepository.js)
    │
    ├─ Insert document into campaigns collection
    ├─ Return inserted doc with _id
    │
    ▼
RESPONSE TO CLIENT
    │
    ├─ 201 Created
    ├─ Body: { campaign_id, status, created_at, qr_code_url, ... }
    │
    └─ Client shows "Campaign created! Download QR code"
```

### 3.3 Folder/Module Structure

```
honestneed-backend/
├── src/
│   ├── config/
│   │   ├── database.js           (MongoDB connection)
│   │   ├── environment.js        (env vars, secrets)
│   │   └── redis.js             (Redis cache)
│   │
│   ├── middleware/
│   │   ├── authMiddleware.js    (JWT validation)
│   │   ├── errorHandler.js      (global error catching)
│   │   ├── rateLimiter.js       (request throttling)
│   │   └── requestLogger.js     (structured logging)
│   │
│   ├── routes/
│   │   ├── auth.js              (login, register, password reset)
│   │   ├── users.js             (user profile, settings)
│   │   ├── campaigns.js         (CRUD, analytics, actions)
│   │   ├── shares.js            (share tracking, rewards)
│   │   ├── donations.js         (transaction recording)
│   │   ├── sweepstakes.js       (entry, drawings, winners)
│   │   ├── admin.js             (moderation, analytics, settings)
│   │   └── health.js            (status check, uptime monitor)
│   │
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── campaignController.js
│   │   ├── userController.js
│   │   ├── shareController.js
│   │   ├── donationController.js
│   │   ├── sweepstakesController.js
│   │   └── adminController.js
│   │
│   ├── services/
│   │   ├── campaignService.js   (campaign CRUD, validation)
│   │   ├── userService.js       (auth, profile)
│   │   ├── shareService.js      (share recording, rewards)
│   │   ├── transactionService.js (fee tracking, history)
│   │   ├── sweepstakesService.js (drawing logic, winner selection)
│   │   ├── analyticsService.js  (metrics, reporting)
│   │   ├── qrCodeService.js     (generation, storage)
│   │   ├── notificationService.js (email, future SMS/push)
│   │   └── paymentService.js    (payment method display, verification)
│   │
│   ├── repositories/
│   │   ├── userRepository.js    (User DB queries)
│   │   ├── campaignRepository.js (Campaign queries)
│   │   ├── shareRepository.js   (Share queries)
│   │   ├── transactionRepository.js
│   │   ├── sweepstakesRepository.js
│   │   └── analyticsRepository.js
│   │
│   ├── models/
│   │   ├── User.js              (schema + validation)
│   │   ├── Campaign.js
│   │   ├── Share.js
│   │   ├── Transaction.js
│   │   ├── SweepstakesEntry.js
│   │   └── SweepstakesDrawing.js
│   │
│   ├── validators/
│   │   ├── authValidator.js     (Zod schemas)
│   │   ├── campaignValidator.js
│   │   ├── shareValidator.js
│   │   ├── donationValidator.js
│   │   └── userValidator.js
│   │
│   ├── utils/
│   │   ├── jwt.js               (sign, verify tokens)
│   │   ├── qrCode.js            (generate QR, save file)
│   │   ├── geolocation.js       (haversine distance, location filtering)
│   │   ├── algorithms.js        (randomization, blessing algo)
│   │   ├── currency.js          (parse, format cents/dollars)
│   │   ├── encryption.js        (encrypt/decrypt sensitive data)
│   │   ├── errorFormatter.js    (standardized errors)
│   │   └── logger.js            (Winston setup)
│   │
│   ├── constants/
│   │   ├── campaignTypes.js     (100+ categories)
│   │   ├── paymentMethods.js    (vendor types)
│   │   ├── campaignStatus.js
│   │   └── errorCodes.js
│   │
│   └── app.js                   (Express setup, middleware, route mounting)
│
├── jobs/
│   ├── sweepstakesDrawing.js    (scheduled daily/monthly)
│   ├── campaignArchival.js      (soft-delete old campaigns)
│   └── notificationBatch.js     (send queued emails)
│
├── scripts/
│   ├── seedDatabase.js          (dev fixtures)
│   └── migrateSweepstakes.js    (schema changes)
│
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   ├── validators/
│   │   └── utils/
│   ├── integration/
│   │   ├── campaigns.test.js
│   │   ├── sharing.test.js
│   │   ├── donations.test.js
│   │   └── sweepstakes.test.js
│   └── e2e/
│       └── campaignWorkflow.test.js
│
├── .env.example              (template for secrets)
├── .env.production           (secrets - DO NOT COMMIT)
├── docker-compose.yml        (MongoDB + Redis local)
├── Dockerfile               (app container)
├── package.json
├── package-lock.json
└── server.js                (entry point)
```

---

## 4. DOMAIN MODEL & DATA DESIGN

### 4.1 MongoDB Collections & Schemas

#### Collection: `users`

```javascript
{
  _id: ObjectId,
  email: String,                    // unique, indexed
  emailVerified: Boolean,           // default: false
  passwordHash: String,             // bcrypt (never return in API)
  displayName: String,              // min 2, max 50 chars
  profilePhoto: String,             // URL to image file
  bio: String,                      // max 500 chars
  location: {
    address: String,                // "San Francisco, CA"
    lat: Number,
    long: Number,
    zipCode: String
  },
  roles: [String],                  // ["creator", "supporter", "admin"]
  isVerified: Boolean,              // identity verification (Phase 2)
  verificationDate: Date,
  socialLinks: {
    twitter: String,
    facebook: String,
    instagram: String
  },
  accountStatus: {
    enum: ["active", "suspended", "deleted"],
    default: "active"
  },
  preferences: {
    emailNotifications: Boolean,    // default: true
    publicProfile: Boolean          // default: true
  },
  paymentMethods: [
    {
      methodId: String,             // UUID
      type: String,                 // "paypal", "venmo", "cashapp", "bank", "crypto", "other"
      isPrimary: Boolean,
      contact: String,              // encrypted: PayPal email, Venmo $tag, etc.
      lastValidated: Date,
      createdAt: Date
    }
  ],
  createdAt: Date,
  updatedAt: Date,
  lastLoginAt: Date
}

// Indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ displayName: 1 });
db.users.createIndex({ createdAt: -1 });
```

#### Collection: `campaigns`

```javascript
{
  _id: ObjectId,
  campaignId: String,               // human-readable ID: "CAMP-2026-001-ABC123"
  creatorId: ObjectId,              // FK to users._id
  title: String,                    // min 5, max 200 chars
  description: String,              // max 2000 chars
  fullDescription: String,          // optional, for markdown/rich text
  campaignType: String,             // "fundraising" or "sharing" or "business_growth"
  needType: String,                 // enum: "emergency_funding", "medical_bills", etc.
  needCategory: String,             // parent category: "Financial", "Labor", etc.
  status: {
    enum: ["draft", "active", "completed", "paused", "archived", "rejected"],
    default: "draft"
  },
  visibility: {
    enum: ["local", "statewide", "country", "global"],
    default: "local",
    indexed: true
  },
  location: {
    address: String,
    lat: Number,
    long: Number,
    zipCode: String,
    radius: Number                  // miles for "local" scope
  },
  media: {
    imageUrl: String,               // primary image
    imageKey: String,               // S3 key (for deletion)
    videoUrl: String,               // Phase 2
    qrCodeUrl: String,              // downloadable QR code
    qrCodeKey: String               // file storage key
  },
  goals: [
    {
      goalType: String,             // "money", "volunteers", "customers"
      targetAmount: Number,         // in cents for money
      currentAmount: Number,
      unit: String,                 // "dollars", "hours", "people"
      description: String,
      createdAt: Date
    }
  ],
  paymentMethods: [
    {
      methodId: String,             // UUID
      type: String,                 // "paypal", "venmo", etc.
      creatorInfo: String,          // encrypted contact info
      displayInfo: String,          // what's shown to supporters
      isPrimary: Boolean
    }
  ],
  shareConfig: {
    totalBudget: Number,            // in cents, e.g., 5000 = $50
    amountPerShare: Number,         // in cents
    currentBudgetRemaining: Number,
    isPaidSharingActive: Boolean,
    shareChannels: [String],        // ["email", "facebook", "tiktok"]
    isFreeSharingEnabled: Boolean   // default: true
  },
  metrics: {
    totalShares: Number,
    totalDonations: Number,
    totalDonationAmount: Number,    // cents
    totalVolunteers: Number,
    totalCustomersAcquired: Number,
    uniqueSupporters: Set(),        // set of supporter user_ids
    viewCount: Number
  },
  createdAt: Date,
  publishedAt: Date,
  completedAt: Date,
  updatedAt: Date,
  expiresAt: Date                   // optional, for time-limited campaigns (Phase 2)
}

// Indexes
db.campaigns.createIndex({ creatorId: 1, status: 1 });
db.campaigns.createIndex({ status: 1, publishedAt: -1 });
db.campaigns.createIndex({ "location.lat": "2dsphere", "location.long": "2dsphere" });
db.campaigns.createIndex({ visibility: 1 });
db.campaigns.createIndex({ needType: 1 });
db.campaigns.createIndex({ createdAt: -1 });
db.campaigns.createIndex({ "metrics.totalShares": -1 });  // trending
```

#### Collection: `shares`

```javascript
{
  _id: ObjectId,
  shareId: String,                  // UUID or nanoid
  campaignId: ObjectId,
  supporterId: ObjectId,            // FK to users._id (can be null for anon interim)
  rewardAmount: Number,             // cents, 0 if free share
  isPaid: Boolean,
  channel: String,                  // "email", "facebook", "sms", "qr", "link"
  status: {
    enum: ["pending", "verified", "failed", "paid"],
    default: "pending"
  },
  proofUrl: String,                 // optional: screenshot, future verification
  metadata: {
    deviceType: String,             // "mobile", "desktop"
    referrerUrl: String,
    geoLocation: {
      lat: Number,
      long: Number
    },
    userAgent: String               // minimal tracking
  },
  createdAt: Date,
  completedAt: Date,
  paidAt: Date
}

// Indexes
db.shares.createIndex({ campaignId: 1, status: 1 });
db.shares.createIndex({ supporterId: 1, createdAt: -1 });
db.shares.createIndex({ createdAt: -1 });
db.shares.createIndex({ channel: 1 });
```

#### Collection: `transactions`

```javascript
{
  _id: ObjectId,
  transactionId: String,            // UUID
  campaignId: ObjectId,
  supporterId: ObjectId,
  amount: Number,                   // cents
  paymentMethod: String,            // "paypal", "venmo", "cashapp", etc.
  transactionType: String,          // "donation", "share_reward", "share_budget_reload"
  status: {
    enum: ["pending", "verified", "failed", "refunded"],
    default: "pending"
  },
  platformFee: Number,              // 20% of amount, in cents
  netAmount: Number,                // amount - platformFee
  isManuallyVerified: Boolean,      // human did spot check
  verifiedBy: ObjectId,             // admin user who verified
  verifiedAt: Date,
  proofUrl: String,                 // optional: receipt, screenshot
  metadata: {
    description: String,            // "Donation to [campaign title]"
    referenceId: String,            // external ref for webhook matching
    webhookVerified: Boolean        // Phase 2
  },
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.transactions.createIndex({ campaignId: 1, status: 1 });
db.transactions.createIndex({ supporterId: 1, createdAt: -1 });
db.transactions.createIndex({ transactionType: 1 });
db.transactions.createIndex({ status: 1 });
db.transactions.createIndex({ createdAt: -1 });
```

#### Collection: `sweepstakes_submissions`

```javascript
{
  _id: ObjectId,
  submissionId: String,             // UUID
  userId: ObjectId,
  drawingPeriod: String,            // "2026-06", "2026-08", etc.
  entryCount: Number,               // cumulative entries
  entrySource: [
    {
      source: String,               // "campaign_created", "donation", "share", "qr_scan"
      count: Number,
      addedAt: Date
    }
  ],
  email: String,                    // denormalized for drawing
  fullName: String,
  phoneNumber: String,              // optional
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.sweepstakes_submissions.createIndex({ userId: 1, drawingPeriod: 1 }, { unique: true });
db.sweepstakes_submissions.createIndex({ drawingPeriod: 1 });
db.sweepstakes_submissions.createIndex({ entryCount: -1 });
```

#### Collection: `sweepstakes_drawings`

```javascript
{
  _id: ObjectId,
  drawingId: String,                // UUID
  drawingPeriod: String,            // "2026-06", "2026-08", etc.
  drawingDate: Date,                // June 3, 2026
  prizeAmount: Number,              // cents, e.g., 50000 = $500
  winningUserId: ObjectId,
  winningSubmissionId: ObjectId,
  status: {
    enum: ["scheduled", "drawn", "claimed", "expired"],
    default: "scheduled"
  },
  winnerNotifiedAt: Date,
  claimedAt: Date,
  prizeDistributedAt: Date,
  paymentMethod: String,            // where prize sent (from winner's profile)
  metadata: {
    totalEntries: Number,
    totalParticipants: Number,
    randomSeed: String              // for reproducibility
  },
  executedAt: Date,
  createdAt: Date
}

// Indexes
db.sweepstakes_drawings.createIndex({ drawingPeriod: 1 }, { unique: true });
db.sweepstakes_drawings.createIndex({ drawingDate: 1 });
db.sweepstakes_drawings.createIndex({ status: 1 });
```

#### Collection: `admin_logs`

```javascript
{
  _id: ObjectId,
  adminId: ObjectId,
  action: String,                   // "flag_campaign", "suspend_user", etc.
  targetType: String,               // "campaign", "user", "share"
  targetId: ObjectId,
  reason: String,
  details: Object,                  // JSON details
  createdAt: Date
}

// Indexes
db.admin_logs.createIndex({ createdAt: -1 });
db.admin_logs.createIndex({ adminId: 1, createdAt: -1 });
db.admin_logs.createIndex({ targetId: 1 });
```

### 4.2 Data Normalization Notes

**Why This Structure:**
- **Denormalization where needed:** `metrics` object in campaigns (aggregated for fast reads)
- **Separate transactions table:** Audit trail, fee tracking, verification history
- **Sweepstakes separation:** Keeps drawing logic isolated, easy to test
- **Encrypted fields:** Payment info stored encrypted, decrypted only on demand
- **Soft deletes:** No hard deletes in campaigns/users (archive instead, maintain history)

**Phase 2 Optimizations:**
- Add `_cache` field to campaigns with denormalized trending metrics
- Redis key for frequently accessed campaigns
- Materialized view for admin analytics

---

## 5. AUTHENTICATION & AUTHORIZATION

### 5.1 JWT Strategy

**Token Structure:**

```javascript
// Access Token (short-lived)
{
  sub: "user_id_here",              // JWT standard: subject
  email: "user@email.com",
  roles: ["creator"],               // array of role strings
  iat: 1704067200,                  // issued at
  exp: 1704153600,                  // expires in 24 hours
  iss: "honestneed.api",            // issuer
  aud: "honestneed-web"             // audience
}

// Signed with RS256 or HS256 (implement both for flexibility)
// Secret key stored in .env, never committed
```

**Token Lifecycle:**

```
1. User logs in with email + password
2. Backend validates credentials
3. Backend generates JWT (24hr expiry)
4. Client stores JWT in localStorage or secure cookie
5. Client includes JWT in every request header: "Authorization: Bearer [token]"
6. Backend middleware validates JWT signature
7. If valid, request proceeds with user context
8. If invalid/expired, client sees 401 → must re-authenticate
```

**Refresh Token Strategy (Phase 1 Optional, Phase 2 Mandatory):**

```javascript
// Issue separate refresh token with 30-day expiry
// Client uses to get new access token without re-entering password
// Implement in Phase 2 when mobile clients added
```

### 5.2 Role-Based Access Control (RBAC)

**Roles Definition:**

```javascript
const ROLES = {
  CREATOR: "creator",       // can create campaigns
  SUPPORTER: "supporter",   // can donate, share, volunteer
  ADMIN: "admin",           // can moderate, view analytics
  SYSTEM: "system"          // background job runner
};

// Users can have multiple roles
// Default: user gets both CREATOR + SUPPORTER on signup
// ADMIN added via backend manually
```

**Permission Matrix:**

```javascript
const PERMISSIONS = {
  // Campaign actions
  "campaign:create": ["creator", "admin"],
  "campaign:read_own": ["creator", "supporter", "admin"],
  "campaign:read_all": ["admin"],
  "campaign:update_own": ["creator"],  // only if draft
  "campaign:update_all": ["admin"],
  "campaign:delete_own": ["creator"],  // soft-delete only
  "campaign:publish": ["creator", "admin"],
  "campaign:flag": ["admin"],
  
  // User actions
  "user:read_own": ["creator", "supporter", "admin"],
  "user:update_own": ["creator", "supporter", "admin"],
  "user:read_all": ["admin"],
  "user:suspend": ["admin"],
  
  // Sweepstakes
  "sweepstakes:enter": ["creator", "supporter"],
  "sweepstakes:draw": ["admin", "system"],
  "sweepstakes:view_results": ["admin"],
  
  // Analytics
  "analytics:view_own": ["creator"],
  "analytics:view_all": ["admin"]
};
```

**Middleware Implementation:**

```javascript
// middleware/rbac.js
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userRoles = req.user.roles || [];
    const hasPermission = PERMISSIONS[permission].some(role => 
      userRoles.includes(role)
    );
    
    if (!hasPermission) {
      return res.status(403).json({ error: "Forbidden" });
    }
    
    next();
  };
};

// Usage in routes:
router.post("/campaigns", requirePermission("campaign:create"), campaignController.create);
```

### 5.3 Authentication Endpoints

#### POST /auth/register

```javascript
REQUEST:
{
  email: "user@example.com",
  password: "SecurePass123!",
  displayName: "John Doe",
  location: {
    zipCode: "94102",
    address: "San Francisco, CA"
  }
}

VALIDATION:
- Email: valid format, not already registered
- Password: min 8 chars, mixed case + number + special char
- displayName: min 2, max 50 chars
- zipCode: valid US format (later expand for intl)

RESPONSE (201):
{
  userId: "user_id_here",
  email: "user@example.com",
  displayName: "John Doe",
  accessToken: "eyJhbGc...",
  expiresIn: 86400,
  roles: ["creator", "supporter"]
}

SIDE EFFECTS:
- Create user in DB
- Send verification email (async)
- Log user created event
```

#### POST /auth/login

```javascript
REQUEST:
{
  email: "user@example.com",
  password: "SecurePass123!"
}

VALIDATION:
- Email exists in DB
- Password matches hash (bcrypt)

RESPONSE (200):
{
  accessToken: "eyJhbGc...",
  expiresIn: 86400,
  user: {
    userId: "...",
    email: "user@example.com",
    displayName: "John Doe",
    roles: ["creator", "supporter"]
  }
}

ERROR CASES:
- 401 if email doesn't exist or password wrong (don't reveal which)
- 400 if email/password invalid format
- 429 if >5 failed attempts in 15 mins (rate limit)
```

#### POST /auth/logout

```javascript
REQUEST:
{
  accessToken: "eyJhbGc..."  // or just auth header
}

RESPONSE (200):
{ success: true }

SIDE EFFECTS:
- Log logout event (for security audit)
- Optional: add token to blacklist (if using Redis)
```

#### POST /auth/password-reset

**Step 1: Request Reset Token**

```javascript
REQUEST:
{
  email: "user@example.com"
}

RESPONSE (200):
{ message: "If email exists, reset link sent" }  // don't reveal if user found

SIDE EFFECTS:
- Generate reset token (6-hour expiry)
- Send email with reset link
- Log password reset attempt
```

**Step 2: Reset Password**

```javascript
REQUEST:
{
  resetToken: "token_from_email",
  newPassword: "NewPassword123!"
}

VALIDATION:
- resetToken valid (not expired)
- newPassword meets complexity

RESPONSE (200):
{ message: "Password reset successful" }

SIDE EFFECTS:
- Hash new password
- Update user
- Invalidate reset token
- Log password changed event
```

---

## 6. CORE BACKEND MODULES & SERVICES

### 6.1 Campaign Module

**campaignService.js - Core Business Logic**

```javascript
class CampaignService {
  
  // CREATE
  async createCampaign(userId, campaignData) {
    // Validate input using Zod schema
    const validated = campaignSchema.parse(campaignData);
    
    // Normalize data
    const normalized = {
      ...validated,
      campaignId: generateCampaignId(),
      creatorId: userId,
      status: "draft",
      metrics: {
        totalShares: 0,
        totalDonations: 0,
        totalDonationAmount: 0,
        uniqueSupporters: [],
        viewCount: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // For money goals, convert dollars → cents
    if (normalized.goals) {
      normalized.goals = normalized.goals.map(goal => ({
        ...goal,
        targetAmount: goal.targetAmount ? Math.round(goal.targetAmount * 100) : null
      }));
    }
    
    // Encrypt sensitive payment info
    if (normalized.paymentMethods) {
      normalized.paymentMethods = normalized.paymentMethods.map(method => ({
        ...method,
        creatorInfo: await encryptPaymentInfo(method.creatorInfo)
      }));
    }
    
    // Generate QR code
    const qrCode = await qrCodeService.generate(normalized.campaignId);
    normalized.media.qrCodeUrl = qrCode.url;
    normalized.media.qrCodeKey = qrCode.storageKey;
    
    // Save to DB
    const campaign = await campaignRepository.create(normalized);
    
    // Emit event for analytics
    publishEvent("campaign:created", { campaignId: campaign._id, userId });
    
    return campaign;
  }
  
  // READ
  async getCampaign(campaignId, userId) {
    const campaign = await campaignRepository.findById(campaignId);
    
    if (!campaign) throw new NotFoundError("Campaign not found");
    
    // Increment view count (async, non-blocking)
    campaignRepository.incrementViewCount(campaignId);
    
    // Decrypt payment info only if user is creator or admin
    if (campaign.creatorId !== userId && !isAdmin(userId)) {
      campaign.paymentMethods = campaign.paymentMethods.map(m => ({
        ...m,
        creatorInfo: undefined  // don't expose
      }));
    }
    
    return campaign;
  }
  
  // LIST with filtering & pagination
  async listCampaigns(filters, page = 1, limit = 20) {
    // Build MongoDB query
    const query = {};
    
    if (filters.needType) query.needType = filters.needType;
    if (filters.status) query.status = filters.status;
    if (filters.creatorId) query.creatorId = filters.creatorId;
    
    // Geolocation filtering
    if (filters.lat && filters.long && filters.radius) {
      query["location.lat"] = {
        $gte: filters.lat - deltaLat(filters.radius),
        $lte: filters.lat + deltaLat(filters.radius)
      };
      query["location.long"] = {
        $gte: filters.long - deltaLong(filters.radius),
        $lte: filters.long + deltaLong(filters.radius)
      };
    }
    
    // Ensure only active campaigns shown (unless user is creator)
    if (!filters.includeInactive) {
      query.status = "active";
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    // Execute query with sorting
    const campaigns = await campaignRepository.find(query)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    return campaigns;
  }
  
  // UPDATE (only drafts)
  async updateCampaign(campaignId, userId, updateData) {
    const campaign = await campaignRepository.findById(campaignId);
    
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.creatorId !== userId) throw new ForbiddenError("Not creator");
    if (campaign.status !== "draft") {
      throw new ValidationError("Can only edit draft campaigns");
    }
    
    // Validate update data
    const validated = campaignUpdateSchema.parse(updateData);
    
    // Apply updates
    const updated = {
      ...campaign,
      ...validated,
      updatedAt: new Date()
    };
    
    // Save
    const result = await campaignRepository.updateById(campaignId, updated);
    
    publishEvent("campaign:updated", { campaignId, userId });
    
    return result;
  }
  
  // PUBLISH
  async publishCampaign(campaignId, userId) {
    const campaign = await campaignRepository.findById(campaignId);
    
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.creatorId !== userId) throw new ForbiddenError("Not creator");
    if (campaign.status !== "draft") {
      throw new ValidationError("Already published");
    }
    
    // One final validation
    this.validateCampaignComplete(campaign);
    
    // Go live
    const updated = await campaignRepository.updateById(campaignId, {
      status: "active",
      publishedAt: new Date(),
      updatedAt: new Date()
    });
    
    // Award sweepstakes entry for campaign creation
    await sweepstakesService.addEntry(userId, "campaign_created");
    
    // Emit event
    publishEvent("campaign:published", { campaignId, userId });
    
    return updated;
  }
  
  // COMPLETE
  async completeCampaign(campaignId, userId) {
    const campaign = await campaignRepository.findById(campaignId);
    
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.creatorId !== userId) throw new ForbiddenError("Not creator");
    if (campaign.status !== "active") {
      throw new ValidationError("Only active campaigns can be completed");
    }
    
    const updated = await campaignRepository.updateById(campaignId, {
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date()
    });
    
    publishEvent("campaign:completed", { campaignId, userId });
    
    return updated;
  }
  
  // ANALYTICS
  async getCampaignAnalytics(campaignId, userId) {
    const campaign = await campaignRepository.findById(campaignId);
    
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.creatorId !== userId) throw new ForbiddenError("Not creator");
    
    // Fetch related data
    const shares = await shareRepository.findByCampaignId(campaignId);
    const transactions = await transactionRepository.findByCampaignId(campaignId);
    
    return {
      campaign: {
        title: campaign.title,
        status: campaign.status,
        publishedAt: campaign.publishedAt
      },
      metrics: { ...campaign.metrics },
      shares: {
        total: shares.length,
        paid: shares.filter(s => s.isPaid).length,
        free: shares.filter(s => !s.isPaid).length,
        byChannel: groupBy(shares, "channel")
      },
      donations: {
        total: transactions.length,
        totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
        byMethod: groupBy(transactions, "paymentMethod")
      }
    };
  }
}
```

**campaignValidator.js - Zod Schemas**

```javascript
const Zod = require("zod");

const campaignSchema = Zod.object({
  title: Zod.string()
    .min(5, "Title too short")
    .max(200, "Title too long"),
  
  description: Zod.string()
    .max(2000, "Description too long"),
  
  needType: Zod.enum([
    "emergency_funding",
    "medical_bills",
    "rent_mortgage",
    "business_startup",
    // ... 96 more
  ]),
  
  campaignType: Zod.enum(["fundraising", "services", "business_growth"]),
  
  goals: Zod.array(
    Zod.object({
      goalType: Zod.enum(["money", "volunteers", "customers"]),
      targetAmount: Zod.number().positive(),
      description: Zod.string()
    }).strict()
  ).min(1),
  
  paymentMethods: Zod.array(
    Zod.object({
      type: Zod.enum(["paypal", "venmo", "cashapp", "bank", "crypto", "other"]),
      creatorInfo: Zod.string().min(1),
      isPrimary: Zod.boolean().optional()
    }).strict()
  ).min(1, "At least one payment method required"),
  
  location: Zod.object({
    address: Zod.string().min(1),
    lat: Zod.number(),
    long: Zod.number(),
    zipCode: Zod.string()
  }).strict()

});

module.exports = { campaignSchema };
```

### 6.2 Share & Reward Module

**shareService.js**

```javascript
class ShareService {
  
  async recordShare(campaignId, supporterId, channel) {
    // Get campaign
    const campaign = await campaignRepository.findById(campaignId);
    if (!campaign) throw new NotFoundError("Campaign not found");
    
    const { shareConfig } = campaign;
    
    // Determine if paid or free
    let isPaid = false;
    let rewardAmount = 0;
    
    if (shareConfig.isPaidSharingActive && shareConfig.currentBudgetRemaining > 0) {
      isPaid = true;
      rewardAmount = shareConfig.amountPerShare;
      
      // Deduct from budget
      const newBudget = shareConfig.currentBudgetRemaining - rewardAmount;
      await campaignRepository.updateShareBudget(campaignId, newBudget);
      
      // If budget depleted, disable paid sharing
      if (newBudget <= 0) {
        await campaignRepository.updateShareBudget(campaignId, 0);
      }
    }
    
    // Create share record
    const share = await shareRepository.create({
      shareId: generateId(),
      campaignId,
      supporterId,
      rewardAmount,
      isPaid,
      channel,
      status: "completed",
      createdAt: new Date()
    });
    
    // Update campaign metrics
    await campaignRepository.incrementMetric(campaignId, "totalShares", 1);
    
    // Award supporter with sweepstakes entry
    await sweepstakesService.addEntry(supporterId, "share_completed", isPaid);
    
    // Emit event for analytics
    publishEvent("share:recorded", {
      campaignId,
      supporterId,
      isPaid,
      rewardAmount
    });
    
    return share;
  }
  
  async reloadShareBudget(campaignId, userId, reloadAmount) {
    const campaign = await campaignRepository.findById(campaignId);
    
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.creatorId !== userId) throw new ForbiddenError("Not creator");
    
    // Validate amount (in cents)
    if (reloadAmount < 1000) {  // $10 minimum
      throw new ValidationError("Minimum reload is $10");
    }
    
    // Calculate platform fee (20%)
    const platformFee = Math.round(reloadAmount * 0.2);
    const netAmount = reloadAmount - platformFee;
    
    // Create transaction record
    const transaction = await transactionRepository.create({
      transactionId: generateId(),
      campaignId,
      supporterId: userId,
      amount: reloadAmount,
      paymentMethod: "share_budget_reload",
      transactionType: "share_budget_reload",
      platformFee,
      netAmount,
      status: "pending",  // manual verification step
      createdAt: new Date()
    });
    
    // Update share config (don't actually deduct from budget until verified)
    // Await manual admin verification
    
    publishEvent("share:budget_reload_requested", {
      campaignId,
      userId,
      amount: reloadAmount
    });
    
    return {
      transactionId: transaction._id,
      status: "pending_verification",
      message: "Reload requested. Admin will verify within 24 hours."
    };
  }
}
```

### 6.3 Donation & Transaction Module

**transactionService.js**

```javascript
class TransactionService {
  
  async recordDonation(campaignId, supporterId, amount, paymentMethod, proofUrl) {
    // Validate
    if (amount < 100) throw new ValidationError("Minimum donation is $1");
    
    // Calculate fees
    const platformFee = Math.round(amount * 0.2);  // 20%
    const netAmount = amount - platformFee;
    
    // Create transaction
    const transaction = await transactionRepository.create({
      transactionId: generateId(),
      campaignId,
      supporterId,
      amount,  // in cents
      paymentMethod,
      transactionType: "donation",
      platformFee,
      netAmount,
      status: "pending",
      proofUrl,  // optional screenshot
      createdAt: new Date()
    });
    
    // Update campaign metrics
    await campaignRepository.updateById(campaignId, {
      $inc: {
        "metrics.totalDonations": 1,
        "metrics.totalDonationAmount": amount
      },
      $addToSet: { "metrics.uniqueSupporters": supporterId }
    });
    
    // Award supporter with sweepstakes entry
    await sweepstakesService.addEntry(supporterId, "donation", {
      amount,
      campaignId
    });
    
    // Emit event
    publishEvent("donation:recorded", {
      transactionId: transaction._id,
      campaignId,
      supporterId,
      amount
    });
    
    return transaction;
  }
  
  async verifyTransaction(transactionId, adminId) {
    const transaction = await transactionRepository.findById(transactionId);
    
    if (!transaction) throw new NotFoundError("Transaction not found");
    
    // Update status
    const verified = await transactionRepository.updateById(transactionId, {
      status: "verified",
      isManuallyVerified: true,
      verifiedBy: adminId,
      verifiedAt: new Date()
    });
    
    // Log admin action
    await adminService.logAction(adminId, "verify_transaction", transactionId, {
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod
    });
    
    publishEvent("transaction:verified", {
      transactionId,
      amount: transaction.amount
    });
    
    return verified;
  }
  
  async getTransactionHistory(campaignId) {
    return await transactionRepository.findByCampaignId(campaignId);
  }
}
```

### 6.4 Sweepstakes & Drawing Module

**sweepstakesService.js**

```javascript
class SweepstakesService {
  
  async addEntry(userId, entrySource, metadata = {}) {
    // Get current drawing period
    const currentPeriod = getCurrentSweepstakesPeriod();  // "2026-06"
    
    // Find or create submission
    let submission = await sweepstakesRepository.findSubmission(userId, currentPeriod);
    
    if (!submission) {
      // First entry for this user this period
      submission = await sweepstakesRepository.createSubmission({
        submissionId: generateId(),
        userId,
        drawingPeriod: currentPeriod,
        entryCount: 1,
        entrySource: [{ source: entrySource, count: 1, addedAt: new Date() }],
        email: user.email,
        fullName: user.displayName,
        createdAt: new Date()
      });
    } else {
      // Increment entry count
      const existingSource = submission.entrySource.find(e => e.source === entrySource);
      
      if (existingSource) {
        existingSource.count += 1;
      } else {
        submission.entrySource.push({
          source: entrySource,
          count: 1,
          addedAt: new Date()
        });
      }
      
      submission.entryCount += 1;
      submission.updatedAt = new Date();
      
      await sweepstakesRepository.updateSubmission(submission._id, submission);
    }
    
    publishEvent("sweepstakes:entry_added", {
      userId,
      entrySource,
      entryCount: submission.entryCount
    });
    
    return submission;
  }
  
  async executeDrawing(drawingPeriod) {
    // Get all entries for this period
    const allSubmissions = await sweepstakesRepository.findSubmissionsByPeriod(drawingPeriod);
    
    if (allSubmissions.length === 0) {
      throw new ValidationError("No entries for drawing period");
    }
    
    // Build weighted random selection
    const weights = [];
    const submissions = [];
    
    for (const submission of allSubmissions) {
      weights.push(submission.entryCount);  // weight by entry count
      submissions.push(submission);
    }
    
    // Weighted random selection (implement using alias method or roulette wheel)
    const randomSeed = generateRandomSeed();
    const winningSubmissionIndex = weightedRandom(weights, randomSeed);
    const winnerSubmission = submissions[winningSubmissionIndex];
    
    // Create drawing record
    const drawing = await sweepstakesRepository.createDrawing({
      drawingId: generateId(),
      drawingPeriod,
      drawingDate: new Date(),
      prizeAmount: 50000,  // $500 in cents
      winningUserId: winnerSubmission.userId,
      winningSubmissionId: winnerSubmission._id,
      status: "drawn",
      metadata: {
        totalEntries: allSubmissions.reduce((sum, s) => sum + s.entryCount, 0),
        totalParticipants: allSubmissions.length,
        randomSeed
      },
      executedAt: new Date()
    });
    
    // Notify winner
    await notificationService.sendWinnerNotification(winnerSubmission.userId, {
      prizeAmount: 50000,
      claimDeadline: addDays(new Date(), 30)
    });
    
    // Update drawing status
    await sweepstakesRepository.updateDrawing(drawing._id, {
      status: "notified",
      winnerNotifiedAt: new Date()
    });
    
    publishEvent("sweepstakes:drawing_executed", {
      drawingPeriod,
      winnerUserId: winnerSubmission.userId,
      totalEntries: allSubmissions.length,
      totalParticipants: allSubmissions.length
    });
    
    return drawing;
  }
  
  async claimPrize(drawingId, userId) {
    const drawing = await sweepstakesRepository.findDrawing(drawingId);
    
    if (!drawing) throw new NotFoundError("Drawing not found");
    if (drawing.winningUserId !== userId) {
      throw new ForbiddenError("Not the winner");
    }
    if (drawing.status !== "notified" && drawing.status !== "drawn") {
      throw new ValidationError("Prize already claimed or expired");
    }
    
    // Get user's preferred payment method
    const user = await userRepository.findById(userId);
    const primaryMethod = user.paymentMethods.find(m => m.isPrimary);
    
    if (!primaryMethod) {
      throw new ValidationError("No payment method configured");
    }
    
    // Update drawing
    await sweepstakesRepository.updateDrawing(drawingId, {
      status: "claimed",
      claimedAt: new Date(),
      paymentMethod: primaryMethod.type
    });
    
    // TODO: Actually send $500 (Phase 2)
    // For MVP: Just log that prize claimed, manual payout follows
    
    publishEvent("sweepstakes:prize_claimed", {
      drawingId,
      userId,
      prizeAmount: drawing.prizeAmount
    });
    
    return { message: "Prize claimed! We'll send the $500 to your account within 3 business days." };
  }
}
```

### 6.5 Notification Module (Email)

**notificationService.js**

```javascript
class NotificationService {
  
  async sendWinnerNotification(userId, details) {
    const user = await userRepository.findById(userId);
    
    const emailContent = await templates.render("sweepstakes_winner", {
      displayName: user.displayName,
      prizeAmount: formatCurrency(details.prizeAmount),
      claimDeadline: details.claimDeadline.toDateString(),
      claimUrl: `${process.env.FRONTEND_URL}/sweepstakes/claim/${generateClaimToken(userId)}`
    });
    
    await sendgridService.send({
      to: user.email,
      subject: "🎉 You Won $500 on HonestNeed!",
      html: emailContent
    });
    
    logger.info(`Winner notification sent to ${user.email}`);
  }
  
  async sendCampaignPublishedNotification(campaignId) {
    const campaign = await campaignRepository.findById(campaignId);
    const creator = await userRepository.findById(campaign.creatorId);
    
    const emailContent = await templates.render("campaign_published", {
      creatorName: creator.displayName,
      campaignTitle: campaign.title,
      campaignUrl: `${process.env.FRONTEND_URL}/campaigns/${campaignId}`,
      qrCodeUrl: campaign.media.qrCodeUrl
    });
    
    await sendgridService.send({
      to: creator.email,
      subject: `Your campaign "${campaign.title}" is now live!`,
      html: emailContent
    });
  }
  
  async sendShareNotification(supporterId, campaignTitle, rewardAmount) {
    const supporter = await userRepository.findById(supporterId);
    
    if (!supporter.preferences.emailNotifications) return;
    
    const emailContent = await templates.render("share_reward", {
      supporterName: supporter.displayName,
      campaignTitle,
      rewardAmount: formatCurrency(rewardAmount),
      rewardUrl: `${process.env.FRONTEND_URL}/rewards`
    });
    
    await sendgridService.send({
      to: supporter.email,
      subject: `You earned ${formatCurrency(rewardAmount)} for sharing!`,
      html: emailContent
    });
  }
}
```

---

**[Due to length constraints, continuing with sections 7-16 in next part...]**

## TABLE OF CONTENTS (Continued)

- **Section 7:** End-to-End Backend Flows (9 detailed workflows)
- **Section 8:** Complete API Specification (All endpoints with payloads)
- **Section 9:** Validation & Business Rules
- **Section 10:** Security, Privacy & Compliance
- **Section 11:** Error Handling & Edge Cases
- **Section 12:** Testing Strategy
- **Section 13:** Deployment & Operations
- **Section 14:** Implementation Phases (Sprint breakdown)
- **Section 15:** Open Questions Resolution (All 21 answered)
- **Section 16:** Final Backend Build Plan (Week-by-week)

---

## 7. END-TO-END BACKEND WORKFLOWS

### 7.1 Campaign Creation Workflow

**Actors:** Creator (user)  
**Entry Point:** Frontend form submissions  
**Exit Point:** Active campaign on platform

**Flow:**

```
STEP 1: User fills campaign form (frontend)
  - Title, description, need type, goals, payment methods
  - Selects meters (money, helping hands, customers)
  - Upload image (optional)
  - Set share budget (optional)

STEP 2: Submit to POST /campaigns
  Request headers: Authorization: Bearer [JWT]
  Request body: { campaign data }
  
STEP 3: Backend validation
  Controller receives request
  ├─ Extract user ID from JWT
  ├─ Validate payload against campaignSchema (Zod)
  ├─ Check user has "creator" role
  └─ Return 400 if invalid
  
STEP 4: Business logic processing
  Service method: campaignService.createCampaign()
  ├─ Normalize data (trim strings, convert dollars to cents)
  ├─ Encrypt payment methods
  ├─ Generate QR code
  ├─ Create campaign_id
  └─ Set status = "draft"
  
STEP 5: Database write
  Repository: campaignRepository.create(normalized)
  └─ Insert document into campaigns collection
  └─ MongoDB returns _id
  
STEP 6: Emit events
  publishEvent("campaign:created", { campaignId, userId })
  
STEP 7: Return response (201)
  {
    campaignId: "CAMP-2026-001-ABC123",
    status: "draft",
    qrCodeUrl: "https://honestneed.s3.../qr_CAMP-2026-001-ABC123.png",
    createdAt: "2026-04-01T10:30:00Z"
  }
  
STEP 8: Frontend receives campaign
  - User sees "Campaign saved as draft"
  - Shows QR code preview
  - Offers option to "Publish Now" or "Edit"
  
STEP 9: User clicks "Publish"
  POST /campaigns/{campaignId}/publish
  
STEP 10: Backend publish validation
  Service: campaignService.publishCampaign()
  ├─ Verify user is creator
  ├─ Verify status is "draft"
  ├─ Validate campaign is complete
  ├─ Update status → "active"
  ├─ Set publishedAt timestamp
  ├─ Award sweepstakes entry (+1 for campaign creation)
  └─ Emit "campaign:published" event
  
STEP 11: Return 200
  {
    status: "active",
    publishedAt: "2026-04-01T10:32:00Z",
    message: "Campaign is now live!"
  }
  
STEP 12: Event processing (async)
  - Send email to creator: "Your campaign is live"
  - Log analytics event
  - Add to campaign feed index (for randomization)

RESULT: Campaign appears on main feed, discoverable by supporters
```

### 7.2 Supporter Browse & Donate Workflow

**Actors:** Supporter (user)  
**Entry Point:** Homepage feed  
**Exit Point:** Donation recorded

**Flow:**

```
STEP 1: User visits homepage
  ├─ Browser makes GET /campaigns?page=1&limit=20
  └─ Headers: Authorization: Bearer [JWT] (optional for anonymous)
  
STEP 2: Backend fetch campaigns
  Controller: campaignController.listCampaigns()
  ├─ Parse query params (page, limit, filters)
  ├─ Build MongoDB query
  ├─ Filter: status = "active"
  ├─ Apply geolocation filter (user's location)
  ├─ Sort by: publishedAt DESC (newest first)
  └─ Pagination: skip=(page-1)*limit, limit=20
  
STEP 3: Execute database query
  Repository finds 20 active campaigns
  ├─ Return campaign cards (title, image, meters, creator)
  └─ Decrypt payment methods (prepare display)
  
STEP 4: Apply randomization algorithm
  Service: algorithmService.applyBlessing()
  ├─ Base weight: 1 per campaign
  ├─ Freshness bonus: newer campaigns +2-3
  ├─ No boosted campaigns yet (free shares only)
  ├─ Weighted random shuffle
  └─ Return randomized campaign list
  
STEP 5: Return API response (200)
  {
    campaigns: [
      {
        campaignId: "CAMP-2026-001-ABC123",
        title: "Help My Coffee Shop Grow",
        creatorName: "Sarah",
        image: "https://...",
        meters: [
          { type: "customers", target: 50, current: 12 }
        ],
        paymentMethods: ["venmo", "paypal", "cashapp"]
      },
      ...
    ],
    totalCount: 1423,
    page: 1,
    hasMore: true
  }
  
STEP 6: Frontend displays campaigns
  - User sees campaign cards
  - Supports pagination
  - Can click any campaign for details
  
STEP 7: User clicks a campaign
  GET /campaigns/{campaignId}
  
STEP 8: Backend returns campaign detail
  - Full description
  - Current meter progress
  - All payment methods with creator info
  - Share options
  - Donation button
  
STEP 9: User clicks "Donate"
  POST /donations with:
  {
    campaignId: "CAMP-2026-001-ABC123",
    amount: 5000,  // $50 in cents
    paymentMethod: "venmo",
    proofUrl: null   // optional screenshot
  }
  
STEP 10: Backend validates donation
  Controller: donationController.recordDonation()
  ├─ Verify campaignId exists
  ├─ Verify amount >= $1
  ├─ Verify payment method is accepted
  └─ Verify user not creator (self-donation blocked)
  
STEP 11: Calculate fees and create transaction
  Service: transactionService.recordDonation()
  ├─ amount = 5000 cents ($50)
  ├─ platformFee = 5000 * 0.2 = 1000 (20% = $10)
  ├─ netAmount = 4000 ($40 to creator)
  ├─ Create transaction record:
  │  - transactionId, campaignId, supporterId
  │  - amount, transactionType: "donation"
  │  - status: "pending" (needs manual verification)
  └─ Return transaction ID
  
STEP 12: Update campaign metrics
  campaignRepository.incrementMetrics()
  ├─ totalDonations += 1
  ├─ totalDonationAmount += 5000
  ├─ Add supporterId to uniqueSupporters set
  └─ Commit to DB
  
STEP 13: Award sweepstakes entry
  sweepstakesService.addEntry(supporterId, "donation")
  ├─ Get current period (e.g., "2026-06")
  ├─ Find or create submission for user
  ├─ Increment entryCount
  ├─ Add entry source: donation
  └─ Each $1 donation = 1 entry (future: scale by amount)
  
STEP 14: Emit events
  publishEvent("donation:recorded", { transactionId, campaignId, supporterId })
  
STEP 15: Return response (201)
  {
    transactionId: "TXN-...",
    status: "pending",
    message: "Your donation is being recorded. Show creator payment method to complete transfer.",
    paymentDetails: {
      method: "venmo",
      creatorHandle: "$sarah_coffee",
      amount: "$50",
      qrCode: "https://..."
    }
  }
  
STEP 16: Frontend shows supporter next steps
  - Display creator's payment details (Venmo QR, etc.)
  - Instructions: "Open Venmo, scan QR, send $50"
  - Button: "I've sent the payment" (marks complete)
  - Button: "Cancel donation"
  
STEP 17: Admin verification (manual, Phase 1)
  Admin dashboard: flagged "pending_donation" transactions
  ├─ Review donation amount matches
  ├─ Spot-check: does supporter seem legitimate?
  ├─ Click "Verify" button
  └─ Transaction status → "verified"
  
STEP 18: Campaign creator notified
  Email: "You received a $50 donation!"
  - From: Sarah
  - Meter updated: now shows new progress
  
RESULT: Donation recorded, supporter has sweepstakes entry, meter updated
```

### 7.3 Share & Earn Workflow

**Actors:** Supporter, Campaign Creator, Potential New Supporters  
**Entry Point:** "Share & Earn" button on campaign  
**Exit Point:** Share recorded with reward tracked

**Flow:**

```
STEP 1: Supporter clicks "Share & Earn"
  GET /campaigns/{campaignId}/share-options
  
STEP 2: Backend returns share config
  {
    isPaidSharingActive: true,
    rewardPerShare: 250,  // $2.50 per share in cents
    remainingBudget: 4750,  // $47.50 left
    channels: ["email", "facebook", "tiktok", "venmo"]
  }
  
STEP 3: Frontend shows share options
  "You can earn $2.50 for each person who supports through your link!"
  - Email
  - Facebook
  - TikTok
  - QR code
  
STEP 4: Supporter selects channel (e.g., "Email")
  POST /shares with:
  {
    campaignId: "CAMP-2026-001-ABC123",
    channel: "email",
    recipientEmail: "friend@example.com"
  }
  
STEP 5: Backend validates and records share
  Service: shareService.recordShare()
  ├─ Verify campaign exists
  ├─ Verify paid sharing still active
  ├─ Create share record:
  │  - shareId, campaignId, supporterId, channel
  │  - rewardAmount = $2.50, isPaid = true
  └─ Update campaign shareConfig:
     └─ currentBudgetRemaining -= $2.50
  
STEP 6: Deduct from budget
  Campaign's share budget: $50 → $47.50
  
STEP 7: Send email to recipient (async)
  Email template: "Sarah wants you to support her coffee shop"
  ├─ Campaign details
  ├─ Unique referral link: /campaigns/CAMP-001?ref=[shareId]
  ├─ Call-to-action: "Support Now"
  └─ CTA button links to campaign
  
STEP 8: Emit events
  publishEvent("share:recorded", { campaignId, supporterId, isPaid: true, rewardAmount: 250 })
  
STEP 9: Sweepstakes entry
  sweepstakesService.addEntry(supporterId, "share_completed")
  ├─ Award 0.5 entry per share (paid or free)
  └─ Total entries for this supporter: +0.5
  
STEP 10: Return response (201)
  {
    shareId: "SHARE-...",
    status: "completed",
    reward: {
      amount: "$2.50",
      currency: "USD",
      claimUrl: "https://honestneed.com/rewards/claim/[shareId]"
    },
    message: "Share sent! You'll earn $2.50 if they support. Share again for more rewards!"
  }
  
STEP 11: Frontend shows confirmation
  ✅ "Email sent to friend@example.com"
  "Next share costs $2.50 from remaining budget of $47.50"
  
STEP 12: Recipient receives email
  - Clicks link in email
  - Lands on campaign page with ?ref=[shareId]
  
STEP 13: Recipient supports campaign
  - Donates $10 (or shares, or volunteers)
  - This new action generates its own workflow
  
STEP 14: Supporter sees reward earned
  Dashboard: "Rewards Earned" section
  ├─ $2.50 credited to virtual wallet
  ├─ Can view all pending rewards
  ├─ Can request payout (Phase 2)
  └─ Rewards expire after 90 days if unclaimed
  
STEP 15: Optional - Budget runs out
  Creator's share budget depletes to $0
  ├─ shareService automatically disables isPaidSharingActive
  ├─ Future shares still recorded (status: free)
  ├─ Supporters can still share for no reward
  ├─ Encourage supporters to "boost this campaign" by funding share budget
  
RESULT: Share recorded, reward deducted from budget, supporter incentivized to share again
```

### 7.4 Sweepstakes Drawing Workflow

**Actors:** System (scheduled job)  
**Entry Point:** June 3, 2026 at 12:00 PM UTC  
**Exit Point:** Winner announced, notified

**Flow:**

```
STEP 1: Scheduled job executes
  CronJob triggers at June 3, 2026 12:00 PM
  └─ Job: sweepstakesDrawing.js → executeMonthlySweepstakes()
  
STEP 2: Fetch all entries for current period
  Period = "2026-06"
  
  Query: db.sweepstakes_submissions.find({ drawingPeriod: "2026-06" })
  
  Results:
  [
    { userId: "user-A", entryCount: 15 },
    { userId: "user-B", entryCount: 8 },
    { userId: "user-C", entryCount: 3 },
    ...
    { userId: "user-Z", entryCount: 1 }
  ]
  
STEP 3: Validate entries
  ├─ Total participants: 847
  ├─ Total entries: 12,453
  ├─ Min entries: 1, Max entries: 87
  ├─ All entries verified: ✓
  
STEP 4: Build weighted probability distribution
  
  Entries by source:
  - Donation: total 8,000 entries
  - Share completion: total 2,100 entries
  - Campaign creation: total 1,200 entries
  - QR scan: total 1,153 entries
  
  User probability distribution:
  - user-A: 15/12,453 = 0.12%
  - user-B: 8/12,453 = 0.06%
  - user-C: 3/12,453 = 0.02%
  
STEP 5: Perform weighted random selection
  Algorithm: Vose's Alias Method (efficient O(1) sampling)
  
  ├─ Generate random seed: seed=987654321
  ├─ Select winning submission: user-M with 42 entries
  ├─ Probability of winning: 42/12,453 = 0.34%
  
STEP 6: Create drawing record
  
  db.sweepstakes_drawings.insertOne({
    drawingId: "DRAW-2026-06-001",
    drawingPeriod: "2026-06",
    drawingDate: ISODate("2026-06-03T12:00:00Z"),
    prizeAmount: 50000,  // $500
    winningUserId: ObjectId("user-M"),
    winningSubmissionId: ObjectId("submission-M"),
    status: "drawn",
    metadata: {
      totalEntries: 12453,
      totalParticipants: 847,
      randomSeed: "987654321"
    },
    executedAt: ISODate("2026-06-03T12:00:00Z")
  })
  
STEP 7: Send winner notification
  Service: notificationService.sendWinnerNotification()
  
  Get winner user details
  ├─ email: "user-m@gmail.com"
  ├─ displayName: "Marcus"
  ├─ preferredPaymentMethod: "venmo"
  
  Send email:
  ┌─────────────────────────────────────────┐
  │ 🎉 YOU WON $500 ON HONESTNEED!         │
  │                                         │
  │ Hi Marcus,                              │
  │                                         │
  │ Congratulations! You were randomly     │
  │ selected to win $500 in our June 2026  │
  │ sweepstakes drawing.                   │
  │                                         │
  │ Your entry was awarded for:            │
  │ - 1 campaign created                   │
  │ - 3 donations made                     │
  │ - 38 shares completed                  │
  │ Total: 42 entries                      │
  │                                         │
  │ CLAIM YOUR PRIZE                       │
  │ [Button: Claim $500]                   │
  │                                         │
  │ Claim by: July 3, 2026                │
  │                                         │
  │ Your payment method on file:           │
  │ Venmo (@marcus_v)                      │
  │                                         │
  │ We'll send the $500 within 2 business  │
  │ days of claiming.                      │
  │                                         │
  │ Thank you for supporting HonestNeed!  │
  │ See good. Do good.                     │
  │                                         │
  │ - The HonestNeed Team                  │
  └─────────────────────────────────────────┘
  
STEP 8: Update drawing record
  db.sweepstakes_drawings.updateOne(
    { drawingId: "DRAW-2026-06-001" },
    {
      status: "notified",
      winnerNotifiedAt: ISODate("2026-06-03T12:00:05Z")
    }
  )
  
STEP 9: Emit analytics event
  publishEvent("sweepstakes:drawing_executed", {
    drawingPeriod: "2026-06",
    winnerUserId: "user-M",
    prizeAmount: 50000,
    totalEntries: 12453,
    totalParticipants: 847
  })
  
STEP 10: Log drawing to admin dashboard
  Event visible: Admin sees "June 2026 drawing completed"
  ├─ Winner: Marcus
  ├─ Total entries: 12,453
  ├─ Odds: 1 in 847
  ├─ Prize claimed: [Awaiting claim]
  
STEP 11: Log to audit trail
  db.admin_logs.insertOne({
    adminId: "system",
    action: "execute_sweepstakes_drawing",
    targetType: "drawing",
    targetId: ObjectId("drawing-record"),
    reason: "Scheduled monthly drawing",
    details: { period: "2026-06", entries: 12453 }
  })

STEP 12: Schedule next drawing
  Next drawing: August 3, 2026
  └─ CronJob updated for next period
  
STEP 13 (Future - Phase 2): Support claim verification
  When winner clicks "Claim" button
  ├─ Verify account still active (not deleted)
  ├─ Verify payment method still valid
  ├─ Record claim in drawing record
  ├─ Initiate payout (send $500 via PayPal/Venmo API)
  ├─ Track transaction for accounting
  └─ Send confirmation email
  
RESULT: Prize drawing fair & transparent, winner notified, transparent history for auditing
```

---

## 8. COMPLETE API SPECIFICATION

### 8.1 Authentication Endpoints

```
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh-token
POST /auth/password-reset
POST /auth/password-reset/confirm
GET /auth/verify-email?token=...
```

**Full specifications in separate API docs file** (too long for this document)

### 8.2 Campaign Endpoints

```
POST   /campaigns                    Create campaign (draft)
GET    /campaigns                    List campaigns (with filters)
GET    /campaigns/{id}               Get campaign detail
PUT    /campaigns/{id}               Update campaign (draft only)
DELETE /campaigns/{id}               Archive campaign

POST   /campaigns/{id}/publish       Activate campaign
POST   /campaigns/{id}/pause         Pause active campaign
POST   /campaigns/{id}/complete      End campaign

GET    /campaigns/{id}/analytics     View creator analytics
PUT    /campaigns/{id}/share-config  Update share budget
POST   /campaigns/{id}/reload-share  Request budget reload
```

### 8.3 Share/Donation Endpoints

```
POST   /campaigns/{id}/donate        Record donation
POST   /campaigns/{id}/share         Record share
GET    /campaigns/{id}/shares        List campaign shares

POST   /donations/{id}/verify        Admin verify donation
GET    /transactions                 Get user transactions
```

### 8.4 Sweepstakes Endpoints

```
GET    /sweepstakes/current          Current drawing info
POST   /sweepstakes/entries          Add entry
GET    /sweepstakes/entries          View user entries
POST   /sweepstakes/claim/{id}       Claim prize

POST   /admin/sweepstakes/draw       Execute drawing (admin)
GET    /admin/sweepstakes/history    View past drawings
```

### 8.5 User Endpoints

```
GET    /users/{id}                   Get user profile
PUT    /users/{id}                   Update profile
POST   /users/{id}/payment-methods   Add payment method
PUT    /users/{id}/payment-methods/{mid}  Update method
DELETE /users/{id}/payment-methods/{mid}  Delete method
```

### 8.6 Admin Endpoints

```
GET    /admin/campaigns              List all campaigns
PUT    /admin/campaigns/{id}/flag    Flag campaign
PUT    /admin/campaigns/{id}/suspend Suspend campaign

GET    /admin/users                  List users
PUT    /admin/users/{id}/suspend     Suspend user

GET    /admin/analytics              Platform analytics
GET    /admin/transactions           Transaction history
GET    /admin/revenue                Revenue report

POST   /admin/sweepstakes/draw       Execute drawing
```

---

## 9. VALIDATION & BUSINESS RULES

### 9.1 Campaign Validation Rules

```javascript
// Title
- Minimum length: 5 characters
- Maximum length: 200 characters
- Cannot be blank
- Must be unique per creator per month (prevent spam)

// Description
- Maximum 2,000 characters
- Must have at least 20 characters
- Cannot contain profanity (check against word list)

// Goals
- At least 1 goal required
- Money goal: $1 minimum, $9,999,999 maximum
- Stored and processed in cents (multiply by 100)
- Volunteers goal: 1 minimum, no max
- Customers goal: 1 minimum, no max

// Need Type
- Must select from 100+ defined category enum
- Cannot be blank
- Affects algorithm visibility

// Payment Methods
- Minimum 1 required
- Maximum 6 payment methods per campaign
- All fields must be encrypted before storage
- Venmo/CashApp: must have valid $tag/@username format
- PayPal: must have valid email
- Crypto: must have valid wallet address format
- Bank: routing number must be 9 digits

// Share Budget
- Minimum $10 (1000 cents)
- Maximum $1,000,000 (100000000 cents)
- Amount per share: $0.10 to $100
- Budget must be set before shares go live

// Image
- Maximum 10MB file size
- Supported formats: JPG, PNG, WebP
- Minimum resolution: 320x320px
- Maximum resolution: 4000x4000px
```

### 9.2 Transaction Validation Rules

```javascript
// Donation Amount
- Minimum: $1 (100 cents)
- Maximum: $10,000 (1000000 cents)
- Must be positive integer (no fractions)

// Payment Method
- Must be one creator selected on campaign
- PayPal donations: processed via PayPal API (Phase 2)
- Venmo donations: manual verification initially

// Supporter
- Cannot donate to own campaign
- Can donate multiple times to same campaign
- Cannot donate zero or negative amount

// Transaction Status
- "pending" → awaiting verification
- "verified" → confirmed by admin
- "failed" → user cancelled or error occurred
```

### 9.3 Share Validation Rules

```javascript
// Share Recording
- Can only record share if campaign status = "active"
- Can only share if campaign visibility allows it
- Cannot share same campaign >10 times from same IP within 1 hour (anti-spam)

// Share Budget Deduction
- Only deduct if isPaidSharingActive = true
- Only deduct if budget > amountPerShare
- If budget becomes ≤ 0, disable paid sharing (auto)
- Deduction is permanent (cannot roll back)

// Reward Payout
- Paid shares: deduct immediately upon recording
- Rewards valid for 90 days
- After 90 days, unclaimed rewards forfeited
```

### 9.4 Sweepstakes Validation Rules

```javascript
// Entry Eligibility
- User must be 18+ years old (assumed at signup, verify no data)
- Cannot be from restricted states (varies by jurisdiction)
- Can have unlimited entries (no cap)
- Entries cumulative within a period (June 2026 = one period)

// Entry Sources
- Campaign created: +1 entry (one-time only)
- Donation made: +1 entry per donation (any amount)
- Share completed: +0.5 entry per share
- QR scan: +1 entry per scan

// Drawing Mechanics
- One winner per drawing period
- Winner selected via weighted random (entry count = weight)
- Multiple drawings per year (June, August, etc.)
- Prize: $500 or configurable amount
- Claim window: 30 days from notification
- Unclaimed prizes: rollover to next period or forfeited

// Compliance
- No purchase required (free entry eligibility)
- Terms & conditions must be posted
- Geo-blocking for restricted states
- Sweepstakes registration may be required in some states
```

### 9.5 User Validation Rules

```javascript
// Email
- Must be unique across platform
- Must be valid email format
- Must be verified before certain actions
- Cannot change email after verification without re-verification

// Password
- Minimum 8 characters
- Must contain: uppercase, lowercase, number, special char
- Cannot be reused (prevent cycling)
- Must expire (Phase 2: force change annually)

// Display Name
- Minimum 2 characters
- Maximum 50 characters
- Can contain letters, numbers, spaces, hyphens
- Cannot impersonate real celebrities (check against list)

// Profile
- Bio: max 500 characters
- Location: required for geographic filtering
- Phone: optional, verified via SMS (Phase 2)

// Account Status
- Active: normal operation
- Suspended: cannot create campaigns, comment, but can view
- Deleted: soft-delete, data retained 90 days
```

---

## 10. SECURITY, PRIVACY & COMPLIANCE

### 10.1 Data Encryption Strategy

**At-Rest Encryption:**

```javascript
// Sensitive fields encrypted before database storage
ENCRYPTED FIELDS:
- user.paymentMethods[].creatorInfo (PayPal email, bank account, etc.)
- campaign.paymentMethods[].creatorInfo
- user.phoneNumber (optional)

ENCRYPTION METHOD:
- Use AES-256-GCM
- Key stored in environment variable (rotate quarterly)
- Each record encrypted with unique IV (stored with ciphertext)
- Use bcrypt for passwords (never encrypt, only hash)

Example:
  Raw: "user@paypal.com"
  Encrypted: "aKf9xJ2mK...encrypted...iQ=="
  IV: "rL8pQ2x...initialization_vector...yM"
  Stored: { encryptedData: "aKf9xJ2mK...", iv: "rL8pQ2x..." }
```

**In-Transit Encryption:**

```javascript
// All API traffic over HTTPS/TLS 1.2+
// Certificate: Let's Encrypt (auto-renew)
// HSTS header: "Strict-Transport-Security: max-age=31536000"
// No sensitive data in URLs (use POST body instead)
```

### 10.2 Authentication Security

**JWT Implementation:**

```javascript
// Token signing
- Algorithm: RS256 (asymmetric, more secure for high-volume)
- Private key: stored in KMS (AWS Secrets Manager or HashiCorp Vault)
- Public key: available to clients for verification
- Secret rotation: quarterly

// Token validation
- Check signature (valid issuer key)
- Check expiration (not expired)
- Check audience (token for correct app)
- Check user still active (not suspended)

// Rate limiting
- Login attempts: 5 failures → 15-minute lockout
- API calls: 100/minute per user (adjust based on usage patterns)
- Registration: 3 accounts per IP per day

// Session security
- httpOnly flag: JS cannot access tokens (prevent XSS)
- Secure flag: only send over HTTPS
- SameSite: Strict (prevent CSRF)
```

### 10.3 RBAC & Permission Enforcement

```javascript
// Permission check middleware
Middleware: requirePermission("campaign:create")

const checkPermission = (permission) => {
  return async (req, res, next) => {
    // 1. Extract and validate JWT
    // 2. Query user roles from DB (don't trust token alone)
    // 3. Check if role has permission
    // 4. If not, return 403 Forbidden
    // 5. If yes, proceed to handler
  }
}

// Principle of least privilege
- Users get minimal permissions required
- Creator role: can only edit own campaigns
- Admin role: given explicitly, not self-service
- Supporters: cannot moderate or see admin tools
```

### 10.4 API Security

**Input Validation:**

```javascript
// All inputs validated before processing
VALIDATION LAYERS:
1. Schema validation (Zod)
   - Type checking (string, number, etc.)
   - Format validation (email, URL, etc.)
   - Range validation (min/max)

2. Business rule validation
   - Amount > 0
   - Campaign exists
   - User has permission

3. Sanitization
   - Remove HTML/JavaScript (prevent XSS)
   - Trim whitespace
   - Escape special characters for DB

// Reject request early if invalid
  if (!validated) return 400;
```

**Rate Limiting & DoS Prevention:**

```javascript
// Implement token bucket algorithm
- Per-user rate limit: 100 requests/minute
- Per-IP rate limit: 1000 requests/minute
- Spike limit: 50 requests in 10 seconds (block for 5 mins)

// Database query timeouts
- Max execution time: 5 seconds
- Max result set: 10,000 documents
- Pagination enforced (no "select all")
```

**CORS & CSRF:**

```javascript
// CORS configuration
const corsOptions = {
  origin: ["https://honestneed.com", "https://www.honestneed.com"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

// CSRF token for state-changing operations
- Issued: on GET /csrf-token
- Validated: on POST/PUT/DELETE
- Rotated: per session or request
```

### 10.5 Compliance

**GDPR (General Data Protection Regulation):**

```javascript
// User rights
- Data portability: GET /users/{id}/export (JSON of all data)
- Right to deletion: DELETE /users/{id} marks account deleted
- Retention: 90 days before permanent deletion
- Consent: explicit opt-in for marketing emails

// Data minimization
- Collect only what's needed
- Delete after purpose served
- Log all access to sensitive data
- Audit trail: who accessed what when
```

**HIPAA (if handling health-related campaigns):**

```javascript
// Not primary concern for MVP (not a healthcare app)
// But if campaigns involve medical fundraising:
- Encrypt health information at rest
- Limit access to authorized medical personnel only
- Implement audit logging for all access
- May require covered entity contract details
```

**CCPA (California Consumer Privacy Act):**

```javascript
// California residents have rights
- Data access: GET /users/{id}/export
- Deletion: DELETE /users/{id}
- Opt-out of sales: toggle in settings
- Non-discrimination: no penalty for exercising rights

// Business obligations
- Privacy notice: clearly posted
- Legitimate interest: transparent about data use
- Vendor contracts: third-party processors (SendGrid, etc.) must comply
```

**Sweepstakes Compliance:**

```javascript
// US state regulations vary widely
RESTRICTED STATES (may prohibit):
- Florida, New York, Washington, Hawaii (others TBD - legal review required)

IMPLEMENTATION:
- Geo-block entries from restricted states (IP geolocation + VPN detection)
- Terms & conditions posted
- Odds published (1 in X)
- No-purchase-necessary explicitly stated
- Compliance registration in states requiring it

DOCUMENTATION:
- Maintain record of:
  - Total participants
  - Entries per person (for fairness verification)
  - Drawing procedures (random seed, algorithm used)
  - Offer period dates
  - Claim process and deadline
```

**PCI-DSS Compliance:**

```javascript
// Phase 1 (MVP): Not processing credit cards directly
- Using PayPal, Venmo, CashApp (third-party processors)
- Don't store full card numbers
- Don't transmit card data ourselves

// Phase 2 (if integrating Stripe):
- Must achieve PCI-DSS Level 1 compliance
- External audits: quarterly
- Penetration testing: annual
- Tokenize card data (Stripe handles actual cards)
- Encrypt transmission (TLS 1.2+)
```

---

## 11. ERROR HANDLING & EDGE CASES

### 11.1 Standard Error Response Format

```javascript
// All errors return JSON with consistent structure
{
  error: {
    code: "CAMPAIGN_NOT_FOUND",
    message: "The campaign you're looking for doesn't exist",
    statusCode: 404,
    timestamp: "2026-04-01T10:30:00Z",
    requestId: "req-abc-123",  // for tracking
    details: {
      campaignId: "CAMP-2026-001-ABC123",
      explanation: "Campaign may have been deleted or archived"
    }
  }
}

// HTTP status codes
200 OK
201 Created
204 No Content
400 Bad Request (validation error)
401 Unauthorized (no JWT or invalid)
403 Forbidden (valid JWT, but no permission)
404 Not Found (resource doesn't exist)
409 Conflict (state violation, e.g., can't edit active campaign)
429 Too Many Requests (rate limited)
500 Internal Server Error
503 Service Unavailable
```

### 11.2 Common Edge Cases & Handling

**Campaign Creation with Image:**

```javascript
EDGE CASE: User uploads 15MB image (exceeds 10MB limit)
HANDLING:
  1. Check file size before uploading to storage
  2. Return 400: "Image too large. Max 10MB."
  3. Don't waste bandwidth on upload
  4. Log attempt (potential abuse)

EDGE CASE: User uploads .exe file masquerading as .jpg
HANDLING:
  1. Validate actual file type (magic bytes, not extension)
  2. Return 400: "Invalid file type"
  3. Restrict allowed MIME types: image/jpeg, image/png, image/webp
```

**Share Budget Depletion:**

```javascript
EDGE CASE: Share budget = $5, next share costs $2.50
  Remainder: $2.50
HANDLING:
  1. Allow share to be recorded
  2. Deduct $2.50
  3. New budget = $0
  4. Automatically disable isPaidSharingActive
  5. Log: "Share budget depleted"

EDGE CASE: Creator tries to reload share budget with $0
HANDLING:
  1. Validate amount > $10 (minimum reload)
  2. Return 400: "Minimum reload is $10"
  3. Don't process zero-amount transactions
```

**Donation While Campaign Deleted:**

```javascript
EDGE CASE: User clicks "Donate" but campaign was just archived
HANDLING:
  1. Fetch campaign in transaction
  2. Check status != "archived"
  3. If archived: Return 410 Gone
  4. Don't allow donations to inactive campaigns
  5. Message: "This campaign is no longer accepting support"
```

**Sweepstakes Drawing with Zero Entries:**

```javascript
EDGE CASE: Drawing period arrives but no entries recorded
HANDLING:
  1. Query db.sweepstakes_submissions for period
  2. If count = 0:
    a. Log warning
    b. Skip drawing
    c. Roll prize to next period
    d. Send admin notification
  3. Prevent drawing with no participants
```

**User Account Deleted Mid-Transaction:**

```javascript
EDGE CASE: User deletes account while donation is "pending"
HANDLING:
  1. User account marked as deleted (soft-delete)
  2. User cannot login
  3. Donation transaction remains in DB for audit
  4. If creator: campaigns archived with notice "Creator account deleted"
  5. If supporter: removed from sweepstakes but historical data retained
  6. Support can resurrect account within 90 days
```

**Payment Method Info Exposed via API Timing Attack:**

```javascript
EDGE CASE: Attacker queries campaign endpoints looking for payment info patterns
HANDLING:
  1. Decrypt payment methods only when:
     a. User is campaign creator
     b. User is admin
     c. User is verified supporter making donation
  2. Don't expose existence of encrypted field
  3. All decryption takes ~same time (prevent timing attacks)
  4. Rate limit decryption requests
  5. Log all payment info access
```

**Campaign Title Contains SQL Injection Attempt:**

```javascript
EDGE CASE: title = "'; DROP TABLE campaigns; --"
HANDLING:
  1. Zod validation: must be string, max 200 chars
  2. Sanitize: remove any SQL keywords
  3. MongoDB uses driver library (not string concatenation)
  4. Injection impossible with parameterized queries
  5. Return 400: "Title contains invalid characters"
```

---

## 12. TESTING STRATEGY

### 12.1 Test Pyramid

```
        /\
       /  \  Manual Testing (UI, edge cases)
      /____\  ~5% of coverage effort

     /      \
    /  E2E   \  Integration Tests (full workflows)
   /          \  ~15% of effort
  /____________\

     /        \
    /  API     \  API Contract Tests
   /            \  ~20% of effort
  /______________\

       /      \
      / Unit   \  Unit Tests (functions, classes)
     /          \  ~60% of effort
    /____________\
```

### 12.2 Unit Tests

**Test Files:**

```javascript
// tests/unit/services/campaignService.test.js

describe("CampaignService", () => {
  
  describe("createCampaign", () => {
    
    it("should create draft campaign with valid input", () => {
      // Arrange
      const userId = "user-123";
      const campaignData = {
        title: "Help my refugee family",
        description: "We need $5000 for housing",
        needType: "housing_deposit",
        goals: [{ goalType: "money", targetAmount: 5000 }],
        paymentMethods: [{ type: "venmo", creatorInfo: "$myname" }],
        location: { ... }
      };
      
      // Act
      const result = await campaignService.createCampaign(userId, campaignData);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe("draft");
      expect(result.creatorId).toBe(userId);
      expect(result.goals[0].targetAmount).toBe(500000);  // 5000 * 100 cents
    });
    
    it("should reject campaign with title < 5 chars", () => {
      const campaignData = { title: "Hi", ... };
      
      expect(() => campaignService.createCampaign(userId, campaignData))
        .toThrow(ValidationError);
    });
    
    it("should encrypt payment method before storing", async () => {
      const result = await campaignService.createCampaign(userId, campaignData);
      
      expect(result.paymentMethods[0].creatorInfo).not.toBe("$myname");  // encrypted
      expect(result.paymentMethods[0].creatorInfo).toMatch(/^[a-zA-Z0-9+=\/]+$/);
    });
    
    it("should generate QR code with correct URL", async () => {
      mockQrCodeService.generate.mockResolvedValue({
        url: "https://s3.../qr_CAMP-123.png",
        storageKey: "qr_CAMP-123"
      });
      
      const result = await campaignService.createCampaign(userId, campaignData);
      
      expect(result.media.qrCodeUrl).toContain("s3");
      expect(mockQrCodeService.generate).toHaveBeenCalled();
    });
  });
  
  describe("publishCampaign", () => {
    
    it("should fail if user is not creator", async () => {
      expect(() => campaignService.publishCampaign(campaignId, "different-user"))
        .toThrow(ForbiddenError);
    });
    
    it("should fail if campaign already published", async () => {
      const activeCampaign = { status: "active", creatorId: userId };
      mockCampaignRepository.findById.mockResolvedValue(activeCampaign);
      
      expect(() => campaignService.publishCampaign(campaignId, userId))
        .toThrow(ValidationError);
    });
    
    it("should award sweepstakes entry on publish", async () => {
      await campaignService.publishCampaign(campaignId, userId);
      
      expect(mockSweepstakesService.addEntry)
        .toHaveBeenCalledWith(userId, "campaign_created");
    });
  });
});
```

**Coverage targets:**
- Unit tests: 80%+ code coverage
- Services layer: 90%+
- Utils functions: 95%+
- Controllers: 60%+ (integration tested instead)

### 12.3 Integration Tests

**Test Files:**

```javascript
// tests/integration/campaigns.test.js

describe("Campaign Endpoints Integration", () => {
  
  beforeEach(async () => {
    // Setup: clear DB, seed fixtures
    await disconnectFromTestDB();
    await connectToTestDB();
    testUser = await createTestUser({ roles: ["creator"] });
    accessToken = generateTestJWT(testUser);
  });
  
  afterEach(async () => {
    await disconnectFromTestDB();
  });
  
  describe("POST /campaigns", () => {
    
    it("should create campaign and return 201", async () => {
      const response = await request(app)
        .post("/campaigns")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          title: "Emergency Medical Fund",
          description: "Heart surgery needed",
          needType: "medical_bills",
          goals: [{ goalType: "money", targetAmount: 50000 }],
          paymentMethods: [{
            type: "paypal",
            creatorInfo: "user@email.com"
          }],
          location: {
            address: "San Francisco, CA",
            lat: 37.7749,
            long: -122.4194,
            zipCode: "94102"
          }
        });
      
      expect(response.status).toBe(201);
      expect(response.body.campaign).toBeDefined();
      expect(response.body.campaign.status).toBe("draft");
      
      // Verify in DB
      const savedCampaign = await Campaign.findById(response.body.campaign._id);
      expect(savedCampaign).toBeDefined();
      expect(savedCampaign.creatorId).toEqual(testUser._id);
    });
    
    it("should fail without authorization header", async () => {
      const response = await request(app)
        .post("/campaigns")
        .send({ title: "Test" });
      
      expect(response.status).toBe(401);
    });
  });
  
  describe("GET /campaigns", () => {
    
    it("should list active campaigns with pagination", async () => {
      const campaign1 = await createTestCampaign({ status: "active" });
      const campaign2 = await createTestCampaign({ status: "active" });
      const campaign3 = await createTestCampaign({ status: "draft" });  // should not appear
      
      const response = await request(app)
        .get("/campaigns?page=1&limit=10")
        .set("Authorization", `Bearer ${accessToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.campaigns.length).toBe(2);  // only active
      expect(response.body.totalCount).toBe(2);
    });
    
    it("should filter campaigns by need type", async () => {
      const campaign1 = await createTestCampaign({ status: "active", needType: "medical_bills" });
      const campaign2 = await createTestCampaign({ status: "active", needType: "emergency_funding" });
      
      const response = await request(app)
        .get("/campaigns?needType=medical_bills")
        .set("Authorization", `Bearer ${accessToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.campaigns).toHaveLength(1);
      expect(response.body.campaigns[0].needType).toBe("medical_bills");
    });
  });
  
  describe("POST /campaigns/{id}/publish", () => {
    
    it("should publish draft campaign and award sweepstakes entry", async () => {
      const campaign = await createTestCampaign({ status: "draft", creatorId: testUser._id });
      
      const response = await request(app)
        .post(`/campaigns/${campaign._id}/publish`)
        .set("Authorization", `Bearer ${accessToken}`);
      
      expect(response.status).toBe(200);
      
      // Check campaign is now active
      const updatedCampaign = await Campaign.findById(campaign._id);
      expect(updatedCampaign.status).toBe("active");
      
      // Check sweepstakes entry was awarded
      const sweepstakesEntry = await SweepstakesSubmission.findOne({
        userId: testUser._id,
        drawingPeriod: getCurrentPeriod()
      });
      expect(sweepstakesEntry).toBeDefined();
      expect(sweepstakesEntry.entryCount).toBe(1);
    });
  });
});

// tests/integration/donations.test.js
describe("Donation Workflow", () => {
  
  it("should record donation and update campaign metrics", async () => {
    const supporter = await createTestUser();
    const campaign = await createTestCampaign({ status: "active" });
    
    const response = await request(app)
      .post(`/campaigns/${campaign._id}/donate`)
      .set("Authorization", generateTestJWT(supporter))
      .send({
        amount: 5000,  // $50
        paymentMethod: "paypal",
        proofUrl: null
      });
    
    expect(response.status).toBe(201);
    expect(response.body.transaction).toBeDefined();
    
    // Check campaign metrics updated
    const updatedCampaign = await Campaign.findById(campaign._id);
    expect(updatedCampaign.metrics.totalDonations).toBe(1);
    expect(updatedCampaign.metrics.totalDonationAmount).toBe(5000);
    
    // Check sweepstakes entry created
    const entry = await SweepstakesSubmission.findOne({
      userId: supporter._id,
      drawingPeriod: getCurrentPeriod()
    });
    expect(entry.entryCount).toBe(1);  // +1 for donation
  });
});
```

**Integration test coverage:**
- All happy-path workflows: 100%
- Authorization checks: 100%
- Database constraints: 100%
- API contract: 100%

### 12.4 E2E/UI Testing (Selenium/Playwright)

**Test Files:**

```javascript
// tests/e2e/campaignCreationFlow.test.js

describe("Campaign Creation End-to-End", () => {
  
  it("should allow user to create, publish, and share campaign", async () => {
    // Setup
    await page.goto('https://test.honestneed.local/register');
    
    // Register
    await page.type('input[name="email"]', 'creator@test.com');
    await page.type('input[name="password"]', 'SecurePassword123!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
    
    // Create campaign
    await page.click('button:has-text("Create Campaign")');
    await page.type('input#title', 'Help My Coffee Shop');
    await page.type('textarea#description', 'We need new equipment...');
    await page.selectOption('select#needType', 'business_growth');
    await page.fill('input#goalAmount', '5000');
    
    // Upload image
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/coffee.jpg');
    
    // Set payment methods
    await page.click('button:has-text("Add Payment Method")');
    await page.selectOption('select#paymentType', 'venmo');
    await page.type('input#venmoHandle', '$mycoffeeshop');
    await page.click('button:has-text("Add")');
    
    // Review and publish
    await page.click('button:has-text("Review")');
    await page.click('button:has-text("Publish")');
    
    // Verify on homepage
    await page.goto('https://test.honestneed.local/');
    const campaignVisible = await page.isVisible('text=Help My Coffee Shop');
    expect(campaignVisible).toBe(true);
  });
});
```

---

## 13. DEPLOYMENT & OPERATIONS

### 13.1 Deployment Architecture

```
┌─────────────────────────────────────────────┐
│         CloudFlare CDN (Global)             │
│         (Static assets: JS, CSS, QR codes)  │
└────────────────┬────────────────────────────┘
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
┌───────────────────────────────────────┐
│        AWS EC2 / DigitalOcean         │
│        (Load Balancer - Nginx)        │
│        443 HTTPS, H2                  │
└────────────┬────────────────────────┘
      ┌──────┴──────┐
      ▼             ▼
┌──────────┐  ┌──────────┐
│ App #1   │  │ App #2   │
│ Node.js  │  │ Node.js  │
│ PM2      │  │ PM2      │
│ 3000     │  │ 3001     │
└────┬─────┘  └────┬─────┘
     │             │
     └──────┬──────┘
            ▼
   ┌──────────────────────┐
   │  MongoDB Atlas       │
   │  (Cluster, replicas) │
   │  Backups: daily      │
   └──────────────────────┘
            ▼
   ┌──────────────────────┐
   │  Redis Elasticache   │
   │  (Session, cache)    │
   └──────────────────────┘
            ▼
   ┌──────────────────────┐
   │  S3 / Storage        │
   │  (Images, QR codes)  │
   └──────────────────────┘
```

### 13.2 Deployment Process

**Environment Configuration:**

```bash
# .env.production
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/honestneed?...
REDIS_URL=redis://redis-host:6379
JWT_SECRET=<long-random-secret>
JWT_EXPIRY=86400
ENCRYPTION_KEY=<encryption-secret-for-payment-info>
SENDGRID_API_KEY=<sendgrid-key>
AWS_ACCESS_KEY_ID=<aws-key>
AWS_SECRET_ACCESS_KEY=<aws-secret>
S3_BUCKET=honestneed-prod-assets
FRONTEND_URL=https://honestneed.com
LOG_LEVEL=info
```

**Database Migration:**

```bash
# migrations/001_initial_schema.js
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "passwordHash", "createdAt"],
      properties: {
        email: { bsonType: "string" },
        passwordHash: { bsonType: "string" },
        createdAt: { bsonType: "date" }
      }
    }
  }
});

db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ createdAt: -1 });
```

**Docker Deployment:**

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
```

**Deploy Script:**

```bash
#!/bin/bash
# scripts/deploy.sh

# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm ci --only=production

# 3. Run DB migrations
npm run migrate:latest

# 4. Build Docker image
docker build -t honestneed:${GIT_COMMIT:0:7} .

# 5. Push to ECR
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/honestneed:${GIT_COMMIT:0:7}

# 6. Update ECS service
aws ecs update-service --cluster honestneed-prod --service honestneed-api \
  --force-new-deployment

# 7. Wait for deployment
aws ecs wait services-stable --cluster honestneed-prod --services honestneed-api

# 8. Verify health
curl https://honestneed.com/health
```

### 13.3 Monitoring & Alerting

**Application Metrics:**

```javascript
// Monitoring integration (DataDog or Prometheus)

const metrics = {
  // Request metrics
  "api.requests.total": counter,        // all requests
  "api.requests.latency_ms": histogram, // response time
  "api.requests.errors": counter,       // error rate
  
  // Business metrics
  "campaigns.created": counter,
  "campaigns.published": counter,
  "donations.total": counter,
  "donations.amount_cents": gauge,
  "shares.recorded": counter,
  "sweepstakes.entries": counter,
  
  // System metrics
  "db.connection_pool.active": gauge,
  "redis.memory_bytes": gauge,
  "server.uptime_seconds": gauge
};

// Set up alerts
ALERT: api.requests.errors > 5% for 5 minutes
ALERT: db.connection_pool.active > 90 connections
ALERT: api.requests.latency_ms > 1000ms for 10 minutes
ALERT: server.uptime < 99.5% (SLA violation)
```

**Logging Strategy:**

```javascript
// Winston logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'honestneed-api' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Log entry format
{
  "timestamp": "2026-04-01T10:30:00.000Z",
  "level": "info",
  "service": "honestneed-api",
  "requestId": "req-abc-123",
  "userId": "user-456",
  "action": "campaign:published",
  "details": {
    "campaignId": "CAMP-001",
    "campaignTitle": "Help Local Coffee Shop"
  },
  "duration_ms": 234
}
```

---

## 14. IMPLEMENTATION PHASES

### Phase 1: MVP Development (Weeks 1-8)

**Sprint 1-2: Foundation & Auth (Weeks 1-2)**

```
├─ Project setup
│  ├─ Initialize Node/Express repo
│  ├─ Docker & docker-compose for local dev
│  ├─ Pre-commit hooks (linting, formatting)
│  └─ GitHub Actions CI/CD pipeline
│
├─ Database setup
│  ├─ MongoDB Atlas cluster (dev, staging, prod)
│  ├─ Create collections & indexes
│  ├─ Seeding script for test data
│  └─ Backup & restore procedures
│
├─ Authentication system
│  ├─ User registration endpoint
│  ├─ Email verification
│  ├─ JWT token generation
│  ├─ Login endpoint
│  ├─ Password reset flow
│  ├─ Rate limiting (5 failed attempts = lockout)
│  └─ Unit tests: 90%+ coverage
│
└─ Deliverable: Can register, login, receive JWT
```

**Sprint 3-4: Campaign Management (Weeks 3-4)**

```
├─ Campaign CRUD
│  ├─ POST /campaigns (create draft)
│  ├─ GET /campaigns (list with filters)
│  ├─ GET /campaigns/{id} (detail)
│  ├─ PUT /campaigns/{id} (update draft)
│  ├─ DELETE /campaigns/{id} (archive)
│  
├─ Campaign publishing
│  ├─ POST /campaigns/{id}/publish
│  ├─ Validation: ensure complete before publishing
│  ├─ Status transition: draft → active
│  ├─ Sweepstakes entry: award +1 for creation
│  │
├─ QR code generation
│  ├─ Generate unique URL per campaign
│  ├─ Create QR code image
│  ├─ Store in S3
│  ├─ Return download URL
│  │
├─ Payment methods
│  ├─ Store creator info (encrypted)
│  ├─ Display to verified supporters
│  ├─ Support: PayPal, Venmo, CashApp, Bank, Crypto
│  │
├─ Meter setup
│  ├─ Money meter (donation goal)
│  ├─ Helping hands meter (volunteer count)
│  ├─ Customers meter (business growth goal)
│  ├─ Independent tracking per goal
│  │
└─ Deliverable: Can create, publish, view campaigns with QR codes
```

**Sprint 5-6: Donations & Sharing (Weeks 5-6)**

```
├─ Donations
│  ├─ POST /donations (record donation)
│  ├─ Calculate 20% platform fee
│  ├─ Create transaction (pending status)
│  ├─ Update campaign metrics
│  ├─ Award sweepstakes entry (+1 per donation)
│  ├─ Admin verification endpoint
│  │
├─ Sharing system
│  ├─ POST /shares (record share)
│  ├─ Paid sharing: deduct from budget, award supporter
│  ├─ Free sharing: no reward, no budget impact
│  ├─ Share channels: email, direct link, QR
│  ├─ Sweepstakes: award +0.5 entry per share
│  ├─ Referral tracking: ?ref=shareId
│  │
├─ Share budget management
│  ├─ Creator sets initial budget (min $10)
│  ├─ Amount per share adjustable
│  ├─ Reload mechanism: request → admin verify → add to budget
│  ├─ Auto-disable paid sharing when budget = $0
│  │
└─ Deliverable: Can donate and share campaigns, earn rewards
```

**Sprint 7-8: Sweepstakes & Launch Prep (Weeks 7-8)**

```
├─ Sweepstakes
│  ├─ Track entry sources (campaign, donation, share, QR)
│  ├─ Accumulate entries per user per period
│  ├─ Scheduled drawing job (June 3, 2026)
│  ├─ Weighted random selection
│  ├─ Send winner notifications
│  ├─ Claim flow (30-day window)
│  │
├─ Admin dashboard
│  ├─ View all campaigns (paginated)
│  ├─ Flag / suspend campaigns
│  ├─ Verify pending donations
│  ├─ View platform analytics
│  ├─ Execute sweepstakes drawing
│  │
├─ Testing & QA
│  ├─ Full test suite: >80% coverage
│  ├─ Integration tests: all workflows
│  ├─ Security audit: OWASP top 10
│  ├─ Performance testing: <2s page load
│  ├─ Load testing: 1,000 concurrent users
│  │
├─ Deployment
│  ├─ Production AWS setup
│  ├─ Database backups
│  ├─ Monitoring & alerting
│  ├─ SSL certificate
│  ├─ HTTPS enforcement
│  │
└─ Deliverable: Live MVP with all core features
```

### Phase 2: Optimization & Scale (Weeks 9-16)

```
├─ Performance optimization
│  ├─ Redis caching for campaign feed
│  ├─ Database query optimization
│  ├─ API response compression
│  ├─ Implement CDN for assets
│  │
├─ Payment integration (Phase 2)
│  ├─ PayPal API webhook integration
│  ├─ Auto-verify donations via PayPal
│  ├─ Implement Stripe for credit cards
│  │
├─ Identity verification
│  ├─ Photo ID verification flow
│  ├─ Trust badge system
│  ├─ Automated fraud detection
│  │
├─ Enhanced analytics
│  ├─ Supporter journey tracking
│  ├─ Campaign performance dashboard
│  ├─ Geographic heatmap
│  │
└─ Planned: May 2026
```

---

## 15. RESOLUTION OF 21 OPEN QUESTIONS

### Business & Product Questions

**Q1: How are share payouts triggered/verified?**
- **Current:** Honor system - we trust supporters completed share
- **MVP Decision:** Accept all share claims. Log suspicious patterns (same user 100x).
- **Phase 2:** Optional proof layer - screenshot of social post or reference
- **Trigger:** Automatic upon share recording (no manual approval)
- **Payout:** Accumulated in supporter wallet, claimed via request (not automatic)

**Q2: What happens if campaign reaches goal mid-month?**
- **Decision:** Campaign does NOT auto-end
- **Behavior:** Update meter to "GOAL REACHED" (100%)
- **Creator can:** Continue accepting support and increase goal
- **Supporter can:** Keep donating even after goal reached
- **Rationale:** Flexibility, supporter goodwill, additional funds help more

**Q3: QR code in-store tracking approach?**
- **MVP:** Use URL parameter tracking: `/campaigns/[id]?origin=store_123&gps=[lat,long]`
- **Storage:** Track origin_store in campaign analytics
- **Enhancement:** Manual store admin can log "scans today"
- **Phase 2:** GPS verification - confirm store coordinates when QR scanned

**Q4: Competitor risk - why use HonestNeed vs. Venmo + group chat?**
- **Answer:** Discoverability, algorithm visibility, community, gamification (sweepstakes)
- **Unique:** Multi-meter support, reward sharing, QR code integration
- **Go-to-market:** Community partnerships (churches, nonprofits, local networks)

**Q5: Businesses on platform - different fee structure?**
- **Decision:** Flat 20% across ALL transactions (businesses and individuals)
- **Rationale:** Simplicity, fairness, no discrimination
- **Phase 2:** Volume discounts if certain thresholds hit

**Q6: Dispute resolution process?**
- **MVP:** Support tickets only (manual email-based)
- **Process:**
  1. Supporter claims: "Share never completed"
  2. Creator responds: "I saw them share"
  3. Support review: "No further action" or "Refund share reward" (manual decision)
- **Phase 2:** Add evidence system (screenshots, timestamps, platform logs)

**Q7: Campaign moderation - pre-approve or reactive?**
- **Decision:** Reactive moderation (flag after reported)
- **Rationale:** Faster time-to-market, lower overhead
- **Trust mechanism:** Creator verification, community reporting
- **Phase 2:** Pre-approval option for nonprofit/verified organizations

**Q8: Sweepstakes sustainability - $500/month realistic?**
- **Decision:** Yes, sustainable at 20% platform fee on $2,500+/month transactions
- **Math:** 20% of $2,500 = $500 (breakeven)
- **Scalability:** As platform grows, prize pool increases
- **Contingency:** Reduce to $250/month if needed, or move to quarterly draws

### Technical Questions

**Q9: Payment processing - integrate APIs or track manually?**
- **MVP:** Manual verification (supporter attests: "I sent $X via [method]")
- **Process:**
  1. Creator provides payment info (Venmo QR, PayPal email, etc.)
  2. Supporter sends payment outside HonestNeed
  3. Supporter marks in app: "Payment sent"
  4. Admin spot-checks (sample verification)
- **Phase 2:** PayPal webhook integration for auto-verification

**Q10: Encryption for payment info?**
- **Implementation:** AES-256-GCM encryption at rest
- **Key:** Stored in AWS Secrets Manager (rotate quarterly)
- **Decryption:** Only when supporter making donation or creator viewing
- **Display:** Never log full info (masked: **** in logs)

**Q11: Scaling considerations - when does randomization slow?**
- **Threshold:** ~1 million campaigns (single MongoDB query becomes slow)
- **Solution:** Implement Vose's Alias Method (O(1) weighted random)
- **Alternative:** Shard campaigns by type or geography
- **Timeline:** Phase 2 (add caching layer via Redis)

**Q12: QR generation - server-side or client-side?**
- **Decision:** Server-side generation
- **Rationale:** Consistency, tracking-friendly, storage
- **Process:**
  1. Campaign created
  2. Server calls qrcode library: `qrcode.toDataURL([unique URL])`
  3. Save to S3
  4. Return URL to client
- **Benefits:** Reliable, auditable, shareable link

**Q13: Notifications - realtime WebSockets or polling?**
- **MVP:** Email + polling (5-second poll on client)
- **Rationale:** Simpler, no WebSocket infrastructure
- **Alerts:** "Someone donated!" → email sent immediately
- **Phase 2:** WebSocket for realtime live campaign feed updates

**Q14: Metrics & analytics - define engagement precisely?**
- **Engagement Definition:**
  ```
  Engagement Score = (Total Shares * 2) + (Total Donations) + (Comment Count) + (View Count / 100)
  ```
- **Used By:** Trending algorithm, campaign recommendations
- **Tracked:** Per campaign, per day
- **Stored:** Denormalized in `campaigns.metrics.engagementScore`

**Q15: Mobile app consideration?**
- **MVP Decision:** Web-only (responsive design)
- **PWA:** Support installation on mobile home screen
- **Phase 2:** Native React Native app if mobile traffic >60%

### Legal/Compliance Questions

**Q16: Sweepstakes state restrictions?**
- **Restricted States:** Florida, New York, Washington, Hawaii (comprehensive legal review needed)
- **Implementation:**
  1. Geo-block entries from restricted states (IP geolocation)
  2. Verify age: 18+ only
  3. Clear "No purchase necessary" in terms
  4. Maintain drawing logs for audits
- **Compliance:** Register with state gaming boards if required

**Q17: Payment method terms-of-service issues?**
- **Status:** Venmo/CashApp ToS allow "payment directory" use case
- **Verification:** Legal review before launch (must do)
- **Risk:** Low - we're not processing payments, just displaying info
- **Mitigation:** Add disclaimer: "Payments sent outside HonestNeed"

**Q18: Should HonestNeed pursue 501(c)(3) nonprofit status?**
- **Decision:** NO for MVP (remain for-profit)
- **Rationale:** 
  - For-profit more flexible for hiring, fundraising, pivots
  - Can donate platform's fees to nonprofits
  - Community trust built through transparency, not status
- **Phase 3:** Revisit based on traction

**Q19: AML/KYC requirements?**
- **Threshold:** Financial institutions required when >$1M/year in transactions
- **Timeline:** Unlikely in MVP (first 3 months ~$100K transactions)
- **Phase 2:** Implement if crossing threshold
- **Basic steps:**
  1. Collect creator identity info (name, address)
  2. Flag suspicious patterns ($100K+ single campaign)
  3. Report to FinCEN if needed

### User Experience Questions

**Q20: Campaign search - how many filters before overwhelming?**
- **MVP Filters:** 4 total
  1. Need Type (dropdown, autocomplete)
  2. Location (local / statewide / country / global)
  3. Payment Method (PayPal, Venmo, etc.)
  4. Sort (newest / trending / closest to goal)
- **Phase 2:** Add rating, creator verification, tags

**Q21: Creator onboarding - tutorial video or text guide?**
- **Decision:** Interactive in-app tutorial (no video for MVP)
- **Steps:**
  1. Form field highlights on first campaign creation
  2. Tooltips explain each field
  3. Sample campaign shown
  4. FAQ link prominently displayed
- **Phase 2:** 2-minute video if engagement data shows need

---

## 16. FINAL BACKEND BUILD PLAN

### Week-by-Week Execution Roadmap

**WEEK 1: Project Infrastructure**

```
Day 1-2: Repo & Environment Setup
- Initialize Node.js/Express project
- GitHub repo with branch protection
- Pre-commit hooks (ESLint, Prettier)
- Docker & docker-compose for local dev
- Env file templates (.env.example)

Day 3-4: Database & Infrastructure
- MongoDB Atlas cluster setup (dev, staging, prod)
- Create initial collections & indexes
- Redis instance (local via Docker)
- AWS S3 bucket for file storage
- SSL certificate setup

Day 5: CI/CD Pipeline
- GitHub Actions workflow
- Lint on PR
- Test on push
- Auto-deploy to staging

Deliverable: Developers can `npm install && npm run dev` and have working local environment
```

**WEEK 2: Authentication**

```
Day 1-2: User Registration
- User model with validation
- Password hashing (bcrypt)
- Registration endpoint
- Email verification flow
- Unit tests: 90%+ coverage

Day 3-4: Login & JWT
- Login endpoint
- JWT generation & validation
- Auth middleware
- Rate limiting: 5 failed attempts → 15 min lockout

Day 5: Password Reset & Testing
- Password reset request
- Reset token validation
- Confirm new password
- Full integration tests

Deliverable: User can register, verify email, login, get JWT token
```

**WEEK 3-4: Campaign CRUD**

```
Day 1-3: Campaign Creation
- Campaign model with all fields
- Zod validation schema
- POST /campaigns endpoint
- Input sanitization
- Unit & integration tests

Day 4-5: Campaign Reading
- GET /campaigns (list with pagination)
- GET /campaigns/{id} (detail)
- Filtering: need type, location, status
- Sorting: newest, trending, closest to goal

Week 4 Day 1-3: Campaign Updates
- PUT /campaigns/{id} (update draft only)
- DELETE /campaigns/{id} (soft archive)
- Validation: only creator, only draft status

Day 4-5: Publishing & QR
- POST /campaigns/{id}/publish
- QR code generation
- S3 upload
- Download endpoint

Deliverable: Full campaign lifecycle (create → update → publish → archive)
```

**WEEK 5-6: Donations & Sharing**

```
Week 5 Day 1-3: Donations
- Transaction model
- POST /donations endpoint
- Calculate 20% platform fee
- Update campaign metrics
- Sweepstakes entry award

Day 4-5: Share Recording
- Share model
- POST /shares endpoint
- Paid vs. free sharing logic
- Budget deduction

Week 6 Day 1-2: Share Budget
- PUT /campaigns/{id}/reload-share
- Transaction creation
- Manual verification flow

Day 3-4: Admin Verification
- Admin endpoints for verification
- Mark transaction as "verified"
- Database auditing

Day 5: Testing
- Full donation workflow tests
- Full sharing workflow tests
- Budget edge cases

Deliverable: Full payment & sharing workflow end-to-end
```

**WEEK 7: Sweepstakes & Admin**

```
Day 1-2: Sweepstakes Entries
- SweepstakesSubmission model
- Entry tracking: campaign, donation, share, QR
- Accumulate per user, per period

Day 3-4: Drawing Logic
- Weighted random algorithm
- Scheduled job setup (Cron)
- Winner selection & notification

Day 5: Admin Dashboard Basics
- GET /admin/campaigns
- GET /admin/analytics
- Admin auth & permissions

Deliverable: Sweepstakes system ready for first drawing (June 3, 2026)
```

**WEEK 8: Testing & Deployment**

```
Day 1-2: Test Suite
- Achieve 80%+ code coverage
- Fix any failing tests
- Performance testing

Day 3: Security Audit
- OWASP top 10 review
- Penetration testing (basic)
- Password complexity check

Day 4: Production Deployment
- AWS setup
- Docker build & push
- Database migration
- Seed initial data

Day 5: Launch Prep
- Health checks
- Monitoring setup
- Load testing
- Backup procedures

Deliverable: Live MVP production environment
```

### Team Roles During Development

```
Senior Backend Engineer (Lead)
├─ Weeks 1-2: Database design, architecture decisions
├─ Weeks 3-4: Campaign module code review
├─ Weeks 5-6: Payment system design
├─ Weeks 7-8: Security review, deployment
└─ Ongoing: Unblock team, technical decisions

API Developer
├─ Weeks 1-2: User registration & login endpoints
├─ Weeks 3-4: All campaign endpoints (CRUD)
├─ Weeks 5-6: Donation & sharing endpoints
├─ Weeks 7: Sweepstakes & admin endpoints
└─ Ongoing: Endpoint implementation

DevOps/QA Engineer
├─ Weeks 1-2: CI/CD pipeline, Docker setup
├─ Weeks 3-4: Integration testing
├─ Weeks 5-6: Full workflow testing
├─ Weeks 7: Load testing, security testing
├─ Week 8: Production deployment
└─ Ongoing: Monitoring, alerting, backups
```

### Success Criteria for MVP Launch

```
FUNCTIONALITY:
✅ All core endpoints working
✅ JWT auth functional
✅ Campaign CRUD complete
✅ Donations tracked
✅ Sharing implemented
✅ Sweepstakes entry tracking

QUALITY:
✅ >80% code coverage
✅ All integration tests passing
✅ <2 second page load time
✅ Handle 1,000 concurrent users

SECURITY:
✅ HTTPS enforced
✅ Passwords bcrypted
✅ Payment info encrypted
✅ RBAC implemented
✅ Rate limiting active

OPERATIONS:
✅ Monitoring configured
✅ Alerting active
✅ Backups automated
✅ Logging structured
✅ Runbooks documented

COMPLIANCE:
✅ Terms of Service published
✅ Privacy Policy live
✅ Sweepstakes rules posted
✅ GDPR/CCPA compliant
```

---

## CONCLUSION: BACKEND READY FOR DEVELOPMENT

This document provides everything needed to begin backend implementation:

✅ **Architecture** - Clear layered design with separation of concerns  
✅ **Database** - MongoDB collections with indexes optimized for queries  
✅ **Authentication** - JWT strategy with RBAC enforcement  
✅ **Services** - All core business logic specified with code examples  
✅ **API** - Complete endpoint list with request/response formats  
✅ **Workflows** - 4 end-to-end flows detailed step-by-step  
✅ **Testing** - Strategy for unit, integration, and E2E tests  
✅ **Security** - Encryption, validation, CORS, compliance covered  
✅ **Deployment** - Docker, CI/CD, monitoring, operations documented  
✅ **Roadmap** - 8-week sprint plan with daily deliverables  
✅ **Decisions** - All 21 open questions answered with rationale  

**Team is immediately ready to:**
1. Create feature branches
2. Implement endpoints
3. Write tests
4. Deploy to staging
5. Launch MVP April 1, 2026

**Next Steps:**
1. Review this document with team (1 hour)
2. Set up dev environment (1 hour)
3. Begin Sprint 1: Infrastructure & Auth (2 weeks)
4. Proceed through remaining sprints

**Estimated Total Backend LOC:** ~8,000 lines of production code  
**Estimated MVP Delivery:** 8 weeks  
**Team Size:** 3-4 backend engineers

---

**Document Prepared For:** HonestNeed Development Team  
**Date:** April 1, 2026  
**Version:** 1.0 (Production Ready)

**Contact:** James Bowser, Santiago Rueda  
**Repository:** [GitHub link to be added]  
**Deployment:** AWS EC2 / DigitalOcean
