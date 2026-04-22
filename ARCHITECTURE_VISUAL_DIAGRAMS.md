# HONESTNEED Architecture - Visual Diagrams

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Client Layer (Browser)                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Next.js Frontend (React 19 + TypeScript)                        │   │
│  │  - App Router with route groups                                  │   │
│  │  - Server Components & Client Components                         │   │
│  │  - Styled Components + Tailwind CSS                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  State Management                                                │   │
│  │  - Zustand (auth, wizard, filters, donations)                   │   │
│  │  - React Query (server state, caching)                          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  API Integration Layer                                           │   │
│  │  ├─ Axios Client with interceptors                              │   │
│  │  ├─ 13 Service classes (campaignService, donationService, etc)  │   │
│  │  └─ Bearer token injection & error handling                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓ HTTPS
          ┌─────────────────────────────────────────────┐
          │   API Gateway / Load Balancer (Optional)    │
          └─────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        Backend API Layer (Node.js)                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Express.js Server (Port 5000)                                   │   │
│  │  ├─ Security Middleware (Helmet, CORS)                          │   │
│  │  ├─ Auth Middleware (JWT verification)                          │   │
│  │  ├─ RBAC Middleware (role checking)                             │   │
│  │  ├─ Validation Middleware (Zod/Joi)                             │   │
│  │  ├─ Request Logger (Winston)                                    │   │
│  │  └─ Global Error Handler                                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Route Layer (17 files)                                          │   │
│  │  ├─ authRoutes            (7 endpoints)                          │   │
│  │  ├─ campaignRoutes        (15+ endpoints)                        │   │
│  │  ├─ donationRoutes        (12+ endpoints)                        │   │
│  │  ├─ adminRoutes           (45+ endpoints)                        │   │
│  │  ├─ sweepstakesRoutes     (8+ endpoints)                         │   │
│  │  ├─ shareReferralRoutes   (10+ endpoints)                        │   │
│  │  └─ ... (11 more route files)                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Controller Layer (19 files)                                     │   │
│  │  - Handle requests & call services                              │   │
│  │  - Format responses                                              │   │
│  │  - Input validation                                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Service Layer (24 files)                                        │   │
│  │  - Business logic encapsulation                                  │   │
│  │  - Data transformation                                           │   │
│  │  - Integration with models                                       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Data Layer (29 MongoDB schemas)                                 │   │
│  │  - User, Campaign, Transaction, Donation                        │   │
│  │  - Share, Sweepstakes, PlatformSettings                         │   │
│  │  - ActivityLog, AuditLog, TokenBlacklist                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓ MongoDB Protocol
          ┌─────────────────────────────────────────────┐
          │        MongoDB Database (Atlas)             │
          │  ├─ Collections: users, campaigns, etc      │
          │  ├─ Indexes on: creator_id, status, etc     │
          │  └─ Replica set for HA                      │
          └─────────────────────────────────────────────┘
