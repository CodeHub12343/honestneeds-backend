# HonestNeed Frontend - Architecture & Layer Diagram

## 🏗️ Application Layer Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER (UI)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Auth UI   │  │ Campaign   │  │  Admin UI    │  │ Supporter  │ │
│  │  (login,   │  │  (list,    │  │  (users,     │  │  (donate,  │ │
│  │ register)  │  │ create,    │  │ moderate)    │  │ shares)    │ │
│  └────────────┘  │ detail)    │  └──────────────┘  └────────────┘ │
│                  └────────────┘                                    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐│
│  │              COMPONENT LAYER (components/)                    ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────┐  ││
│  │  │ ui/      │ │campaign/ │ │donation/ │ │admin/, creator/ │  ││
│  │  │Primitives│ │Forms,    │ │Wizards   │ │  Specialized    │  ││
│  │  │(Button,  │ │Modals,   │ │Components│ │  Components     │  ││
│  │  │Card)     │ │QR, Wizard│ │          │ │                 │  ││
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────────────┘  ││
│  │                                                                │
│  │  BUS: React Props + Event Handlers                            │
│  └───────────────────────────────────────────────────────────────┘│
│           │                   │                    │              │
└───────────┼───────────────────┼────────────────────┼──────────────┘
            │                   │                    │
┌───────────▼───────────────────▼────────────────────▼──────────────┐
│                  STATE MANAGEMENT LAYER                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐  ┌───────────────────────────────────────┐  │
│  │ React Query      │  │ Zustand Stores (store/)              │  │
│  │ (api/hooks/)     │  │ ┌──────────────────────────────────┐ │  │
│  │ ┌──────────────┐ │  │ │ authStore.ts       (user, token) │ │  │
│  │ │useCampaigns()│ │  │ │ wizardStore.ts     (form steps)  │ │  │
│  │ │useDonations()│ │  │ │ filterStore.ts     (search filter)│ │  │
│  │ │useAdmin()    │ │  │ │ donationWizardStore (donation)   │ │  │
│  │ │useAuth()     │ │  │ └──────────────────────────────────┘ │  │
│  │ └──────────────┘ │  └───────────────────────────────────────┘  │
│  │ ▶ Query caching  │  ▶ Direct mutations                         │
│  │ ▶ Auto-retry     │  ▶ Lightweight state                        │
│  │ ▶ Invalidation   │  ▶ Form step tracking                       │
│  └──────────────────┘                                              │
│                                                                      │
└───────────┬──────────────────────────┬─────────────────────────────┘
            │                          │
