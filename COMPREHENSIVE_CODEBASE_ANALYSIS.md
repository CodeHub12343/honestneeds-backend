# HONESTNEED Web Application - Comprehensive Codebase Analysis
**Date**: April 7, 2026 | **Version**: 1.0.0 | **Status**: Production Ready

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Backend Architecture](#backend-architecture)
3. [Frontend Architecture](#frontend-architecture)
4. [Data Integration Points](#data-integration-points)
5. [Authentication & Authorization](#authentication--authorization)
6. [Error Handling](#error-handling)
7. [Key Features & Workflows](#key-features--workflows)
8. [Database Models](#database-models)
9. [API Endpoints Summary](#api-endpoints-summary)

---

## Project Overview

### Technology Stack
- **Backend**: Node.js + Express.js + MongoDB
- **Frontend**: Next.js 16.2 + React 19 + TypeScript
- **State Management**: Zustand (client), React Query (server state)
- **Styling**: Styled Components + Tailwind CSS
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Zod schemas (frontend), Joi/Zod (backend)
- **HTTP Client**: Axios
- **Logging**: Winston
- **Environment**: Docker ready, supports dev/staging/production

### Project Structure
```
/src                          # Backend (Node.js/Express)
├── app.js                    # Express app entry point
├── config/                   # Configuration files
├── controllers/              # HTTP request handlers (19 controllers)
├── middleware/               # Express middleware (auth, RBAC, error handling)
├── models/                   # MongoDB schemas (29 models)
├── repositories/             # Data access layer
├── routes/                   # API route definitions (17 route files)
├── services/                 # Business logic layer (24 services)
├── utils/                    # Utilities (logging, JWT, validation, email)
└── validators/               # Input validation schemas (9 validator files)

/honestneed-frontend          # Frontend (Next.js)
├── app/                      # Next.js 13+ App Router
│   ├── (auth)/              # Auth routes (login, register, password reset)
│   ├── (campaigns)/         # Campaign browsing routes
│   ├── (creator)/           # Creator-specific routes
│   ├── (supporter)/         # Supporter-specific routes
│   └── admin/               # Admin panel routes
├── api/                      # API integration layer
│   ├── services/            # 13 API service classes
│   └── hooks/               # 13 custom React Query hooks
├── components/              # Reusable React components
├── store/                   # Zustand stores (auth, wizard, filters, donations)
├── lib/                     # Utilities and configurations
└── utils/                   # Validation schemas, helpers
```

---

## Backend Architecture

### Directory Structure & Responsibilities

#### Controllers (19 files)
Handles HTTP requests and responses. Each controller corresponds to a domain entity:

| Controller | Responsibilities | Key Methods |
|--------------|------------------|-------------|
| **authController.js** | User authentication | register, login, refreshAccessToken, requestPasswordReset, verifyResetToken, resetPassword |
| **campaignController.js** | Campaign CRUD and queries | create, list, getTrending, getNeedTypes, get, update, delete |
| **campaignUpdateController.js** | Campaign update management | create, list, get, update, delete |
| **DonationController.js** | Donation processing (15 methods) | createDonation, listDonations, getDonation, refundDonation, exportDonations |
| **userController.js** | User profile management | getProfile, updateProfile, getStats, updatePreferences |
| **AdminController.js** | Admin operations (43 methods) | listUsers, verifyUser, approveCampaign, listDonations, etc. |
| **AdminFeeController.js** | Fee tracking and settlement | getFeesDashboard, settleFees, getSettlementHistory, generateFeeReport |
| **AdminUserController.js** | User management | getAllUsers, getUserDetail, updateUser, assignRoles |
| **ShareController.js** | Share/referral system | recordShare, getShareStats, getShareConfig, trackShareEvent |
| **ShareReferralController.js** | Referral link management | create, verify, analytics |
| **SweepstakesController.js** | Sweepstakes management | create, list, draw, manage entries |
| **SweepstakesClaimController.js** | Prize claim processing | createClaim, verifyClaim, processClaim |
| **PaymentMethodController.js** | Payment setup | addPaymentMethod, listMethods, updateMethod, deleteMethod |
| **VolunteerController.js** | Volunteer operations | create, list, get, update, delete |
| **VolunteerOfferController.js** | Volunteer offer management | create, accept, reject |
| **analyticsController.js** | Platform analytics | getDashboard, getMetrics, getTimeSeries |
| **TransactionController.js** | Transaction processing | record, verify, reject, refund |
| **healthController.js** | Server health checks | status, metrics |

#### Routes (17 files)
Define REST API endpoints by domain:

```
API Routing Structure:
/health                          # Health checks
/api/auth                        # Authentication (register, login, password reset)
/api/users                       # User profiles and stats
/api/campaigns                   # Campaign CRUD and queries
/api/donations                   # Donation creation and management
/api/sweepstakes                 # Sweepstakes operations
/api/admin/users                 # User management
/api/admin                       # Admin operations (43 endpoints)
/api/admin/fees                  # Fee management
/api/payment-methods             # Payment method setup
/api/volunteers                  # Volunteer management
/api/analytics                   # Platform analytics
/api/share                       # Sharing and referral programs
```

#### Models (29 MongoDB schemas)
Define database structure and relationships:

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **User.js** | User accounts | email, password_hash, role, verified, stats (donations, campaigns, referrals) |
| **Campaign.js** | Fundraising/sharing campaigns | campaign_id, creator_id, title, need_type, goals, status, payment_methods, location |
| **CampaignUpdate.js** | Campaign progress updates | campaign_id, creator_id, title, description, media_url, metrics |
| **Transaction.js** | Donation records | campaign_id, supporter_id, amount_cents, status, payment_method, platform_fee_cents |
| **Donation.js** | Donation details | campaign_id, supporter_id, amount, payment_method, status |
| **PaymentMethod.js** | Stored payment methods | user_id, type, account_info, is_primary, verified |
| **Share.js** | Share/referral records | campaign_id, share_platform, creator_id, shares_count, rewards_earned |
| **ShareTracking.js** | Share analytics | share_id, click_count, conversion_count, last_updated |
| **ReferralTracking.js** | Referral link metrics | referral_link, created_by, campaign_id, visits, conversions |
| **ReferralLink.js** | Referral link storage | campaign_id, creator_id, link_hash, platform, generated_at |
| **GRCodeCode.js** | QR code storage | campaign_id, qr_code_data, analytics_data |
| **SweepstakesDrawing.js** | Sweepstakes drawings | sweepstakes_id, winners, draw_date, results |
| **SweepstakesSubmission.js** | Sweepstakes entries | sweepstakes_id, supporter_id, entries_count, status |
| **VolunteerProfile.js** | Volunteer info | user_id, skills, availability, experience_level, preferred_causes |
| **VolunteerAssignment.js** | Volunteer tasks | campaign_id, volunteer_id, task_description, status |
| **VolunteerOffer.js** | Volunteer opportunities | campaign_id, skill_required, description, status |
| **CampaignProgress.js** | Campaign metrics tracking | campaign_id, current_donations, current_shares, completion_percentage |
| **ActivityLog.js** | User activity tracking | user_id, action, entity_type, entity_id, timestamp |
| **AuditLog.js** | Admin audit trail | admin_id, action, target_id, changes, timestamp |
| **FeeTransaction.js** | Platform fee records | transaction_id, campaign_id, fee_amount, status, settlement_date |
| **SettlementLedger.js** | Payment settlements | creator_id, total_amount, transactions, settlement_date |
| **Alert.js** | System alerts | type, severity, message, resolved_at |
| **BroadcastNotification.js** | Platform notifications | title, message, recipient_roles, created_at |
| **Category.js** | Campaign categories | name, description, icon |
| **PlatformSettings.js** | Global platform config | fees, terms, policies |
| **PlatformContent.js** | CMS content | key, content, status |
| **TokenBlacklist.js** | Invalidated JWT tokens | token, blacklisted_at, expires_at |
| **UserReport.js** | User reports/complaints | reporter_id, reported_id, reason, status |

#### Services (24 files)
Encapsulate business logic and interact with models:

| Service | Responsibility |
|---------|-----------------|
| **CampaignService.js** | Campaign create/update/delete, filtering, trending |
| **CampaignAnalyticsService.js** | Real-time campaign metrics, progress tracking |
| **CampaignProgressService.js** | Progress updates, milestone tracking |
| **CampaignProgressScheduler.js** | Scheduled progress calculations |
| **TransactionService.js** | Transaction recording, fee calculation, verification |
| **DonationService.js** | Donation processing, sweepstakes integration |
| **PaymentProcessingService.js** | Payment gateway integration |
| **PaymentService.js** | Payment method management |
| **StripeService.js** | Stripe integration |
| **ShareService.js** | Sharing mechanics, tracking, rewards |
| **ShareConfigService.js** | Share campaign configuration |
| **ReferralTrackingService.js** | Referral analytics and metrics |
| **SweepstakesService.js** | Sweepstakes creation, management, drawing |
| **DrawingService.js** | Random winner selection, verification |
| **PrizeClaimService.js** | Prize claim verification and processing |
| **VolunteerService.js** | Volunteer profile management |
| **AdminService.js** | Admin operations and reporting |
| **AdminDashboardService.js** | Dashboard metrics and KPIs |
| **FeeTrackingService.js** | Fee calculations and settlement |
| **qrCodeService.js** | QR code generation and tracking |
| **analyticsService.js** | Platform-wide analytics |
| **emailService.js** | Email notifications |
| **userService.js** | User profile and stats management |
| **SpamDetectionService.js** | Fraud and spam detection |

#### Middleware (6 files)
Cross-cutting concerns:

| Middleware | Purpose |
|-----------|---------|
| **authMiddleware.js** | JWT verification, user context attachment |
| **rbac.js** | Role-Based Access Control, permission checking |
| **errorHandler.js** | Global error handling with standardized responses |
| **requestLogger.js** | HTTP request/response logging with Winston |
| **uploadMiddleware.js** | File upload handling (multipart/form-data) |
| **validation.js** | Input validation schemas |

#### Validators (9 files)
Zod schemas for request validation:
- campaignValidators.js - Campaign creation/update schemas
- donationValidators.js - Donation request validation
- sharingValidators.js - Share/referral validation
- paymentMethodValidators.js - Payment setup validation
- analyticsValidators.js - Analytics query validation
- And 4 more...

### Backend Request Flow Diagram
```
HTTP Request
    ↓
[Routes] - URL mapping to controller
    ↓
[Middleware] - auth, validation, logging
    ↓
[Controller] - Handle request, call services
    ↓
[Services] - Business logic, interact with models
    ↓
[Models] - MongoDB queries, data transformation
    ↓
[Database] - MongoDB operations
    ↓
[Response] - JSON formatted, error-handled
```

### Key Backend Patterns

#### 1. **Currency Handling**
- All monetary amounts stored in **CENTS** in database
- Frontend displays as **DOLLARS** (divided by 100)
- Conversion happens at service layer boundaries:
  ```javascript
  // Input: $10.50 from user → 1050 cents in DB
  const amountCents = Math.round(amountDollars * 100);
  
  // Output: 1050 cents from DB → $10.50 to frontend
  const amountDollars = amountCents / 100;
  ```

#### 2. **Fee Calculation**
- Platform takes 20% fee on all donations
- Net amount = Gross amount - (Gross × 0.20)
- Fee breakdown sent to frontend for transparency

#### 3. **Campaign Status Lifecycle**
```
Draft → Active (via /activate) → Paused (via /pause) → Completed
  ↓      ↑
  └──── Can revert from Active/Paused
```

#### 4. **JWT Authentication**
- Tokens include: userId, roles, token type (access/refresh)
- Refresh tokens for long-lived sessions
- Token blacklist for logout support
- 7-day expiration with cookie storage

#### 5. **Error Handling Strategy**
- Standardized error response format:
  ```json
  {
    "success": false,
    "error": {
      "code": "ERROR_CODE",
      "message": "Human readable message",
      "details": null,
      "statusCode": 400
    }
  }
  ```
- Custom error codes: VALIDATION_ERROR, CAMPAIGN_NOT_FOUND, INSUFFICIENT_FUNDS, etc.
- Details include field-level validation errors

---

## Frontend Architecture

### Page Structure (Next.js App Router)
```
/app
├── page.tsx                          # Landing page
├── providers.tsx                     # React Query + Auth provider
├── layout.tsx                        # Root layout with Navbar/Footer
├── (auth)/                           # Auth route group
│   ├── login/page.tsx               # Login page
│   ├── register/page.tsx            # Registration page
│   ├── forgot-password/page.tsx     # Password recovery
│   └── reset-password/[token]/page.tsx # Password reset with token
├── (campaigns)/                      # Campaign browsing
│   └── campaigns/
│       ├── page.tsx                 # Browse campaigns (filtered)
│       ├── new/page.tsx             # Create new campaign
│       ├── [id]/page.tsx            # Campaign detail page
│       ├── [id]/donate/page.tsx     # Donation flow
│       ├── [id]/edit/page.tsx       # Edit campaign
│       └── [id]/analytics/page.tsx  # Campaign analytics
├── (creator)/                        # Creator dashboard
│   ├── dashboard/page.tsx           # Creator dashboard
│   ├── campaigns/
│   │   ├── [id]/edit/page.tsx      # Edit campaign draft
│   │   └── [id]/analytics/page.tsx # Campaign performance
│   ├── settings/page.tsx            # Creator settings
│   └── profile/page.tsx             # Creator profile
├── (supporter)/                      # Supporter features
│   ├── donations/page.tsx           # Donation history
│   ├── shares/page.tsx              # Share activity
│   ├── sweepstakes/page.tsx         # Sweepstakes entries
│   └── referrals/page.tsx           # Referral earnings
└── admin/                            # Admin panel
    ├── dashboard/page.tsx           # Admin dashboard
    ├── users/page.tsx               # User management
    ├── campaigns/page.tsx           # Campaign moderation
    ├── transactions/page.tsx        # Transaction verification
    ├── settings/page.tsx            # Platform settings
    └── manage-sweepstakes/page.tsx  # Sweepstakes management
```

### Component Architecture
```
/components
├── layout/                          # Layout components
│   ├── Navbar.tsx                  # Top navigation
│   └── Footer.tsx                  # Footer
├── auth/                            # Auth UI
│   ├── LoginForm.tsx
│   ├── RegisterForm.tsx
│   └── PasswordResetForm.tsx
├── campaign/                        # Campaign UI (23 components)
│   ├── wizard/                     # Creation wizard (4-step)
│   │   ├── TypeSelector.tsx        # Step 1: Type selection
│   │   ├── BasicInfoForm.tsx       # Step 2: Title/description/image
│   │   ├── GoalsForm.tsx           # Step 3: Type-specific fields
│   │   └── ReviewForm.tsx          # Step 4: Review & publish
│   ├── CampaignCard.tsx            # Campaign list item
│   ├── CampaignGrid.tsx            # Responsive grid layout
│   ├── CampaignDetail.tsx          # Campaign detail view
│   ├── CampaignUpdates.tsx         # Progress updates section
│   ├── PaymentMethodManager.tsx    # Payment setup
│   ├── QRCodeDisplay.tsx           # QR code generator
│   ├── FlyerBuilder.tsx            # Flyer customization
│   └── QRAnalyticsDashboard.tsx    # QR code tracking
├── donation/                        # Donation UI
│   ├── DonationForm.tsx            # Donation wizard
│   └── DonationConfirmation.tsx    # Receipt/confirmation
├── sweepstakes/                     # Sweepstakes UI
│   ├── EntryForm.tsx
│   └── ComplianceGuard.tsx
├── admin/                           # Admin UI
│   ├── UserManagement.tsx
│   ├── CampaignModeration.tsx
│   └── Dashboard.tsx
├── ui/                              # Base UI components
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── FormField.tsx
│   ├── Modal.tsx
│   ├── LoadingSpinner.tsx
│   └── Divider.tsx
└── ProtectedRoute.tsx              # Role-based access wrapper
```

### API Service Layer (13 services)
Abstracts HTTP communication:

| Service | Endpoints | Key Methods |
|---------|-----------|------------|
| **authService.ts** | /auth/* | login, register, refreshToken, resetPassword |
| **campaignService.ts** | /campaigns/* | getCampaigns, getCampaign, createCampaign, updateCampaign |
| **campaignUpdateService.ts** | /campaigns/*/updates | getUpdates, createUpdate, deleteUpdate |
| **donationService.ts** | /donations/* | createDonation, listDonations, exportDonations |
| **sharingService.ts** | /share/* | recordShare, getShareStats, generateReferralLink |
| **sweepstakesService.ts** | /sweepstakes/* | submitEntry, getEntries, claimPrize |
| **volunteerService.ts** | /volunteers/* | listAssignments, acceptOffer, completeTask |
| **paymentMethodService.ts** | /payment-methods/* | addMethod, listMethods, updateMethod |
| **adminService.ts** | /admin/* | listUsers, verifyCampaign, getMetrics |
| **adminUserService.ts** | /admin/users/* | getUsers, assignRole, blockUser |
| **adminContentService.ts** | /admin/content/* | getContent, updateContent, publish |
| **pdfExportService.ts** | PDF generation | generateReceipt, generateFlyer |
| **qrFlyerService.ts** | QR flyer generation | buildFlyer, downloadFlyer |

### State Management Stores (Zustand)

#### 1. **authStore.ts** - Authentication state
```typescript
interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (user, token) => void     // On login
  clearAuth: () => void              // On logout
  updateUser: (updates) => void      // Profile updates
  hasRole: (role) => boolean         // Permission checking
}
```
- Synced with localStorage and cookies
- 7-day expiration window
- Provides client-side role checking

#### 2. **wizardStore.ts** - Campaign creation wizard
```typescript
interface WizardState {
  currentStep: number              // 1-4
  campaignType: 'fundraising' | 'sharing'
  basicInfo: { title, description, image }
  fundraisingData: { goalAmount, category, tags, duration }
  sharingData: { platforms, rewardPerShare, budget, maxShares }
  setStep: (step) => void
  updateBasicInfo: (data) => void
  updateGoals: (data) => void
  submitWizard: () => Promise<Campaign>
}
```
- Persistent across page reloads
- Supports resuming draft creation
- Validates at each step

#### 3. **filterStore.ts** - Campaign browsing filters
```typescript
interface FilterStore {
  searchQuery: string
  needTypes: string[]
  location: string
  geographicScope: 'local' | 'regional' | 'national' | 'all'
  status: 'active' | 'draft' | 'all'
  sortBy: 'trending' | 'newest' | 'ending-soon'
  setFilters: (filters) => void
  resetFilters: () => void
}
```

#### 4. **donationWizardStore.ts** - Donation flow state
```typescript
interface DonationWizardState {
  amount: number
  paymentMethod: string
  donorName: string
  message: string
  isAnonymous: boolean
  submitDonation: () => Promise<void>
}
```

### React Query Integration (13 custom hooks)

Query key factory pattern for cache management:
```typescript
const campaignKeys = {
  all: ['campaigns'],
  lists: () => [...campaignKeys.all, 'list'],
  list: (page, limit, filters?) => [...campaignKeys.lists(), {page, limit, ...filters}],
  details: () => [...campaignKeys.all, 'detail'],
  detail: (id) => [...campaignKeys.details(), id],
}
```

Cache strategy:
- **Lists**: staleTime: 10min, gcTime: 30min
- **Details**: staleTime: 5min, gcTime: 15min
- **Real-time**: Refetch on window focus, online
- **Mutations**: Auto-invalidate related queries

### Frontend Request Flow
```
User Action (form submit, link click)
    ↓
[Custom Hook] - useQuery/useMutation with caching
    ↓
[API Service] - Abstract HTTP client (axios)
    ↓
[API Client] - Interceptors (auth token, error handling)
    ↓
[Backend API]
    ↓
[Response Transformation] - Map to frontend types
    ↓
[Zustand Store update] OR [Toast notification]
    ↓
[Component Re-render]
```

---

## Data Integration Points

### 1. **Campaign Creation Flow**
```
Frontend: CampaignWizard (4 steps)
    ↓
Step 1: Type selection (fundraising vs sharing) → wizardStore
Step 2: Basic info (title, description, image) → wizardStore
Step 3: Type-specific data (goal/platforms) → wizardStore
Step 4: Review and submit → Validation → FormData
    ↓
POST /api/campaigns (multipart/form-data)
    ↓
Backend: campaignController.create()
    ↓
Body parsing:
  - title: string
  - description: string
  - tags: CSV → Array
  - image: binary file
  - goalAmount: $10.50 → 1050 cents
    ↓
CampaignService.createCampaign()
    ↓
Campaign model save → MongoDB
    ↓
Response: { id, campaign: { ...normalized data } }
    ↓
Frontend: useCampaigns hook invalidated
    ↓
Router.push('/campaigns/{id}')
```

### 2. **Donation Flow**
```
Frontend: Browse campaigns → Select campaign → Click "Donate"
    ↓
DonationWizard (2-3 steps):
  1. Select amount and payment method
  2. Review donation details
  3. Confirm submission
    ↓
POST /api/campaigns/{campaignId}/donations
    ↓
Body: {
  amount: 25.50,              // dollars
  paymentMethod: 'paypal',
  donorName: 'John',
  message: 'Keep up the work!',
  isAnonymous: false
}
    ↓
Backend: DonationController.createDonation()
    ↓
Validation:
  - Campaign exists and is active
  - Payment method accepted by campaign
  - Amount within acceptable range
  - No self-donations
    ↓
TransactionService.recordDonation()
    ↓
Fee calculation:
  - Amount in cents: 2550
  - Platform fee (20%): 510 cents
  - Net amount: 2040 cents
    ↓
Transaction model save (status: 'pending')
    ↓
Sweepstakes entries created (auto-determined by amount)
    ↓
Response: {
  transaction_id: 'TRANS-2026-04-07-ABC123',
  amount_dollars: 25.50,
  fee_breakdown: { gross: 2550, fee: 510, net: 2040 },
  status: 'pending',
  sweepstakes_entries: 2
}
    ↓
Frontend: Show confirmation → Toast notification
    ↓
useDonations hook invalidated
```

### 3. **Campaign Activation (Draft → Active)**
```
Frontend: Creator dashboard → Campaign card → Click "Activate"
    ↓
POST /api/campaigns/{campaignId}/activate
    ↓
Backend: campaignController.activate()
    ↓
Validation:
  - Campaign exists
  - Creator owns campaign
  - Campaign is in 'draft' status
  - Payment methods configured
    ↓
Campaign.update({ status: 'active' })
    ↓
CampaignProgress model created (tracks metrics)
    ↓
ActivityLog record created (audit trail)
    ↓
Response: { success: true, campaign: {...} }
    ↓
Frontend: Dashboard updated, redirect to detail page
```

### 4. **Admin Transaction Verification**
```
Frontend: Admin dashboard → Transactions tab → Unverified transactions
    ↓
GET /api/admin/transactions?status=pending
    ↓
Backend: AdminController.listTransactions()
    ↓
Return: { transactions: [], pagination: {} }
    ↓
Frontend: Display transaction list with verify/reject buttons
    ↓
Admin clicks "Verify" on transaction
    ↓
POST /api/admin/transactions/{transactionId}/verify
    ↓
Backend: TransactionController.verify()
    ↓
Validation:
  - Transaction exists
  - User has admin role
  - Transaction status is 'pending'
    ↓
Transaction.update({
  status: 'verified',
  verified_by: adminId,
  verified_at: now
})
    ↓
User.update({ stats: { total_donated: +amountCents } })
    ↓
Campaign.update({ stats: { total_raised: +amountCents } })
    ↓
Response: { transaction: {...updated} }
```

### 5. **Share/Referral System**
```
Frontend: Campaign detail → "Share this campaign" button
    ↓
Generate referral link: /ref/abc123def456
    ↓
POST /api/share/generate-referral-link
    ↓
Backend: ShareReferralController.generateReferralLink()
    ↓
ReferralLink model created with unique hash
    ↓
Response: { referralLink: 'https://honestneed.com/ref/abc123' }
    ↓
Frontend: Display shareable URL, allow copying
    ↓
Someone visits /ref/abc123 and donates
    ↓
GET /api/share/track-referral/{hash}
    ↓
Backend: ReferralTrackingService records visit
    ↓
POST /api/donations (donation submission includes referralId)
    ↓
TransactionService records referral_reward for original sharer
    ↓
Reward = 5% of donation amount
    ↓
Frontend: Share analytics updated, earnings display refreshed
```

### 6. **API Request/Response Transformation**

#### Backend → Frontend Data Transformation
```javascript
// Campaign from DB (internal format with cents)
{
  _id: ObjectId('...'),
  campaign_id: 'CAMP-2026-0001',
  creator_id: ObjectId('...'),
  title: 'Build Community Center',
  goals: [{ 
    goal_type: 'fundraising',
    target_amount: 500000,  // cents
    current_amount: 125000
  }],
  payment_methods: [...],
  status: 'active'
}

// Transform to frontend (dollars, mapped fields)
{
  id: 'CAMP-2026-0001',           // campaign_id
  _id: '...',                      // Keep for some operations
  creatorId: '...',
  title: 'Build Community Center',
  goals: [{
    goalType: 'fundraising',
    targetAmount: 5000,            // 500000 / 100
    currentAmount: 1250
  }],
  paymentMethods: [...],
  status: 'active',
  progress: 0.25                   // Calculated: 1250 / 5000
}
```

### Error Response Format

**Consistent across all endpoints**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "details": [
      { "field": "email", "message": "Invalid email format" },
      { "field": "amount", "message": "Amount must be positive" }
    ],
    "statusCode": 422,
    "timestamp": "2026-04-07T10:30:45.123Z"
  }
}
```

---

## Authentication & Authorization

### JWT Token Structure
```javascript
// Access Token Payload
{
  userId: ObjectId,
  roles: ['creator'],
  type: 'access',
  iat: 1234567890,          // issued at
  exp: 1234567890 + 3600    // expires in 1 hour
}

// Refresh Token Payload
{
  userId: ObjectId,
  type: 'refresh',
  iat: 1234567890,
  exp: 1234567890 + 604800  // expires in 7 days
}
```

### Authentication Middleware (Backend)
```javascript
// Flow for every protected endpoint
1. Extract Authorization header: "Bearer <token>"
2. Verify JWT signature using JWT_SECRET
3. Check token expiration
4. Attach decoded user context to req.user:
   {
     _id: userId,
     id: userId,
     userId: userId,
     roles: ['admin'],
     type: 'access'
   }
5. Pass to route handler
```

### Role-Based Access Control (RBAC)

**Three main roles**:
- **admin**: Full platform control
- **creator**: Can create campaigns, manage donations
- **user** (or supporter): Can browse, donate, share

**Permission Matrix**:
```
Admin permissions:
  - verify:user
  - block:user
  - delete:user
  - approve:campaign
  - reject:campaign
  - verify:transaction
  - settle:fees

Creator permissions:
  - create:campaign
  - edit:campaign (draft only)
  - activate:campaign
  - pause:campaign
  - delete:campaign (draft only)
  - view:campaign_analytics
  - withdraw:funds

User permissions:
  - read:campaigns
  - create:donation
  - view:donation_history
  - create:share
  - claim:sweepstakes_prize
```

### Frontend Authentication

**authStore.ts** manages:
- User session state
- Token storage (localStorage + cookies)
- Login/logout lifecycle
- Permission checking client-side

**Protected Routes** component:
```typescript
<ProtectedRoute allowedRoles={['creator', 'admin']}>
  <CreatorDashboard />
</ProtectedRoute>
```

**Token Refresh Flow**:
1. Access token expires
2. API interceptor catches 401 response
3. Call POST /auth/refresh with refresh token
4. Get new access token
5. Retry original request

---

## Error Handling

### Backend Error Hierarchy

**1. Validation Errors (422)**
- Zod/Joi validation failures
- Missing required fields
- Invalid field formats

**2. Authentication Errors (401)**
- Missing auth header
- Invalid/malformed token
- Token expired

**3. Authorization Errors (403)**
- User lacks required role
- User doesn't own resource
- Insufficient permissions

**4. Resource Errors (404/409)**
- Resource not found
- Resource in wrong state
- Duplicate unique constraint

**5. Business Logic Errors (400/409)**
- Campaign not active for donations
- Invalid payment method
- Insufficient funds

**6. Server Errors (500)**
- Database connection failure
- Unhandled exceptions
- External service failures

### Error Logging

**Winston Logger** captures:
```javascript
{
  level: 'error',
  timestamp: '2026-04-07T10:30:45.123Z',
  message: 'Error message',
  userId: '...',
  path: '/api/campaigns',
  method: 'POST',
  ip: '192.168.1.1',
  statusCode: 400,
  errorCode: 'VALIDATION_ERROR',
  stack: '...'
}
```

### Frontend Error Handling

**Toast Notifications**:
```typescript
// Success
toast.success('Campaign created successfully!')

// Error
toast.error('Failed to create campaign: Invalid amount')

// Loading
toast.loading('Processing donation...')
```

**Error Boundaries**:
- Catch component rendering crashes
- Display fallback UI
- Log to error tracking service (if configured)

---

## Key Features & Workflows

### 1. **Campaign Management**
- Create campaigns in draft status with wizard
- Support two types: fundraising and sharing
- Type-specific fields validated
- Activate/pause/complete lifecycle
- Analytics dashboard with metrics
- Payment methods configuration

### 2. **Donation System**
- Multiple payment methods: PayPal, Venmo, Bank Transfer, Check, Crypto
- Automatic sweepstakes entries based on amount
- 20% platform fee on all donations
- Admin verification workflow
- Transaction history and receipts

### 3. **Sharing & Referrals**
- Generate unique referral links
- Track shares across social platforms
- Earn rewards for successful referrals
- QR code generation for campaigns
- Analytics on share performance

### 4. **Sweepstakes Program**
- Automatic entries for donations
- Configuration per campaign
- Random drawing mechanism
- Prize claim verification
- Compliance tracking

### 5. **Volunteer System**
- Volunteer profile creation
- Skill-based task matching
- Volunteer offer management
- Task completion tracking
- Recognition system

### 6. **Admin Panel**
- User management and verification
- Campaign moderation and approval
- Transaction verification
- Fee settlement and reporting
- Platform analytics dashboard
- System settings and policies

### 7. **Analytics & Reporting**
- Campaign performance metrics
- Donation analytics
- Referral tracking
- Platform-wide KPIs
- CSV export capabilities

---

## Database Models

### Core Model Relationships
```
User (1) ←→ (Many) Campaign
           ├→ Created campaigns
           ├→ Creator role campaigns
           └→ Supporter donations

Campaign (1) ←→ (Many) Transaction/Donation
         (1) ←→ (Many) Share
         (1) ←→ (Many) VolunteerAssignment
         (1) ←→ (Many) CampaignUpdate
         (1) ←→ (Many) SweepstakesSubmission

Transaction (1) ←→ (1) Campaign
          (1) ←→ (1) User (supporter)
          (1) ←→ (1) FeeTransaction
          (1) ←→ (+) SweepstakesSubmission

Share (1) ←→ (1) Campaign
    (1) ←→ (Many) ShareTracking
    (1) ←→ (1) ReferralLink

FeeTransaction (1) ←→ (1) Transaction
             (1) ←→ (1) SettlementLedger
```

### Model Field Patterns

**Timestamps**: All models include `created_at`, `updated_at`
**Status Fields**: Track workflow state (draft, active, paused, completed)
**Metrics**: Track aggregated counts (donations_made, total_raised, etc.)
**References**: Foreign keys using MongoDB ObjectIds
**Indexing**: Performance indexes on frequently queried fields

---

## API Endpoints Summary

### Authentication (7 endpoints)
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/check-email
POST   /api/auth/refresh
POST   /api/auth/request-password-reset
GET    /api/auth/verify-reset-token/:token
POST   /api/auth/reset-password
```

### Campaigns (15+ endpoints)
```
GET    /api/campaigns
POST   /api/campaigns
GET    /api/campaigns/need-types
GET    /api/campaigns/trending
GET    /api/campaigns/:id
PUT    /api/campaigns/:id
DELETE /api/campaigns/:id
POST   /api/campaigns/:id/activate
POST   /api/campaigns/:id/pause
POST   /api/campaigns/:id/complete
GET    /api/campaigns/:id/analytics
POST   /api/campaigns/:id/updates
```

### Donations (12+ endpoints)
```
POST   /api/campaigns/:campaignId/donations
GET    /api/donations
GET    /api/donations/:id
GET    /api/donations/history
POST   /api/donations/:id/verify
POST   /api/donations/:id/refund
GET    /api/campaigns/:id/donations
GET    /api/donations/stats
GET    /api/donations/export
POST   /api/donations/:id/receipt
```

### Sweepstakes (8+ endpoints)
```
GET    /api/sweepstakes
POST   /api/sweepstakes
GET    /api/sweepstakes/:id
POST   /api/sweepstakes/:id/submit-entry
GET    /api/sweepstakes/my-entries
POST   /api/sweepstakes/:id/draw
GET    /api/sweepstakes/:drawingId/winners
POST   /api/sweepstakes/claim-prize
```

### Sharing (10+ endpoints)
```
POST   /api/share/generate-referral-link
GET    /api/share/track-referral/:hash
POST   /api/share/record-share
GET    /api/share/stats
GET    /api/share/analytics
GET    /api/share/earnings
POST   /api/share/request-payout
POST   /api/share/config
```

### Admin (45+ endpoints)
```
GET    /api/admin/users
GET    /api/admin/users/:id
POST   /api/admin/users/:id/verify
POST   /api/admin/users/:id/block
GET    /api/admin/campaigns
POST   /api/admin/campaigns/:id/approve
POST   /api/admin/campaigns/:id/reject
GET    /api/admin/transactions
POST   /api/admin/transactions/:id/verify
GET    /api/admin/dashboard
GET    /api/admin/fees
POST   /api/admin/fees/settle
... and 35+ more
```

### Users (8+ endpoints)
```
GET    /api/users/profile
PUT    /api/users/profile
GET    /api/users/stats
POST   /api/users/avatar
DELETE /api/users/account
GET    /api/users/preferences
PUT    /api/users/preferences
```

### Analytics (6+ endpoints)
```
GET    /api/analytics/dashboard
GET    /api/analytics/campaigns
GET    /api/analytics/donations
GET    /api/analytics/users
GET    /api/analytics/time-series
GET    /api/analytics/export
```

### Volunteers (10+ endpoints)
```
GET    /api/volunteers/profile
POST   /api/volunteers/profile
GET    /api/volunteers/assignments
POST   /api/volunteers/assignments/:id/accept
POST   /api/volunteers/assignments/:id/reject
POST   /api/volunteers/assignments/:id/complete
GET    /api/volunteers/offers
... and 3+ more
```

### Payment Methods (8+ endpoints)
```
POST   /api/payment-methods
GET    /api/payment-methods
PUT    /api/payment-methods/:id
DELETE /api/payment-methods/:id
POST   /api/payment-methods/:id/verify
GET    /api/payment-methods/types
... and 2+ more
```

---

## Key Technical Insights

### 1. **Scalability Considerations**
- MongoDB indexing on `creator_id`, `status`, `campaign_id`
- Redis caching layer (for analytics, analytics cache service exists)
- Queue system for async tasks (donation processing, email notifications)
- Pagination on all list endpoints (default 20-100 items)

### 2. **Security Practices**
- HTTPS enforced in production
- Helmet.js for security headers
- Rate limiting (express-rate-limit middleware)
- Input validation with Zod/Joi
- CORS configured with frontend URL allowlist
- JWT secrets stored in environment variables
- Passwords hashed with bcrypt (rounds: 8-15)

### 3. **Performance Optimization**
- Query pagination and filtering
- Field projection (only select needed fields)
- Indexed database queries
- Client-side caching with React Query
- Lazy loading of components
- Compressed responses

### 4. **Data Consistency**
- Transactional fee calculations
- Referential integrity with MongoDB ObjectIds
- Audit logs for all admin actions
- Activity tracking for user actions
- Settlement ledger for payment tracking

### 5. **File Upload Handling**
- Multipart/form-data for campaign images
- S3 integration (AWS_ACCESS_KEY_ID in env config)
- File size limits (10MB for images)
- Allowed types: JPEG, PNG, GIF, WebP
- Server-side validation

---

## Development Workflow

### Environment Setup
```bash
# Backend
cp .env.example .env
npm install
npm run dev          # starts on port 5000

# Frontend
cd honestneed-frontend
npm install
npm run dev          # starts on port 3000
```

### Testing
```bash
# Backend
npm run test         # Unit tests
npm run test:integration  # Integration tests
npm run test:coverage    # Coverage report

# Frontend
npm run lint         # ESLint
npm run build        # Next.js build
```

### Database
```bash
npm run db:seed      # Load test data
npm run db:migrate   # Run migrations
npm run db:reset     # Wipe and reseed
```

---

## Conclusion

The HONESTNEED application is a full-featured fundraising and community platform built with:
- **Robust backend**: Express + MongoDB with comprehensive services
- **Modern frontend**: Next.js with type-safe React components
- **Secure authentication**: JWT-based with role-based access control
- **Complex business logic**: Campaign lifecycle, fee calculations, sweepstakes
- **Production-ready**: Error handling, logging, validation, testing

The architecture separates concerns effectively with clear layer boundaries: routes → controllers → services → models. Frontend state management uses Zustand for UI state and React Query for server state. Data flows consistently through transformations at API boundaries to hide internal database formats from clients.

The platform is designed to scale with proper indexing, pagination, caching, and asynchronous task processing. Security is prioritized with JWT authentication, input validation, rate limiting, and audit logging.
