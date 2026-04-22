# HonestNeed Frontend - Critical Folder Structure Analysis

**Generated:** April 5, 2026  
**Framework:** Next.js 16 (App Router)  
**Tech Stack:** React 19, TypeScript, TailwindCSS, Styled Components, React Query, Zustand, React Hook Form

---

## 📊 Overall Structure Map

```
honestneed-frontend/
├── app/                          # Next.js App Router (Route Groups)
│   ├── (auth)/                   # Public authentication routes
│   ├── (campaigns)/              # Public campaign browsing
│   ├── (creator)/                # Creator dashboard (protected)
│   ├── (supporter)/              # Supporter dashboard (protected)
│   ├── admin/                    # Admin dashboard (protected)
│   └── [root layouts & pages]
│
├── api/                          # API Integration Layer
│   ├── services/                 # 13 API service modules (domain-driven)
│   └── hooks/                    # 13 React Query hooks (data fetching)
│
├── components/                   # Reusable UI Components (Domain-Organized)
│   ├── admin/                    # Admin-specific components
│   ├── analytics/                # Analytics/reporting components
│   ├── auth/                     # Authentication components
│   ├── campaign/                 # Campaign-related components (largest)
│   ├── creator/                  # Creator-specific components
│   ├── donation/                 # Donation flow components
│   ├── layout/                   # Layout/wrapper components
│   ├── sweepstakes/              # Sweepstakes components
│   ├── ui/                       # Base primitives
│   └── [composite components]
│
├── hooks/                        # Custom React Hooks (Utils - non-API)
├── lib/                          # Utility/Config Libraries
├── store/                        # Zustand State Management
├── styles/                       # Global Styling & Theme
├── utils/                        # Helper Functions & Validation
├── middleware.ts                 # Next.js Middleware (Auth)
└── [config files]
```

---

## 🏗️ Deep Folder Structure Analysis

### **1. Route Organization (`/app`) - EXCELLENT**

#### Strengths ✅
- **Next.js 16 App Router** with proper route groups using parentheses
- **Role-based grouping** separates concerns: `(auth)`, `(campaigns)`, `(creator)`, `(supporter)`, `admin`
- **Isolated layouts** per group enable different navigation/styling per user role
- **Clear permission boundaries** between public, creator, supporter, and admin areas

#### Structure
```
app/
├── (auth)/
│   ├── layout.tsx
│   ├── login/
│   ├── register/
│   ├── forgot-password/
│   └── reset-password/
│
├── (campaigns)/             # Public campaign browsing
│   ├── layout.tsx
│   └── campaigns/
│
├── (creator)/               # Creator-only features
│   ├── layout.tsx
│   ├── campaigns/           # Create, edit, analytics
│   ├── dashboard/           # Creator dashboard
│   └── settings/            # Creator account settings
│
├── (supporter)/             # Non-creator features
│   ├── layout.tsx
│   ├── donations/
│   ├── shares/              # Share earnings
│   └── sweepstakes/
│
├── admin/                   # Admin-only routes
│   ├── layout.tsx
│   ├── campaigns/
│   ├── dashboard/
│   ├── manage-sweepstakes/
│   ├── settings/
│   ├── transactions/
│   └── users/
│
└── [Root middleware files]
    ├── layout.tsx
    ├── page.tsx
    ├── providers.tsx
    ├── auth-hydrator.tsx
    ├── error.tsx
    ├── loading.tsx
    ├── unauthorized.tsx
    └── favicon.ico
```

#### Issues ⚠️
- **No explicit `(public)` group** - root and `(campaigns)` could be clearer
- **No subdirectory organization** within route groups (e.g., `(creator)/campaigns/[id]/` lacks sub-pages like `/edit`, `/analytics`)
- **Settings scattered** - appears in both `(creator)/settings` and `admin/settings`

---

### **2. API Integration (`/api`) - STRONG PATTERN**

#### Architecture: **Vertical Slice Pattern** (Domain-Driven)

