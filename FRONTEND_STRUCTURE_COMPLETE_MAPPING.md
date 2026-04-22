# Frontend Application Structure - Complete Mapping

**Root Directory:** `honestneed-frontend/`  
**Framework:** Next.js (App Router with Route Groups)

---

## 1. ROOT LAYOUT & CORE FILES

```
app/
├── layout.tsx                    # Root layout wrapper
├── page.tsx                      # Landing/home page
├── providers.tsx                 # QueryClient + Context providers
├── auth-hydrator.tsx            # Auth hydration logic
├── error.tsx                     # Global error boundary
├── loading.tsx                   # Global loading state
├── not-found.tsx               # 404 page
├── unauthorized.tsx            # 401 page
├── globals.css                  # Global styles
└── favicon.ico
```

---

## 2. AUTHENTICATION ROUTES - `(auth)` Route Group
**Path:** `app/(auth)/`  
**Purpose:** Public authentication pages (login, register, password reset)

```
(auth)/
├── layout.tsx                   # Auth layout wrapper
├── login/
│   └── page.tsx                # Login form page
├── register/
│   └── page.tsx                # Registration/signup form page
├── forgot-password/
│   └── page.tsx                # Forgot password entry page
└── reset-password/
    └── page.tsx                # Password reset confirmation page
```

**Key Components Used:**
- `components/auth/*` (auth-related UI components)

---

## 3. CREATOR ROUTES - `(creator)` Route Group
**Path:** `app/(creator)/`  
**Purpose:** Creator/fundraiser dashboard and management pages  
**Access:** Authenticated creators only

### 3.1 Creator Dashboard
```
(creator)/
├── layout.tsx                   # Creator section layout
├── dashboard/
│   ├── page.tsx                # Main creator dashboard overview
│   ├── campaigns/
│   │   ├── page.tsx            # Creator's campaigns list
│   │   └── [id]/
│   │       └── page.tsx        # Campaign detail/edit view
│   ├── components/
│   ├── context/
│   ├── hooks/
│   ├── services/
│   └── utils/
├── analytics/
│   └── page.tsx                # Creator analytics dashboard
├── settings/
│   └── page.tsx                # Creator account settings
├── wallet/
│   └── page.tsx                # Wallet overview & balance
├── boosts/
│   └── page.tsx                # Campaign boost management
└── sharers-payouts/
    ├── layout.tsx              # Sharers payouts layout
    ├── page.tsx                # Sharers payout overview
    └── [campaignId]/
        └── page.tsx            # Payout details for specific campaign
```

**Key Components Used:**
- `components/creator/BudgetReloadModal.tsx` - Budget reload functionality
- `components/creator/PrayerModerationPage.tsx` - Prayer moderation interface
- `components/creator/PrayerModerationQueue.tsx` - Prayer queue management
- `components/creator/VolunteerOffers.tsx` - Volunteer management
- `components/wallet/WalletDashboard.tsx` - Wallet display
- `components/wallet/PayoutScheduleManager.tsx` - Payout scheduling
- `components/wallet/TransactionHistory.tsx` - Transaction list
- `components/wallet/WalletSettings.tsx` - Wallet preferences
- `components/wallet/WithdrawalRequestModal.tsx` - Withdrawal initiation

---

## 4. CAMPAIGN ROUTES - `(campaigns)` Route Group
**Path:** `app/(campaigns)/`  
**Purpose:** Campaign browsing, creation, detail, donation pages  
**Access:** Public + authenticated users

### 4.1 Campaign Browsing & Management
```
(campaigns)/
├── layout.tsx                   # Campaigns section layout
├── campaigns/
│   ├── page.tsx                # Campaign list/browse page
│   ├── new/
│   │   └── page.tsx            # Campaign creation wizard start
│   └── [id]/
│       ├── page.tsx            # Campaign detail page
│       ├── donate/
│       │   └── page.tsx        # Donation flow for campaign
│       └── analytics/
│           └── page.tsx        # Campaign analytics (public view)
└── [id]/
    └── analytics/
        └── page.tsx            # Alternative analytics route
```