```

---

## 2. Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT SIDE                                  │
│                                                                 │
│  User enters credentials → RegisterForm/LoginForm              │
│           ↓                                                    │
│  Form validation (Zod schema)                                  │
│           ↓                                                    │
│  POST /api/auth/login { email, password }                     │
│           ↓                                                    │
│  Response: { user, token, refreshToken }                      │
│           ↓                                                    │
│  authStore.setAuth(user, token)                               │
│           ├─ Save token to localStorage                       │
│           ├─ Save token to cookies (7-day expiry)             │
│           ├─ Save user to localStorage                        │
│           └─ Set isAuthenticated = true                       │
│           ↓                                                    │
│  Subsequent requests include Authorization header:            │
│  "Authorization: Bearer <access_token>"                       │
│           ↓                                                    │
│  [TOKEN EXPIRES]                                              │
│           ↓                                                    │
│  API interceptor catches 401 response                         │
│           ↓                                                    │
│  POST /api/auth/refresh { refreshToken }                      │
│           ↓                                                    │
│  Get new access token                                         │
│           ↓                                                    │
│  Retry original request with new token                        │
│           ↓                                                    │
│  User clicks logout → authStore.clearAuth()                   │
│           ├─ Remove from localStorage                         │
│           ├─ Clear cookies                                    │
│           └─ Set isAuthenticated = false                      │
│           ↓                                                    │
│  Redirect to /login                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND SIDE                                 │
│                                                                 │
│  POST /api/auth/login                                          │
│           ↓                                                    │
│  authController.login(req, res)                               │
│           ├─ Extract email, password                          │
│           ├─ User.findOne({ email })                          │
│           ├─ verifyPassword(password, password_hash)          │
│           └─ Check: not blocked, etc.                         │
│           ↓                                                    │
│  Generate tokens:                                             │
│  - Access token (1 hour expiry)                               │
│  - Refresh token (7 day expiry)                               │
│           ↓                                                    │
│  Update User.lastLogin                                        │
│           ↓                                                    │
│  Return: {                                                    │
│    success: true,                                             │
│    data: {                                                    │
│      user: { id, email, displayName, role },                 │
│      accessToken: "...",                                      │
│      refreshToken: "..."                                      │
│    }                                                           │
│  }                                                             │
│                                                                 │
│  Protected Endpoints:                                         │
│           ↓                                                    │
│  authMiddleware:                                              │
│  1. Extract Authorization header                             │
│  2. verifyToken(token) - check signature & expiry            │
│  3. Attach req.user = { userId, roles, type }                │
│  4. Proceed to route handler                                 │
│           ↓                                                    │
│  RBAC middleware (if used):                                   │
│  1. Check req.user.roles includes required role             │
│  2. If not, throw 403 Forbidden                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Campaign Creation & Activation Flow

```
STEP 1: Campaign Wizard (Frontend)
┌────────────────────────────────────────────────┐
│  User navigates to /campaigns/new              │
│           ↓                                    │
│  CampaignWizard component rendered            │
│           ↓                                    │
│  Step 1: Select Type                          │
│  ├─ Fundraising (has goalAmount, category)    │
│  └─ Sharing (has platforms, budget)           │
│           ↓ (wizardStore.campaignType = 'fundraising')
│  Step 2: Basic Info                           │
│  ├─ Title (min 5 chars)                       │
│  ├─ Description (max 2000 chars)              │
│  └─ Image (optional, max 10MB)                │
│           ↓ (wizardStore.basicInfo = {...})
│  Step 3: Type-Specific Data                   │
│  ├─ For fundraising: goal amount, category    │
│  └─ For sharing: platforms, reward per share  │
│           ↓ (wizardStore.fundraisingData = {...})
│  Step 4: Review & Submit                      │
│  ├─ Show all entered data                     │
│  ├─ "Submit" button triggers POST              │
│  └─ Final validation before send               │
└────────────────────────────────────────────────┘

STEP 2: Campaign Creation API Call
┌────────────────────────────────────────────────┐
│  POST /api/campaigns (Multipart Form-Data)     │
│                                                │
│  FormData:                                     │
│  • title: "Build Community Center"            │
│  • description: "Help us build..."            │
│  • need_type: "community_infrastructure"      │
│  • tags: "community,center,education"  (CSV)  │
│  • goalAmount: 50000 (dollars → converted)    │
│  • category: "education"                      │
│  • image: <File object>                       │
│           ↓                                    │
│  campaignController.create(req, res)          │
│           ↓                                    │
│  Extract userId from req.user (JWT)           │
│           ↓                                    │
│  Validate input with campaignCreationSchema   │
│           ├─ Title 5-200 chars: ✓             │
│  ├─ Description present: ✓                    │
│  ├─ Need type valid: ✓                        │
│  └─ Amount 1-9999999: ✓                       │
│           ↓                                    │
│  Parse form data:                             │
│  • Convert dollars to cents: 50000 * 100      │
│  • Split CSV to array: ["community", ...]     │
│  • Convert image file to S3 URL               │
│           ↓                                    │
│  CampaignService.createCampaign()             │
│           ├─ Generate campaign_id             │
│           ├─ Set creator_id from JWT          │
│           ├─ Set status = "draft"             │
│           ├─ Initialize goals array           │
│           └─ Save to MongoDB                  │
│           ↓                                    │
│  Response 201 Created:                        │
│  {                                            │
│    success: true,                             │
│    id: "CAMP-2026-0001",                     │
│    campaign: {                                │
│      id: "CAMP-2026-0001",                   │
│      title: "Build Community Center",        │
│      status: "draft",                        │
│      goals: [{                               │
│        goalType: "fundraising",              │
│        targetAmount: 500000,                 │
│      }],                                     │
│      ...                                      │
│    }                                          │
│  }                                            │
└────────────────────────────────────────────────┘

