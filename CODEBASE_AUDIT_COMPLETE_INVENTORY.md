# HonestNeed Codebase Audit - Complete Inventory

## Overview
This document provides a comprehensive inventory of the entire HonestNeed application codebase for the fundraising campaign flow. All files are categorized by function with specific line numbers and brief descriptions.

**Generation Date**: April 8, 2026  
**Scope**: Frontend (Next.js/React) + Backend (Express.js/Node.js)

---

## 1. FRONTEND CAMPAIGN CREATION FLOW

### 1.1 Campaign Wizard & Form Components

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/components/campaign/wizard/CampaignWizard.tsx](honestneed-frontend/components/campaign/wizard/CampaignWizard.tsx) | 1-500+ | Main wizard component orchestrating 4-step campaign creation flow (type selection → basic info → details → review) |
| [honestneed-frontend/components/campaign/wizard/WizardSteps.tsx](honestneed-frontend/components/campaign/wizard/WizardSteps.tsx) | 1-300+ | Individual step components for wizard (Step1TypeSelection, Step2BasicInfo, Step3Details, Step4Review) |
| [honestneed-frontend/components/campaign/ShareWizard.tsx](honestneed-frontend/components/campaign/ShareWizard.tsx) | 1-400+ | Specialized wizard for creating sharing campaigns (paid sharing mechanics) |
| [honestneed-frontend/components/donation/DonationWizard.tsx](honestneed-frontend/components/donation/DonationWizard.tsx) | 1-350+ | 3-step donation flow (Amount → Payment Method → Confirmation) |
| [honestneed-frontend/components/donation/DonationWizardSteps.tsx](honestneed-frontend/components/donation/DonationWizardSteps.tsx) | 1-300+ | Step components for donation wizard (DonationStep1Amount, DonationStep2PaymentMethod, DonationStep3Confirmation) |
| [honestneed-frontend/components/campaign/AddPaymentMethodForm.tsx](honestneed-frontend/components/campaign/AddPaymentMethodForm.tsx) | 1-200+ | Form for adding payment methods (Venmo, PayPal, CashApp, Bank, Crypto) |

### 1.2 Validation Schemas (Zod)

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/utils/validationSchemas.ts](honestneed-frontend/utils/validationSchemas.ts) | 1-500+ | **Core validation schemas**: loginSchema, registerSchema, passwordSchema, campaignCreationSchema (with discriminated unions for fundraising vs sharing), donationSchema, paymentMethodSchema, etc. Uses Zod for type-safe validation with custom error messages. Includes emergency password strength checker (`evaluatePasswordStrength`) and field validators |
| [honestneed-frontend/utils/imageUtils.ts](honestneed-frontend/utils/imageUtils.ts) | 1-150+ | Image upload and processing utilities: `validateImageFile()`, `resizeImage()`, `compressImage()` |

### 1.3 State Management (Zustand Stores)

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/store/wizardStore.ts](honestneed-frontend/store/wizardStore.ts) | 1-250+ | Campaign wizard state: `currentStep`, `formData`, `campaignType`, `errors`, `setFormData()`, `nextStep()`, `prevStep()`, `reset()` |
| [honestneed-frontend/store/donationWizardStore.ts](honestneed-frontend/store/donationWizardStore.ts) | 1-200+ | Donation wizard state: `amount`, `selectedPaymentMethod`, `proof`, `status`, `setAmount()`, `setPaymentMethod()` |
| [honestneed-frontend/store/filterStore.ts](honestneed-frontend/store/filterStore.ts) | 1-150+ | Campaign filters: `searchQuery`, `needTypes[]`, `location`, `status`, `sortBy` |
| [honestneed-frontend/store/authStore.ts](honestneed-frontend/store/authStore.ts) | 1-200+ | Authentication state: `user`, `token`, `isAuthenticated`, `setUser()`, `logout()` |

### 1.4 API Service Layer

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/api/services/campaignService.ts](honestneed-frontend/api/services/campaignService.ts) | 1-500+ | **Primary campaign API client** with methods: `getCampaigns()` (list with pagination), `getCampaign()` (detail), `createCampaign()` (POST with FormData), `updateCampaign()`, `getCampaignAnalytics()`, `getTrendingCampaigns()`, `getRelatedCampaigns()`, `recordShare()`, `activateCampaign()`, `pauseCampaign()`, `completeCampaign()`. Handles FormData multipart encoding for image uploads. Uses bearer token authentication. Line 50-150: GET requests, Line 150-250: POST requests, Line 250-350: Analytics endpoints, Line 350+: Status action endpoints |
| [honestneed-frontend/api/services/campaignUpdateService.ts](honestneed-frontend/api/services/campaignUpdateService.ts) | 1-200+ | Campaign updates/announcements API: `getUpdates()`, `createUpdate()`, `deleteUpdate()` |
| [honestneed-frontend/api/services/donationService.ts](honestneed-frontend/api/services/donationService.ts) | 1-250+ | Donation API client: `createDonation()` (POST /campaigns/:id/donations), `getMyDonations()`, `getDonation()`, `calculateFee()` (20% platform fee in cents). Handles referral codes for share-to-donation conversions |
| [honestneed-frontend/api/services/paymentMethodService.ts](honestneed-frontend/api/services/paymentMethodService.ts) | 1-200+ | Payment method management: `createPaymentMethod()`, `getPaymentMethods()`, `deletePaymentMethod()`, `setDefaultPaymentMethod()`. Supports Venmo, PayPal, CashApp, Bank Transfer, Crypto |
| [honestneed-frontend/api/services/authService.ts](honestneed-frontend/api/services/authService.ts) | 1-180+ | Authentication API: `login()`, `register()`, `forgotPassword()`, `resetPassword()`, `refreshToken()`. Sets JWT in localStorage |
| [honestneed-frontend/api/services/adminService.ts](honestneed-frontend/api/services/adminService.ts) | 1-200+ | Admin dashboard APIs: campaign management, user management, transaction approval |
| [honestneed-frontend/api/services/sharingService.ts](honestneed-frontend/api/services/sharingService.ts) | 1-250+ | Sharing campaign APIs: `recordShare()`, `trackReferral()`, `getShareRewards()` |
| [honestneed-frontend/api/services/sweepstakesService.ts](honestneed-frontend/api/services/sweepstakesService.ts) | 1-200+ | Sweepstakes integration: `getSweepstakes()`, `enterSweepstakes()`, `checkWinner()` |

