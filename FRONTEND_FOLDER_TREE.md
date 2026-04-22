# HonestNeed Frontend - Complete Folder Structure Tree

```
honestneed-frontend/
│
├── 📁 app/                                    # Next.js App Router (16 Route Segments)
│   │
│   ├── 📁 (auth)/                            # Public Authentication Routes
│   │   ├── layout.tsx
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   └── reset-password/
│   │       └── page.tsx
│   │
│   ├── 📁 (campaigns)/                       # Public Campaign Browsing Routes
│   │   ├── layout.tsx
│   │   └── campaigns/
│   │       ├── page.tsx                      # Campaign search & browse
│   │       └── [id]/
│   │           └── page.tsx                  # Campaign detail view
│   │
│   ├── 📁 (creator)/                         # Creator Dashboard Routes (Protected)
│   │   ├── layout.tsx
│   │   │
│   │   ├── 📁 campaigns/
│   │   │   ├── page.tsx                      # Campaign list/dashboard
│   │   │   ├── create/
│   │   │   │   └── page.tsx                  # Campaign creation wizard
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx                  # Campaign detail
│   │   │   │   ├── edit/
│   │   │   │   │   └── page.tsx              # Campaign editing
│   │   │   │   ├── analytics/
│   │   │   │   │   └── page.tsx              # Campaign analytics
│   │   │   │   └── boost/
│   │   │   │       └── page.tsx              # Campaign boosting
│   │   │   └── ...
│   │   │
│   │   ├── 📁 dashboard/
│   │   │   ├── page.tsx                      # Creator overview dashboard
│   │   │   ├── analytics/
│   │   │   │   └── page.tsx
│   │   │   └── ...
│   │   │
│   │   └── 📁 settings/
│   │       ├── page.tsx                      # Creator account settings
│   │       ├── profile/
│   │       ├── payment-methods/
│   │       └── ...
│   │
│   ├── 📁 (supporter)/                       # Non-Creator Features (Protected)
│   │   ├── layout.tsx
│   │   │
│   │   ├── 📁 donations/
│   │   │   ├── page.tsx                      # Donations list
│   │   │   └── [id]/
│   │   │       └── page.tsx                  # Donation detail
│   │   │
│   │   ├── 📁 shares/
│   │   │   ├── page.tsx                      # Shares/earnings
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   │
│   │   └── 📁 sweepstakes/
│   │       ├── page.tsx                      # Sweepstakes list
│   │       └── [id]/
│   │           └── page.tsx                  # Entry/participation
│   │
│   ├── 📁 admin/                             # Admin Dashboard Routes (Protected)
│   │   ├── layout.tsx
│   │   ├── page.tsx                          # Admin overview
│   │   │
│   │   ├── 📁 campaigns/
│   │   │   ├── page.tsx                      # Campaign moderation
│   │   │   └── [id]/
│   │   │       └── page.tsx                  # Campaign details
│   │   │
│   │   ├── 📁 users/
│   │   │   ├── page.tsx                      # User management
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   │
│   │   ├── 📁 transactions/
│   │   │   ├── page.tsx                      # Transaction logs
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   │
│   │   ├── 📁 manage-sweepstakes/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   │
│   │   └── 📁 settings/
│   │       ├── page.tsx                      # Admin settings
│   │       ├── categories/
│   │       ├── platforms/
│   │       └── ...
│   │
│   ├── 📄 layout.tsx                         # Root layout (all pages)
│   ├── 📄 page.tsx                           # Landing/home page
│   ├── 📄 providers.tsx                      # React providers (Query, Zustand, Styled)
│   ├── 📄 auth-hydrator.tsx                  # Auth rehydration component
│   ├── 📄 error.tsx                          # Error boundary
│   ├── 📄 loading.tsx                        # Loading skeleton
│   ├── 📄 unauthorized.tsx                   # 403 unauthorized page
│   ├── 📄 favicon.ico
│   └── 📄 globals.css                        # CSS reset & theme application
│
│
├── 📁 api/                                   # API Integration Layer
│   │
│   ├── 📁 services/                          # 13 API Service Modules
│   │   ├── 📄 authService.ts                 # Auth endpoints (login, register, logout)
│   │   ├── 📄 campaignService.ts             # Campaign CRUD + status (15+ methods)
│   │   ├── 📄 campaignUpdateService.ts       # Campaign news/updates
│   │   ├── 📄 donationService.ts             # Donation endpoints
│   │   ├── 📄 paymentMethodService.ts        # Payment method CRUD
│   │   ├── 📄 sharingService.ts              # Share/refer endpoints
│   │   ├── 📄 sweepstakesService.ts          # Sweepstakes endpoints (create, enter, list)
│   │   ├── 📄 volunteerService.ts            # Volunteer features
│   │   ├── 📄 adminService.ts                # Admin dashboard endpoints
│   │   ├── 📄 adminUserService.ts            # Admin user management
│   │   ├── 📄 adminContentService.ts         # Admin content moderation
│   │   ├── 📄 qrFlyerService.ts              # QR code & flyer generation
│   │   └── 📄 pdfExportService.ts            # PDF export utilities
│   │
│   └── 📁 hooks/                             # 13 React Query Hooks (1:1 with services)
│       ├── 📄 useAuth.ts                     # Auth state & mutations
│       ├── 📄 useAuthMutations.ts            # Login/register/logout mutations
│       ├── 📄 useCampaigns.ts                # Campaign queries & mutations
│       ├── 📄 useCampaignUpdates.ts          # Campaign updates queries
│       ├── 📄 useDonations.ts                # Donation queries
│       ├── 📄 usePaymentMethods.ts           # Payment method queries & mutations
│       ├── 📄 useQRAnalytics.ts              # QR analytics queries
│       ├── 📄 useShares.ts                   # Share queries
│       ├── 📄 useSharingService.ts           # Sharing service queries
│       ├── 📄 useSweepstakes.ts              # Sweepstakes queries & mutations
│       ├── 📄 useSweepstakesCompliance.ts    # Compliance checks
│       ├── 📄 useAdmin.ts                    # Admin data queries
│       └── 📄 useAdminOperations.ts          # Admin action mutations
│
│
├── 📁 components/                            # Reusable UI Components (100+ files)
│   │
│   ├── 📁 ui/                                # Base UI Primitives (Reusable across all)
│   │   ├── 📄 Badge.tsx
│   │   ├── 📄 Button.tsx
│   │   ├── 📄 Card.tsx
│   │   ├── 📄 Divider.tsx
│   │   ├── 📄 FormField.tsx
│   │   ├── 📄 Link.tsx
│   │   ├── 📄 LoadingSpinner.tsx
│   │   ├── 📄 Modal.tsx
│   │   ├── 📄 ProtectedRoute.tsx
│   │   └── 📄 index.ts                       # Barrel export
│   │
│   ├── 📁 campaign/                          # Campaign Management (30+ files) ⚠️ LARGE
│   │   ├── 📄 CampaignCard.tsx               # Campaign grid item
│   │   ├── 📄 CampaignGrid.tsx               # Grid wrapper
│   │   ├── 📄 CampaignUpdates.tsx            # Updates feed
│   │   ├── 📄 CreatorProfile.tsx             # Creator info card
│   │   ├── 📄 FiltersSidebar.tsx             # Campaign filters
│   │   ├── 📄 SearchBar.tsx
│   │   ├── 📄 ProgressBar.tsx
│   │   ├── 📄 GeographicScopeSelector.tsx
│   │   │
│   │   ├── 📁 wizard/                        # 4-Step Campaign Creation Wizard
│   │   │   ├── 📄 CampaignWizard.tsx
│   │   │   ├── 📄 Step1TypeSelection.tsx     # Choose fundraising vs sharing
│   │   │   ├── 📄 Step2BasicInfo.tsx         # Title, description, image
│   │   │   ├── 📄 Step3TypeDetails.tsx       # Type-specific (goal/budget)
│   │   │   └── 📄 Step4Review.tsx            # Review & publish
│   │   │
│   │   ├── 📁 QR/                            # QR Code Components
│   │   │   ├── 📄 QRCodeDisplay.tsx
│   │   │   ├── 📄 QRAnalyticsDashboard.tsx
│   │   │   ├── 📄 FlyerBuilder.tsx
│   │   │   └── 📄 FlyerDownload.tsx
│   │   │
│   │   ├── 📄 FundShareBudgetCard.tsx
│   │   ├── 📄 FundShareBudgetModal.tsx
│   │   ├── 📄 AgeVerificationModal.tsx
│   │   │
│   │   ├── 📁 payment/                       # ⚠️ DUPLICATED - see components/payment/
│   │   │   ├── 📄 AddPaymentMethodForm.tsx
│   │   │   ├── 📄 AddPaymentMethodModal.tsx
│   │   │   ├── 📄 PaymentDirectory.tsx
│   │   │   ├── 📄 PaymentMethodManager.tsx
│   │   │   └── 📄 PaymentMethodsManager.tsx  # Likely duplicate above
│   │   │
│   │   ├── 📄 ShareBudgetReloadModal.tsx
│   │   ├── 📄 ShareBudgetSetupSection.tsx
│   │   ├── 📄 ShareEarningsCard.tsx
│   │   ├── 📄 SharePayoutHistory.tsx
│   │   ├── 📄 SweepstakesCompliance.tsx
│   │   ├── 📄 SweepstakesEntryGuard.tsx
│   │   └── 📄 MultiMeterDisplay.tsx
│   │
│   ├── 📁 admin/                             # Admin-Specific Components
│   │   ├── 📄 CategoryManager.tsx            # Manage campaign categories
│   │   ├── 📄 EditablePlatformSettings.tsx   # Platform configuration
│   │   └── 📄 UserManagementList.tsx         # User admin list
│   │
│   ├── 📁 analytics/                         # Analytics & Reporting Widgets
│   │   ├── 📄 ActivityFeed.tsx
│   │   ├── 📄 AdminSweepstakesStats.tsx
│   │   └── [other analytics components]
│   │
│   ├── 📁 auth/                              # Authentication Components
│   │   ├── 📄 LoginForm.tsx
│   │   ├── 📄 RegisterForm.tsx
│   │   ├── 📄 PasswordResetForm.tsx
│   │   └── [other auth components]
│   │
│   ├── 📁 donation/                          # Donation Flow Components
│   │   ├── 📄 DonationWizard.tsx
│   │   ├── 📄 DonationForm.tsx
│   │   └── [other donation components]
│   │
│   ├── 📁 sweepstakes/                       # Sweepstakes Components
│   │   ├── 📄 SweepstakesCard.tsx
│   │   ├── 📄 EntryForm.tsx
│   │   └── [other sweepstakes components]
│   │
│   ├── 📁 creator/                           # Creator Dashboard Components
│   │   ├── 📄 CreatorDashboard.tsx
│   │   ├── 📄 CreatorStats.tsx
│   │   └── [other creator-specific components]
│   │
│   └── 📁 layout/                            # Layout & Wrapper Components
│       ├── 📄 Header.tsx
│       ├── 📄 Sidebar.tsx
│       ├── 📄 Footer.tsx
│       └── [other layout components]
│
│
├── 📁 hooks/                                 # Custom React Hooks (Non-API)
│   ├── 📄 useAuth.ts                         # Auth state management
│   ├── 📄 useAuthHydration.ts                # Hydrate user on app init
│   ├── 📄 useAuthMutations.ts                # Auth action mutations
│   ├── 📄 useToast.ts                        # Toast notification helper
│   └── 📄 index.ts
│
│
├── 📁 store/                                 # Zustand State Management
│   ├── 📄 authStore.ts                       # User, token, role state
│   ├── 📄 wizardStore.ts                     # Campaign wizard step state
│   ├── 📄 donationWizardStore.ts             # Donation wizard step state
│   └── 📄 filterStore.ts                     # Campaign search/filter state
│
│
├── 📁 lib/                                   # Utilities & Configuration
│   ├── 📄 api.ts                             # Axios instance + auth interceptor
│   ├── 📄 queryClient.ts                     # React Query config
│   ├── 📄 theme.ts                           # Theme constants
│   ├── 📄 qrcode.ts                          # QR code generation
│   ├── 📄 registry.tsx                       # Styled-components provider
│   ├── 📄 styled-components-registry.tsx     # Duplicate of above? ⚠️
│   └── 📄 test-utils.ts                      # Testing utilities
│
│
├── 📁 utils/                                 # Helper Functions & Validation
│   └── 📄 validationSchemas.ts               # Zod form validation schemas
│       (SHOULD ALSO HAVE: constants, transformers, helpers, formatters)
│
│
├── 📁 styles/                                # Global Styling
│   ├── 📄 globals.css                        # Reset + base styles
│   ├── 📄 theme.ts                           # Theme object
│   └── 📄 tokens.ts                          # Design tokens (colors, spacing)
│
│
├── 📁 public/                                # Static Assets
│   └── [images, icons, etc.]
│
│
├── 📁 coverage/                              # Test Coverage Reports (Ignored in git)
│   ├── 📄 coverage-final.json
│   ├── 📄 lcov.info
│   └── 📁 lcov-report/
│
│
├── 📄 middleware.ts                          # Next.js Middleware (Auth, redirects)
├── 📄 tsconfig.json                          # TypeScript config
├── 📄 package.json                           # Dependencies & scripts
├── 📄 package-lock.json
├── 📄 next.config.ts                         # Next.js config
├── 📄 eslint.config.mjs                      # ESLint rules
├── 📄 postcss.config.mjs                     # PostCSS config
├── 📄 jest.config.js                         # Jest testing config
├── 📄 next-env.d.ts                          # Auto-generated Next.js types
├── 📄 .gitignore
├── 📄 README.md                              # Project documentation
├── 📄 CLAUDE.md                              # Copilot instructions (custom)
├── 📄 AGENTS.md                              # Agent configurations
│
└── 📁 .next/                                 # Build artifacts (Ignored)
    └── [auto-generated Next.js build files]

```