STEP 3: Draft Campaign Management (Frontend)
┌────────────────────────────────────────────────┐
│  useCampaigns hook invalidated → refetch      │
│           ↓                                    │
│  Redirect to /campaigns/{id}                  │
│           ↓                                    │
│  Creator dashboard shows draft campaign      │
│  ├─ Edit button → PUT /api/campaigns/{id}    │
│  ├─ Delete button → DELETE /api/campaigns/.. │
│  └─ Activate button → POST /api/campaigns/./ │
│                              /activate        │
└────────────────────────────────────────────────┘

STEP 4: Campaign Activation
┌────────────────────────────────────────────────┐
│  Creator clicks "Activate" button             │
│           ↓                                    │
│  POST /api/campaigns/{id}/activate            │
│           ↓                                    │
│  campaignController.activate(req, res)        │
│           ▼                                    │
│  Validations:                                 │
│  ├─ Campaign exists: ✓                       │
│  ├─ Creator owns campaign: ✓                 │
│  ├─ Status is "draft": ✓                     │
│  ├─ Payment methods configured: ✓            │
│  └─ Goals defined: ✓                         │
│           ↓                                    │
│  Database Updates:                            │
│  • Campaign.status = "active"                │
│  • Campaign.activated_at = now()             │
│  • CampaignProgress created (tracking)       │
│  • ActivityLog.create({ action: 'activate' })│
│           ↓                                    │
│  Response 200 OK:                             │
│  {                                            │
│    success: true,                             │
│    message: "Campaign activated successfully",│
│    campaign: { id, title, status: "active" }│
│  }                                            │
│           ↓                                    │
│  Frontend:                                    │
│  ├─ Dashboard updated                        │
│  ├─ Campaign now visible to all              │
│  └─ Accepts donations                        │
└────────────────────────────────────────────────┘
```

---

## 4. Donation Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  USER INITIATES DONATION (Frontend)                             │
│                                                                 │
│  Campaign detail page → "Donate" button                        │
│     ↓                                                          │
│  Redirect to /campaigns/{id}/donate                           │
│     ↓                                                          │
│  DonationWizard component (2-3 steps):                        │
│  Step 1: Amount & Payment Method                             │
│    ├─ Input amount: $25.50                                   │
│    ├─ Select payment: "PayPal"                               │
│    └─ Show fee breakdown: $5.10 (20%)                        │
│     ↓                                                          │
│  Step 2 (optional): Donor info                               │
│    ├─ Donor name                                             │
│    ├─ Message to creator                                     │
│    └─ Anonymous option                                       │
│     ↓                                                          │
│  Step 3: Review & Confirm                                    │
│    ├─ Show all details                                       │
│    ├─ Confirm button                                         │
│    └─ On submit: store in donationWizardStore               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  API CALL                                                       │
│                                                                 │
│  POST /api/campaigns/{campaignId}/donations                   │
│                                                                 │
│  Body:                                                         │
│  {                                                             │
│    "amount": 25.50,              // dollars                   │
│    "paymentMethod": "paypal",                                 │
│    "donorName": "Jane Smith",                                │
│    "message": "Great cause!",                                │
│    "isAnonymous": false                                       │
│  }                                                             │
│     ↓                                                          │
│  DonationController.createDonation()                          │
│     ↓                                                          │
│  Validations:                                                 │
│  ├─ Campaign exists: ✓                                       │
│  ├─ Campaign status is "active": ✓                           │
│  ├─ Amount > 0: ✓                                            │
│  ├─ Amount <= 10000: ✓                                       │
│  ├─ Payment method accepted by campaign: ✓                   │
│  ├─ Donor exists: ✓                                          │
│  ├─ Not self-donation: ✓                                     │
│  └─ User not blocked: ✓                                      │
│     ↓                                                          │
│  TransactionService.recordDonation()                         │
│     ↓                                                          │
│  Calculations:                                                │
│  • Amount in cents: 2550                                     │
│  • Platform fee (20%): 510 cents                             │
│  • Net to creator: 2040 cents                                │
│     ↓                                                          │
│  Database writes:                                             │
│  • Transaction created:                                       │
│    {                                                          │
│      transaction_id: "TRANS-2026-04-07-ABC123",              │
│      campaign_id: {...},                                     │
│      supporter_id: {...},                                    │
│      creator_id: {...},                                      │
│      amount_cents: 2550,                                     │
│      platform_fee_cents: 510,                                │
│      net_amount_cents: 2040,                                 │
│      payment_method: "paypal",                               │
│      status: "pending",  // awaiting admin verification      │
│      donor_name: "Jane Smith",                               │
│      message: "Great cause!",                                │
│      is_anonymous: false                                     │
│    }                                                          │
│                                                                 │
│  • FeeTransaction created:                                    │
│    { transaction_id, fee_cents: 510, status: "pending" }     │
│                                                                 │
│  • Sweepstakes entries created (auto-calculated):             │
│    • Entry rules: $1-5 = 1 entry, $5-25 = 2, etc.           │
│    • This donation: 2 entries created                        │
│                                                                 │
│  • Campaign metrics updated:                                  │
│    • CampaignProgress.donations_count += 1                   │
│    • CampaignProgress.pending_amount_cents += 2550           │
│                                                                 │
│  • ActivityLog recorded:                                      │
│    { user_id, action: "donated", campaign_id, amount }       │
│     ↓                                                          │
│  Response 201 Created:                                        │
│  {                                                             │
│    "success": true,                                           │
│    "message": "Donation recorded successfully",               │
│    "data": {                                                  │
│      "transaction_id": "TRANS-2026-04-07-ABC123",             │
│      "amount_dollars": 25.50,                                │
│      "fee_breakdown": {                                       │
│        "gross_cents": 2550,                                  │
│        "fee_cents": 510,                                     │
│        "net_cents": 2040,                                    │
│        "fee_percentage": 20                                  │
│      },                                                       │
│      "status": "pending",                                    │
│      "sweepstakes_entries": 2,                               │
│      "created_at": "2026-04-07T10:30:45.123Z"                │
│    }                                                          │
│  }                                                             │
│     ↓                                                          │
│  Frontend:                                                    │
│  ├─ Show confirmation toast                                  │
│  ├─ Display transaction ID                                   │
│  ├─ Update donation history                                  │
│  ├─ Show sweepstakes entries earned                          │
│  └─ Redirect to donation receipt/success page               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ADMIN VERIFICATION (Backend)                                  │
│                                                                 │
│  Admin sees pending transaction in dashboard                 │
│     ↓                                                          │
│  GET /api/admin/transactions?status=pending                  │
│     ↓                                                          │
│  AdminController returns list with verification UI           │
│     ↓                                                          │
│  POST /api/admin/transactions/{transactionId}/verify         │
│     ↓                                                          │
│  AdminController.verifyTransaction()                         │
│     ↓                                                          │
│  Updates:                                                     │
│  • Transaction.status = "verified"                           │
│  • Transaction.verified_by = adminId                         │
│  • Transaction.verified_at = now()                           │
│  • FeeTransaction.status = "verified"                        │
│     ↓                                                          │
│  Update platform metrics:                                    │
│  • PlatformStats.total_donations_verified += 1               │
│  • PlatformStats.total_revenue_cents += 2550                │
│  • PlatformStats.total_fees_collected_cents += 510           │
│     ↓                                                          │
│  Mark sweepstakes entries as "eligible"                      │
│     ↓                                                          │
│  If withdrawal requested:                                    │
│  • Schedule payout to creator's payment method              │
│  • Create SettlementLedger entry                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Transformation at API Boundaries

```
DATABASE (Internal Format - Cents, Full Data)
│
│ SELECT * FROM campaigns WHERE _id = ObjectId('...')
│ Result:
│ {
│   _id: ObjectId('64a9f3c1e8d9f2b5a1c7e9d1'),
│   campaign_id: 'CAMP-2026-0001',
│   creator_id: ObjectId('64a9f3c1e8d9f2b5a1c7e9d2'),
│   title: 'Build Community Center',
│   description: 'Help us build...',
│   goals: [{
│     goal_type: 'fundraising',
│     target_amount: 500000,     // 5000 dollars in cents
│     current_amount: 125000,    // progress in cents
│   }],
│   payment_methods: ['paypal', 'venmo'],
│   status: 'active',
│   created_at: '2026-04-07T10:30:45.000Z',
│   updated_at: '2026-04-07T10:30:45.000Z',
│   creator_stats: {
│     total_raised_cents: 125000
│   }
│ }
│
├─→ SERVICE LAYER (Transformation)
│   
│   CampaignService.getCampaign(id) {
│     // 1. Add calculated fields
│     // 2. Convert cents to dollars
│     // 3. Format dates
│     // 4. Map field names for frontend
│     
│     return {
│       ...campaign,
│       id: campaign.campaign_id,              // rename
│       creatorId: campaign.creator_id,        // rename
│       goals: campaign.goals.map(g => ({
│         goalType: g.goal_type,               // rename
│         targetAmount: g.target_amount / 100, // convert cents→dollars
│         currentAmount: g.current_amount / 100,
│         progress: (g.current_amount / g.target_amount) * 100
│       })),
│       paymentMethods: campaign.payment_methods,
│       createdAt: campaign.created_at
│     }
│   }
│
├─→ API RESPONSE (Frontend Format - Dollars, Selected Fields)
│   
│   {
│     "success": true,
│     "data": {
│       "id": "CAMP-2026-0001",
│       "creatorId": "64a9f3c1e8d9f2b5a1c7e9d2",
│       "title": "Build Community Center",
│       "goals": [{
│         "goalType": "fundraising",
│         "targetAmount": 5000,                // dollars!
│         "currentAmount": 1250,               // dollars!
│         "progress": 25
│       }],
│       "paymentMethods": ["paypal", "venmo"],
│       "status": "active",
│       "createdAt": "2026-04-07T10:30:45.000Z"
│     }
│   }
│
├─→ CLIENT STATE (React Query Cache)
│   
│   queryClient.setQueryData(
│     ['campaigns', 'detail', 'CAMP-2026-0001'],
│     {  // cached response
│       id: "CAMP-2026-0001",
│       creatorId: "...",
│       title: "Build Community Center",
│       goals: [{
│         goalType: "fundraising",
│         targetAmount: 5000,        // displayed as $5,000.00
│         currentAmount: 1250,       // displayed as $1,250.00
│         progress: 25
│       }],
│       ...
│     }
│   )
│
└─→ UI RENDER
    
    <ProgressBar 
      value={campaign.goals[0].progress}    // 25
      label={`$${campaign.goals[0].currentAmount.toLocaleString()} / $${campaign.goals[0].targetAmount.toLocaleString()}`}
      // Renders: "$1,250 / $5,000"
    />