### 1.5 React Query Hooks

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/api/hooks/useCampaigns.ts](honestneed-frontend/api/hooks/useCampaigns.ts) | 1-400+ | **Campaign React Query hooks**: `useCampaigns()` (list, staleTime 10min, gcTime 30min), `useCampaign()` (detail, staleTime 5min, gcTime 15min), `useCampaignAnalytics()` (refetch every 5min), `useTrendingCampaigns()`, `useRelatedCampaigns()`, `useRecordShare()`, `useNeedTypes()`. Query key factory for consistent cache management (lines 15-30). Hooks use mutation for create/update/delete operations (lines 200+) |
| [honestneed-frontend/api/hooks/useCampaignUpdates.ts](honestneed-frontend/api/hooks/useCampaignUpdates.ts) | 1-200+ | Campaign updates hooks: `useUpdates()` (query), `useCreateUpdate()` (mutation), `useDeleteUpdate()` (mutation) |
| [honestneed-frontend/api/hooks/useDonations.ts](honestneed-frontend/api/hooks/useDonations.ts) | 1-250+ | Donation hooks: `useDonations()` (list), `createDonation()` (mutation with screenshot upload), `useMyDonations()` (current user's history) |
| [honestneed-frontend/api/hooks/usePaymentMethods.ts](honestneed-frontend/api/hooks/usePaymentMethods.ts) | 1-200+ | Payment method hooks: `usePaymentMethods()`, `useCreatePaymentMethod()`, `useDeletePaymentMethod()` |
| [honestneed-frontend/api/hooks/useAuth.ts](honestneed-frontend/api/hooks/useAuth.ts) | 1-180+ | Auth hooks: `useLogin()`, `useRegister()`, `useRefreshToken()` with automatic token refresh |
| [honestneed-frontend/api/hooks/useSharingService.ts](honestneed-frontend/api/hooks/useSharingService.ts) | 1-200+ | Sharing hooks: `useShares()`, `useRecordShare()`, `useTrackReferral()` |
| [honestneed-frontend/api/hooks/useShares.ts](honestneed-frontend/api/hooks/useShares.ts) | 1-200+ | Share tracking hooks: `useShareStats()`, `useReferralHistory()` |
| [honestneed-frontend/api/hooks/useSweepstakes.ts](honestneed-frontend/api/hooks/useSweepstakes.ts) | 1-200+ | Sweepstakes hooks: `useSweepstakes()`, `useEnterSweepstakes()` |
| [honestneed-frontend/api/hooks/useQRAnalytics.ts](honestneed-frontend/api/hooks/useQRAnalytics.ts) | 1-150+ | QR code analytics: `useQRAnalytics()`, `useQRScans()` |

### 1.6 Campaign Creation Pages

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/app/(campaigns)/campaigns/new/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/new/page.tsx) | 1-100+ | Campaign creation entry point - renders CampaignWizard component |
| [honestneed-frontend/app/(creator)/campaigns/[id]/edit/page.tsx](honestneed-frontend/app/(creator)/campaigns/[id]/edit/page.tsx) | 1-150+ | Edit draft campaign page - allows editing of title, description, image, payment methods (only for draft status) |
| [honestneed-frontend/app/(campaigns)/campaigns/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/page.tsx) | 1-200+ | Campaign list/browse page with filtering, search, pagination |

### 1.7 Campaign Detail Pages

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/app/(campaigns)/campaigns/[id]/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/[id]/page.tsx) | 1-300+ | Campaign detail page - displays title, description, image, donation meter, share buttons, creator profile, related campaigns. Integrates with useCampaign and useCampaignAnalytics hooks |
| [honestneed-frontend/app/(campaigns)/campaigns/[id]/analytics/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/[id]/analytics/page.tsx) | 1-250+ | Campaign analytics dashboard (creator-only view) - shows donation trends, top donors, share metrics, QR scans |
| [honestneed-frontend/app/(campaigns)/campaigns/[id]/donate/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/[id]/donate/page.tsx) | 1-200+ | Donation page - renders DonationWizard for multi-step donation flow |

---

## 2. FRONTEND CAMPAIGN DETAIL & ANALYTICS

### 2.1 Detail Display Components

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/components/campaign/CampaignCard.tsx](honestneed-frontend/components/campaign/CampaignCard.tsx) | 1-250+ | Campaign card component for lists/grids: displays title, image, raised/goal amounts (converted from cents to dollars), status badge, creator name, action buttons |
| [honestneed-frontend/components/campaign/CampaignGrid.tsx](honestneed-frontend/components/campaign/CampaignGrid.tsx) | 1-200+ | Responsive grid layout for campaign cards with pagination controls |
| [honestneed-frontend/components/campaign/CreatorProfile.tsx](honestneed-frontend/components/campaign/CreatorProfile.tsx) | 1-150+ | Creator info display: name, avatar, bio, campaign count, total raised |
| [honestneed-frontend/components/donation/DonationList.tsx](honestneed-frontend/components/donation/DonationList.tsx) | 1-200+ | List of recent donations with donor names, amounts, timestamps |
| [honestneed-frontend/components/donation/FeeBreakdown.tsx](honestneed-frontend/components/donation/FeeBreakdown.tsx) | 1-150+ | Displays donation breakdown: gross amount, 20% platform fee, net creator amount |

### 2.2 Analytics Components

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/components/campaign/QRAnalyticsDashboard.tsx](honestneed-frontend/components/campaign/QRAnalyticsDashboard.tsx) | 1-300+ | QR code scan analytics: daily/weekly/monthly trends, geographic distribution, device types, click data. Uses Chart.js or similar for visualization |
| [honestneed-frontend/components/analytics/CampaignMetricsCards.tsx](honestneed-frontend/components/analytics/CampaignMetricsCards.tsx) | 1-200+ | Summary cards: total raised, donor count, share count, engagement rate |
| [honestneed-frontend/components/campaign/MultiMeterDisplay.tsx](honestneed-frontend/components/campaign/MultiMeterDisplay.tsx) | 1-180+ | Progress visualization for multiple campaign goals (fundraising + sharing) |
| [honestneed-frontend/components/campaign/ProgressBar.tsx](honestneed-frontend/components/campaign/ProgressBar.tsx) | 1-120+ | Linear progress bar with percentage and labels |

### 2.3 Donation UI Components

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/components/donation/DonationStep1Amount.tsx](honestneed-frontend/components/donation/DonationStep1Amount.tsx) | 1-180+ | Donation amount input with preset amounts ($5, $10, $25, $50, $100) and custom input. Fee calculation displayed in real-time. Stores amount in cents internally |
| [honestneed-frontend/components/donation/DonationStep2PaymentMethod.tsx](honestneed-frontend/components/donation/DonationStep2PaymentMethod.tsx) | 1-200+ | Payment method selection (Venmo, PayPal, CashApp, Bank, Check, Crypto). Show existing payment methods or add new |
| [honestneed-frontend/components/donation/DonationStep3Confirmation.tsx](honestneed-frontend/components/donation/DonationStep3Confirmation.tsx) | 1-150+ | Confirmation page with review of donation details, fee breakdown, submit button |
| [honestneed-frontend/components/donation/DonationSuccessModal.tsx](honestneed-frontend/components/donation/DonationSuccessModal.tsx) | 1-120+ | Success message after donation submission with transaction ID, receipt, share options |
| [honestneed-frontend/components/donation/DonationStatusBadge.tsx](honestneed-frontend/components/donation/DonationStatusBadge.tsx) | 1-100+ | Status indicator badge: 'pending', 'verified', 'rejected', 'refunded' |
| [honestneed-frontend/components/donation/DonationDetailModal.tsx](honestneed-frontend/components/donation/DonationDetailModal.tsx) | 1-150+ | Modal showing full donation details: amount breakdown, payment method, timestamp, status, any rejection reason |
| [honestneed-frontend/components/donation/ShareButton.tsx](honestneed-frontend/components/donation/ShareButton.tsx) | 1-100+ | Share button for campaigns (Facebook, Twitter, LinkedIn, Email, WhatsApp) |
| [honestneed-frontend/components/donation/ShareModal.tsx](honestneed-frontend/components/donation/ShareModal.tsx) | 1-150+ | Modal for sharing campaign: copy link, email, social media |
| [honestneed-frontend/components/donation/ShareList.tsx](honestneed-frontend/components/donation/ShareList.tsx) | 1-150+ | List of shares on campaign with timestamps and channels |