┌───────────▼──────────────────────────▼─────────────────────────────┐
│                    API INTEGRATION LAYER                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │         React Query Hooks (api/hooks/)                      │  │
│  │  ────────────────────────────────────────────────────────  │  │
│  │  • useAuth.ts          → authService calls                 │  │
│  │  • useCampaigns.ts     → campaignService calls             │  │
│  │  • useDonations.ts     → donationService calls             │  │
│  │  • useAdmin.ts         → adminService calls                │  │
│  │  • usePaymentMethods.ts → paymentMethodService calls       │  │
│  │  • useSweepstakes.ts   → sweepstakesService calls          │  │
│  │  • [+ 7 more domain hooks]                                 │  │
│  └────────────┬─────────────────────────────────────────────────┘  │
│               │ (wraps service calls with caching/loading state)   │
│  ┌────────────▼─────────────────────────────────────────────────┐  │
│  │         API Services (api/services/)                         │  │
│  │  ────────────────────────────────────────────────────────   │  │
│  │  • authService         → POST /auth/login, /auth/register   │  │
│  │  • campaignService     → GET/POST /campaigns, /campaigns/:id│  │
│  │  • donationService     → POST /donations, GET /donations    │  │
│  │  • paymentMethodService → GET/POST /payment-methods         │  │
│  │  • sharingService      → POST /share, GET /earnings         │  │
│  │  • sweepstakesService  → GET/POST /sweepstakes             │  │
│  │  • adminService        → GET /admin/dashboard              │  │
│  │  • qrFlyerService      → POST /qr/generate, /flyer         │  │
│  │  • [+ 5 more services]                                     │  │
│  └────────────┬─────────────────────────────────────────────────┘  │
│               │ (HTTP requests via axios with auth)                │
│  ┌────────────▼─────────────────────────────────────────────────┐  │
│  │         HTTP Client (lib/api.ts)                             │  │
│  │  ────────────────────────────────────────────────────────   │  │
│  │  axios instance                                             │  │
│  │  ├─ Request Interceptor  → Add Authorization header        │  │
│  │  ├─ Error Handling       → Normalize error responses        │  │
│  │  └─ Base URL             → Backend API endpoint             │  │
│  └────────────┬─────────────────────────────────────────────────┘  │
│               │                                                      │
└───────────────┼──────────────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│               BACKEND API (External)                                  │
├──────────────────────────────────────────────────────────────────────┤
│  Node.js/Express Backend @ http://localhost:5000 (or deployed)       │
│  ├─ /auth/login, /auth/register, /auth/logout                       │
│  ├─ /campaigns, /campaigns/:id, /campaigns/:id/activate              │
│  ├─ /donations, /donations/:id                                      │
│  ├─ /payment-methods                                                │
│  ├─ /shares, /earnings                                              │
│  ├─ /sweepstakes                                                    │
│  ├─ /admin/users, /admin/campaigns, /admin/transactions             │
│  └─ /qr, /flyer, /export/pdf                                        │
└──────────────────────────────────────────────────────────────────────┘
                │
                ▼
            DATABASE
```

---

## 📊 Component Hierarchy

```
Root Layout (app/layout.tsx)
│
├─ Providers Setup
│  ├─ QueryClientProvider (React Query)
│  ├─ StoreProvider (Zustand)
│  └─ StyleRegistry (Styled Components)
│
├─ Auth Hydrator (Rehydrate user on load)
│
└─ Route Group Layouts
   │
   ├─ (auth)/layout.tsx
   │  └─ Public pages (login, register, reset password)
   │
   ├─ (campaigns)/layout.tsx
   │  └─ Public campaign browsing
   │
   ├─ (creator)/layout.tsx
   │  ├─ Protected: Creator dashboard
   │  ├─ Campaign management (create, edit, analytics)
   │  └─ Creator settings
   │
   ├─ (supporter)/layout.tsx
   │  ├─ Donations flow & history
   │  ├─ Shares & earnings
   │  └─ Sweepstakes participation
   │
   └─ admin/layout.tsx
      ├─ User management
      ├─ Campaign moderation
      ├─ Transaction logs
      └─ Admin settings
```

---

## 🔄 Data Flow Examples

### **Example 1: User Campaign Creation Flow**

```
User fills Campaign Wizard
       ↓
[CampaignWizard Component]
  Step 1: Type Selection (fundraising | sharing)
  Step 2: Basic Info (title, description, image)
  Step 3: Type-Specific Details
  Step 4: Review & Publish
       ↓
Form submission
       ↓
useCampaigns.useCreateCampaign() [React Query Mutation]
       ↓
campaignService.createCampaign() [API Service]
       ↓
lib/api.ts [HTTP Client]
       ↓
POST /campaigns [Backend API]
       ↓
Backend processes, validates, stores
       ↓
Response with campaign ID + details
       ↓
React Query updates cache
       ↓
wizardStore clears (Zustand)
       ↓
Navigate to campaign detail page
       ↓
Components re-render with new data
```

### **Example 2: View Campaigns List with Filters**

```
User navigates to /campaigns
       ↓
CampaignGrid Component renders
       ↓
filterStore.getFilters() [Zustand]
       ↓
useCampaigns.useGetCampaigns({filter}) [React Query]
       ↓
campaignService.getCampaigns({filter}) [API Service]
       ↓
lib/api.ts batches request
       ↓
GET /campaigns?category=health&search=water [Backend]
       ↓
Backend filters, sorts, paginates
       ↓
Response: { campaigns: [...], total: 150, page: 1 }
       ↓