```

---

## 6. Component Hierarchy (Campaign Detail Example)

```
Page: /campaigns/[id]/page.tsx
│
├─ Layout
│  └─ Navbar + Footer (from root layout)
│
├─ CampaignDetailPage (async server component)
│  │
│  ├─ ClientProviders (Client boundary)
│  │  └─ CampaignDetail (client component with hooks)
│  │     │
│  │     ├─ useParams() → get {id}
│  │     ├─ useCampaign(id) → fetch from API
│  │     ├─ useState(activeTab)
│  │     └─ useState(showDonateModal)
│  │     │
│  │     ├─ CampaignHero
│  │     │  ├─ CampaignImage
│  │     │  ├─ CampaignTitle
│  │     │  ├─ CreatorProfile
│  │     │  └─ ActionButtons
│  │     │     ├─ DonateButton → onClick: setShowDonateModal(true)
│  │     │     ├─ ShareButton → opens share menu
│  │     │     └─ BookmarkButton
│  │     │
│  │     ├─ TabbedContent
│  │     │  ├─ Tab: "Details"
│  │     │  │  └─ CampaignDescription
│  │     │  │     ├─ Title
│  │     │  │     ├─ Description (formatted text)
│  │     │  │     ├─ Tags (as chips)
│  │     │  │     └─ Location
│  │     │  │
│  │     │  ├─ Tab: "Progress"
│  │     │  │  └─ CampaignProgress
│  │     │  │     ├─ ProgressBar (with percentage)
│  │     │  │     ├─ GoalAmount display
│  │     │  │     ├─ DonationCount
│  │     │  │     └─ TimeRemaining
│  │     │  │
│  │     │  ├─ Tab: "Updates"
│  │     │  │  └─ CampaignUpdates (list)
│  │     │  │     └─ CampaignUpdateCard × N
│  │     │  │        ├─ DateTime
│  │     │  │        ├─ UpdateTitle
│  │     │  │        ├─ UpdateContent
│  │     │  │        └─ UpdateMedia (optional)
│  │     │  │
│  │     │  └─ Tab: "Supporters"
│  │     │     └─ DonorList
│  │     │        └─ DonorCard × N
│  │     │           ├─ DonorName (or "Anonymous")
│  │     │           ├─ Amount
│  │     │           └─ Message (if any)
│  │     │
│  │     └─ Modal: DonateModal (conditionally rendered)
│  │        └─ DonationWizard (2 steps)
│  │           ├─ Step 1: AmountAndMethodForm
│  │           │  ├─ AmountInput
│  │           │  ├─ FeeCalculator (shows 20% fee)
│  │           │  ├─ PaymentMethodSelect
│  │           │  └─ NextButton
│  │           │
│  │           └─ Step 2: DonorInfoForm
│  │              ├─ DonorNameInput
│  │              ├─ MessageTextarea
│  │              ├─ AnonymousCheckbox
│  │              ├─ TermsCheckbox
│  │              ├─ BackButton
│  │              └─ SubmitButton → POST /donations
│  │
│  └─ ErrorBoundary
│     └─ Error message if fetch fails
│
└─ Metadata export (title, description, og:image, etc.)
```

---

## 7. Error Handling Pipeline

```
┌─────────────────────────────────────────────┐
│  FRONTEND                                   │
│  catch(error) → handleError()               │
└─────────────────────────────────────────────┘
            ↓ Parse error response
        ┌─────────────────────────────────────┐
        │ Error Response Interceptor          │
        │ (axios interceptor)                 │
        │                                     │
        │ if (error.response) {               │
        │   // 4xx/5xx from backend          │
        │   const { code, message } =        │
        │     error.response.data.error       │
        │ } else {                            │
        │   // Network error                 │
        │ }                                   │
        └─────────────────────────────────────┘
            ↓
        ┌─────────────────────────────────────┐
        │ Error Type Determination            │
        │                                     │
        │ VALIDATION_ERROR       → Field errors
        │ UNAUTHORIZED           → Show login  │
        │ FORBIDDEN              → Deny access │
        │ NOT_FOUND              → 404 page   │
        │ DUPLICATE_KEY_ERROR    → Retry      │
        │ INTERNAL_SERVER_ERROR  → Retry      │
        └─────────────────────────────────────┘
            ↓
        ┌─────────────────────────────────────┐
        │ User Notification                   │
        │                                     │
        │ toast.error(message)                │
        │ └─ "Email already exists"          │
        │ └─ "Campaign not found"            │
        │ └─ "Invalid payment method"        │
        │                                     │
        │ OR                                  │
        │                                     │
        │ <FormFieldError field={fieldName} />
        │ └─ Shows inline validation error    │
        └─────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  BACKEND                                    │