### 2.4 Real-time Update Components

| File Path | Lines | Description |
|-----------|-------|-------------|
| [honestneed-frontend/components/campaign/CampaignUpdates.tsx](honestneed-frontend/components/campaign/CampaignUpdates.tsx) | 1-200+ | Timeline of campaign updates/announcements posted by creator. Uses useCampaignUpdates hook for queries |

---

## 3. BACKEND CAMPAIGN ROUTES (Express.js)

### 3.1 Campaign CRUD Routes

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/routes/campaignRoutes.js](src/routes/campaignRoutes.js) | 1-300+ | **Main campaign routes**. Route order matters (specific before /:id). POST /campaigns (L50-60): Create campaign with FormData (multipart). GET / (L62-75): List campaigns with pagination. GET /need-types (L77-90): GET all campaign need types taxonomy. GET /trending (L92-105): Trending campaigns. POST /:campaignId/donations (L150+): Create donation. GET /:id (L200+): Get campaign detail. PUT /:id (L250+): Update campaign (draft only). DELETE /:id (L300+): Soft delete campaign |

### 3.2 Campaign Update Routes

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/routes/campaignUpdateRoutes.js](src/routes/campaignUpdateRoutes.js) | 1-150+ | Campaign updates/announcements: POST /campaigns/:id/updates (create), GET /campaigns/:id/updates (list), DELETE /campaigns/:id/updates/:updateId (delete) |

### 3.3 Donation Routes

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/routes/donationRoutes.js](src/routes/donationRoutes.js) | 1-350+ | **Complete donation endpoints**. GET /donations/stats (L20-30): Platform stats. GET /donations/monthly-breakdown (L32-45): Time series. GET /donations/analytics/dashboard (L47-60): Dashboard analytics. GET /donations/export (L62-75): Admin export. GET /donations/history (L77-90): User history. GET /donations (L92-110): List paginated. GET /donations/:id (L112-125): Detail. POST /donations/:id/refund (L150+): Refund endpoint. GET /donations/campaign/:campaignId (L200+): Campaign donations. GET /donations/:id/receipt (L250+): Receipt generation |

### 3.4 Analytics Routes

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/routes/analyticsRoutes.js](src/routes/analyticsRoutes.js) | 1-200+ | GET /analytics/dashboard (campaign metrics), GET /analytics/donations (donation trends), GET /analytics/campaigns/:id (campaign-specific), GET /analytics/qr-codes (QR scan analytics) |

### 3.5 Payment & Transaction Routes

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/routes/transactionRoutes.js](src/routes/transactionRoutes.js) | 1-150+ | GET /transactions (list), GET /transactions/:id (detail), PUT /transactions/:id (admin approval), POST /transactions/export (export) |
| [src/routes/paymentMethodRoutes.js](src/routes/paymentMethodRoutes.js) | 1-200+ | POST /payment-methods (create), GET /payment-methods (list), DELETE /payment-methods/:id (delete), PUT /payment-methods/:id/default (set default) |

### 3.6 Webhook Routes

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/routes/webhookRoutes.js](src/routes/webhookRoutes.js) | 1-200+ | POST /webhooks/stripe (L35): Stripe webhook handler for payment events (charge.dispute.created L81). POST /webhooks/test (L137): Test webhook endpoint. Handles: charge.succeeded, charge.failed, charge.dispute.created, charge.refunded |

### 3.7 Share & Referral Routes

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/routes/shareRoutes.js](src/routes/shareRoutes.js) | 1-250+ | POST /shares/record (record share), GET /shares/stats (share statistics), GET /shares/referral-link (generate), GET /shares/qr-click (track QR click) |
| [src/routes/shareReferralRoutes.js](src/routes/shareReferralRoutes.js) | 1-200+ | GET /referrals/history (history), POST /referrals/track (track click), GET /referrals/:code (validate referral code) |
| [src/routes/sharev2Routes.js](src/routes/sharev2Routes.js) | 1-200+ | V2 sharing endpoints with improved tracking |

---

## 4. BACKEND SERVICES & MODELS

### 4.1 Campaign Model

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/models/Campaign.js](src/models/Campaign.js) | 1-500+ | **Complete campaign schema**. Fields: campaign_id (unique), creator_id (ref User), title (5-200 chars), description (2000 max), need_type (enum 68+ values), goals[] (fundraising/sharing/resource targets), payment_methods (JSON encrypted), tags (max 10), category, image_url, status (draft/active/paused/completed/rejected), raised_amount_cents, share_count, created_at, updated_at, trending flag, geographic_scope, location. Indexes on campaign_id, creator_id, need_type, status. Validation rules in Schema |

### 4.2 Transaction/Donation Model

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/models/Transaction.js](src/models/Transaction.js) | 1-400+ | **Transaction schema** storing donations and rewards. Fields: transaction_id (unique), campaign_id, supporter_id, creator_id, transaction_type (enum: donation, share_reward, referral_reward), amount_cents, platform_fee_cents (20%), net_amount_cents, payment_method, status (pending/verified/failed/refunded/approved/rejected), verified_by, verified_at, hold_until_date (for share rewards - 30 day hold), hold_reason, proof_url. Indexes on transaction_id, campaign_id, supporter_id, status, hold_until_date |
| [src/models/FeeTransaction.js](src/models/FeeTransaction.js) | 1-200+ | Fee tracking model for revenue analytics |

### 4.3 Sharing & Share Models

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/models/Share.js](src/models/Share.js) | 1-250+ | Share tracking: campaign_id, sharer_id, channel, share_date, click_count, conversion_count, referral_link |
| [src/models/ShareTracking.js](src/models/ShareTracking.js) | 1-200+ | Detailed share tracking: qr_code_id, campaign_id, scan_date, device_type, location, referral_code |
| [src/models/ShareWithdrawal.js](src/models/ShareWithdrawal.js) | 1-150+ | Share earnings withdrawal requests |
| [src/models/ReferralLink.js](src/models/ReferralLink.js) | 1-180+ | Referral link generation and tracking |
| [src/models/ReferralTracking.js](src/models/ReferralTracking.js) | 1-150+ | Track referral clicks and conversions |

### 4.4 QR Code Model

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/models/QRCode.js](src/models/QRCode.js) | 1-200+ | QR code generation tracking: campaign_id, qr_code_data, scans, click_through_rate |

### 4.5 Campaign Analytics Model

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/models/CampaignProgress.js](src/models/CampaignProgress.js) | 1-180+ | Hourly/daily snapshots of campaign metrics for analytics |
| [src/models/CampaignUpdate.js](src/models/CampaignUpdate.js) | 1-150+ | Campaign updates/announcements posted by creators |