**Key Components Used:**
- `components/campaign/CampaignCard.tsx` - Campaign display card
- `components/campaign/CampaignGrid.tsx` - Grid layout for campaigns
- `components/campaign/CampaignAnalyticsDashboard.tsx` - Analytics display
- `components/campaign/FiltersSidebar.tsx` - Campaign filtering
- `components/campaign/SearchBar.tsx` - Campaign search
- `components/campaign/CreatorProfile.tsx` - Creator info display
- `components/campaign/CampaignUpdates.tsx` - Campaign updates feed
- `components/campaign/QRAnalyticsDashboard.tsx` - QR code analytics
- `components/campaign/ReferralAnalyticsDashboard.tsx` - Referral tracking

### 4.2 Campaign Wizard (Creation/Edit)
```
components/campaign/wizard/
├── CampaignWizard.tsx          # Main wizard orchestrator
├── Step1TypeSelection.tsx       # Type selection (fundraising vs sharing)
├── Step1aTypeSelection.tsx      # Alternative type selection
├── Step2BasicInfo.tsx           # Title, description, image
├── Step3GoalsBudget.tsx         # Goal amounts and budget
├── Step4Review.tsx              # Review before publish
├── Step5BoostSelection.tsx      # Boost tier selection
├── Step6BoostPayment.tsx        # Boost payment processing
├── CampaignPreview.tsx          # Live preview during creation
├── AutoSaveStatus.tsx           # Auto-save indicator
├── MeterSelection.tsx           # Meter type selection
├── MeterSelectionStep.tsx       # Meter configuration
├── MeterGoalsFormFields.tsx     # Meter goals input
├── CategoryBrowser.tsx          # Category selection
└── WizardSteps.tsx              # Step navigation component
```

---

## 5. SUPPORTER ROUTES - `(supporter)` Route Group
**Path:** `app/(supporter)/`  
**Purpose:** Supporter/donor pages for donations, shares, sweepstakes  
**Access:** Authenticated supporters

```
(supporter)/
├── layout.tsx                   # Supporter section layout
├── donations/
│   └── page.tsx                # Supporter's donations history
├── shares/
│   └── page.tsx                # Supporter's shares tracking
└── sweepstakes/
    └── page.tsx                # Supporter's sweepstakes entries
```

**Key Components Used:**
- `components/donation/DonationList.tsx` - Donations list view
- `components/donation/DonationWizard.tsx` - Donation flow
- `components/share/ShareAppeal.tsx` - Share request display
- `components/sweepstakes/SweepstakesLeaderboard.tsx` - Leaderboard
- `components/sweepstakes/SweepstakesEntryCounter.tsx` - Entry tracking
- `components/sweepstakes/PastWinningsTable.tsx` - Winners history

---

## 6. ADMIN ROUTES
**Path:** `app/admin/`  
**Purpose:** Administrative management and reporting  
**Access:** Admin users only

```
admin/
├── layout.tsx                   # Admin layout wrapper
├── dashboard/
│   └── page.tsx                # Admin dashboard overview
├── campaigns/
│   └── page.tsx                # Campaign management & moderation
├── sweepstakes/
│   └── page.tsx                # Sweepstakes management
├── manage-sweepstakes/
│   └── page.tsx                # Sweepstakes configuration
├── transactions/
│   └── page.tsx                # Transaction history & logs
├── settings/
│   └── page.tsx                # Platform settings & configuration
├── reports/
│   └── page.tsx                # Analytics & reports
└── users/
    └── page.tsx                # User management & moderation
```

**Key Components Used:**
- `components/admin/CategoryManager.tsx` - Category configuration
- `components/admin/EditablePlatformSettings.tsx` - Platform settings UI
- `components/admin/ShareVerificationDashboard.tsx` - Share verification
- `components/admin/UserManagementList.tsx` - User administration
- `components/analytics/AdminSweepstakesStats.tsx` - Sweepstakes statistics
- `components/layout/AdminSidebar.tsx` - Admin navigation

---

## 7. SWEEPSTAKES ROUTES
**Path:** `app/sweepstakes/`  
**Purpose:** Sweepstakes entry and details  
**Access:** Public pages

```
sweepstakes/
├── page.tsx                     # Sweepstakes list/browse
└── [id]/
    └── page.tsx                # Individual sweepstakes detail
```

**Key Components Used:**
- `components/sweepstakes/ClaimPrizeModal.tsx` - Prize claiming interface
- `components/sweepstakes/WinnerNotificationModal.tsx` - Winner notification
- `components/sweepstakes/SweepstakesEntryGuard.tsx` - Entry compliance check

---

## 8. CORE COMPONENTS BY FUNCTION

### 8.1 Campaign Components
**Location:** `components/campaign/`