React Query caches result (10 min TTL)
       ↓
CampaignCard components render each campaign
       ↓
User filters by category:
       ↓
filterStore.setFilters({...}) updates immediately
       ↓
React Query invalidates cache + re-fetches
       ↓
New list rendered instantly (with loading skeleton)
```

### **Example 3: Admin Moderation**

```
Admin navigates to /admin/campaigns
       ↓
Admin Dashboard Component
       ↓
useAdmin.useGetCampaignsForModeration() [React Query]
       ↓
adminService.getCampaignsForModeration() [API Service]
       ↓
GET /admin/campaigns?status=pending [Backend]
       ↓
Backend returns pending campaigns with violation flags
       ↓
Admin reviews campaign → Click "Reject" button
       ↓
useAdminOperations.useRejectCampaign() [React Query Mutation]
       ↓
adminService.rejectCampaign(campaignId, reason) [API Service]
       ↓
POST /admin/campaigns/:id/reject [Backend]
       ↓
Backend updates campaign status, sends notification to creator
       ↓
React Query invalidates admin queries
       ↓
List refreshes, campaign removed from pending
```

---

## 🔐 Authentication Flow

```
app/middleware.ts (Auth Middleware)
     │
     ├─ Check URL path
     ├─ Check token in cookies/localStorage
     └─ Redirect if needed (login → /auth/login, protected → /auth/login)

↓

(auth)/login page
     │
     ├─ LoginForm Component
     ├─ useAuth.useLogin() [React Query Mutation]
     └─ authService.login(email, password)

↓

Backend validates credentials, returns JWT token

↓

authStore.setUser() [Zustand]
     │
     ├─ Store user profile
     ├─ Store JWT token
     └─ Store auth status

↓

lib/api.ts [HTTP Interceptor]
     │
     └─ Automatically attach token to all requests

↓

Redirect to dashboard based on role:
  - Creator → (creator)/dashboard
  - Supporter → (supporter)/donations
  - Admin → admin/dashboard
```

---

## 🗂️ Routing Structure

```
PUBLIC ROUTES (No Auth Required)
├─ /                          (Home/Landing)
├─ /auth/login
├─ /auth/register
├─ /auth/forgot-password
├─ /auth/reset-password
└─ /campaigns                 (Browse campaigns)
   └─ /campaigns/:id          (Campaign detail view)