### 4.6 Payment & Payout Models

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/models/PaymentMethod.js](src/models/PaymentMethod.js) | 1-250+ | User payment methods storage: type (venmo/paypal/cashapp/bank/crypto), encrypted_details, is_default, created_at. Supports multiple payment methods per user |
| [src/models/SettlementLedger.js](src/models/SettlementLedger.js) | 1-200+ | Settlement/payout ledger for creators: creator_id, campaign_id, amount_cents, status, settlement_date |

### 4.7 Campaign Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/CampaignService.js](src/services/CampaignService.js) | 1-600+ | **Core campaign business logic**. Methods: `create()` (with encryption of payment methods, generate campaign_id), `list()` (pagination), `getById()`, `update()` (draft only), `delete()` (soft), `activate()` (draft→active), `pause()` (active→paused), `complete()`, `getCampaignAnalytics()`. Handles currency conversion (cents ↔ dollars). Event emitter for campaign lifecycle events (L50-80). Payment method encryption with AES-256-GCM (L150-200) |

### 4.8 Campaign Analytics Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/CampaignAnalyticsService.js](src/services/CampaignAnalyticsService.js) | 1-400+ | Analytics calculations: `getDonationTrends()`, `getTopDonors()`, `getShareMetrics()`, `getGrowthRate()`, `getDemoGraphics()`, `getTopCampaigns()`. Aggregates Transaction, Share, and ShareTracking data. Real-time metrics computation |

### 4.9 Campaign Progress Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/CampaignProgressService.js](src/services/CampaignProgressService.js) | 1-300+ | Computes campaign progress snapshots hourly/daily. Methods: `calculateProgress()`, `recordSnapshot()`, `getProgressHistory()`, `predictCompletionDate()` |
| [src/services/CampaignProgressScheduler.js](src/services/CampaignProgressScheduler.js) | 1-200+ | Scheduler job that runs every hour to capture campaign metrics snapshots for historical analytics |

### 4.10 Donation Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/DonationService.js](src/services/DonationService.js) | 1-500+ | **Donation business logic**. Methods: `createDonation()` (validates, creates transaction record, calculates fee), `verifyDonation()` (admin approval), `rejectDonation()`, `refundDonation()`, `getDonationAnalytics()` (aggregates by type/method/date), `getDonationHistory()`, `exportDonations()`, `generateReceipt()`. Fee calculation: 20% platform fee (L150-160). Share reward conversion integration (L300-350) |

### 4.11 Transaction Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/TransactionService.js](src/services/TransactionService.js) | 1-400+ | General transaction operations: `list()`, `getById()`, `updateStatus()`, `export()`, `analytics()`. Handles transaction_id generation (TRANS-YYYY-MM-DD-XXXXX format). Integrates with payment processing |

### 4.12 Stripe Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/StripeService.js](src/services/StripeService.js) | 1-500+ | **Stripe integration**. Methods: `getOrCreateStripeCustomer()` (L50-100), `attachPaymentMethod()`, `detachPaymentMethod()`, `createPaymentIntent()` (L200-230), `confirmPayment()`, `refundPayment()` (L280-310), `listPaymentMethods()`. Handles PCI compliance (no raw card data). Metadata tracking for user/campaign context (L70) |

### 4.13 Payment & Fee Services

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/paymentService.js](src/services/paymentService.js) | 1-400+ | High-level payment orchestration: `processPayment()`, `handlePaymentWebhook()`, `reconcilePayments()` |
| [src/services/PaymentProcessingService.js](src/services/PaymentProcessingService.js) | 1-350+ | Low-level payment processing for different payment methods |
| [src/services/FeeTrackingService.js](src/services/FeeTrackingService.js) | 1-250+ | Platform fee tracking and reporting for revenue analytics |

### 4.14 Share Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/ShareService.js](src/services/ShareService.js) | 1-400+ | Share campaign operations: `recordShare()`, `trackClick()`, `generateReferralLink()`, `calculateReward()`, `createShareReward()` (creates transaction with 30-day hold) |
| [src/services/ShareRewardService.js](src/services/ShareRewardService.js) | 1-300+ | Manages share reward distribution and holds |
| [src/services/ShareConfigService.js](src/services/ShareConfigService.js) | 1-250+ | Sharing campaign configuration: budget management, per-share amounts, active/inactive state |

### 4.15 Sweepstakes Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/SweepstakesService.js](src/services/SweepstakesService.js) | 1-500+ | Sweepstakes entry recording and drawing logic |
| [src/services/DrawingService.js](src/services/DrawingService.js) | 1-300+ | Scheduled drawings for sweepstakes winner selection |
| [src/services/PrizeClaimService.js](src/services/PrizeClaimService.js) | 1-250+ | Prize claim processing and compliance |

### 4.16 User/Creator Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/userService.js](src/services/userService.js) | 1-350+ | User profile management, preferences, payment methods |

### 4.17 Analytics Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/analyticsService.js](src/services/analyticsService.js) | 1-300+ | Platform-wide analytics: `getDashboardMetrics()`, `getTrends()`, `getRetentionMetrics()` |

### 4.18 Email Service

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/emailService.js](src/services/emailService.js) | 1-400+ | Email notifications: campaign verification, donation receipts, share rewards, sweepstakes notifications. Uses SendGrid or equivalent |
| [src/utils/emailService.js](src/utils/emailService.js) | 1-250+ | Alternative/legacy email service implementation |

### 4.19 Admin Services

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/services/AdminService.js](src/services/AdminService.js) | 1-350+ | Admin operations: campaign approval, transaction verification, user management, dispute resolution |
| [src/services/AdminDashboardService.js](src/services/AdminDashboardService.js) | 1-300+ | Admin dashboard metrics and reporting |

---

## 5. BACKEND CONTROLLERS (HTTP Handlers)

### 5.1 Campaign Controller

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/controllers/campaignController.js](src/controllers/campaignController.js) | 1-600+ | **HTTP handlers for campaigns**. Methods: `create()` (L50-150: POST validation, user extraction, multipart parsing, calls CampaignService.create()), `list()` (L152-200: pagination, filtering), `getNeedTypes()` (L202-220), `getTrending()` (L222-240), `getById()` (L242-260), `update()` (L262-300), `delete()` (L302-320). Detailed logging with winstonLogger for debugging |

### 5.2 Campaign Update Controller

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/controllers/campaignUpdateController.js](src/controllers/campaignUpdateController.js) | 1-200+ | HTTP handlers for campaign updates |

### 5.3 Donation Controller

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/controllers/DonationController.js](src/controllers/DonationController.js) | 1-500+ | **HTTP handlers for donations**. Methods: `create()` (POST, validates amount/method), `getDonationStats()` (GET /stats), `getMonthlyBreakdown()` (GET /monthly-breakdown), `getDonationAnalytics()` (GET /analytics/dashboard), `exportDonations()` (GET /export, admin-only), `getDonationHistory()` (GET /history), `list()` (GET /), `getById()` (GET /:id), `refund()` (POST /:id/refund), `getReceipt()` |

### 5.4 Transaction Controller

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/controllers/TransactionController.js](src/controllers/TransactionController.js) | 1-300+ | HTTP handlers for transaction queries and admin operations |