| Component | Purpose |
|-----------|---------|
| `CampaignCard.tsx` | Reusable campaign display card with image/metadata |
| `CampaignGrid.tsx` | Grid layout wrapper for multiple campaigns |
| `CampaignAnalyticsDashboard.tsx` | Campaign performance metrics display |
| `AnalyticsCharts.tsx` | Chart visualizations for analytics |
| `AnalyticsExportModal.tsx` | Export analytics data UI |
| `CampaignBoostBadge.tsx` | Boost status indicator |
| `CampaignUpdates.tsx` | Campaign news/update feed |
| `CreatorProfile.tsx` | Creator info card/modal |
| `FiltersSidebar.tsx` | Campaign filtering interface |
| `SearchBar.tsx` | Campaign search input |
| `QRCodeDisplay.tsx` | QR code generator/display |
| `QRAnalyticsDashboard.tsx` | QR code scans analytics |
| `ReferralAnalyticsDashboard.tsx` | Referral tracking analytics |
| `ShareAnalyticsDashboard.tsx` | Share campaign analytics |
| `PrayButton.tsx` | Prayer action button |
| `PrayerActivityFeed.tsx` | Prayer activity display |
| `PrayerMeter.tsx` | Prayer progress meter |
| `PrayerModal.tsx` | Prayer submission modal |
| `PrayerRequestConfig.tsx` | Prayer request configuration |
| `PrayerSettingsTab.tsx` | Prayer settings UI |
| `PaymentDirectory.tsx` | Payment method selection |
| `PaymentMethodManager.tsx` | Payment method management |
| `PaymentMethodsManager.tsx` | Multi-payment management |
| `AddPaymentMethodForm.tsx` | Add payment method form |
| `AddPaymentMethodModal.tsx` | Payment method modal |
| `AgeVerificationModal.tsx` | Age verification for sweepstakes |
| `FlyerBuilder.tsx` | Campaign flyer creation tool |
| `FlyerDownload.tsx` | Flyer download interface |
| `MultiMeterDisplay.tsx` | Multiple progress meter display |
| `ProgressBar.tsx` | Single progress indicator |
| `GeographicScopeSelector.tsx` | Geographic targeting selector |
| `SweepstakesCompliance.tsx` | Sweepstakes compliance info |
| `SweepstakesEntryGuard.tsx` | Entry eligibility checker |
| `FundShareBudgetCard.tsx` | Budget display card |
| `FundShareBudgetModal.tsx` | Budget management modal |
| `ShareEarningsCard.tsx` | Earnings display for shares |
| `ShareEarningsDisplay.tsx` | Share earnings details |
| `ShareInfoSection.tsx` | Share campaign info block |
| `SharePayoutHistory.tsx` | Share payout transaction list |
| `ShareResult.tsx` | Share activity result display |
| `ShareWizard.tsx` | Share campaign creation wizard |
| `ShareBudgetBadge.tsx` | Budget status badge |

### 8.2 Donation Components
**Location:** `components/donation/`

| Component | Purpose |
|-----------|---------|
| `DonationWizard.tsx` | Multi-step donation flow orchestrator |
| `DonationStep1Amount.tsx` | Amount selection step |
| `DonationStep2PaymentMethod.tsx` | Payment method selection step |
| `DonationStep3Confirmation.tsx` | Donation confirmation step |
| `DonationSuccessModal.tsx` | Success confirmation modal |
| `DonationList.tsx` | List of user's donations |
| `DonationDetailModal.tsx` | Donation details popup |
| `DonationStatusBadge.tsx` | Donation status indicator |
| `ShareButton.tsx` | Share action button |
| `ShareModal.tsx` | Share campaign selection modal |
| `ShareList.tsx` | List of shared campaigns |
| `OfferHelpModal.tsx` | Offer additional help modal |
| `FeeBreakdown.tsx` | Fee structure display |
| `ShareBudgetBadge.tsx` | Share budget indicator |

### 8.3 Boost Components
**Location:** `components/boost/`

| Component | Purpose |
|-----------|---------|
| `BoostWizard.tsx` | Boost tier selection flow |
| `BoostManager.tsx` | Boost management interface |
| `BoostModal.tsx` | Boost details modal |
| `BoostTierCard.tsx` | Individual boost tier display |
| `BoostCheckout.tsx` | Boost payment checkout |

### 8.4 Analytics Components
**Location:** `components/analytics/`