│  Express Route Handler                      │
└─────────────────────────────────────────────┘
            ↓ try/catch or middleware
        ┌─────────────────────────────────────┐
        │ Error Identification                │
        │                                     │
        │ • throw new Error(message)         │
        │ • return res.status(400)...        │
        │ • next(err) → errorHandler         │
        └─────────────────────────────────────┘
            ↓
        ┌─────────────────────────────────────┐
        │ Global Error Handler Middleware     │
        │ (errorHandler.js)                   │
        │                                     │
        │ const errorHandler = (err) => {     │
        │   // Map error type to HTTP status  │
        │   // Extract error details          │
        │   // Log with Winston               │
        │   // Build standardized response    │
        │ }                                   │
        └─────────────────────────────────────┘
            ↓
        ┌─────────────────────────────────────┐
        │ Winston Logger                      │
        │                                     │
        │ logger.error('Request error', {     │
        │   message,                          │
        │   statusCode,                       │
        │   userId,                           │
        │   path,                             │
        │   stack,                            │
        │   timestamp                         │
        │ })                                  │
        │                                     │
        │ Output:                             │
        │ • Console (dev)                     │
        │ • File (logs/error.log)             │
        │ • Sentry (if production)            │
        └─────────────────────────────────────┘
            ↓
        ┌─────────────────────────────────────┐
        │ Standardized JSON Response          │
        │                                     │
        │ {                                   │
        │   "success": false,                 │
        │   "error": {                        │
        │     "code": "VALIDATION_ERROR",    │
        │     "message": "...",               │
        │     "details": [                    │
        │       {                             │
        │         "field": "email",           │
        │         "message": "Invalid email"  │
        │       }                             │
        │     ],                              │
        │     "statusCode": 422,              │
        │     "timestamp": "...",             │
        │     "requestId": "..." (optional)   │
        │   }                                 │
        │ }                                   │
        └─────────────────────────────────────┘
            ↓
        Response sent to frontend