### 5.5 Analytics Controller

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/controllers/analyticsController.js](src/controllers/analyticsController.js) | 1-400+ | HTTP handlers for analytics: `getDashboard()`, `getDonationTrends()`, `getCampaignMetrics()`, `getQRAnalytics()`, `getShareMetrics()` |

### 5.6 Payment Method Controller

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/controllers/PaymentMethodController.js](src/controllers/PaymentMethodController.js) | 1-250+ | HTTP handlers: `create()`, `list()`, `delete()`, `setDefault()` |

### 5.7 Share Controller

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/controllers/ShareController.js](src/controllers/ShareController.js) | 1-350+ | HTTP handlers: `recordShare()`, `trackQRClick()`, `generateReferralLink()` |

### 5.8 Admin Controllers

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/controllers/AdminController.js](src/controllers/AdminController.js) | 1-300+ | Admin dashboard endpoints |
| [src/controllers/AdminFeeController.js](src/controllers/AdminFeeController.js) | 1-200+ | Fee management endpoints |
| [src/controllers/AdminDashboardController.js](src/controllers/AdminDashboardController.js) | 1-250+ | Dashboard metrics endpoints |
| [src/controllers/AdminUserController.js](src/controllers/AdminUserController.js) | 1-200+ | User management endpoints |

---

## 6. BACKEND VALIDATORS & MIDDLEWARE

### 6.1 Campaign Validators

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/validators/campaignValidators.js](src/validators/campaignValidators.js) | 1-400+ | **Campaign validation schemas**. Functions: `validateCampaignCreation()` (required fields, length constraints, need_type enum), `validateCampaignUpdate()` (draft-only, immutable fields check), `validateCampaignType()` (discriminated union: fundraising requires goal_amount, category, tags, duration; sharing requires platforms, budget, reward_per_share) (L200-300). Each validator returns {valid, errors}. Uses regex for URL/email validation |
| [src/validators/campaignUpdateValidators.js](src/validators/campaignUpdateValidators.js) | 1-200+ | Update-specific validators |

### 6.2 Donation Validators

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/validators/donationValidators.js](src/validators/donationValidators.js) | 1-250+ | Donation validation: `validateCreateDonation()` (amount: $1-10000 in cents, payment_method enum), `validateListDonationsQuery()` (pagination parameters). Handles referral code validation for share conversions |

### 6.3 Payment Validators

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/validators/paymentValidators.js](src/validators/paymentValidators.js) | 1-200+ | Payment validation schemas |
| [src/validators/paymentMethodValidators.js](src/validators/paymentMethodValidators.js) | 1-250+ | Payment method validators: Venmo handle format, PayPal email, bank routing/account numbers |

### 6.4 Analytics Validators

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/validators/analyticsValidators.js](src/validators/analyticsValidators.js) | 1-150+ | Query parameter validation for analytics endpoints |

### 6.5 Sharing Validators

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/validators/sharingValidators.js](src/validators/sharingValidators.js) | 1-300+ | Share tracking/reward validators |

### 6.6 Authentication Middleware

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/middleware/authMiddleware.js](src/middleware/authMiddleware.js) | 1-150+ | JWT verification and extraction. Functions: `authMiddleware()` (verify token, extract user_id), `authorize(roles)` (role-based access). Sets `req.user = {id, email, role}` (L50-80) |

### 6.7 Upload Middleware

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/middleware/uploadMiddleware.js](src/middleware/uploadMiddleware.js) | 1-200+ | Image file upload handling: multer configuration (10MB limit, jpg/png/gif/webp/webm). Validates MIME types, file size. Sets uploaded file path in req.file (L50-100) |

### 6.8 Validation Middleware

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/middleware/validation.js](src/middleware/validation.js) | 1-180+ | Request body/query validation middleware using validators |

### 6.9 Error Handler Middleware

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/middleware/errorHandler.js](src/middleware/errorHandler.js) | 1-250+ | Global error handling: catches exceptions, formats error responses, logs with winstonLogger |

### 6.10 RBAC Middleware

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/middleware/rbac.js](src/middleware/rbac.js) | 1-150+ | Role-based access control: admin, creator, supporter role checks |

### 6.11 Logging Middleware

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/middleware/requestLogger.js](src/middleware/requestLogger.js) | 1-120+ | Request logging: method, path, status, duration |

---

## 7. BACKEND UTILITIES & HELPERS

### 7.1 Campaign Utilities

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/utils/campaignValidators.js](src/utils/campaignValidators.js) | 1-300+ | Campaign helper functions: `canEdit()` (draft-only), `canActivate()`, `canPause()`, `calculateProgress()`, `categoryOptions()` |
| [src/utils/validation.js](src/utils/validation.js) | 1-200+ | General validation helpers |

### 7.2 Logging & Metrics

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/utils/winstonLogger.js](src/utils/winstonLogger.js) | 1-250+ | Winston logging configuration: console transport (dev), file transport (prod), error level filtering. Used throughout codebase for structured logging |
| [src/utils/logger.js](src/utils/logger.js) | 1-150+ | Alternative/legacy logger |
| [src/utils/metricsCollector.js](src/utils/metricsCollector.js) | 1-200+ | Performance metrics: response times, error rates |
| [src/utils/errorTracker.js](src/utils/errorTracker.js) | 1-180+ | Error tracking and reporting |

### 7.3 Authentication Utils

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/utils/jwt.js](src/utils/jwt.js) | 1-150+ | JWT token generation/verification: `generateToken(userId)`, `verifyToken(token)`. Secret from env, 7-day expiry |
| [src/utils/passwordUtils.js](src/utils/passwordUtils.js) | 1-120+ | Password hashing/comparison using bcrypt |

### 7.4 Email Utilities

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/utils/emailService.js](src/utils/emailService.js) | 1-250+ | Email template rendering and sending |

### 7.5 Analytics Cache

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/utils/analyticsCache.js](src/utils/analyticsCache.js) | 1-200+ | In-memory cache for analytics queries (5-min TTL to reduce DB load) |

---

## 8. BACKEND EVENT HANDLERS

| File Path | Lines | Description |
|-----------|-------|-------------|
| [src/events/campaignEventHandlers.js](src/events/campaignEventHandlers.js) | 1-300+ | Campaign lifecycle event handlers: on creation, activation, completion. Triggers email notifications, analytics updates, payout calculations |

---

## 9. PAYMENT INTEGRATION DETAILS

### 9.1 Stripe Integration