```
api/
├── services/               # 13 API service modules
│   ├── authService.ts
│   ├── campaignService.ts          # Campaign CRUD + status mgmt
│   ├── campaignUpdateService.ts    # Campaign updates/news
│   ├── donationService.ts
│   ├── paymentMethodService.ts
│   ├── sharingService.ts
│   ├── sweepstakesService.ts
│   ├── volunteerService.ts
│   ├── adminService.ts
│   ├── adminUserService.ts
│   ├── adminContentService.ts
│   ├── qrFlyerService.ts
│   └── pdfExportService.ts
│
└── hooks/                  # 13 React Query hooks (1:1 with services)
    ├── useAuth.ts
    ├── useCampaigns.ts             # useQuery + useMutation wrappers
    ├── useCampaignUpdates.ts
    ├── useDonations.ts
    ├── usePaymentMethods.ts
    ├── useQRAnalytics.ts
    ├── useShares.ts
    ├── useSharingService.ts
    ├── useSweepstakes.ts
    ├── useSweepstakesCompliance.ts
    ├── useAdmin.ts
    ├── useAdminOperations.ts
    └── useVolunteer.ts
```

#### Strengths ✅
- **Clear separation**: Services handle HTTP/business logic, hooks handle React Query state
- **1:1 mapping** between services and hooks (consistent pattern)
- **Domain-driven** organization by feature (auth, campaigns, donations, etc.)
- **Expected patterns**: Hooks export `useQuery` + `useMutation` wrappers

#### Issues ⚠️
- **No error handling wrapper** - error standardization likely duplicated across services
- **No DTOs/type definitions** - API response contracts not centralized
- **No API client configuration module** - axios setup/interceptors unclear
- **No request/response transformers** - currency conversion, date formatting duplicated?
- **13 hooks is large** - some could be merged (e.g., `useAdmin` + `useAdminOperations`)

#### Recommendation
```
api/
├── services/
│   ├── core/               # NEW: Shared setup
│   │   ├── apiClient.ts    # Axios instance + interceptors
│   │   ├── types.ts        # Common types: ApiResponse, ApiError, Pagination
│   │   └── transformers.ts # Currency, date, image transformations
│   └── [domain services]
└── hooks/
    ├── useAuth.ts
    └── [domain hooks]
```

---

### **3. Components (`/components`) - WELL-ORGANIZED**

#### Organization: **Domain + UI Tier Pattern**

```
components/
├── ui/                     # Base primitives (reusable across all)
│   └── [shadcn-style components]
│
├── admin/                  # Admin-exclusive components
│   ├── CategoryManager.tsx
│   ├── EditablePlatformSettings.tsx
│   └── UserManagementList.tsx
│
├── analytics/              # Dashboard & analytics widgets
│   ├── ActivityFeed.tsx
│   ├── AdminSweepstakesStats.tsx
│   └── [analytics specific]
│
├── auth/                   # Auth-related forms
│   └── [login, register, password components]
│
├── campaign/               # LARGEST DOMAIN (30+ components)
│   ├── AddPaymentMethodForm.tsx
│   ├── AddPaymentMethodModal.tsx
│   ├── AgeVerificationModal.tsx
│   ├── CampaignCard.tsx
│   ├── CampaignGrid.tsx
│   ├── CampaignUpdates.tsx
│   ├── CreatorProfile.tsx
│   ├── FiltersSidebar.tsx
│   ├── FlyerBuilder.tsx
│   ├── FlyerDownload.tsx
│   ├── FundShareBudgetCard.tsx
│   ├── FundShareBudgetModal.tsx
│   ├── GeographicScopeSelector.tsx
│   ├── MultiMeterDisplay.tsx
│   ├── PaymentDirectory.tsx
│   ├── PaymentMethodManager.tsx
│   ├── PaymentMethodsManager.tsx
│   ├── ProgressBar.tsx
│   ├── QR/                 # Nested QR-specific components
│   │   └── [QR variants]
│   ├── QRAnalyticsDashboard.tsx
│   ├── QRCodeDisplay.tsx
│   ├── SearchBar.tsx
│   ├── ShareBudgetReloadModal.tsx
│   ├── ShareBudgetSetupSection.tsx
│   ├── ShareEarningsCard.tsx
│   ├── SharePayoutHistory.tsx
│   ├── SweepstakesCompliance.tsx
│   ├── SweepstakesEntryGuard.tsx
│   └── wizard/             # Nested wizard components
│       └── [4-step wizard components]
│
├── creator/                # Creator dashboard components
│   └── [creator specific layouts]
│
├── donation/               # Donation flow
├── layout/                 # Layout wrappers
├── sweepstakes/            # Sweepstakes components
│
└── [Global base components]
    ├── Badge.tsx
    ├── Button.tsx
    ├── Card.tsx
    ├── Divider.tsx
    ├── FormField.tsx
    ├── Link.tsx
    ├── LoadingSpinner.tsx
    ├── Modal.tsx
    ├── ProtectedRoute.tsx
    └── index.ts            # Barrel export
```