| Component | Purpose |
|-----------|---------|
| `ActivityFeed.tsx` | User activity log display |
| `ActivityPredictionCard.tsx` | Predictive activity card |
| `AdminSweepstakesStats.tsx` | Sweepstakes admin statistics |
| `CampaignMetricsCards.tsx` | Campaign KPI cards |
| `ChannelROIChart.tsx` | ROI by channel visualization |
| `CohortRetentionTable.tsx` | User cohort retention tracking |
| `CsvExportButton.tsx` | CSV export functionality |
| `ForecastingChart.tsx` | Forecast visualization |
| `OptimizationPanel.tsx` | Optimization recommendations |
| `PeriodComparisonChart.tsx` | Period-over-period comparison |
| `PrayerAnalyticsDashboard.tsx` | Prayer metrics dashboard |
| `PrayerTrendChart.tsx` | Prayer trend visualization |
| `SeasonalHeatmap.tsx` | Seasonal pattern heatmap |
| `TimeSeriesChart.tsx` | Time series data visualization |
| `TrendIndicator.tsx` | Trend up/down indicator |

### 8.5 Sweepstakes Components
**Location:** `components/sweepstakes/`

| Component | Purpose |
|-----------|---------|
| `SweepstakesLeaderboard.tsx` | Leaderboard display |
| `SweepstakesEntryCounter.tsx` | Entry count tracking |
| `PastWinningsTable.tsx` | Winners history table |
| `ClaimPrizeModal.tsx` | Prize claim interface |
| `WinnerNotificationModal.tsx` | Winner announcement modal |

### 8.6 Wallet Components
**Location:** `components/wallet/`

| Component | Purpose |
|-----------|---------|
| `WalletDashboard.tsx` | Main wallet overview |
| `PayoutScheduleManager.tsx` | Payout schedule configuration |
| `TransactionHistory.tsx` | Transaction log viewer |
| `WalletSettings.tsx` | Wallet preferences |
| `WithdrawalRequestModal.tsx` | Withdrawal initiation form |

### 8.7 Admin Components
**Location:** `components/admin/`

| Component | Purpose |
|-----------|---------|
| `CategoryManager.tsx` | Campaign category configuration |
| `EditablePlatformSettings.tsx` | Editable platform settings UI |
| `ShareVerificationDashboard.tsx` | Share verification interface |
| `UserManagementList.tsx` | User administration list |

### 8.8 Layout Components
**Location:** `components/layout/`

| Component | Purpose |
|-----------|---------|
| `Navbar.tsx` | Top navigation bar |
| `AdminSidebar.tsx` | Admin section sidebar |
| `Footer.tsx` | Footer component |

### 8.9 UI Components
**Location:** `components/ui/`

| Component | Purpose |
|-----------|---------|
| `Button.tsx` | Reusable button component |
| `Skeleton.tsx` | Loading skeleton placeholder |

### 8.10 Mobile Components
**Location:** `components/mobile/`

**Atoms:**
- `MobileButton.tsx` - Mobile-optimized button
- `MobileCard.tsx` - Mobile-optimized card
- `MobileInput.tsx` - Mobile input field

**Layouts:**
- `MobileAppShell.tsx` - Mobile app wrapper layout

**Navigation:**
- `BottomTabBar.tsx` - Bottom tab navigation
- `Drawer.tsx` - Side drawer menu

### 8.11 Share Components
**Location:** `components/share/`

| Component | Purpose |
|-----------|---------|
| `ShareAppeal.tsx` | Share campaign appeal display |
| `ConversionAnalyticsDashboard.tsx` | Share conversion metrics |

### 8.12 Creator-Specific Components
**Location:** `components/creator/`

| Component | Purpose |
|-----------|---------|
| `BudgetReloadModal.tsx` | Budget reload interface |
| `PrayerModerationPage.tsx` | Prayer moderation interface |
| `PrayerModerationQueue.tsx` | Prayer moderation queue |
| `VolunteerOffers.tsx` | Volunteer management |

---

## 9. API SERVICES & HOOKS

### 9.1 API Services
**Location:** `api/services/`