**Service**: [src/services/StripeService.js](src/services/StripeService.js) (1-500+)
- **Environment Vars**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`
- **Key Methods**: 
  - `getOrCreateStripeCustomer()` - Maps user to Stripe customer (L50-100)
  - `createPaymentIntent()` - Initiates charge (L200-230)
  - `handleWebhookEvent()` - Processes Stripe webhooks (L300-350)
- **Webhook Endpoint**: [POST /webhooks/stripe](src/routes/webhookRoutes.js#L35)
- **Webhook Events Handled**:
  - `charge.succeeded` - Payment completed
  - `charge.failed` - Payment failed
  - `charge.dispute.created` - Chargeback initiated (L81-90)
  - `charge.refunded` - Refund processed

### 9.2 PayPal Integration

**Support Level**: Mentioned in PaymentMethod model and validation but requires backend implementation
- **Payment Method Type**: 'paypal' enum in [src/models/PaymentMethod.js](src/models/PaymentMethod.js)
- **Validator**: Email format validation in [src/validators/paymentMethodValidators.js](src/validators/paymentMethodValidators.js)
- **Status**: Infrastructure ready, webhook handler can be added

### 9.3 Alternative Payment Methods

Supported in frontend/backend but as "manual verification":
- **Venmo**: Stored email/handle, manual screenshot verification via Donation proof_url
- **CashApp**: Stored $-tag, manual verification
- **Bank Transfer**: Routing + account number encrypted
- **Cryptocurrency**: Wallet address stored
- **Check/Money Order**: Manual processing

### 9.4 Payment Method Storage

**Model**: [src/models/PaymentMethod.js](src/models/PaymentMethod.js) (1-250+)
- `type`: Enum (venmo, paypal, cashapp, bank, crypto, stripe, etc)
- `encrypted_details`: Non-Stripe methods store sensitive data encrypted with AES-256-GCM
- `is_default`: Boolean for user's preferred method
- **Encryption Logic**: [src/services/CampaignService.js](src/services/CampaignService.js#L150-200)

### 9.5 Fee Calculation & Processing

**Logic Location**: [src/services/DonationService.js](src/services/DonationService.js#L150-200)
- **Platform Fee**: 20% of gross donation amount
- **Calculation in Cents**: `platformFee = Math.round(gross * 0.20)`
- **Net to Creator**: `net = gross - platformFee`
- **Example**: $100 donation = 10000 cents → fee 2000 cents → net 8000 cents ($80)
- **Hold Period**: Share rewards held for 30 days before settlement (Transaction.hold_until_date)

### 9.6 Settlement & Payout

**Model**: [src/models/SettlementLedger.js](src/models/SettlementLedger.js) (1-200+)
- Tracks creator payouts: amount_cents, status, settlement_date
- Requires admin approval for disbursement
- Multiple settlement methods (Stripe, bank transfer, etc)

---

## 10. DONATION FLOW (End-to-End)

### 10.1 Frontend Flow

```
User selects campaign
  ↓
Clicks "Donate" button (on campaign detail page)
  ↓
DonationWizard Modal opens: [honestneed-frontend/components/donation/DonationWizard.tsx](honestneed-frontend/components/donation/DonationWizard.tsx)
  ↓
Step 1: Amount (DonationStep1Amount.tsx) 
  - User enters amount in dollars
  - Frontend converts to cents: amount * 100
  - Fee calculated in real-time (20%)
  ↓
Step 2: Payment Method (DonationStep2PaymentMethod.tsx)
  - Select from saved methods or add new
  - For manual methods: provides payment details (Venmo tag, etc)
  - For Stripe: customer already has payment method attached
  ↓
Step 3: Confirmation (DonationStep3Confirmation.tsx)
  - Displays breakdown: gross, fee, net
  - User confirms and "Pay" button clicked
  ↓
API Call via useDonations() hook
  - Mutation: campaignService.createDonation()
  - POST /campaigns/{campaignId}/donations
  - Payload: { amount (in cents), paymentMethod, referralCode (optional) }
  ↓
Success Modal (DonationSuccessModal.tsx)
  - Transaction ID displayed
  - Receipt generated
  - Share options offered
  ↓
Donation recorded in supporter's history page
```

### 10.2 Backend Flow

```
POST /campaigns/{campaignId}/donations request received
  ↓
[src/controllers/DonationController.js](src/controllers/DonationController.js) - create() handler
  - Validates amount, campaignId, payment method
  - Calls DonationService.createDonation()
  ↓
[src/services/DonationService.js](src/services/DonationService.js)
  - Creates Transaction record (status: 'pending')
  - Calculates: platform_fee_cents = amount_cents * 0.20
  - Sets net_amount_cents = amount_cents - platform_fee_cents
  - For manual methods (non-Stripe): status stays pending, awaits admin verification
  - For Stripe: attempts charge via StripeService
  ↓
If Stripe charge:
  - [src/services/StripeService.js](src/services/StripeService.js).createPaymentIntent()
  - Creates charge on Stripe
  - On success: transaction status → 'verified', verified_at timestamp set
  - On failure: transaction status → 'failed', rejection_reason populated
  - Webhook callback: POST /webhooks/stripe handles async confirmations
  ↓
Transaction persisted to MongoDB
  - [src/models/Transaction.js](src/models/Transaction.js)
  - If share_reward migration: hold_until_date = now + 30 days, hold_reason = 'share_reward_hold'
  ↓
Email notification
  - [src/services/emailService.js](src/services/emailService.js)
  - Receipt sent to donor
  - Notification sent to creator
  ↓
Analytics updated
  - CampaignProgressService records donation event
  - Campaign.total_donation_amount updated
  - Campaign.total_donations incremented
  ↓
Response to frontend
  - HTTP 201 Created
  - Returns: Donation object with transaction_id, status
  - Frontend displays success modal
```

---

## 11. CAMPAIGN CREATION FLOW (End-to-End)

### 11.1 Frontend Wizard Flow

```
User on creator dashboard clicks "New Campaign"
  ↓
Page: [honestneed-frontend/app/(campaigns)/campaigns/new/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/new/page.tsx)
  ↓
CampaignWizard component rendered: [honestneed-frontend/components/campaign/wizard/CampaignWizard.tsx](honestneed-frontend/components/campaign/wizard/CampaignWizard.tsx)
  - State managed by wizardStore (Zustand)
  ↓
STEP 1: Type Selection (WizardSteps.tsx - Step1TypeSelection)
  - Choose: "Fundraising Campaign" or "Sharing Campaign"
  - Sets campaignType in formData
  ↓
STEP 2: Basic Information (WizardSteps.tsx - Step2BasicInfo, uses CampaignBasicForm)
  - Title (5-200 chars, validated via validationSchemas.ts Zod schema)
  - Description (max 2000 chars)
  - Image upload (optionally, max 10MB, via AddPaymentMethodForm or separate component)
  - On input: real-time validation via Zod schema
  ↓
STEP 3: Type-Specific Details (WizardSteps.tsx - Step3Details)
  
  If Fundraising:
    - Need Type (dropdown from campaignService.getNeedTypes())
    - Goal Amount (in dollars, stored as cents)
    - Category (predefined list)
    - Tags (max 10 chips)
    - Campaign Duration (7-90 days)
  
  If Sharing:
    - Platforms (checkboxes: Facebook, Twitter, LinkedIn, Instagram, TikTok, YouTube, Pinterest, Snapchat - max 8)
    - Budget (in dollars, for per-share rewards)
    - Reward per Share (amount in dollars)
    - Sweepstakes entry enabled (yes/no)
  ↓
STEP 4: Review & Publish (WizardSteps.tsx - Step4Review)
  - Summary of all fields
  - User confirms or goes back
  - "Create Campaign" button clicked
  ↓
Form Validation
  - Entire formData validated against discriminated union schema (validationSchemas.ts, lines 150-250+)
  - On validation failure: errors displayed, user directed to offending step
  ↓