```

---

## 8. React Query Cache Strategy

```
QUERY KEY FACTORY
┌──────────────────────────────────────────────┐
│ campaignKeys = {                             │
│   all: ['campaigns'],                        │
│   lists: () => [...all, 'list'],            │
│   list: (page, limit, filters) =>           │
│     [...lists(), { page, limit, ...filters }]│
│   details: () => [...all, 'detail'],        │
│   detail: (id) => [...details(), id],       │
│   analytics: () => [...all, 'analytics'],   │
│   analyticsDetail: (id) =>                  │
│     [...analytics(), id],                   │
│   trending: () => [...all, 'trending'],     │
│ }                                            │
└──────────────────────────────────────────────┘

CACHE HIERARCHY
┌──────────────────────────────────────────────┐
│ ['campaigns']                                 │
│ ├─ ['campaigns', 'list']                     │
│ │  ├─ ['campaigns', 'list', {page:1,limit:12}]
│ │  │  └─ QUERY: getCampaigns(1, 12, filters)│
│ │  │     staleTime:  10min                  │
│ │  │     gcTime:     30min                  │
│ │  ├─ ['campaigns', 'list', {page:2,limit:12}]
│ │  │  └─ Same stale/gc times               │
│ │  └─ ...                                    │
│ ├─ ['campaigns', 'detail']                   │
│ │  ├─ ['campaigns', 'detail', 'CAMP-001']   │
│ │  │  └─ QUERY: getCampaign('CAMP-001')     │
│ │  │     staleTime:  5min                   │
│ │  │     gcTime:     15min                  │
│ │  ├─ ['campaigns', 'detail', 'CAMP-002']   │
│ │  │  └─ Same stale/gc times               │
│ ├─ ['campaigns', 'analytics']                │
│ │  ├─ ['campaigns', 'analytics', 'CAMP-001']│
│ │  │  └─ QUERY: getCampaignAnalytics(...)   │
│ │  │     staleTime:  3min (real-time!)      │
│ │  │     gcTime:     10min                  │
│ └─ ['campaigns', 'trending']                 │
│    └─ QUERY: getTrendingCampaigns()         │
│       staleTime: 30min                       │
│       gcTime:    1 hour                      │
└──────────────────────────────────────────────┘