| Service | Purpose |
|---------|---------|
| `campaignService.ts` | Campaign CRUD & management API calls |
| `campaignUpdateService.ts` | Campaign update API calls |
| `donationService.ts` | Donation processing API calls |
| `sharingService.ts` | Share campaign API calls |
| `boostService.ts` | Boost purchase API calls |
| `authService.ts` | Authentication API calls |
| `paymentMethodService.ts` | Payment method management |
| `sweepstakesService.ts` | Sweepstakes API calls |
| `simpleSweepstakesService.ts` | Simplified sweepstakes service |
| `prayerService.ts` | Prayer endpoint calls |
| `volunteerService.ts` | Volunteer system API |
| `adminService.ts` | Admin operations API |
| `adminUserService.ts` | Admin user management |
| `adminContentService.ts` | Admin content moderation |
| `qrFlyerService.ts` | QR code & flyer generation |
| `pdfExportService.ts` | PDF export functionality |

### 9.2 React Query Hooks
**Location:** `api/hooks/`

| Hook | Purpose |
|------|---------|
| `useCampaigns.ts` | Campaign list & CRUD operations |
| `useBatchCampaigns.ts` | Batch campaign operations |
| `useCampaignAnalytics.ts` | Campaign analytics data |
| `useCampaignUpdates.ts` | Campaign updates |
| `useAutoSaveCampaignDraft.ts` | Auto-save campaign drafts |
| `useScheduledActivation.ts` | Scheduled activation management |
| `useDonations.ts` | Donation history & processing |
| `useShares.ts` | Share tracking |
| `useSharingService.ts` | Share campaign operations |
| `useShareEarnings.ts` | Share earnings tracking |
| `useSharerEarnings.ts` | Sharer earnings data |
| `useMyShareAnalytics.ts` | Share analytics for user |
| `useBoosts.ts` | Boost purchases |
| `useAuth.ts` | Authentication state |
| `useSweepstakes.ts` | Sweepstakes operations |
| `useSimpleSweepstakes.ts` | Simplified sweepstakes |
| `useSweepstakesCompliance.ts` | Sweepstakes compliance |
| `usePaymentMethods.ts` | Payment method management |
| `usePrayers.ts` | Prayer data |
| `useReferralCode.ts` | Referral code generation |
| `useReferralUrl.ts` | Referral URL tracking |
| `useConversionTracking.ts` | Conversion pixel tracking |
| `useQRAnalytics.ts` | QR code analytics |
| `useWallet.ts` | Wallet operations |
| `useCampaignPayouts.ts` | Campaign payout tracking |
| `useAdmin.ts` | Admin operations |
| `useAdminOperations.ts` | Admin-specific operations |
| `useVolunteer.ts` | Volunteer system operations |
| `useCampaignStatusNotifications.ts` | Campaign status notifications |

---

## 10. STATE MANAGEMENT & UTILITIES

### 10.1 Zustand Stores
**Location:** `store/`

| Store | Purpose |
|-------|---------|
| `authStore.ts` | Authentication state |
| `wizardStore.ts` | Campaign wizard state |
| `donationWizardStore.ts` | Donation flow state |
| `filterStore.ts` | Campaign filter state |

### 10.2 Validation Schemas (Zod)
**Location:** `utils/`

| File | Purpose |
|------|---------|
| `validationSchemas.ts` | Campaign & form validation |
| `boostValidationSchemas.ts` | Boost-specific validation |
| `prayerValidationSchemas.ts` | Prayer validation |

### 10.3 Utilities
**Location:** `utils/`

| File | Purpose |
|------|---------|
| `dateFilters.ts` | Date range utilities |
| `imageUtils.ts` | Image processing utilities |
| `imageUrlNormalizer.ts` | Image URL normalization |
| `conversionPixel.ts` | Conversion tracking pixel |

### 10.4 Library Files
**Location:** `lib/`

| File | Purpose |
|------|---------|
| `api.ts` | Axios instance configuration |
| `queryClient.ts` | React Query client setup |
| `registry.tsx` | Styled components registry |
| `styled-components-registry.tsx` | Styled components setup |
| `theme.ts` | Theme configuration |
| `qrcode.ts` | QR code generation utilities |
| `mediaRecorder.ts` | Media recording utilities |
| `test-utils.ts` | Testing utilities |

### 10.5 Hooks
**Location:** `hooks/`

| Hook | Purpose |
|------|---------|
| `useAuth.ts` | Authentication state hook |
| `useAuthHydration.ts` | Auth hydration on mount |
| `useAuthMutations.ts` | Auth mutation helpers |
| `useToast.ts` | Toast notification system |
| `useMobile.ts` | Mobile detection |
| `useMetricsFilters.ts` | Analytics filter state |

---

## 11. PAGE FUNCTIONALITY SUMMARY