---

## 📊 Structure Statistics

| Metric | Value | Status |
|--------|-------|--------|
| **Route Groups** | 5 | ✅ Good |
| **Route Pages** | ~25-30 | ✅ Reasonable |
| **Service Modules** | 13 | ✅ Good |
| **React Query Hooks** | 13 | ✅ Match services |
| **Component Folders** | 10 | ✅ Domain-organized |
| **Component Files** | ~100+ | ⚠️ Campaign has 30+ |
| **Zustand Stores** | 4 | ⚠️ Minimal |
| **API Type Files** | 0 | ❌ MISSING |
| **Utility Modules** | 1 | ⚠️ Only validationSchemas |
| **Custom Hooks** | 4 | ✅ Good |

---

## 🎯 Key Paths (Most Used)

```
Source Code (Development)
├── app/[routes]              # Route handlers
├── api/services/[domain]     # API calls
├── api/hooks/use[Domain]     # State management
├── components/[domain]/      # UI components
├── store/[domain]Store.ts    # Global state
└── utils/                    # Validation & helpers

Configuration
├── middleware.ts             # Auth middleware
├── lib/api.ts                # HTTP client
├── lib/queryClient.ts        # React Query setup
└── tsconfig.json             # TypeScript

Styling
├── styles/globals.css        # Base styles
├── styles/tokens.ts          # Design system
└── lib/theme.ts              # Theme values

Testing & Linting
├── jest.config.js            # Test setup
├── eslint.config.mjs         # Linting rules
├── coverage/                 # Test reports (CI/CD)
└── lib/test-utils.ts         # Test helpers
```

---

## 🚀 Optimization Opportunities

1. **Reduce Component Files**: Campaign folder (30 files) → Target: 15-20 files
2. **Centralize Types**: Create `/api/types.ts` for API contracts
3. **Add/Consolidate Utils**: Create `/utils/constants.ts`, `/utils/transformers.ts`
4. **Consolidate Duplicate Registries**: Keep only one styled-components setup
5. **Clarify Payment Components**: Rename for consistency (singular vs plural)

---

## 📋 File Count Summary

```
Total Files (excluding node_modules, .next, coverage):
  ├── Routes (app/)........................... ~25-30 pages
  ├── Services (api/services/)............... 13 files
  ├── Hooks (api/hooks + hooks/)............. 17 files
  ├── Components (components/)............... 100+ files
  ├── Stores (store/)........................ 4 files
  ├── Configuration (lib/)................... 7 files
  ├── Utils (utils/)......................... 1 file
  ├── Styles................................ 3 files
  └── Config Files........................... 10+ files
  
  TOTAL: ~180+ source files
```

---

**Generated**: April 5, 2026 | **Framework**: Next.js 16 App Router | **Status**: ✅ Production-Ready Structure