MUTATION INVALIDATION EXAMPLE
┌──────────────────────────────────────────────┐
│ useMutation({                                 │
│   mutationFn: createDonation,                │
│   onSuccess: async () => {                  │
│     // Invalidate lists (need refetch!)     │
│     await queryClient.invalidateQueries({   │
│       queryKey: campaignKeys.lists()        │
│       // This invalidates ALL list caches    │
│     })                                       │
│                                              │
│     // Invalidate specific campaign detail   │
│     await queryClient.invalidateQueries({   │
│       queryKey: campaignKeys.detail(id)    │
│     })                                       │
│      ↓                                       │
│     // These queries now have isStale=true  │
│     // useQuery will refetch in background  │
│                                              │
│     toast.success('Donation recorded!')     │
│   }                                          │
│ })                                           │
└──────────────────────────────────────────────┘

CACHE LIFECYCLE
┌──────────────────────────────────────────────┐
│ 1. Initial State                             │
│    status: 'pending'                         │
│    no cached data                            │
│                                              │
│ 2. After First Query                         │
│    status: 'success'                         │
│    data: {...}                               │
│    isStale: false                            │
│                                              │
│ 3. After staleTime expires (10min)          │
│    status: 'success' (still shows old data)  │
│    isStale: true                             │
│                                              │
│ 4. Next focus/mount triggers refetch        │
│    status: 'success' (shows old data first)  │
│    fetching in background...                 │
│    On success → updates cache                │
│                                              │
│ 5. After gcTime expires (30min)             │
│    Query completely removed from cache      │
│    data: undefined                           │
│    Next query = full network request         │
│                                              │
│ 6. Manual Invalidation                      │
│    invalidateQueries() marks stale=true     │
│    Next useQuery hook trigger → refetch     │
└──────────────────────────────────────────────┘
```

---

This comprehensive visual architecture documentation provides clear understanding of:
- System layers and data flow
- Authentication and authorization mechanisms
- Complex workflows (campaigns, donations, sharing)
- Data transformations at API boundaries
- Component hierarchies
- Error handling pipelines
- Caching strategies

All diagrams use ASCII format for clarity and can be easily version controlled in the repository.