### By User Role

**Public Users:**
- `app/(campaigns)/campaigns/page.tsx` - Browse all campaigns
- `app/(campaigns)/campaigns/[id]/page.tsx` - View campaign details
- `app/(campaigns)/campaigns/[id]/donate/page.tsx` - Make donation
- `app/sweepstakes/page.tsx` - View sweepstakes listings
- `app/sweepstakes/[id]/page.tsx` - Enter sweepstakes
- `app/page.tsx` - Landing page

**Authenticated Donors/Supporters:**
- `app/(supporter)/donations/page.tsx` - View donation history
- `app/(supporter)/shares/page.tsx` - View shares tracking
- `app/(supporter)/sweepstakes/page.tsx` - View sweepstakes entries

**Creators/Fundraisers:**
- `app/(creator)/dashboard/page.tsx` - Main dashboard
- `app/(creator)/dashboard/campaigns/page.tsx` - Campaign list
- `app/(creator)/dashboard/campaigns/[id]/page.tsx` - Edit campaign
- `app/(creator)/analytics/page.tsx` - Analytics dashboard
- `app/(creator)/wallet/page.tsx` - Wallet & earnings
- `app/(creator)/boosts/page.tsx` - Boost management
- `app/(creator)/settings/page.tsx` - Account settings
- `app/(creator)/sharers-payouts/page.tsx` - Payout management

**Administrators:**
- `app/admin/dashboard/page.tsx` - Admin overview
- `app/admin/campaigns/page.tsx` - Campaign moderation
- `app/admin/sweepstakes/page.tsx` - Sweepstakes management
- `app/admin/transactions/page.tsx` - Transaction logs
- `app/admin/users/page.tsx` - User management
- `app/admin/reports/page.tsx` - Analytics & reports
- `app/admin/settings/page.tsx` - Platform settings

---

## 12. KEY PATTERNS & CONVENTIONS

### Routing Structure
- **Route Groups** use parentheses: `(auth)`, `(campaigns)`, `(creator)`, `(supporter)`
- **Dynamic Routes** use brackets: `[id]`, `[campaignId]`
- **Shared Layouts** per route group with `layout.tsx`

### Component Organization
- **Page Components** (in `app/`) handle routing & page-level logic
- **Reusable Components** organized in `components/` by feature
- **Services** provide API communication
- **Hooks** wrap services with React Query for state management

### Naming Conventions
- `*Service.ts` - API communication layer
- `use*` - React hooks (Query hooks, custom hooks)
- `*Store.ts` - Zustand state stores
- `*Modal.tsx` - Modal/dialog components
- `*Dashboard.tsx` - Analytics/overview dashboards
- `*Card.tsx` - Card display components
- `*List.tsx` - List view components
- `*Wizard.tsx` - Multi-step form flows

### Data Flow
1. **Pages** → Display UI & fetch data
2. **Hooks** (`api/hooks/`) → React Query wrapper around services
3. **Services** (`api/services/`) → Axios calls to backend
4. **Components** → Receive data via props or hooks
5. **Stores** (`store/`) → Global state (auth, wizard state)

---

## 13. FILE STATISTICS

| Category | Count |
|----------|-------|
| Page Components | 25+ |
| Service Files | 16 |
| Hook Files | 30+ |
| Component Folders | 14 |
| Layout Files | 3+ |
| Route Groups | 4 |
| Admin Pages | 9 |
| Auth Pages | 4 |

**Total Files in Frontend:** ~300+ files (excluding node_modules)

---

## 14. ROUTING HIERARCHY

```
/ (root)
├── (auth)
│   ├── login
│   ├── register
│   ├── forgot-password
│   └── reset-password
├── (campaigns)
│   ├── campaigns
│   │   ├── new (wizard)
│   │   └── [id]
│   │       ├── donate
│   │       └── analytics
│   └── [id]
│       └── analytics
├── (creator)
│   ├── dashboard
│   │   └── campaigns/[id]
│   ├── analytics
│   ├── settings
│   ├── wallet
│   ├── boosts
│   └── sharers-payouts/[campaignId]
├── (supporter)
│   ├── donations
│   ├── shares
│   └── sweepstakes
├── admin
│   ├── dashboard
│   ├── campaigns
│   ├── sweepstakes
│   ├── manage-sweepstakes
│   ├── transactions
│   ├── settings
│   ├── reports
│   └── users
└── sweepstakes
    └── [id]
```

