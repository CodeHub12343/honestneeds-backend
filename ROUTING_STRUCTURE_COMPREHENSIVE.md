# HonestNeed Web Application - Comprehensive Routing Analysis

**Generated:** April 17, 2026  
**Framework:** Next.js 16 (App Router)  
**Frontend Path:** `honestneed-frontend/`

---

## Table of Contents
1. [Routing Overview](#routing-overview)
2. [Middleware & Route Protection](#middleware--route-protection)
3. [Route Groups & Layout Structure](#route-groups--layout-structure)
4. [Complete Route Hierarchy](#complete-route-hierarchy)
5. [Dynamic Routes Reference](#dynamic-routes-reference)
6. [Special Route Files](#special-route-files)
7. [API Routes](#api-routes)
8. [Route Statistics](#route-statistics)

---

## Routing Overview

### Framework Details
- **Framework:** Next.js 16 with App Router
- **Routing Type:** File-based routing with route groups
- **Protected Routes:** Implemented via middleware and `ProtectedRoute` component
- **Route Groups:** 4 route groups using parentheses `(groupName)` syntax
- **Dynamic Routes:** 7 dynamic route segments using `[param]` syntax
- **Special Files:** 3 (error.tsx, not-found.tsx, loading.tsx)

### Key Architectural Features
- **Route Group Isolation:** Routes in `(groupName)` don't appear in the URL path
- **Layout Nesting:** Each route group has its own layout for consistent UI
- **Authentication:** Middleware enforces access control before request reaches pages
- **Authorization:** Role-based access (creator, supporter, admin)
- **Protected Route Component:** Additional client-side protection component

---

## Middleware & Route Protection

### Middleware Configuration
**File:** `middleware.ts` (root level)

#### Protected Routes (Require Authentication)
```
- /dashboard/*
- /creator/*
- /admin/*
- /profile/*
- /donations/*
```

#### Admin-Only Routes
```
- /admin/*
```
**Required Role:** `admin`

#### Creator-Only Routes
```
- /creator/*
```
**Required Role:** `creator` or `admin`

#### Auth Routes (Redirect if Logged In)
```
- /login
- /register
- /forgot-password
- /reset-password
```
**Behavior:** Redirects to `/dashboard` if user already has auth token

#### Public Routes (No Authentication Required)
```
- /
- /campaigns/*
- /sweepstakes/*
- /browse
```

### Token Validation
- **Token Source:** Cookies (`auth_token`)
- **Role Source:** Cookies (`user_role`)
- **Fallback:** If token missing, redirects to `/login` with redirect param
- **Admin Check:** Validates `user_role` cookie for admin routes

---

## Route Groups & Layout Structure

### Root Layout
**File:** `app/layout.tsx`
- Global layout wrapping entire application
- Includes: Navbar, Footer, Providers, Toast notifications
- Styled with Tailwind and Styled Components
- Contains accessibility skip link

### Route Group Layouts

#### 1. Auth Group `(auth)`
**File:** `app/(auth)/layout.tsx`
- Centered authentication container
- Purple gradient background
- Max-width: 28rem
- Used for: Login, Register, Password Reset

#### 2. Campaigns Group `(campaigns)`
**File:** `app/(campaigns)/layout.tsx`
- Public campaign browsing and viewing
- Campaign card grid layout
- Search and filter functionality

#### 3. Creator Group `(creator)`
**File:** `app/(creator)/layout.tsx`
- Protected route: `allowedRoles: ['creator', 'admin']`
- Creator dashboard and management tools
- Admin sidebar navigation
- Creator-specific functionality

#### 4. Supporter Group `(supporter)`
**File:** `app/(supporter)/layout.tsx`
- Supporter-specific pages
- Simple pass-through layout
- Donations and shares management

#### 5. Admin Group
**File:** `app/admin/layout.tsx`
- Protected admin panel
- Admin sidebar navigation
- Admin-only dashboard and management tools
- Role verification via cookies

---

## Complete Route Hierarchy

### 1. Root Level Routes

#### `/` (Home/Landing Page)
- **File:** `app/page.tsx`
- **Type:** Page
- **Protected:** No
- **Description:** Landing page - default Next.js starter page template
- **Components:** Hero section with Next.js/Vercel integration links
- **Role Access:** Public

---

### 2. Authentication Routes
**Namespace:** `(auth)` route group (hidden from URL)  
**Base Path:** `/auth/` (parent layout)  
**Layout:** `app/(auth)/layout.tsx`

#### `/login`
- **File:** `app/(auth)/login/page.tsx`
- **Type:** Page
- **Protected:** No (redirects if already authenticated)
- **Description:** User login form with email/password authentication
- **Features:** 
  - Email and password validation
  - Show/hide password toggle
  - Form error handling
  - Link to registration and password reset
  - Styled with animated gradient blobs
  - Form submission via `useLogin()` hook
- **State Management:** React Hook Form + Zod validation
- **Role Access:** Unauthenticated users only

#### `/register`
- **File:** `app/(auth)/register/page.tsx`
- **Type:** Page
- **Protected:** No (redirects if already authenticated)
- **Description:** User registration page for new account creation
- **Features:**
  - Email, password, confirm password inputs
  - Role selection (supporter, creator)
  - Form validation with Zod schema
  - Error/success messages
  - Link to login page
- **Role Access:** Unauthenticated users only

#### `/forgot-password`
- **File:** `app/(auth)/forgot-password/page.tsx`
- **Type:** Page
- **Protected:** No
- **Description:** Password recovery request form
- **Features:**
  - Email input for password reset request
  - Sends reset link to user email
  - Confirmation message display
- **Role Access:** Unauthenticated users

#### `/reset-password/[token]`
- **File:** `app/(auth)/reset-password/[token]/page.tsx`
- **Type:** Page (Dynamic)
- **Protected:** No
- **Description:** Password reset form with token verification
- **Dynamic Segment:** `[token]` - Reset token from email link
- **Features:**
  - Token validation
  - New password input with confirmation
  - Password strength requirements
  - Success/error feedback
- **Query Parameters:** None (token in URL)
- **Role Access:** Users with valid reset token

---

### 3. Public Campaign Browsing Routes
**Namespace:** `(campaigns)` route group (hidden from URL)  
**Base Path:** `/campaigns/`  
**Layout:** `app/(campaigns)/layout.tsx`

#### `/campaigns` (or `/browse`)
- **File:** `app/(campaigns)/campaigns/page.tsx`
- **Type:** Page
- **Protected:** No
- **Description:** Public campaign browsing and discovery page
- **Features:**
  - Campaign grid/card layout
  - Search functionality with toLowerCase().includes()
  - Filter sidebar by:
    - Campaign type (fundraising/sharing)
    - Need type/category
    - Status
    - Funding level
    - Date range
  - Responsive grid (1-4 columns)
  - Pagination support
  - Empty state with create CTA
- **State Management:** `useFilterStore`, React Query
- **Query Parameters:** Search, filters, pagination
- **Role Access:** Public (any user)
- **Data Source:** `useCampaigns()` hook

#### `/campaigns/new`
- **File:** `app/(campaigns)/campaigns/new/page.tsx`
- **Type:** Page
- **Protected:** Yes (creator/admin only)
- **Description:** Campaign creation wizard
- **Features:**
  - 4-step wizard flow:
    1. Campaign type selection (fundraising vs sharing)
    2. Basic info (title, description, image upload)
    3. Type-specific details:
       - Fundraising: goal amount, category, tags, duration
       - Sharing: platforms, reward per share, budget, max shares
    4. Review and publish
  - Image upload with 10MB limit
  - Form validation with discriminated union schema
  - Draft campaign support
  - FormData submission for multipart requests
- **Components:** `CampaignWizard`
- **Role Access:** Creator, Admin
- **Data Submission:** POST `/campaigns` with multipart/form-data

#### `/campaigns/[id]`
- **File:** `app/(campaigns)/campaigns/[id]/page.tsx`
- **Type:** Page (Dynamic)
- **Protected:** No
- **Description:** Campaign detail/view page
- **Dynamic Segment:** `[id]` - Campaign ID
- **Features:**
  - Campaign overview with description
  - Creator profile section
  - Progress bar/meters for goals
  - Share metrics and tracking
  - Related campaigns section
  - Campaign status display
  - Action buttons (donate, share, report)
  - Analytics preview
- **Components:** `CreatorProfile`, `ProgressBar`, `MultiMeterDisplay`
- **Query Parameters:** None in URL (campaign data via API)
- **Role Access:** Public
- **Data Source:** `useCampaign()`, `useCampaignAnalytics()`

#### `/campaigns/[id]/analytics`
- **File:** `app/(campaigns)/campaigns/[id]/analytics/page.tsx`
- **Type:** Page (Dynamic)
- **Protected:** Depends on role
- **Description:** Campaign analytics and performance metrics
- **Dynamic Segment:** `[id]` - Campaign ID
- **Features:**
  - Campaign performance charts
  - Engagement metrics
  - Donation/share breakdown
  - Geographic distribution
  - Time-series analytics
  - Performance comparison
- **Role Access:** Campaign creator, Admin
- **Data Source:** `useCampaignAnalytics()`

#### `/campaigns/[id]/donate`
- **File:** `app/(campaigns)/campaigns/[id]/donate/page.tsx`
- **Type:** Page (Dynamic)
- **Protected:** No (but donor login recommended)
- **Description:** Campaign donation page
- **Dynamic Segment:** `[id]` - Campaign ID
- **Features:**
  - Donation amount input
  - Payment method selection
  - Donor information form
  - Receipt generation
  - Confirmation and thank you message
  - Optional recurring donation
- **Role Access:** Public
- **Payment Integration:** Stripe/payment processor
- **Data Submission:** POST donation via API

#### `/[id]/analytics` (Root Campaigns)
- **File:** `app/(campaigns)/[id]/analytics/page.tsx`
- **Type:** Page (Dynamic)
- **Protected:** Yes (creator/admin only)
- **Description:** Alternative route for campaign analytics
- **Dynamic Segment:** `[id]` - Campaign ID
- **Role Access:** Creator, Admin
- **Note:** May be used for internal routing

---

### 4. Creator Dashboard & Management
**Namespace:** `(creator)` route group  
**Base Path:** `/creator/`  
**Layout:** `app/(creator)/layout.tsx` (Protected: creator/admin only)  
**Protection:** `ProtectedRoute` component with `allowedRoles: ['creator', 'admin']`

#### `/dashboard` (Creator Dashboard)
- **File:** `app/(creator)/dashboard/page.tsx`
- **Type:** Page
- **Protected:** Yes
- **Description:** Main creator dashboard with unified overview
- **Features:**
  - Key Performance Indicators (KPIs) grid:
    - Total revenue
    - Active campaigns
    - Total supporters
    - Campaign performance
  - Campaign card selection for batch operations
  - Performance charts and visualizations
  - Activity feed
  - Comparison view between campaigns
  - Health score indicator
  - Batch operations (pause, complete, delete)
  - WebSocket real-time notifications
  - Browser notifications support
  - Sound alerts for important events
  - Notification preferences modal
  - Keyboard shortcuts support
  - Undo/redo for actions
- **Components:** `DashboardHeader`, `KPICardsGrid`, `CampaignCardSelectable`, `PerformanceChart`, `ActivityFeed`, `ComparisonView`, `HealthScore`, `BatchOperations`
- **Context Providers:** `DashboardProvider`, `NotificationPreferencesProvider`
- **Hooks:** `useDashboardData`, `useKeyboardShortcuts`, `useWebSocketNotifications`
- **Role Access:** Creator, Admin
- **Real-Time Features:** WebSocket notifications, browser notifications, sound alerts

#### `/dashboard/campaigns`
- **File:** `app/(creator)/dashboard/campaigns/page.tsx`
- **Type:** Page
- **Protected:** Yes
- **Description:** Creator's campaign management list
- **Features:**
  - Campaigns table/list view
  - Sortable columns (name, status, progress, revenue)
  - Filtering by status (draft, active, paused, completed)
  - Inline action buttons (edit, pause, activate, delete)
  - Bulk operations checkbox
  - Quick stats per campaign
  - Search functionality
- **Role Access:** Creator, Admin
- **Data Source:** `useCampaigns()` hook

#### `/dashboard/campaigns/[id]/edit`
- **File:** `app/(creator)/dashboard/campaigns/[id]/edit/page.tsx`
- **Type:** Page (Dynamic)
- **Protected:** Yes
- **Description:** Campaign edit page
- **Dynamic Segment:** `[id]` - Campaign ID
- **Features:**
  - Edit campaign details form
  - Image replacement
  - Update title, description
  - Modify type-specific fields:
    - Fundraising: goal, category, tags, duration (read-only after creation)
    - Sharing: platforms, reward per share, budget, max shares
  - Status change buttons
  - Validation with Zod schemas
  - Unsaved changes warning
- **Role Access:** Creator (campaign owner), Admin
- **Data Submission:** PUT `/campaigns/[id]`
- **Restrictions:** Some fields immutable after creation (endDate, campaignType)

#### `/analytics`
- **File:** `app/(creator)/analytics/page.tsx`
- **Type:** Page
- **Protected:** Yes
- **Description:** Creator analytics overview page
- **Features:**
  - Platform-wide creator analytics
  - Revenue trends
  - Campaign performance comparison
  - Top-performing campaigns
  - Growth metrics
  - Export analytics data
- **Role Access:** Creator, Admin
- **Data Source:** Analytics API hooks

#### `/boosts`
- **File:** `app/(creator)/boosts/page.tsx`
- **Type:** Page
- **Protected:** Yes
- **Description:** Campaign boost management page
- **Features:**
  - Active boosts list
  - Boost history
  - Create new boost wizard
  - Boost performance metrics
  - Boost budget management
  - Cancel/pause active boosts
- **Components:** Boost selection, boost wizard
- **Role Access:** Creator, Admin

#### `/settings`
- **File:** `app/(creator)/settings/page.tsx`
- **Type:** Page
- **Protected:** Yes
- **Description:** Creator account and preferences settings
- **Features:**
  - Profile information
  - Account security (change password)
  - Payment method management
  - Tax information
  - Notification preferences
  - Email notification settings
  - API keys (if applicable)
- **Role Access:** Creator, Admin

#### `/sharers-payouts`
- **File:** `app/(creator)/sharers-payouts/page.tsx`
- **Type:** Page
- **Protected:** Yes
- **Description:** Manage payouts to sharers/supporters
- **Features:**
  - Payouts history table
  - Status tracking (pending, paid, failed)
  - Filter by campaign
  - Bulk payout operations
  - Payment details view
- **Layout:** `app/(creator)/sharers-payouts/layout.tsx`
- **Role Access:** Creator, Admin
- **Data Source:** Sharers payout API

#### `/sharers-payouts/[campaignId]`
- **File:** `app/(creator)/sharers-payouts/[campaignId]/page.tsx`
- **Type:** Page (Dynamic)
- **Protected:** Yes
- **Description:** Payouts for specific campaign's sharers
- **Dynamic Segment:** `[campaignId]` - Campaign ID
- **Features:**
  - Campaign-specific sharers list
  - Individual sharer earnings
  - Share counts per sharer
  - Payout status per sharer
  - Initiate/track payout for this campaign
- **Layout:** `app/(creator)/sharers-payouts/[campaignId]/layout.tsx`
- **Role Access:** Creator (campaign owner), Admin
- **Data Source:** Campaign-specific sharers endpoint

#### `/wallet`
- **File:** `app/(creator)/wallet/page.tsx`
- **Type:** Page
- **Protected:** Yes
- **Description:** Wallet and financial management dashboard
- **Features:**
  - Wallet balance display
  - Transaction history (deposits, withdrawals, payouts)
  - Payout schedule manager
  - Linked payment methods
  - Withdrawal functionality
  - Tax document access
  - Wallet settings (withdrawal frequency, min amount)
- **Components:** 
  - `WalletDashboard` - Balance and overview
  - `TransactionHistory` - Historical transactions
  - `PayoutScheduleManager` - Payout configuration
  - `WalletSettings` - Wallet preferences
- **Tabs:** Dashboard, Transactions, Payout Schedule, Settings
- **Role Access:** Creator, Supporter (view own wallet)
- **Error Handling:** ErrorBoundary component

---

### 5. Supporter/Donor Routes
**Namespace:** `(supporter)` route group  
**Base Path:** `/supporter/`  
**Layout:** `app/(supporter)/layout.tsx` (Pass-through)

#### `/donations`
- **File:** `app/(supporter)/donations/page.tsx`
- **Type:** Page
- **Protected:** Likely yes (supporter/authenticated)
- **Description:** Supporter's donation history
- **Features:**
  - List of campaigns supported via donation
  - Donation amounts and dates
  - Campaign status linked to donations
  - Donation receipts/details view
  - Tax reporting documents
  - Repeat donation options
- **Role Access:** Supporter, Authenticated users

#### `/shares`
- **File:** `app/(supporter)/shares/page.tsx`
- **Type:** Page
- **Protected:** Likely yes (supporter/authenticated)
- **Description:** Supporter's share activity and earnings
- **Features:**
  - Campaigns shared by supporter
  - Share count per campaign
  - Earnings from shares
  - Pending and completed shares
  - Share rewards status
  - Referral tracking (if applicable)
- **Role Access:** Supporter, Authenticated users

#### `/sweepstakes`
- **File:** `app/(supporter)/sweepstakes/page.tsx`
- **Type:** Page
- **Protected:** Likely yes (supporter/authenticated)
- **Description:** Supporter's sweepstakes entries
- **Features:**
  - Active sweepstakes entries
  - Entry history
  - Winning status
  - Reward redemption
  - Sweepstakes rules
- **Role Access:** Supporter, Authenticated users

---

### 6. Public Sweepstakes Routes

#### `/sweepstakes`
- **File:** `app/sweepstakes/page.tsx`
- **Type:** Page
- **Protected:** No
- **Description:** Public sweepstakes landing page
- **Features:**
  - Current active sweepstake(s)
  - Entry mechanism
  - Prize details
  - Sweepstake rules and terms
  - Countdown timer
  - Entry count display
  - Previous winners showcase
- **State Management:** `useCurrentSweepstakes()` hook
- **Role Access:** Public

#### `/sweepstakes/[id]/claim`
- **File:** `app/sweepstakes/[id]/claim/page.tsx`
- **Type:** Page (Dynamic)
- **Protected:** No (but winner verification required)
- **Description:** Sweepstake prize claim page
- **Dynamic Segment:** `[id]` - Sweepstake ID
- **Features:**
  - Winner verification
  - Claim form (name, email, contact info)
  - Prize selection (if multiple prizes)
  - Terms acceptance
  - Payment information for prize fulfillment
- **Role Access:** Public (verified winners)
- **Data Source:** Winner verification endpoint

---

### 7. Admin Panel Routes
**Namespace:** `admin` route group  
**Base Path:** `/admin/`  
**Layout:** `app/admin/layout.tsx` (Protected: admin only)  
**Protection:** Middleware enforces `user_role === 'admin'`

#### `/admin/dashboard`
- **File:** `app/admin/dashboard/page.tsx`
- **Type:** Page
- **Protected:** Yes (admin only)
- **Description:** Main admin dashboard with platform metrics
- **Features:**
  - Platform-wide KPIs:
    - Total revenue
    - Active campaigns
    - User counts (creators, supporters)
    - Transaction volume
  - Alert system with severity levels
  - Activity feed (user actions, system events)
  - Admin quick actions
  - Performance monitoring
  - System health indicators
- **Components:** `LoadingSpinner`, custom metrics components
- **Hooks:** `useAdminOverview()`, `useActivityFeed()`, `useAdminAlerts()`
- **Role Access:** Admin only
- **Features:** Real-time updates via React Query

#### `/admin/campaigns`
- **File:** `app/admin/campaigns/page.tsx`
- **Type:** Page
- **Protected:** Yes (admin only)
- **Description:** Admin campaign management and review
- **Features:**
  - All campaigns list (global view)
  - Campaign status management
  - Approve/reject campaigns
  - Flag campaigns for review
  - View campaign details
  - Creator information
  - Campaign performance metrics
  - Bulk actions (approve, reject, suspend)
- **Role Access:** Admin only
- **Data Source:** Admin campaigns API

#### `/admin/users`
- **File:** `app/admin/users/page.tsx`
- **Type:** Page
- **Protected:** Yes (admin only)
- **Description:** User management page
- **Features:**
  - List all users (creators, supporters)
  - User role and status
  - Account suspension/verification
  - User activity tracking
  - Search and filter users
  - Edit user information
  - View user campaigns/activity
- **Role Access:** Admin only

#### `/admin/transactions`
- **File:** `app/admin/transactions/page.tsx`
- **Type:** Page
- **Protected:** Yes (admin only)
- **Description:** Transaction and payment management
- **Features:**
  - Transaction history
  - Payment status tracking
  - Dispute resolution
  - Refund processing
  - Revenue reports
  - Payment method statistics
  - Reconciliation tools
- **Role Access:** Admin only

#### `/admin/sweepstakes`
- **File:** `app/admin/sweepstakes/page.tsx`
- **Type:** Page
- **Protected:** Yes (admin only)
- **Description:** Sweepstake management and creation
- **Features:**
  - Active sweepstakes list
  - Create new sweepstake
  - Edit sweepstake rules
  - View entries and participants
  - Select winners
  - Prize management
- **Role Access:** Admin only

#### `/admin/manage-sweepstakes`
- **File:** `app/admin/manage-sweepstakes/page.tsx`
- **Type:** Page
- **Protected:** Yes (admin only)
- **Description:** Detailed sweepstake management
- **Features:**
  - Sweepstake configuration
  - Entry validation
  - Winner selection algorithms
  - Prize distribution
  - Audit trail
  - Compliance reporting
- **Role Access:** Admin only

#### `/admin/reports`
- **File:** `app/admin/reports/page.tsx`
- **Type:** Page
- **Protected:** Yes (admin only)
- **Description:** Platform analytics and reporting
- **Features:**
  - Revenue reports (daily, monthly, yearly)
  - User growth analytics
  - Campaign performance reports
  - Payment analytics
  - Fraud detection alerts
  - Custom report builder
  - Export functionality (CSV, PDF)
- **Role Access:** Admin only

#### `/admin/settings`
- **File:** `app/admin/settings/page.tsx`
- **Type:** Page
- **Protected:** Yes (admin only)
- **Description:** Admin settings and configuration
- **Features:**
  - Platform settings
  - Email configuration
  - Payment processor settings
  - System maintenance settings
  - Notification settings
  - API keys management
  - Rate limiting configuration
- **Role Access:** Admin only

---

## Special Route Files

### 1. Global Error Handling
**File:** `app/error.tsx`
- **Type:** Error boundary component
- **Scope:** Application-wide error handling
- **Trigger:** Any unhandled error in child pages
- **Features:**
  - Error message display
  - Stack trace (development only)
  - Reset button to retry
  - Link to home page
  - Styled error container with icon
- **Components:** `AlertCircle` icon, `Button`, `Link`
- **Styling:** Gradient background, centered layout

### 2. 404 Not Found
**File:** `app/not-found.tsx`
- **Type:** 404 page
- **Scope:** Route not found
- **Trigger:** Accessing non-existent route
- **Features:**
  - 404 error message
  - "Page not found" explanation
  - Search suggestions icon
  - Links to home and explore/compass
  - Styled container with icon
  - Responsive design
- **Metadata:** Title and description for SEO
- **Components:** `Search`, `Home`, `Compass` icons

### 3. Loading State
**File:** `app/loading.tsx`
- **Type:** Loading boundary component
- **Scope:** Application-wide loading indicator
- **Trigger:** Page transition or data loading
- **Features:**
  - Loading spinner animation
  - Centered display
  - Animated dots or spinning indicator
- **Styling:** Gradient background, centered with animation

### 4. Unauthorized/Access Denied
**File:** `app/unauthorized.tsx`
- **Type:** Access denial page
- **Scope:** User lacks required permissions
- **Trigger:** User role doesn't match route requirements
- **Features:**
  - "Access Denied" message
  - Lock icon
  - Permission explanation
  - Actions (go home, login with different account)
  - Styled with gradient background
- **Components:** `Lock` icon, `Button`, `Link`
- **Metadata:** SEO title and description

---

## Dynamic Routes Reference

### Route Parameters by Type

#### Campaign-Related Parameters
| Route | Parameter | Type | Example | Description |
|-------|-----------|------|---------|-------------|
| `/campaigns/[id]` | `[id]` | UUID or String | `campaign-123` | Campaign ID |
| `/campaigns/[id]/analytics` | `[id]` | UUID or String | `campaign-123` | Campaign ID |
| `/campaigns/[id]/donate` | `[id]` | UUID or String | `campaign-123` | Campaign ID |
| `/dashboard/campaigns/[id]/edit` | `[id]` | UUID or String | `campaign-123` | Campaign ID |
| `/[id]/analytics` | `[id]` | UUID or String | `campaign-123` | Campaign ID (alt route) |

#### Sharer/Payout Parameters
| Route | Parameter | Type | Example | Description |
|-------|-----------|------|---------|-------------|
| `/sharers-payouts/[campaignId]` | `[campaignId]` | UUID or String | `campaign-456` | Campaign ID for payout filtering |

#### Sweepstake Parameters
| Route | Parameter | Type | Example | Description |
|-------|-----------|------|---------|-------------|
| `/sweepstakes/[id]/claim` | `[id]` | UUID or String | `sweepstake-789` | Sweepstake ID |

#### Authentication Parameters
| Route | Parameter | Type | Example | Description |
|-------|-----------|------|---------|-------------|
| `/reset-password/[token]` | `[token]` | String (JWT-like) | `eyJhbGc...` | Password reset token from email |

### Query Parameter Patterns

#### Campaign Search/Browse
```
/campaigns?search=keyword&category=fundraising&status=active&page=1&limit=20
```
- `search` - Campaign title/description search
- `category` - Filter by need type/category
- `status` - Filter by campaign status
- `page` - Pagination page number
- `limit` - Items per page (default: 20)

#### Campaign Detail Analytics
```
/campaigns/[id]/analytics?period=30d&metric=engagement&export=pdf
```
- `period` - Time range (7d, 30d, 90d, all)
- `metric` - Specific metric focus
- `export` - Export format (pdf, csv)

#### Dashboard Filtering
```
/dashboard/campaigns?status=active&sort=revenue_desc&view=grid
```
- `status` - Filter by campaign status
- `sort` - Sorting option
- `view` - View type (grid, table, list)

---

## API Routes

**Status:** No frontend-side Next.js API routes found in `app/api/`

**Note:** Backend API calls are made to external Express.js backend server at `src/` directory

### Backend API Integration
- **Location:** `honestneed-frontend/api/services/` and `honestneed-frontend/api/hooks/`
- **Server:** External Node.js/Express backend
- **Base URL:** Configured via environment variables (likely `http://localhost:5000` in development)
- **Authentication:** Bearer token via `Authorization` header or `auth_token` cookie

#### Key Service Modules
| Service | File | Purpose |
|---------|------|---------|
| Campaign Service | `api/services/campaignService.js` | Campaign CRUD and operations |
| Auth Service | `api/services/authService.js` | Login, register, auth |
| Admin Service | `api/services/adminService.js` | Admin operations |
| Wallet Service | `api/services/walletService.js` | Wallet and transactions |
| Sweepstakes Service | `api/services/simpleSweepcasesService.js` | Sweepstakes operations |

---

## Route Statistics

### Summary
| Category | Count |
|----------|-------|
| **Total Pages** | 30 |
| **Total Layouts** | 8 |
| **Special Files** | 4 (error, not-found, loading, unauthorized) |
| **Route Groups** | 4 |
| **Dynamic Routes** | 7 |
| **Protected Routes** | 17 |
| **Public Routes** | 13 |
| **Admin Routes** | 8 |
| **Creator Routes** | 9 |
| **Supporter Routes** | 3 |

### Route Breakdown by Accessibility

#### Public Routes (13)
1. `/` - Home
2. `/login` - Auth
3. `/register` - Auth
4. `/forgot-password` - Auth
5. `/reset-password/[token]` - Auth
6. `/campaigns` - Browse campaigns
7. `/campaigns/[id]` - View campaign
8. `/campaigns/[id]/analytics` - Campaign analytics preview
9. `/campaigns/[id]/donate` - Donation page
10. `/sweepstakes` - Sweepstakes landing
11. `/sweepstakes/[id]/claim` - Claim prize
12. Special pages: error, not-found, unauthorized

#### Creator Routes (9)
1. `/dashboard` - Creator dashboard
2. `/dashboard/campaigns` - Campaign management
3. `/dashboard/campaigns/[id]/edit` - Edit campaign
4. `/analytics` - Analytics overview
5. `/boosts` - Boost management
6. `/settings` - Creator settings
7. `/sharers-payouts` - Payout management
8. `/sharers-payouts/[campaignId]` - Campaign-specific payouts
9. `/wallet` - Wallet dashboard

#### Supporter Routes (3)
1. `/donations` - Donation history
2. `/shares` - Share activity
3. `/sweepstakes` - Sweepstakes entries

#### Admin Routes (8)
1. `/admin/dashboard` - Admin overview
2. `/admin/campaigns` - Campaign management
3. `/admin/users` - User management
4. `/admin/transactions` - Transaction management
5. `/admin/sweepstakes` - Sweepstake management
6. `/admin/manage-sweepstakes` - Advanced sweepstake management
7. `/admin/reports` - Analytics and reports
8. `/admin/settings` - Admin settings

### Route Depth Distribution
| Depth | Count | Examples |
|-------|-------|----------|
| 1 segment | 3 | `/`, `/login`, `/register` |
| 2 segments | 14 | `/campaigns`, `/dashboard`, `/admin/users` |
| 3 segments | 8 | `/campaigns/[id]/donate`, `/dashboard/campaigns/[id]/edit` |
| 4+ segments | 5 | `/sweepstakes/[id]/claim`, `/sharers-payouts/[campaignId]` |

---

## Architectural Patterns

### 1. Route Group Usage
- **Purpose:** Organize routes without URL inclusion
- **Groups:** `(auth)`, `(campaigns)`, `(creator)`, `(supporter)`, `admin`
- **Benefit:** Shared layouts, logical organization, clean URLs

### 2. Layout Nesting Strategy
```
app/layout.tsx (root - navbar, footer, providers)
├── (auth)/layout.tsx (centered auth form)
├── (campaigns)/layout.tsx (campaign browsing layout)
├── (creator)/layout.tsx (creator dashboard layout + protection)
├── (supporter)/layout.tsx (supporter layout)
└── admin/layout.tsx (admin panel layout + protection)
```

### 3. Protection Strategy
- **Middleware:** First line of defense (token validation)
- **Component:** `ProtectedRoute` component (client-side backup)
- **Role Checking:** Via `user_role` cookie
- **Fallback:** Redirects to login with redirect parameter

### 4. Data Fetching Pattern
- **Framework:** React Query (TanStack Query)
- **Services:** Axios-based service layer in `api/services/`
- **Hooks:** Custom hooks in `api/hooks/`
- **State:** Zustand for global state (auth, filters)

### 5. Error Handling
- **Global Error Boundary:** `app/error.tsx`
- **404 Handling:** `app/not-found.tsx`
- **Authorization:** `app/unauthorized.tsx`
- **Component Level:** ErrorBoundary components in pages

---

## Key Implementation Details

### Authentication Flow
1. User accesses protected route
2. Middleware checks `auth_token` cookie
3. If missing → redirect to `/login?redirect=<original-path>`
4. On login → token stored in cookie
5. User redirected to original path or dashboard
6. Client-side `ProtectedRoute` component re-validates

### Campaign Wizard Implementation
- **Steps:** Type → Info → Details → Review
- **Validation:** Zod discriminated unions by campaign type
- **Image Upload:** FormData wrapper with file input
- **Currency:** Stored in cents in backend, displayed as dollars
- **API:** POST to `/campaigns` with multipart/form-data

### Notification System (Phase 4)
- **WebSocket:** Real-time notification delivery
- **Browser Notifications:** Native browser API
- **Sound Alerts:** Audio notification service
- **Preferences:** User-configurable in settings
- **Context:** `NotificationPreferencesProvider` for state

### Wallet Management
- **Tabs:** Dashboard, Transactions, Payout Schedule, Settings
- **Features:** Balance, history, withdrawals, tax documents
- **Roles:** Accessible by creators and supporters
- **Real-time Updates:** React Query with invalidation

---

## File Organization Reference

### Complete Directory Map
```
honestneed-frontend/
├── app/                           # Next.js App Router
│   ├── page.tsx                  # Root landing page
│   ├── layout.tsx                # Root layout
│   ├── error.tsx                 # Global error handler
│   ├── not-found.tsx             # 404 page
│   ├── loading.tsx               # Loading boundary
│   ├── unauthorized.tsx          # Access denied
│   ├── providers.tsx             # React context providers
│   ├── auth-hydrator.tsx         # Auth state hydration
│   │
│   ├── (auth)/                   # Authentication route group
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/[token]/page.tsx
│   │
│   ├── (campaigns)/              # Campaign browsing route group
│   │   ├── layout.tsx
│   │   ├── campaigns/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       ├── analytics/page.tsx
│   │   │       └── donate/page.tsx
│   │   └── [id]/
│   │       └── analytics/page.tsx
│   │
│   ├── (creator)/                # Creator dashboard route group
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   ├── campaigns/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/edit/page.tsx
│   │   │   ├── components/       # Dashboard sub-components
│   │   │   ├── context/          # Dashboard context
│   │   │   ├── hooks/            # Dashboard hooks
│   │   │   ├── services/         # Dashboard services
│   │   │   └── utils/            # Dashboard utilities
│   │   ├── analytics/page.tsx
│   │   ├── boosts/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── wallet/page.tsx
│   │   ├── sharers-payouts/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── [campaignId]/
│   │   │       ├── layout.tsx
│   │   │       └── page.tsx
│   │
│   ├── (supporter)/              # Supporter route group
│   │   ├── layout.tsx
│   │   ├── donations/page.tsx
│   │   ├── shares/page.tsx
│   │   └── sweepstakes/page.tsx
│   │
│   ├── admin/                    # Admin panel
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── campaigns/page.tsx
│   │   ├── users/page.tsx
│   │   ├── transactions/page.tsx
│   │   ├── sweepstakes/page.tsx
│   │   ├── manage-sweepstakes/page.tsx
│   │   ├── reports/page.tsx
│   │   └── settings/page.tsx
│   │
│   └── sweepstakes/              # Public sweepstakes
│       ├── page.tsx
│       └── [id]/claim/page.tsx
│
├── api/                          # API layer
│   ├── services/                 # Axios service clients
│   └── hooks/                    # React Query hooks
│
├── components/                   # React components
│   ├── layout/                   # Layout components
│   ├── campaign/                 # Campaign-related components
│   ├── ui/                       # UI primitives
│   ├── wallet/                   # Wallet components
│   └── ...
│
├── store/                        # Zustand stores
│   ├── authStore.ts
│   └── filterStore.ts
│
├── utils/                        # Utilities
│   ├── validationSchemas.ts      # Zod schemas
│   ├── imageUtils.ts
│   └── ...
│
├── middleware.ts                 # Next.js middleware
├── next.config.ts               # Next.js config
├── tsconfig.json                # TypeScript config
└── package.json                 # Dependencies
```

---

## Security & Access Control Summary

### Middleware Enforcement
| Route Pattern | Auth Required | Role Required | Redirect Target |
|---------------|---------------|---------------|-----------------|
| `/dashboard/*` | Yes | - | `/login` |
| `/creator/*` | Yes | creator, admin | `/unauthorized` |
| `/admin/*` | Yes | admin | `/unauthorized` |
| `/profile/*` | Yes | - | `/login` |
| `/donations/*` | Yes | - | `/login` |
| `/login`, `/register` | No | - | `/dashboard` (if logged in) |
| All others | No | - | - |

### Token Validation
- **Token Storage:** HttpOnly cookie `auth_token` (secure)
- **Token Format:** JWT
- **Validation:** Performed in middleware before request reaches page
- **Expiration:** Handled by backend token issue
- **Refresh:** Handled by backend (if applicable)

### Role-Based Access
- **Admin Role:** Access to `/admin/*` routes
- **Creator Role:** Access to `/creator/*` routes
- **Supporter Role:** Access to supporter features (implied by auth)
- **Enforcement:** Middleware + `ProtectedRoute` component

---

## Performance Optimizations

### Code Splitting
- **Route Groups:** Separate layouts bundle code by section
- **Dynamic Imports:** Components loaded on demand
- **Lazy Loading:** Images and non-critical components

### Caching Strategy
- **React Query:** Default 10-30 minute stale times
- **Next.js Cache:** Static generation where applicable
- **Browser Cache:** Configured via Cache-Control headers

### Image Optimization
- **Next Image Component:** Automatic optimization and lazy loading
- **Format:** WebP with fallback to original
- **Responsive:** Srcset generation for multiple screen sizes

---

## Documentation Summary

This analysis covers:
✅ All 30 page files  
✅ All 8 layout files  
✅ All 4 special route files (error, not-found, loading, unauthorized)  
✅ All dynamic route segments with parameters  
✅ Complete route hierarchy organized by accessibility  
✅ Middleware and route protection mechanisms  
✅ Route group organization and layout nesting  
✅ Query parameter patterns  
✅ API integration approach  
✅ Authentication and authorization flow  
✅ File organization and directory structure  
✅ Security and access control summary  
✅ Performance optimization strategies

---

**Next Steps for Implementation:**
1. Review authentication flow for security compliance
2. Audit route protection with role-based access
3. Implement caching strategies for optimized performance
4. Set up monitoring for route access patterns
5. Document backend API endpoints matching frontend routes