#### Strengths ✅
- **Domain-organized** - features group logically (campaign, donation, sweepstakes)
- **UI primitives isolated** - base components at root level with barrel export
- **Nested organization** - `campaign/QR/` and `campaign/wizard/` for sub-features
- **Clear naming** - purpose evident from names (Modal, Card, Form, Manager, etc.)

#### Issues ⚠️
- **Campaign folder too large** (~30 files) - should split into subdomains
  - **Suggestion**: Break into `campaign/{ forms/, modals/, qr/, wizard/, display/ }`
- **No layout folder structure visible** - what's in `layout/`?
- **No components/common/** folder - where are shared utilities?
- **Payment components duplicated?** - `AddPaymentMethodForm` AND `PaymentMethodManager` AND `PaymentMethodsManager` (naming inconsistency)
- **QR and wizard deeply nested** - could be top-level domains given complexity

#### Recommendation
```
components/
├── ui/                     # Primitives: Button, Card, Modal, Badge, etc.
├── auth/                   # Auth-exclusive
├── layout/                 # Layout wrappers
├── campaign/
│   ├── display/            # CampaignCard, CreatorProfile, CampaignUpdates
│   ├── forms/              # CampaignForm, FilterForm, etc.
│   ├── modals/             # AgeVerificationModal, PaymentMethodModal
│   └── shared/             # ProgressBar, SearchBar
├── qr/                     # Elevated: QRCodeDisplay, QRAnalyticsDashboard, QR/
├── wizard/                 # Elevated: 4-step campaign/donation wizards
├── payment/                # Elevated: Consolidate all payment components
├── donation/               # Donation-specific
├── sweepstakes/            # Sweepstakes-specific
├── analytics/              # Dashboard/analytics widgets
├── admin/                  # Admin-exclusive
└── creator/                # Creator-exclusive
```

---

### **4. State Management (`/store`) - PATTERN CLEAR**

```
store/
├── authStore.ts            # Auth state (user, token, role)
├── donationWizardStore.ts  # Donation creation wizard steps
├── filterStore.ts          # Campaign filters (search, category, etc.)
└── wizardStore.ts          # Campaign creation wizard steps
```

#### Strengths ✅
- **Zustand pattern** - lightweight, simple stores
- **Feature-specific** - each store handles one concern
- **Wizard stores** - indicate multi-step form state management

#### Issues ⚠️
- **Only 4 stores for entire app** - may be undermanaged
- **`wizardStore` naming ambiguous** - is this campaign or generic?
- **No payment wizard store** - where is payment state?
- **No loading/error states** - handled globally via React Query?

---

### **5. Utilities & Configuration - ADEQUATE**

```
utils/
└── validationSchemas.ts    # Zod validation (forms + API payloads)

lib/
├── api.ts                  # Axios instance + auth interceptor
├── queryClient.ts          # React Query setup
├── theme.ts                # Design tokens
├── qrcode.ts               # QR code generation utility
├── registry.tsx            # Styled-components registry
├── styled-components-registry.tsx
└── test-utils.ts

hooks/                       # Non-API custom hooks
├── useAuth.ts              # Auth state hook
├── useAuthHydration.ts     # Oauth/external auth setup
├── useAuthMutations.ts     # Auth mutations (login, register)
└── useToast.ts             # Toast notifications

styles/
├── globals.css
├── theme.ts
└── tokens.ts               # Design tokens (colors, spacing, etc.)
```

#### Issues ⚠️
- **`utils/` too minimal** - only validation, should have helpers
- **No constants folder** - magic strings scattered?
- **`hooks/` vs `api/hooks/`** - confusing organization (should be `hooks/useAuth.ts` in root)
- **Styled-components setup unclear** - why duplicate registry files?
- **No shared utilities module** - formatCurrency, parseDate, etc. where?

#### Recommendation
```
utils/
├── validationSchemas.ts
├── constants.ts            # NEW: API endpoints, config values
├── transformers.ts         # NEW: formatCurrency, parseDate, etc.
├── helpers.ts              # NEW: General utilities
└── formatters.ts           # NEW: String/number formatting

hooks/  (root level, not /api/hooks)
├── useAuth.ts
├── useAuthHydration.ts
├── useAuthMutations.ts
├── useToast.ts
└── (API hooks should be in /api/hooks - already correct)
```

---

### **6. Middleware & Global Setup - GOOD**

```
app/
├── layout.tsx              # Root layout (providers, theme)
├── providers.tsx           # React Query, Zustand, Styled-components wrappers
├── auth-hydrator.tsx       # Rehydrate user from localStorage/API
├── page.tsx                # Landing page
├── error.tsx               # Global error boundary
├── loading.tsx             # Loading state
├── unauthorized.tsx        # 403 handler
├── favicon.ico
└── globals.css             # Reset + theme application

middleware.ts               # Next.js middleware (token validation, redirects)
```

#### Strengths ✅
- **Error boundary** - global error handling
- **Auth hydrator** - user state persists across refreshes
- **Middleware** - protects routes before rendering

---

## 📈 Structure Quality Assessment

| Category | Score | Status | Notes |
|----------|-------|--------|-------|
| **Route Organization** | 9/10 | ✅ Excellent | Role-based groups, clear hierarchy |
| **API Layer** | 8/10 | ✅ Good | Domain-driven, but needs error/DTO standardization |
| **Components** | 7/10 | ⚠️ Good | Well-organized but campaign folder too large |
| **State Management** | 7/10 | ⚠️ Good | Zustand pattern clear, but minimal |
| **Utilities** | 6/10 | ⚠️ Adequate | Fragmented across utils, lib, hooks |
| **Type Safety** | 8/10 | ✅ Good | TypeScript strict mode, Zod validation |
| **Scalability** | 7/10 | ⚠️ Good | Good for current size, needs refactoring at 2x size |
| **Maintainability** | 7.5/10 | ✅ Good | Clear patterns, some naming conflicts |

**Overall Score: 7.5/10** - Well-structured for a complex application, but showing signs of growth friction.

---

## 🚨 Critical Issues

### 1. **Campaign Component Bloat** (PRIORITY: HIGH)
- **30+ files in `/components/campaign/`**
- **Visual clutter** - hard to locate specific components
- **Refactor recommendation**: Split by feature (forms, modals, displays, qr, wizard)
- **Impact**: Slows development, increases merge conflicts

### 2. **API Response Handling Fragmentation** (PRIORITY: HIGH)
- **No centralized DTO/type definitions**
- **Each service likely reimplements** error handling & transformation
- **Currency conversion** scattered across components
- **Refactor recommendation**: Create `/api/services/core/` with shared utilities

### 3. **Payment Components Naming Conflict** (PRIORITY: MEDIUM)
- `AddPaymentMethodForm`, `PaymentMethodManager`, `PaymentMethodsManager`
- **Unclear which to use** - duplicated logic likely
- **Refactor recommendation**: Consolidate to `PaymentForm`, `PaymentManager` + clarify singular vs plural

### 4. **Wizard Duplication** (PRIORITY: MEDIUM)  
- Two separate wizards: campaign creation (`campaign/wizard/`) and donation (`store/donationWizardStore`)
- **Code reuse opportunity** - shared wizard components
- **Refactor recommendation**: `/components/wizard/` with reusable steps

### 5. **Missing Folder Boundaries** (PRIORITY: LOW)
- No `constants/`, `types/`, `helpers/` folders
- **Global utilities scattered** across `lib/`, `utils/`, `hooks/`
- **Refactor recommendation**: Consolidate to clear structure

---

## ✅ Recommendations by Priority

### **Phase 1: Immediate (Fix structural debt)**
1. ✅ Split `/components/campaign/` into subfolders
2. ✅ Create `/api/services/core/` for shared utilities
3. ✅ Consolidate payment components

### **Phase 2: Short-term (Improve organization)**
4. ✅ Extract `/components/wizard/` for reuse
5. ✅ Create `/utils/constants.ts` for magic strings
6. ✅ Centralize API types in `/api/types.ts`

### **Phase 3: Long-term (Enhance scalability)**
7. ✅ Consider feature-based structure (if app grows 2x)
8. ✅ Add component testing patterns
9. ✅ Document component API contracts

---

## 🎯 Proposed Optimized Structure

```
honestneed-frontend/
├── app/                          # Route definitions (GOOD - keep as-is)
│   ├── (auth)/
│   ├── (campaigns)/
│   ├── (creator)/
│   ├── (supporter)/
│   └── admin/
│
├── api/                          # API Integration (REFACTOR)
│   ├── services/
│   │   ├── core/                 # NEW: Shared utilities
│   │   │   ├── apiClient.ts
│   │   │   ├── types.ts
│   │   │   └── transformers.ts
│   │   ├── authService.ts
│   │   ├── campaignService.ts
│   │   └── [other services]
│   ├── hooks/                    # React Query hooks (KEEP)
│   └── types.ts                  # NEW: Central API types
│
├── components/                   # Components (REORGANIZE)
│   ├── ui/                       # Primitives (KEEP)
│   ├── layout/                   # Layout wrappers (KEEP)
│   ├── common/                   # NEW: Shared across features
│   ├── wizard/                   # NEW: Elevated from campaign
│   ├── payment/                  # NEW: Elevated from campaign
│   ├── qr/                       # NEW: Elevated from campaign
│   ├── campaign/                 # REORGANIZED: Reduced to 15 files
│   │   ├── display/
│   │   ├── forms/
│   │   ├── modals/
│   │   └── shared/
│   ├── donation/
│   ├── sweepstakes/
│   ├── analytics/
│   ├── admin/
│   └── creator/
│
├── hooks/                        # Custom hooks (MOVE api/hooks here? Optional)
│   ├── useAuth.ts
│   ├── useAuthHydration.ts
│   └── ...
│
├── store/                        # Zustand stores (KEEP)
│
├── utils/                        # Utilities (CONSOLIDATE)
│   ├── validationSchemas.ts
│   ├── constants.ts              # NEW
│   ├── transformers.ts           # NEW
│   └── helpers.ts                # NEW
│
├── lib/                          # Config/Setup (CONSOLIDATE)
│   ├── api.ts
│   ├── queryClient.ts
│   ├── theme.ts
│   └── qrcode.ts
│
├── styles/                       # Global styles (KEEP)
│
├── middleware.ts                 # Auth middleware (KEEP)
└── [config files]
```

---

## 📋 Migration Checklist

- [ ] Split campaign components into 5 subfolders
- [ ] Create `/api/services/core/` module
- [ ] Extract payment components to `/components/payment/`
- [ ] Extract wizard to `/components/wizard/` with reusable steps
- [ ] Create `/utils/constants.ts`, `/utils/transformers.ts`, `/utils/helpers.ts`
- [ ] Consolidate API types in `/api/types.ts`
- [ ] Update barrel exports (index.ts files)
- [ ] Update import statements across codebase (~50-100 updates)
- [ ] Test all routes and components after refactoring
- [ ] Update team documentation with new structure

---

## 🏆 Summary

**Current State**: Well-structured for a mid-scale React app, following Next.js conventions with clear role-based routing and domain-driven organization.

**Key Strengths**: Route organization, API service pattern, component domain grouping, TypeScript setup.

**Key Weaknesses**: Campaign bloat, fragmented utilities, missing type centralization, naming conflicts in payment components.

**Recommendation**: Implement **High Priority** refactors (Phases 1) immediately to prevent architectural debt. Current structure supports 20-30 pages; beyond that, consider feature-based folder structure.

**Estimated Refactoring Time**: 8-16 hours (accounting for testing and impact assessment).