API Call - campaignService.createCampaign()
  - FormData object created
  - String fields appended (title, description, etc)
  - Arrays stringified: tags → "tag1,tag2,tag3" (CSV), platforms → "facebook,twitter" (CSV)
  - Objects stringified: targetAudience → JSON string
  - Image file appended if present
  - Content-Type: multipart/form-data (auto-set by FormData)
  ↓
POST /campaigns request
  - Backend multipart parser (multer) receives
  - Auth header validated via authMiddleware
  - File uploaded to /uploads directory (if present)
  ↓
Success Response
  - HTTP 201 Created
  - Returns campaign object with:
    - campaign_id (auto-generated: CAMP-2026-NNN-XXXXXX)
    - status: 'draft'
    - created_at timestamp
    - image_url (if uploaded)
  ↓
Frontend Redirect
  - User redirected to campaign detail page
  - wizardStore reset for next use
  - Toast success notification
```

### 11.2 Backend Campaign Creation Flow

```
POST /campaigns endpoint handler: [src/controllers/campaignController.js](src/controllers/campaignController.js#L50-150)
  ↓
Extract user from JWT (authMiddleware)
  ↓
Extract multipart form data
  - title, description: from req.body
  - image: from req.file (via multer uploadMiddleware)
  - tags: CSV string → parsed to array in validation
  - platforms: CSV string → parsed to array in validation
  ↓
Validation: [src/validators/campaignValidators.js](src/validators/campaignValidators.js)
  - validateCampaignCreation(): checks all required fields
  - For fundraising: verify goal_amount in range, category enum, tags ≤10, duration 7-90 days
  - For sharing: verify platforms ≤8, budget in range, reward_per_share in range
  - On validation fail: HTTP 400 with error details
  ↓
CampaignService.create(): [src/services/CampaignService.js](src/services/CampaignService.js)
  
  Step 1: Generate Campaign ID (L40-60)
    - Format: CAMP-{year}-{sequence}-{suffix}
    - Example: CAMP-2026-042-ABC123
  
  Step 2: Process Payment Methods (L150-250)
    - Encrypt sensitive payment details with AES-256-GCM
    - For Stripe-only: skip encryption (no sensitive data needed)
    - Encryption key from env variable (32 bytes)
  
  Step 3: Build Campaign Document
    - campaign_id, creator_id, title, description
    - need_type enum validation
    - goals array: type (fundraising/sharing), target_amount (store in cents)
    - payment_methods: encrypted if needed
    - tags array, category, image_url
    - status: 'draft' (default)
    - timestamps: created_at
  
  Step 4: Save to MongoDB
    - Create Campaign document via mongoose
    - Indexes auto-created on campaign_id, creator_id
    - Transaction/atomic operation
  
  Step 5: Emit Events
    - campaignEventEmitter.emit('campaign:created')
    - Triggers any registered listeners (analytics, notifications)
  
  Step 6: Return Campaign Object
    - HTTP 201 Created
    - Response includes all fields including generated campaign_id
  ↓
Image Processing (if uploaded)
  - File stored in /uploads/campaigns/{campaign_id}/ directory
  - image_url saved to campaign document
  - Cleanup of old images handled by CampaignService
  ↓
Response sent to frontend
  - Includes: campaign_id, creator_id, title, status, created_at
  - Frontend redirects to campaign detail page
```

---

## 12. ANALYTICS FLOW

### 12.1 Campaign Analytics Data Collection

| Metric | Data Source | Update Frequency | Storage |
|--------|-------------|------------------|---------|
| Total Donations | Transaction model (sum amount_cents grouped by campaign) | Real-time on donation | Transaction table |
| Unique Donors | Transaction model (count distinct supporter_id per campaign) | Real-time on donation | Transaction table |
| Donation Trend | CampaignProgress snapshots | Hourly by scheduler | CampaignProgress table |
| Share Count | Share model (sum), ShareTracking clicks | Real-time on share | Share table |
| QR Scans | ShareTracking model (count scans) | Real-time on scan | ShareTracking table |
| Geographic Data | ShareTracking.location (from IP/browser) | Real-time on scan | ShareTracking table |
| Device Types | ShareTracking.device_type | Real-time on scan | ShareTracking table |

### 12.2 Analytics Endpoints

| Endpoint | Handler | Purpose | Cache |
|----------|---------|---------|-------|
| GET /campaigns/:id/analytics | [campaignController.js](src/controllers/campaignController.js) | Current campaign metrics | 5-min Redis |
| GET /analytics/dashboard | [analyticsController.js](src/controllers/analyticsController.js#L50-100) | Creator dashboard summary | 10-min Redis |
| GET /analytics/donations | [analyticsController.js](src/controllers/analyticsController.js#L150-200) | Donation trend chart data | 15-min Redis |
| GET /analytics/campaigns/:id | [analyticsController.js](src/controllers/analyticsController.js#L250-300) | Campaign-specific breakdown | 5-min Redis |
| GET /analytics/qr-codes | [analyticsController.js](src/controllers/analyticsController.js#L350-400) | QR scan analytics | 5-min Redis |

### 12.3 Frontend Analytics Components

| Component | Data Source | Visualization | Update |
|-----------|-------------|----------------|--------|
| CampaignMetricsCards | useCampaignAnalytics hook | Summary cards (total donors, raised, shares) | Every 5 pages load |
| QRAnalyticsDashboard | useQRAnalytics hook | Line charts (scans over time), maps (geo distribution) | Refetch every 5 minutes |
| CustomChart (internal) | hardcoded/generated via Chart.js | Donation trend line chart | On page mount |

---

## 13. FRONTEND APP PAGES STRUCTURE

| Page Path | File | Purpose | Data Sources |
|-----------|------|---------|--------------|
| `/` | [honestneed-frontend/app/page.tsx](honestneed-frontend/app/page.tsx) | Landing page | CampaignService.getTrendingCampaigns() |
| `/login` | [honestneed-frontend/app/(auth)/login/page.tsx](honestneed-frontend/app/(auth)/login/page.tsx) | Login form | authService.login() |
| `/register` | [honestneed-frontend/app/(auth)/register/page.tsx](honestneed-frontend/app/(auth)/register/page.tsx) | Registration form | authService.register() |
| `/forgot-password` | [honestneed-frontend/app/(auth)/forgot-password/page.tsx](honestneed-frontend/app/(auth)/forgot-password/page.tsx) | Password reset request | authService.forgotPassword() |
| `/reset-password/[token]` | [honestneed-frontend/app/(auth)/reset-password/[token]/page.tsx](honestneed-frontend/app/(auth)/reset-password/[token]/page.tsx) | Password reset form | authService.resetPassword() |
| `/campaigns` | [honestneed-frontend/app/(campaigns)/campaigns/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/page.tsx) | Browse campaigns | useCampaigns() with filters |
| `/campaigns/new` | [honestneed-frontend/app/(campaigns)/campaigns/new/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/new/page.tsx) | Create campaign wizard | campaignService.createCampaign() |
| `/campaigns/:id` | [honestneed-frontend/app/(campaigns)/campaigns/[id]/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/[id]/page.tsx) | Campaign detail | useCampaign(), useCampaignAnalytics() |
| `/campaigns/:id/donate` | [honestneed-frontend/app/(campaigns)/campaigns/[id]/donate/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/[id]/donate/page.tsx) | Donation wizard | donationService.createDonation() |
| `/campaigns/:id/analytics` | [honestneed-frontend/app/(campaigns)/campaigns/[id]/analytics/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/[id]/analytics/page.tsx) | Analytics dashboard (creator-only) | useCampaignAnalytics(), useQRAnalytics() |
| `/creator/dashboard` | [honestneed-frontend/app/(creator)/dashboard/page.tsx](honestneed-frontend/app/(creator)/dashboard/page.tsx) | Creator dashboard | useCampaigns() (filtered by creator), getDashboardMetrics() |
| `/creator/campaigns/:id/edit` | [honestneed-frontend/app/(creator)/campaigns/[id]/edit/page.tsx](honestneed-frontend/app/(creator)/campaigns/[id]/edit/page.tsx) | Edit campaign (draft-only) | campaignService.updateCampaign() |
| `/creator/settings` | [honestneed-frontend/app/(creator)/settings/page.tsx](honestneed-frontend/app/(creator)/settings/page.tsx) | Creator settings | paymentMethodService.getPaymentMethods() |
| `/supporter/donations` | [honestneed-frontend/app/(supporter)/donations/page.tsx](honestneed-frontend/app/(supporter)/donations/page.tsx) | Donation history | useDonations() |
| `/supporter/shares` | [honestneed-frontend/app/(supporter)/shares/page.tsx](honestneed-frontend/app/(supporter)/shares/page.tsx) | Share earnings | useShares() |
| `/supporter/sweepstakes` | [honestneed-frontend/app/(supporter)/sweepstakes/page.tsx](honestneed-frontend/app/(supporter)/sweepstakes/page.tsx) | Sweepstakes entries | useSweepstakes() |
| `/admin/dashboard` | [honestneed-frontend/app/admin/dashboard/page.tsx](honestneed-frontend/app/admin/dashboard/page.tsx) | Admin overview | adminService.getDashboard() |
| `/admin/campaigns` | [honestneed-frontend/app/admin/campaigns/page.tsx](honestneed-frontend/app/admin/campaigns/page.tsx) | Manage campaigns | campaignService.list() (all campaigns) |
| `/admin/transactions` | [honestneed-frontend/app/admin/transactions/page.tsx](honestneed-frontend/app/admin/transactions/page.tsx) | Transaction verification | transactionService.list() |
| `/admin/users` | [honestneed-frontend/app/admin/users/page.tsx](honestneed-frontend/app/admin/users/page.tsx) | User management | adminUserService.list() |
| `/admin/settings` | [honestneed-frontend/app/admin/settings/page.tsx](honestneed-frontend/app/admin/settings/page.tsx) | Platform settings | adminService.getSettings() |

---

## 14. KEY ASSUMPTIONS & CONTRACTS

### 14.1 Backend Contracts (API Assumptions)

**Campaign Creation Contract** (Frontend assumes)
- POST /campaigns with multipart/form-data
- Returns: { _id, campaign_id, status: 'draft', created_at, ... }
- `amount` fields in responses are in cents (multiply by 100 from dollars)

**Donation Contract** (Frontend assumes)
- POST /campaigns/:id/donations with JSON body
- Amount in body should be in cents
- Returns: { transactionId, status: 'pending'|'verified', ... }
- 20% platform fee calculated by backend

**Authentication** (Frontend assumes)
- POST /auth/login returns { token, user }
- Token stored in localStorage with key 'auth_token'
- All requests include Authorization: Bearer {token}
- 7-day token expiry

### 14.2 Frontend Assumptions (Backend expects)

**Image Upload**
- FormData multipart with field name 'image'
- Single file, 10MB max
- MIME types: image/jpeg, image/png, image/gif, image/webp

**Campaign Creation Data**
- Tags sent as CSV string: "tag1,tag2,tag3"
- Platforms sent as CSV string: "facebook,twitter"
- Target audience sent as JSON string: {"ageRange":"18-25","interests":["tech","music"]}

**Currency Handling**
- Frontend sends/receives all monetary amounts in cents
- Divide by 100 for display as dollars
- All calculations done in cents (integer arithmetic)

### 14.3 Validation Constraints

| Field | Min | Max | Format | Required |
|-------|-----|-----|--------|----------|
| Campaign Title | 5 | 200 | String | Yes |
| Description | 10 | 2000 | String | Yes |
| Need Type | - | - | Enum (68 values) | Yes |
| Goal Amount | $1 | $9,999,999 | Cents | If fundraising |
| Tags | - | 10 | Array | No |
| Donation Amount | $1 | $10,000 | Cents | Yes |
| Platform Fee | - | - | 20% of gross | Auto-calculated |
| Campaign Duration | 7 | 90 | Days | If fundraising |
| Reward Per Share | $0.10 | $100 | Cents | If sharing |

---

## 15. SUMMARY STATISTICS

### Frontend File Count
- **Pages**: 22
- **Components**: 88+ (campaign, donation, sharing, sweepstakes, layout, UI)
- **Services**: 13 
- **Hooks**: 13 
- **Stores**: 4
- **Utils**: 2
- **Total Frontend Files**: ~150+

### Backend File Count
- **Routes**: 18
- **Controllers**: 19
- **Services**: 26+
- **Models**: 28
- **Validators**: 7
- **Middleware**: 7
- **Utils**: 10
- **Total Backend Files**: ~115+

### Key Numbers
- **Campaign Need Types**: 68+ predefined values
- **Payment Methods Supported**: 8+ (Stripe, Venmo, PayPal, CashApp, Bank, Crypto, Check, Money Order)
- **Platform Fee**: 20% of donation
- **Share Reward Hold Period**: 30 days before settlement
- **Image Upload Limit**: 10MB
- **Campaign Duration Range**: 7-90 days
- **Max Tags**: 10
- **Max Platforms**: 8

---

## 16. CRITICAL INTEGRATIONS

| System | Component | Status |
|--------|-----------|--------|
| Stripe Payments | StripeService.js | ✅ Fully integrated |
| PayPal | PaymentMethodController.js | ⚠️ Configured, webhook needed |
| Email Notifications | emailService.js | ✅ SendGrid integrated |
| QR Code Generation | qrCodeService.js | ✅ Implemented |
| Sweepstakes Drawing | DrawingService.js | ✅ Scheduled jobs |
| Analytics Caching | analyticsCache.js | ✅ 5-min TTL |

---

## 17. DEPLOYMENT ARTIFACTS

**Environment Variables Required**:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
ENCRYPTION_KEY=<32-byte-hex-string>
JWT_SECRET=<secret>
SENDGRID_API_KEY=<key>
MONGODB_URI=mongodb+srv://...
REDIS_URL=redis://...
AWS_S3_BUCKET=<bucket-name>
NODE_ENV=production
```

**Database Indexes**:
- Campaign: campaign_id (unique), creator_id, need_type, status
- Transaction: transaction_id (unique), campaign_id, supporter_id, status, hold_until_date
- Share: campaign_id, sharer_id
- ShareTracking: campaign_id, scan_date

---

**End of Audit Document**