PROTECTED ROUTES - CREATOR
├─ /dashboard/campaigns       (List all creator's campaigns)
├─ /dashboard/campaigns/create (Create campaign wizard)
└─ /dashboard/campaigns/:id
   ├─ page.tsx               (Campaign detail)
   ├─ /edit                  (Edit draft campaign)
   ├─ /analytics             (Campaign metrics)
   └─ /boost                 (Promote campaign)

PROTECTED ROUTES - SUPPORTER
├─ /donations                (Donation history)
│  └─ /donations/:id         (Donation detail)
├─ /shares                   (Earn from shares)
│  └─ /shares/:id            (Share detail)
└─ /sweepstakes              (Enter sweepstakes)
   └─ /sweepstakes/:id       (Sweepstake detail)

PROTECTED ROUTES - ADMIN
├─ /admin                    (Dashboard)
├─ /admin/campaigns          (Moderate campaigns)
│  └─ /admin/campaigns/:id
├─ /admin/users              (Manage users)
├─ /admin/transactions       (View transactions)
└─ /admin/settings           (Admin settings)
   ├─ /categories            (Manage categories)
   └─ /platforms             (Manage platforms)

SPECIAL ROUTES
├─ /unauthorized             (403 handler)
├─ /not-found                (404 handler)
└─ /error                    (500 handler)
```

---

## 🎨 Styling Strategy

```
┌─────────────────────────────────────────────┐
│  Tailwind CSS (Utility-first)               │
│  ├─ classes for spacing, colors, layout    │
│  └─ configured in tailwind.config.ts       │
└──────────────┬────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  Styled Components (Component styling)      │
│  ├─ scoped CSS-in-JS                       │
│  ├─ dynamic styles via props               │
│  └─ registry.tsx for hydration             │
└──────────────┬────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  Global Styles (styles/globals.css)        │
│  ├─ CSS reset                              │
│  ├─ typography base                        │
│  └─ design tokens applied                  │
└──────────────┬────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  Design System (styles/tokens.ts)           │
│  ├─ colors palette                         │
│  ├─ spacing scale                          │
│  ├─ typography scales                      │
│  └─ breakpoints for responsive             │
└─────────────────────────────────────────────┘
```

---

## 📦 Dependency Map (Key Imports)

```
CORE DEPENDENCIES
├─ next (16.2.2)          - SSR + routing framework
├─ react (19.2.4)         - UI library
├─ typescript              - Type safety
├─ axios (1.6.5)           - HTTP client
├─ @tanstack/react-query   - Server state management
├─ zustand                 - Client state management
├─ zod                     - Schema validation
├─ react-hook-form        - Form handling
├─ styled-components      - CSS-in-JS
├─ react-toastify         - Toast notifications
├─ leaflet-react          - Maps (if needed)
└─ lucide-react           - Icon library

DEV DEPENDENCIES
├─ tailwindcss (4)        - Utility CSS
├─ postcss                - CSS processing
├─ eslint (9)             - Linting
└─ jest                   - Testing

MISSING/OPTIONAL
├─ Testing: @testing-library/react, jest (setup found but not in deps)
├─ Forms: already using react-hook-form ✅
├─ Validation: already using zod ✅
└─ Analytics: not configured (should add sentry or similar)
```

---

## 🚀 Developer Workflow Paths

### **Adding a New Feature**

```
1. Create Route
   └─ app/[group]/[feature]/page.tsx

2. Create Container Component
   └─ components/[feature]/[Feature]Container.tsx

3. Create Presentational Components
   └─ components/[feature]/[Sub-components].tsx

4. Create API Service & Hook
   ├─ api/services/[feature]Service.ts
   └─ api/hooks/use[Feature].ts

5. Create Validation Schema (if needed)
   └─ utils/validationSchemas.ts (add new schema)

6. Create Zustand Store (if needed)
   └─ store/[feature]Store.ts

7. Wire Everything
   └─ Import hooks/store in components
   └─ Connect to form/button handlers
```

### **Quick Navigation (IDE Shortcuts)**

```
To find...                        Look in...
───────────────────────────────────────────────────────
Campaign creation logic           api/services/campaignService.ts
Campaign hooks/state              api/hooks/useCampaigns.ts
Campaign UI components            components/campaign/
Auth state/login                  api/hooks/useAuth.ts + authStore.ts
Form validation rules             utils/validationSchemas.ts
API client setup                  lib/api.ts
Theme/colors                      styles/tokens.ts or lib/theme.ts
Route definitions                 app/[group]/[feature]/page.tsx
Middleware logic                  middleware.ts
Toast messages                    hooks/useToast.ts
QR code generation                api/services/qrFlyerService.ts
```

---

## 🔍 Critical Paths (Must Know)

```
AUTHENTICATION
app/middleware.ts ← Check token + redirect
authStore.ts ← User state
api/services/authService.ts ← Login/register calls
lib/api.ts ← Attach token to requests

CAMPAIGN CREATION
components/campaign/wizard/ ← Multi-step form
useCampaigns.useCreateCampaign() ← Form submission
api/services/campaignService.ts ← API call
store/wizardStore.ts ← Track wizard step

DATA DISPLAY
api/hooks/use[Feature].ts ← Fetch data (React Query)
components/[feature]/Display.tsx ← Show data
store/filterStore.ts ← Store filters (optional)

ERROR HANDLING
app/error.tsx ← Global boundary
api services ← Try/catch + error normalization
components ← Show error state/toast

PERFORMANCE
lib/queryClient.ts ← Cache config (staleTime, gcTime)
api/hooks/ ← Query key management + invalidation
components ← Skeleton loaders during fetch
```

---

**Last Updated**: April 5, 2026  
**Framework**: Next.js 16 App Router  
**Status**: Production Architecture ✅
