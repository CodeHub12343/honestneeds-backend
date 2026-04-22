# HonestNeed Frontend: Browse & Donate Flow - Technical Inventory

**Last Updated:** April 7, 2026  
**Document Type:** Frontend API Contracts & Implementation Reference  
**Scope:** Complete Browse & Donate workflow (routes, components, stores, hooks, services, validation)

---

## 📋 EXECUTIVE SUMMARY

This document provides an exact technical inventory of the frontend Browse & Donate flow with verification of all API contracts expected from the backend. It covers:
- **8 Route Definitions** with component mappings
- **12 Core Components** with prop interfaces
- **3 Zustand Stores** with complete state schemas
- **5 Core React Query Hooks** with cache strategies
- **3 Service Classes** with 20+ methods and request/response shapes
- **6 Validation Schemas** with Zod type definitions
- **Exact API Endpoints** expected from backend with query params and payloads

---

## 1. ROUTES & PAGES

### 1.1 Campaigns Browse Page
**Route:** `/campaigns`  
**File:** `honestneed-frontend/app/(campaigns)/campaigns/page.tsx`  
**Protection:** Public (no auth required)

#### Component Render Structure
```
<PageContainer>
  ├── <Header> with title and description
  ├── <MainContent>
  │   ├── <SearchContainer>
  │   │   └── <SearchBar /> - Real-time search input
  │   └── <LayoutGrid>
  │       ├── <SidebarContainer>
  │       │   └── <FiltersSidebar /> - Campaign filters
  │       └── <ContentColumn>
  │           └── <CampaignGrid /> - Campaign card grid
  └── <MobileFilterToggle> - Mobile hamburger menu
```

#### Props Used
- `useCampaigns(page, limit, filters)` - Hook to fetch campaigns
- `useFilterStore()` - Filter state management
- `useNeedTypes()` - Hook to fetch available need types
- `CampaignGrid` accepts: `campaigns`, `isLoading`, `onDonate`, `onShare`
- `SearchBar` for real-time search
- `FiltersSidebar` for multi-select filters

---

### 1.2 Campaign Detail Page (Browse)
**Route:** `/campaigns/[id]`  
**File:** `honestneed-frontend/app/(campaigns)/campaigns/[id]/page.tsx`  
**Protection:** Public (no auth required)

#### Child Routes
- `analytics/` - Campaign analytics dashboard (public)
- `donate/` - Protected donation entry point

#### Expected Components
- `CampaignDetail` - Read-only campaign information display
- `CreatorProfile` - Creator profile card section
- `MultiMeterDisplay` - Real-time metrics (donation count, shares, supporters)
- `CampaignUpdates` - Campaign update/activity feed
- `RelatedCampaigns` - Related campaigns section (same need_type)
- Donation CTA button → routes to `/campaigns/[id]/donate`

---

### 1.3 Donation Wizard Page
**Route:** `/campaigns/[id]/donate`  
**File:** `honestneed-frontend/app/(campaigns)/campaigns/[id]/donate/page.tsx`  
**Protection:** ✅ **ProtectedRoute** (requires authenticated user)

#### Route Protection
```tsx
<ProtectedRoute>
  <DonationWizard campaignId={campaignId} />
</ProtectedRoute>
```

#### Step Flow
1. **Step 1:** Amount Selection (`DonationStep1Amount`)
2. **Step 2:** Payment Method Selection (`DonationStep2PaymentMethod`) 
3. **Step 3:** Confirmation & Proof (`DonationStep3Confirmation`)
4. **Success:** Success Modal (`DonationSuccessModal`)

---

## 2. COMPONENTS

### 2.1 Campaign Browse Components

#### CampaignBrowsePage (Container)
**File:** `honestneed-frontend/app/(campaigns)/campaigns/page.tsx`  
**Type:** Client component (`'use client'`)

**State Management:**
```tsx
const filters = useFilterStore() // All browse filters
const { data: campaigns, isLoading } = useCampaigns(page, limit, filters)
const { data: needTypes } = useNeedTypes()
```

**Features:**
- Sticky filter sidebar (desktop, `@media (min-width: 1024px)`)
- Mobile filter toggle with hamburger menu
- Real-time search with debounce
- Pagination (default limit: 12)

---

#### CampaignGrid
**File:** `honestneed-frontend/components/campaign/CampaignGrid.tsx`  
**Props:**
```tsx
interface CampaignGridProps {
  campaigns: Campaign[]
  isLoading?: boolean
  onDonate?: (campaignId: string) => void
  onShare?: (campaignId: string) => void
}
```

**Features:**
- Responsive grid: 1 col (mobile) → 2 cols (tablet) → 3 cols (desktop)
- Campaign cards with lazy loading skeletons
- Empty state with "reset filters" CTA
- Loading animation with pulsing effect

**Skeleton UI:**
```
- Image block (12rem height)
- Content wrapper with multiple lines
- Button row with two skeleton buttons
- Pulsing animation (2s cycle)
```

---

#### CampaignCard
**File:** `honestneed-frontend/components/campaign/CampaignCard.tsx`

**Props:**
```tsx
interface CampaignCardProps {
  campaign: Campaign          // Campaign data object
  onDonate?: (id: string) => void
  onShare?: (id: string) => void
}
```

**Card Display Section:**
```
┌─────────────────────────────┐
│ Image Container (12rem)     │
│ - Badges (top-right corner) │
│   * Trending (if true)      │
│   * Scope (local/regional..)│
│   * Status                  │
├─────────────────────────────┤
│ Title (max 2 lines)         │
│ Description (truncated)     │
├─────────────────────────────┤
│ Stats Row                   │
│ - Donors: {total_donors}    │
│ - Raised: ${amount/100}     │
│ - Progress: X%              │
├─────────────────────────────┤
│ Creator Info                │
│ - Avatar + Name             │
│ - Location tag              │
├─────────────────────────────┤
│ Actions                     │
│ - Donate button             │
│ - Share button              │
└─────────────────────────────┘
```

**Data Displayed:**
- `campaign.title` - Campaign title
- `campaign.image?.url` - Campaign image or placeholder
- `campaign.description` - Campaign description (truncated)
- `campaign.total_donation_amount` - In cents, displayed as dollars
- `campaign.total_donations` - Donation count
- `campaign.total_donors` - Unique donor count
- `campaign.share_count` - Share count
- `campaign.creator_name` - Creator's display name
- `campaign.creator_avatar` - Creator's avatar URL
- `campaign.geographic_scope` - Scope badge (local/regional/national/global)
- `campaign.trending` - Trending indicator
- `campaign.status` - Status badge

**Progress Calculation:**
```
Progress % = (total_donation_amount / goal_amount) * 100
Note: goal_amount from goals array, computed from backend
```

---

#### FiltersSidebar
**File:** `honestneed-frontend/components/campaign/FiltersSidebar.tsx`

**Filter Options (from filterStore):**
```tsx
interface CampaignFilters {
  searchQuery: string              // Text search
  needTypes: string[]              // Multi-select (from useNeedTypes)
  location?: string                // Text input
  locationRadius?: number          // Miles (slider)
  geographicScope?: GeographicScope // local|regional|national|global|all
  minGoal?: number                 // In cents
  maxGoal?: number                 // In cents
  status: 'all' | 'active' | 'completed' | 'paused'
  sortBy: 'trending' | 'newest' | 'goalAsc' | 'goalDesc' | 'raised'
  page: number
  limit: number
}
```

**Filter UI Elements:**
- **Need Type:** Multi-select checkboxes
- **Location:** Text input + radius slider (0-100 miles)
- **Geographic Scope:** Radio buttons (All, Local, Regional, National, Global)
- **Goal Range:** Dual-handle slider (min $1, max $9,999,999)
- **Status:** Dropdown or tabs (All, Active, Completed, Paused)
- **Sort By:** Dropdown (Trending, Newest, Goal Low→High, Goal High→Low, Most Raised)

**Query Param Mapping (in campaignService):**
```
searchQuery          → params.search
needTypes[]          → params.needTypes (CSV: "type1,type2")
location             → params.location
locationRadius       → params.radius
geographicScope      → params.scope (only if !== 'all')
minGoal              → params.minGoal (in cents)
maxGoal              → params.maxGoal (in cents)
status               → params.status (only if !== 'all')
sortBy               → params.sort
page                 → params.page
limit                → params.limit
```

---

#### SearchBar
**File:** `honestneed-frontend/components/campaign/SearchBar.tsx`

**Props:**
```tsx
{
  placeholder?: string
  onSearch: (query: string) => void
  debounceMs?: number  // default 300ms
}
```

**Behavior:**
- Controlled input with debounce
- Updates `filterStore.setSearchQuery()` on change
- Resets page to 1 on search
- Shows clear button when text entered

---

### 2.2 Donation Components

#### DonationWizard
**File:** `honestneed-frontend/components/donation/DonationWizard.tsx`

**Props:**
```tsx
interface DonationWizardProps {
  campaignId: string
}
```

**State Management:**
```tsx
const wizardStore = useDonationWizardStore()  // Form data + step tracking
const { data: campaign } = useCampaign(campaignId)  // Campaign details
const { mutate: createDonation, isLoading } = useCreateDonation()
const router = useRouter()
```

**Rendered Steps:**
```
Step 1: DonationStep1Amount
  ├─ Amount input with presets ($5, $10, $25, $50, $100, $250)
  ├─ Real-time FeeBreakdown display
  └─ Next button enabled when amount >= $1

Step 2: DonationStep2PaymentMethod
  ├─ Display CREATOR's payment methods (campaign.payment_methods)
  ├─ Select one method to proceed
  ├─ Show QR codes (if applicable for payment method)
  └─ Next button enabled when method selected

Step 3: DonationStep3Confirmation
  ├─ Amount review (gross + fee breakdown)
  ├─ Selected payment method display
  ├─ Screenshot upload for proof
  ├─ Checkbox: "I agree I've sent the money"
  └─ Submit button → calls createDonation()

Success: DonationSuccessModal
  ├─ Confirmation message: "Thank you for your donation!"
  ├─ Transaction ID display
  ├─ Amount confirmation
  └─ "View campaign" link back to campaign detail
```

**Form Data Persistence:**
```tsx
// Stored in useDonationWizardStore (persisted to localStorage)
{
  campaignId: string | null
  amount: number | null        // in dollars (user input)
  paymentMethod: Partial<DonationPaymentMethod> | null
  screenshotProof: File | null
  screenshotProofPreview: string | null
  agreePaymentSent: boolean
  currentStep: number
  errors: Record<string, string>
  isSubmitting: boolean
}
```

**Step Validation:**
- Step 1: `donationAmountSchema` - $1 to $10,000
- Step 2: Payment method must be selected from campaign's payment_methods
- Step 3: `donationConfirmationSchema` - Screenshot optional, agreement required

---

#### DonationStep1Amount
**File:** `honestneed-frontend/components/donation/DonationStep1Amount.tsx`

**Props:**
```tsx
{
  initialAmount?: number
  onNext: (amount: number) => void
  isLoading?: boolean
}
```

**Features:**
- Currency input with "$" prefix
- Preset buttons: $5, $10, $25, $50, $100, $250
- Real-time fee breakdown (20% platform fee)
- Validation: min $1, max $10,000
- Error message for invalid amounts
- Info banner: "Platform fee: 20% of your donation"

---

#### DonationStep2PaymentMethod
**File:** `honestneed-frontend/components/donation/DonationStep2PaymentMethod.tsx`

**Props:**
```tsx
{
  paymentMethods: Array<{
    type: string
    [key: string]: any
  }>
  creatorName: string
  amount: number
  onNext: (selectedMethod: any) => void
  isLoading?: boolean
}
```

**Component Structure:**
```
├─ Amount Highlight Box (display donation amount)
├─ Security Note (blue info box)
├─ PaymentDirectory Component
│  └─ Shows creator's payment methods
│     ├─ Venmo: @username
│     ├─ PayPal: email
│     ├─ Cash App: $cashtag
│     ├─ Bank Transfer: routing + account
│     ├─ Crypto: wallet address
│     └─ Other: custom details
├─ Selected method display
└─ Continue button
```

**Payment Directory Display:**
- Shows **creator's** payment methods (not supporter's)
- For each method, displays:
  - Payment method type icon
  - Identifying info (username, email, cashtag, etc.)
  - QR code (if applicable for crypto/bank)
  - Instructions for sending money

---

#### DonationStep3Confirmation
**File:** `honestneed-frontend/components/donation/DonationStep3Confirmation.tsx`

**Props:**
```tsx
{
  amount: number
  paymentMethod: DonationPaymentMethod
  onNext: (formData: DonationConfirmationFormData) => void
  isLoading?: boolean
}
```

**Display Elements:**
```
├─ FeeBreakdown component
│  ├─ Gross amount (user's input)
│  ├─ Platform fee (20% = gross * 0.2)
│  └─ Net amount (gross - fee)
├─ Payment method verification
│  └─ Display selected method details
├─ Screenshot upload section
│  ├─ File input (optional)
│  ├─ Preview of uploaded image
│  └─ Remove button
├─ Checkbox: "I've successfully sent this donation"
└─ Submit donation button
```

**Validation Schema:**
```tsx
export const donationConfirmationSchema = z.object({
  screenshotProof: z
    .instanceof(File)
    .optional()
    .refine(
      (file) => !file || file.size <= 5 * 1024 * 1024,
      'Screenshot must be under 5MB'
    )
    .refine(
      (file) => !file || ['image/jpeg', 'image/png'].includes(file.type),
      'Screenshot must be JPEG or PNG'
    ),
  agreePaymentSent: z
    .boolean()
    .refine((val) => val === true, 'You must confirm you sent the donation'),
})
```

---

#### FeeBreakdown
**File:** `honestneed-frontend/components/donation/FeeBreakdown.tsx`

**Props:**
```tsx
{
  grossAmount: number
  platformFeePercentage?: number  // default 20
}
```

**Calculation:**
```javascript
const feeAmount = Math.round(grossAmount * (platformFeePercentage / 100))
const netAmount = grossAmount - feeAmount
```

**Display:**
```
┌────────────────────────────────────┐
│ FEE BREAKDOWN                      │
├────────────────────────────────────┤
│ Your Donation        $XXX.XX       │
│ Platform Fee (20%)   $XX.XX        │
├────────────────────────────────────┤
│ Creator Receives     $XXX.XX       │
│ (in bold, larger)                  │
├────────────────────────────────────┤
│ ℹ️  Fee helps maintain platform    │
│     and fraud detection           │
└────────────────────────────────────┘
```

---

#### DonationSuccessModal
**File:** `honestneed-frontend/components/donation/DonationSuccessModal.tsx`

**Display:**
```
┌─────────────────────────────────┐
│ ✅ Donation Received!           │
├─────────────────────────────────┤
│ Transaction ID: {transactionId} │
│ Amount Confirmed: ${amount}     │
│                                 │
│ Thank you for supporting this   │
│ campaign!                       │
├─────────────────────────────────┤
│ [View Campaign] [Return Home]  │
└─────────────────────────────────┘
```

---

## 3. STORES (Zustand)

### 3.1 filterStore
**File:** `honestneed-frontend/store/filterStore.ts`

**State Interface:**
```typescript
export interface CampaignFilters {
  searchQuery: string
  needTypes: string[]
  location?: string
  locationRadius?: number  // miles
  geographicScope?: GeographicScope | 'all'
  minGoal?: number        // in cents
  maxGoal?: number        // in cents
  status: 'all' | 'active' | 'completed' | 'paused'
  sortBy: 'trending' | 'newest' | 'goalAsc' | 'goalDesc' | 'raised'
  page: number
  limit: number
}

export interface FilterStore {
  filters: CampaignFilters
  setSearchQuery: (query: string) => void
  setNeedTypes: (types: string[]) => void
  setLocation: (location: string, radius: number) => void
  setGeographicScope: (scope: GeographicScope | 'all' | undefined) => void
  setGoalRange: (min: number, max: number) => void  // in cents
  setStatus: (status: 'all' | 'active' | 'completed' | 'paused') => void
  setSortBy: (sort: 'trending' | 'newest' | 'goalAsc' | 'goalDesc' | 'raised') => void
  setPage: (page: number) => void
  resetFilters: () => void
  getQueryParams: () => Record<string, string | number>
}
```

**Default Filters:**
```javascript
{
  searchQuery: '',
  needTypes: [],
  status: 'all',
  sortBy: 'trending',
  page: 1,
  limit: 12,
}
```

**Persistence:**
- Uses `persist` middleware: saved to `localStorage` under key `'campaign-filters'`
- Automatically loads on app start

**Filter Updates Reset Page to 1:**
- `setSearchQuery()` → `page = 1`
- `setNeedTypes()` → `page = 1`
- `setLocation()` → `page = 1`
- `setGeographicScope()` → `page = 1`
- `setGoalRange()` → `page = 1`
- `setStatus()` → `page = 1`
- `setSortBy()` → `page = 1`

---

### 3.2 donationWizardStore
**File:** `honestneed-frontend/store/donationWizardStore.ts`

**State Interface:**
```typescript
export interface DonationWizardFormData {
  campaignId: string | null
  amount: number | null            // in dollars (user input)
  paymentMethod: Partial<DonationPaymentMethod> | null
  screenshotProof: File | null
  screenshotProofPreview: string | null
  agreePaymentSent: boolean
}

export interface DonationWizardState {
  // State
  currentStep: number
  formData: DonationWizardFormData
  errors: Record<string, string>
  isSubmitting: boolean
  draftSaved: boolean

  // Actions
  setCurrentStep: (step: number) => void
  updateFormData: (data: Partial<DonationWizardFormData>) => void
  setAmount: (amount: number) => void
  setPaymentMethod: (method: Partial<DonationPaymentMethod>) => void
  setScreenshotProof: (file: File | null, preview: string | null) => void
  setAgreePaymentSent: (agree: boolean) => void
  setErrors: (errors: Record<string, string>) => void
  setIsSubmitting: (submitting: boolean) => void
  setCampaignId: (id: string) => void
  saveDraft: () => boolean  // returns success boolean
  loadDraft: (campaignId: string) => boolean  // returns success boolean
  clearDraft: (campaignId: string) => void
  resetWizard: () => void

  // Getters
  getFormData: () => DonationWizardFormData
  getDraftExists: (campaignId: string) => boolean
}
```

**Draft Persistence:**
- Storage Key: `'donation-wizard-draft-{campaignId}'` in `localStorage`
- **Only stores data** (not File objects): amount, paymentMethod, screenshotProofPreview, agreePaymentSent, currentStep, savedAt
- `saveDraft()`: Returns true if successful
- `loadDraft(campaignId)`: Returns true if draft found and loaded
- `clearDraft(campaignId)`: Removes draft from localStorage

**Initial Form Data:**
```javascript
{
  campaignId: null,
  amount: null,
  paymentMethod: null,
  screenshotProof: null,
  screenshotProofPreview: null,
  agreePaymentSent: false,
}
```

---

### 3.3 authStore (Relevant Fields)
**File:** `honestneed-frontend/store/authStore.ts`

**Relevant State:**
```typescript
{
  isAuthenticated: boolean
  user: {
    id: string
    email: string
    displayName: string
    // ...more fields
  } | null
}
```

**Used in:** `ProtectedRoute` wrapper for `/campaigns/[id]/donate`

---

## 4. HOOKS (React Query)

### 4.1 useCampaigns
**File:** `honestneed-frontend/api/hooks/useCampaigns.ts`

**Function Signature:**
```typescript
function useCampaigns(
  page: number = 1,
  limit: number = 12,
  filters?: Partial<CampaignFilters>
): UseQueryResult<CampaignListResponse, Error>
```

**Cache Configuration:**
```javascript
{
  queryKey: ['campaigns', 'list', { page, limit, ...filters }],
  staleTime: 10 * 60 * 1000,      // 10 minutes
  gcTime: 30 * 60 * 1000,          // 30 minutes garbage collection
  placeholderData: (previousData) => previousData  // Keep previous data while fetching new
}
```

**Return Value:**
```typescript
{
  data: {
    campaigns: Campaign[]
    total: number
    page: number
    limit: number
    totalPages: number
  }
  isLoading: boolean
  error: Error | null
  isError: boolean
  // ...more React Query properties
}
```

---

### 4.2 useCampaign
**File:** `honestneed-frontend/api/hooks/useCampaigns.ts`

**Function Signature:**
```typescript
function useCampaign(id: string | undefined): UseQueryResult<CampaignDetail, Error>
```

**Cache Configuration:**
```javascript
{
  queryKey: ['campaigns', 'detail', id],
  enabled: !!id,  // Only run query if id is provided
  staleTime: 5 * 60 * 1000,  // 5 minutes
  gcTime: 15 * 60 * 1000,     // 15 minutes
  retry: 1
}
```

**Return Value:**
```typescript
{
  data: CampaignDetail
  isLoading: boolean
  error: Error | null
  // ...
}
```

---

### 4.3 useCampaignAnalytics
**File:** `honestneed-frontend/api/hooks/useCampaigns.ts`

**Function Signature:**
```typescript
function useCampaignAnalytics(id: string | undefined): UseQueryResult<CampaignAnalytics, Error>
```

**Cache Configuration:**
```javascript
{
  queryKey: ['campaigns', 'analytics', id],
  enabled: !!id,
  staleTime: 3 * 60 * 1000,       // 3 minutes
  gcTime: 15 * 60 * 1000,          // 15 minutes
  refetchInterval: 5 * 60 * 1000,  // Auto-refetch every 5 minutes (LIVE UPDATES)
  retry: 1
}
```

**Real-time Behavior:**
- Automatically refetches every 5 minutes for live metric updates
- Returns cached data while background refetch happens

---

### 4.4 useDonations
**File:** `honestneed-frontend/api/hooks/useDonations.ts`

**Function Signature:**
```typescript
function useDonations(page = 1, limit = 25): UseQueryResult<{
  donations: Donation[]
  total: number
  pages: number
}, Error>
```

**Cache Configuration:**
```javascript
{
  queryKey: ['donations', 'list', { page, limit }],
  staleTime: 5 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
}
```

---

### 4.5 useCreateDonation
**File:** `honestneed-frontend/api/hooks/useDonations.ts`

**Function Signature:**
```typescript
function useCreateDonation(): UseMutationResult<
  Donation,
  Error,
  CreateDonationRequest
>
```

**Mutation Configuration:**
```javascript
{
  mutationFn: (data: CreateDonationRequest) => donationService.createDonation(data),
  onSuccess: (donation) => {
    queryClient.invalidateQueries({ queryKey: ['donations', 'list'] })
    queryClient.invalidateQueries({ queryKey: ['donations', 'stats'] })
    queryClient.invalidateQueries({ 
      queryKey: ['donations', 'campaignMetrics', donation.campaignId]
    })
    showToast({
      message: 'Donation received! Thank you for your support.',
      type: 'success',
    })
  },
  onError: (error: any) => {
    const message = error?.response?.data?.message || 'Failed to create donation...'
    showToast({
      message,
      type: 'error',
    })
  }
}
```

**Usage Example:**
```typescript
const { mutate: createDonation, isLoading } = useCreateDonation()

const handleSubmit = async () => {
  createDonation({
    campaignId: 'campaign-123',
    amount: 5000,  // $50.00 in cents
    paymentMethod: 'venmo',
    screenshotProof: file || undefined
  })
}
```

---

### 4.6 useTrendingCampaigns
**File:** `honestneed-frontend/api/hooks/useCampaigns.ts`

**Function Signature:**
```typescript
function useTrendingCampaigns(limit: number = 6): UseQueryResult<Campaign[], Error>
```

---

### 4.7 useRelatedCampaigns
**Function Signature:**
```typescript
function useRelatedCampaigns(
  excludeId: string,
  needType: string,
  limit: number = 3
): UseQueryResult<Campaign[], Error>
```

---

### 4.8 useNeedTypes
**Function Signature:**
```typescript
function useNeedTypes(): UseQueryResult<string[], Error>
```

**Returns:** Array of available need type strings (used to populate FiltersSidebar)

---

### 4.9 useRecordShare
**Function Signature:**
```typescript
function useRecordShare(): UseMutationResult<
  { shareId: string; referralUrl: string },
  Error,
  { campaignId: string; channel: string }
>
```

---

## 5. SERVICES (API Layer)

### 5.1 campaignService
**File:** `honestneed-frontend/api/services/campaignService.ts`

**Type Definitions:**
```typescript
export interface CampaignImage {
  url: string
  alt: string
}

export interface Campaign {
  id: string
  _id?: string  // MongoDB ID
  title: string
  description: string
  image?: CampaignImage
  creator_id: string
  creator_name: string
  creator_avatar?: string
  need_type: string
  status: 'draft' | 'active' | 'paused' | 'completed' | 'rejected'
  goal_amount?: number          // in cents (optional, computed from goals)
  raised_amount?: number        // in cents (optional)
  total_donation_amount: number // in cents (actual field)
  total_donations: number       // donation count
  donation_count?: number       // legacy field
  goals?: Array<{
    goal_type: string
    goal_name: string
    target_amount: number
    current_amount: number
  }>
  share_count: number
  supporter_count?: number      // legacy, use unique_supporters.length
  unique_supporters?: string[]  // array of supporter IDs
  total_donors: number          // unique donor count
  trending: boolean
  geographic_scope?: string     // 'local' | 'regional' | 'national' | 'global'
  location?: string | {
    address: string
    city: string
    state: string
    country: string
  }
  created_at: string
  updated_at: string
  view_count?: number
  metrics?: {
    total_donations: number
    total_donation_amount: number
    unique_supporters: string[]
    [key: string]: any
  }
}

export interface CampaignDetail extends Campaign {
  full_description: string
  payment_methods: Array<{
    type: string
    username?: string
    email?: string
    cashtag?: string
    routing_number?: string
    account_number?: string
    wallet_address?: string
    details?: string
    [key: string]: any
  }>
  category: string
  tags: string[]
  duration: number  // days
  end_date: string
  scope_description?: string
  related_campaigns: Campaign[]
}

export interface CampaignAnalytics {
  campaignId: string
  totalDonations: number
  totalRaised: number         // in cents
  uniqueDonors: number
  totalShares: number
  sharesByChannel: Record<string, number>
  donationsByDate: Array<{
    date: string
    amount: number
    count: number
  }>
  lastUpdated: string
}

export interface CampaignListResponse {
  campaigns: Campaign[]
  total: number
  page: number
  limit: number
  totalPages: number
}
```

#### Methods

##### getcampaigns() - Get Campaign List
**Signature:**
```typescript
async getCampaigns(
  page: number = 1,
  limit: number = 12,
  filters?: Partial<CampaignFilters>
): Promise<CampaignListResponse>
```

**Request:**
```
GET /campaigns?page=1&limit=12&search=...&needTypes=...&location=...&radius=...&scope=...&minGoal=...&maxGoal=...&status=...&sort=...
```

**Query Parameters Mapping:**
```javascript
{
  page: 1,
  limit: 12,
  ...(filters?.searchQuery && { search: filters.searchQuery }),
  ...(filters?.needTypes?.length && { needTypes: filters.needTypes.join(',') }),
  ...(filters?.location && { location: filters.location }),
  ...(filters?.locationRadius && { radius: filters.locationRadius }),
  ...(filters?.geographicScope && filters.geographicScope !== 'all' && { scope: filters.geographicScope }),
  ...(filters?.minGoal !== undefined && { minGoal: filters.minGoal }),
  ...(filters?.maxGoal !== undefined && { maxGoal: filters.maxGoal }),
  ...(filters?.status && filters.status !== 'all' && { status: filters.status }),
  ...(filters?.sortBy && { sort: filters.sortBy }),
}
```

**Response (Backend wraps in envelope):**
```json
{
  "success": true,
  "message": "Campaigns fetched successfully",
  "data": [
    {
      "id": "campaign-123",
      "_id": "507f1f77bcf86cd799439011",
      "title": "Emergency Medical Fund",
      "description": "Help us raise funds for...",
      "creator_id": "user-456",
      "creator_name": "John Doe",
      "need_type": "medical-emergency",
      "status": "active",
      "total_donation_amount": 150000,
      "total_donations": 15,
      "total_donors": 12,
      "share_count": 45,
      "trending": true,
      "geographic_scope": "local",
      "location": { "city": "San Francisco", "state": "CA" },
      "created_at": "2026-04-01T10:00:00Z",
      "updated_at": "2026-04-07T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 12,
    "totalCount": 150,
    "totalPages": 13
  }
}
```

**Processing in Hook:**
```typescript
const { data, pagination } = response.data
const campaignsWithIds = (data || []).map((campaign: any) => ({
  ...campaign,
  id: campaign.id || campaign._id,  // Ensure id field is set
}))
return {
  campaigns: campaignsWithIds,
  total: pagination?.totalCount || 0,
  page: pagination?.page || 1,
  limit: pagination?.limit || 12,
  totalPages: pagination?.totalPages || 1,
}
```

---

##### getCampaign() - Get Campaign Detail
**Signature:**
```typescript
async getCampaign(id: string): Promise<CampaignDetail>
```

**Request:**
```
GET /campaigns/{id}
```

**Response:**
```json
{
  "success": true,
  "message": "Campaign retrieved successfully",
  "data": {
    "id": "campaign-123",
    "title": "Emergency Medical Fund",
    "description": "...",
    "full_description": "...",
    "creator_id": "user-456",
    "creator_name": "John Doe",
    "creator_avatar": "https://...",
    "category": "medical-emergency",
    "tags": ["urgent", "medical", "family"],
    "duration": 30,
    "end_date": "2026-05-01T10:00:00Z",
    "payment_methods": [
      {
        "type": "venmo",
        "username": "@johndoe"
      },
      {
        "type": "paypal",
        "email": "john@example.com"
      }
    ],
    "geographic_scope": "local",
    "scope_description": "San Francisco Bay Area",
    "status": "active",
    "total_donation_amount": 150000,
    "total_donations": 15,
    "total_donors": 12,
    "share_count": 45,
    "trending": true,
    "created_at": "2026-04-01T10:00:00Z",
    "updated_at": "2026-04-07T14:30:00Z",
    "related_campaigns": [
      { /* Campaign object */ }
    ]
  }
}
```

**Error Handling:**
```typescript
if (error.response?.status === 404) {
  throw new Error('Campaign not found')
}
```

---

##### getCampaignAnalytics() - Get Campaign Metrics
**Signature:**
```typescript
async getCampaignAnalytics(id: string): Promise<CampaignAnalytics>
```

**Request:**
```
GET /campaigns/{id}/analytics
```

**Response:**
```json
{
  "success": true,
  "data": {
    "campaignId": "campaign-123",
    "totalDonations": 15,
    "totalRaised": 150000,
    "uniqueDonors": 12,
    "totalShares": 45,
    "sharesByChannel": {
      "facebook": 20,
      "twitter": 15,
      "email": 10
    },
    "donationsByDate": [
      {
        "date": "2026-04-06",
        "amount": 50000,
        "count": 5
      },
      {
        "date": "2026-04-07",
        "amount": 100000,
        "count": 10
      }
    ],
    "lastUpdated": "2026-04-07T14:30:00Z"
  }
}
```

---

##### getTrendingCampaigns() - Get Trending Campaigns
**Signature:**
```typescript
async getTrendingCampaigns(limit: number = 6): Promise<Campaign[]>
```

**Request:**
```
GET /campaigns/trending?limit=6
```

**Response:**
```json
{
  "campaigns": [
    { /* Campaign object */ }
  ]
}
```

---

##### getRelatedCampaigns() - Get Campaigns by Need Type
**Signature:**
```typescript
async getRelatedCampaigns(
  excludeId: string,
  needType: string,
  limit: number = 3
): Promise<Campaign[]>
```

**Request:**
```
GET /campaigns/{excludeId}/related?needType={needType}&limit={limit}
```

---

##### recordShare() - Record Campaign Share
**Signature:**
```typescript
async recordShare(
  campaignId: string,
  channel: 'facebook' | 'twitter' | 'linkedin' | 'email' | 'whatsapp' | 'link'
): Promise<{ shareId: string; referralUrl: string }>
```

**Request:**
```
POST /campaigns/{campaignId}/share
Body: { "channel": "facebook" }
```

---

### 5.2 donationService
**File:** `honestneed-frontend/api/services/donationService.ts`

**Type Definitions:**
```typescript
export interface DonationAmount {
  gross: number          // user's input (dollars)
  platformFee: number    // 20% of gross (dollars)
  net: number           // gross - fee (dollars)
}

export interface PaymentMethodDetails {
  type: 'venmo' | 'paypal' | 'cashapp' | 'bank' | 'crypto' | 'other'
  [key: string]: string
}

export interface CreateDonationRequest {
  campaignId: string
  amount: number              // in DOLLARS (not cents)
  paymentMethod: string       // type: 'venmo' | 'paypal' | etc
  screenshotProof?: File | string
}

export interface Donation {
  transactionId: string
  id: string
  campaignId: string
  campaignTitle: string
  donorId: string
  donorEmail: string
  donorName: string
  amount: number              // in cents (gross)
  platformFee: number         // in cents
  netAmount: number          // in cents
  paymentMethod: PaymentMethodDetails
  status: 'pending' | 'verified' | 'rejected'
  statusReason?: string
  createdAt: string
  verifiedAt?: string
}

export interface DonationStats {
  totalDonations: number
  totalAmount: number        // in cents
  averageDonation: number   // in cents
  recentDonations: Donation[]
}

export interface CampaignDonationMetrics {
  campaignId: string
  totalDonations: number
  totalRaised: number       // in cents
  avgDonation: number      // in cents
  topDonor?: {
    name: string
    amount: number
  }
  donationsByDate: Array<{
    date: string
    count: number
    amount: number
  }>
}
```

#### Methods

##### calculateFee() - Calculate Platform Fee
**Signature:**
```typescript
calculateFee(gross: number): DonationAmount
```

**Logic:**
```javascript
const platformFee = Math.round(gross * 0.2)  // 20% fee
const net = gross - platformFee
return { gross, platformFee, net }
```

**Example:**
```
Input: 5000 (cents = $50.00)
Fee: 5000 * 0.2 = 1000 (cents = $10.00)
Net: 5000 - 1000 = 4000 (cents = $40.00)
```

---

##### createDonation() - Create New Donation
**Signature:**
```typescript
async createDonation(data: CreateDonationRequest): Promise<Donation>
```

**Request:**
```
POST /campaigns/{campaignId}/donations
Content-Type: application/json

{
  "amount": 50.00,
  "paymentMethod": "venmo"
}
```

**⚠️ CRITICAL NOTE:**
- Frontend sends `amount` in **DOLLARS** (from user input)
- Backend handles conversion if needed
- No screenshot file in JSON body - upload separately if supported

**Response:**
```json
{
  "transactionId": "txn-123456",
  "id": "donation-789",
  "campaignId": "campaign-123",
  "campaignTitle": "Emergency Medical Fund",
  "donorId": "supporter-456",
  "donorEmail": "supporter@example.com",
  "donorName": "Jane Smith",
  "amount": 5000,
  "platformFee": 1000,
  "netAmount": 4000,
  "paymentMethod": {
    "type": "venmo"
  },
  "status": "pending",
  "createdAt": "2026-04-07T14:30:00Z"
}
```

---

##### getMyDonations() - Get User's Donations
**Signature:**
```typescript
async getMyDonations(
  page = 1,
  limit = 25
): Promise<{
  donations: Donation[]
  total: number
  pages: number
}>
```

**Request:**
```
GET /donations?page=1&limit=25
```

**Response:**
```json
{
  "success": true,
  "data": {
    "donations": [
      { /* Donation object */ }
    ],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 50,
      "pages": 2
    }
  }
}
```

---

##### getDonation() - Get Specific Donation
**Signature:**
```typescript
async getDonation(donationId: string): Promise<Donation>
```

**Request:**
```
GET /donations/{donationId}
```

---

##### getCampaignDonationMetrics() - Get Campaign Donation Stats
**Signature:**
```typescript
async getCampaignDonationMetrics(campaignId: string): Promise<CampaignDonationMetrics>
```

**Request:**
```
GET /campaigns/{campaignId}/donations/metrics
```

---

##### getDonationStats() - Get User's Donation Stats
**Signature:**
```typescript
async getDonationStats(): Promise<DonationStats>
```

**Request:**
```
GET /donations/stats
```

---

##### getCampaignDonations() - Admin: Get All Campaign Donations
**Signature:**
```typescript
async getCampaignDonations(
  campaignId: string,
  page = 1,
  limit = 25,
  status?: 'pending' | 'verified' | 'rejected'
): Promise<{
  donations: Donation[]
  total: number
  pages: number
}>
```

**Request:**
```
GET /admin/campaigns/{campaignId}/donations?page=1&limit=25&status=pending
```

---

## 6. VALIDATION SCHEMAS

**File:** `honestneed-frontend/utils/validationSchemas.ts`

### 6.1 Donation Amount Schema
```typescript
export const donationAmountSchema = z.object({
  amount: z
    .number()
    .min(1, 'Donation amount must be at least $1')
    .max(10000, 'Donation amount cannot exceed $10,000'),
})

export type DonationAmountFormData = z.infer<typeof donationAmountSchema>
```

---

### 6.2 Donation Payment Method Schema
```typescript
export const donationPaymentMethodSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('venmo'),
    username: z
      .string()
      .min(1, 'Venmo username is required')
      .regex(/^@?[\w-]+$/, 'Invalid Venmo username format'),
  }),
  z.object({
    type: z.literal('paypal'),
    email: z.string().email('Valid PayPal email is required'),
  }),
  z.object({
    type: z.literal('cashapp'),
    cashtag: z
      .string()
      .min(1, 'CashApp tag is required')
      .regex(/^\$?[\w-]+$/, 'Invalid CashApp tag format'),
  }),
  z.object({
    type: z.literal('bank'),
    routingNumber: z.string().regex(/^\d{9}$/, 'Routing number must be 9 digits'),
    accountNumber: z.string().regex(/^\d{9,17}$/, 'Account number must be 9-17 digits'),
  }),
  z.object({
    type: z.literal('crypto'),
    walletAddress: z.string().min(10, 'Valid crypto wallet address required'),
    cryptoType: z.enum(['bitcoin', 'ethereum', 'usdc', 'other']),
  }),
  z.object({
    type: z.literal('other'),
    details: z.string().min(5, 'Payment details must be at least 5 characters'),
  }),
])

export type DonationPaymentMethod = z.infer<typeof donationPaymentMethodSchema>
```

---

### 6.3 Donation Confirmation Schema
```typescript
export const donationConfirmationSchema = z.object({
  screenshotProof: z
    .instanceof(File)
    .optional()
    .refine(
      (file) => !file || file.size <= 5 * 1024 * 1024,
      'Screenshot must be under 5MB'
    )
    .refine(
      (file) => !file || ['image/jpeg', 'image/png'].includes(file.type),
      'Screenshot must be JPEG or PNG'
    ),
  agreePaymentSent: z
    .boolean()
    .refine((val) => val === true, 'You must confirm you sent the donation'),
})

export type DonationConfirmationFormData = z.infer<typeof donationConfirmationSchema>
```

---

### 6.4 Browse Filters - Query Params
**No explicit schema for browser filters, but used implicitly:**
```typescript
// implicitly validated by filterStore
interface CampaignFilters {
  searchQuery: string            // string, any length
  needTypes: string[]            // array of valid category IDs
  location?: string              // string, any format
  locationRadius?: number        // 0-100 miles
  geographicScope?: 'local' | 'regional' | 'national' | 'global' | 'all'
  minGoal?: number               // in cents, >= 100
  maxGoal?: number               // in cents, <= 999999900
  status: 'all' | 'active' | 'completed' | 'paused'
  sortBy: 'trending' | 'newest' | 'goalAsc' | 'goalDesc' | 'raised'
}
```

---

## 7. UI EXPECTATIONS

### 7.1 Campaign Card Display
```
┌───────────────────────────────────┐
│ Image Container (12rem height)    │
│ ┌─────┐  ┌─────┐  ┌─────┐        │
│ │Trend│ │Scope│ │Status│        │ (Top-right badges)
│ └─────┘  └─────┘  └─────┘        │
├───────────────────────────────────┤
│ Title (2 lines max, truncated)    │
│ Description (3 lines, ellipsis)   │
├───────────────────────────────────┤
│ 👥 12 supporters  💵 $1,500/5,000  │ (Stats in smaller font)
├───────────────────────────────────┤
│ ▓▓▓▓▓░░░░ 30% Progress Bar        │
├───────────────────────────────────┤
│ [Avatar] Creator Name             │
│ 📍 City, State (or Local/Regional)│
├───────────────────────────────────┤
│ [Donate Button]  [Share Button]   │
└───────────────────────────────────┘
```

**Font Colors & Sizes:**
- Title: 1.125rem, font-weight 600, color #0f172a
- Description: 0.875rem, color #64748b
- Stats: 0.8125rem, color #475569
- Progress: 0.75rem, color #6366f1

---

### 7.2 Filter Sidebar Layout
```
Filters
├─ Search (text input, debounced)
├─ Need Types (checkboxes)
│  ├─ Medical Emergency
│  ├─ Cancer Treatment
│  ├─ Mental Health
│  └─ ... (12+ categories)
├─ Location (text + radius slider)
│  ├─ Location Input
│  └─ Radius: 0-100 miles
├─ Geographic Scope (radio)
│  ├─ All
│  ├─ Local
│  ├─ Regional
│  ├─ National
│  └─ Global
├─ Goal Range (dual-slider)
│  ├─ Min: $1
│  └─ Max: $9,999,999
├─ Status (dropdown)
│  ├─ All
│  ├─ Active
│  ├─ Completed
│  └─ Paused
├─ Sort By (dropdown)
│  ├─ Trending
│  ├─ Newest
│  ├─ Goal Low→High
│  ├─ Goal High→Low
│  └─ Most Raised
└─ [Reset Filters] button
```

---

### 7.3 Donation Fee Breakdown Display
```
YOUR DONATION SUMMARY
─────────────────────────
Your Donation:      $50.00
Platform Fee (20%): -$10.00
─────────────────────────
Creator Receives:   $40.00
─────────────────────────

ℹ️  This fee helps us maintain
    the platform and prevent fraud.
```

**Display Precision:** Always show `.00` for dollars

---

### 7.4 Payment Methods Directory
**For Each Payment Method:**
```
Payment Method: Venmo
Username: @johndoe
[QR Code for Venmo link]
Tap to copy: @johndoe

---

Payment Method: PayPal
Email: john@example.com
[PayPal logo]

---

Payment Method: Cash App
Tag: $johndoe
[QR Code or link]
```

---

### 7.5 Sweepstakes/Compliance Display
**Note:** Not yet fully detailed in current implementation, but anticipated:
- Compliance banner for sweepstakes campaigns
- Age verification modal (if applicable)
- Entry guards for invalid eligibility

---

## 8. API EXPECTATIONS & CONTRACTS

### 8.1 Backend Endpoints Expected

| Endpoint | Method | Query/Body | Response | Notes |
|----------|--------|-----------|----------|-------|
| `/campaigns` | GET | page, limit, search, needTypes, location, radius, scope, minGoal, maxGoal, status, sort | `{success, data[], pagination}` | Main browse endpoint |
| `/campaigns/{id}` | GET | - | `{success, data: CampaignDetail}` | Single campaign detail |
| `/campaigns/{id}/analytics` | GET | - | `{success, data: CampaignAnalytics}` | Live metrics (5min refetch) |
| `/campaigns/trending` | GET | limit | `{campaigns[]}` | Trending list |
| `/campaigns/{id}/related` | GET | needType, limit | `{campaigns[]}` | Related by need type |
| `/campaigns/{id}/share` | POST | {channel} | `{shareId, referralUrl}` | Record share event |
| `/campaigns/{id}/donations` | POST | {amount, paymentMethod} | `{Donation}` | Create donation (JSON) |
| `/donations` | GET | page, limit | `{success, data: {donations[], pagination}}` | User's donations |
| `/donations/{id}` | GET | - | `{success, data: Donation}` | Single donation detail |
| `/donations/stats` | GET | - | `{success, data: DonationStats}` | User's donation stats |
| `/campaigns/{id}/donations/metrics` | GET | - | `{CampaignDonationMetrics}` | Campaign donation metrics |

---

### 8.2 Query Parameter Format

**needTypes Parameter (CSV):**
```
?needTypes=medical-emergency,cancer-treatment,mental-health
```

**Scope Parameter:**
```
?scope=local  (only sent if !== 'all' in filterStore)
```

**Status Parameter:**
```
?status=active  (only sent if !== 'all' in filterStore)
```

---

### 8.3 Response Envelope Format

**Success Response:**
```json
{
  "success": true,
  "message": "Campaigns fetched successfully",
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 12,
    "totalCount": 150,
    "totalPages": 13
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error description",
  "error": {
    "code": "ERROR_CODE",
    "details": "Additional details"
  }
}
```

---

### 8.4 Data Shapes & Field Mappings

#### Campaign Object (from GET /campaigns list)
```javascript
{
  id: "624abc123...",      // required: unique identifier
  _id: "624abc123...",     // MongoDB ID
  title: string,           // campaign title
  description: string,     // short description
  image: {
    url: string,
    alt: string
  },
  creator_id: string,
  creator_name: string,
  creator_avatar: string,
  need_type: string,       // from CAMPAIGN_CATEGORIES list
  status: 'active' | 'draft' | 'paused' | 'completed' | 'rejected',
  
  // MONETARY FIELDS (ALL IN CENTS)
  total_donation_amount: number,  // actual cumulative donations (cents)
  goal_amount: number,            // optional, computed from goals array
  
  total_donations: number,        // count
  donation_count: number,         // legacy field mapping
  total_donors: number,           // unique donors
  supporter_count: number,        // legacy
  unique_supporters: string[],    // array of supporter IDs
  
  share_count: number,
  trending: boolean,
  
  geographic_scope: string,  // 'local' | 'regional' | 'national' | 'global'
  location: {
    address: string,
    city: string,
    state: string,
    country: string
  },
  
  created_at: ISO8601,
  updated_at: ISO8601,
  view_count: number
}
```

#### Donation Object (from POST /campaigns/{id}/donations)
```javascript
{
  transactionId: string,    // unique transaction ID
  id: string,               // donation record ID
  campaignId: string,
  campaignTitle: string,
  donorId: string,
  donorEmail: string,
  donorName: string,
  
  // MONETARY FIELDS (ALL IN CENTS)
  amount: number,           // gross (what user entered)
  platformFee: number,      // 20% of gross
  netAmount: number,        // gross - fee (what creator gets)
  
  paymentMethod: {
    type: string            // 'venmo' | 'paypal' | 'cashapp' | 'bank' | 'crypto' | 'other'
  },
  
  status: 'pending' | 'verified' | 'rejected',
  statusReason: string,     // optional, only if rejected
  
  createdAt: ISO8601,
  verifiedAt: ISO8601      // optional, only if verified
}
```

---

## 9. CRITICAL INTEGRATION NOTES

### 9.1 Currency Handling ⚠️
- **Frontend Input:** User enters in DOLLARS (e.g., "50" = $50.00)
- **Frontend Display:** Always display with `.00` format
- **Service Calculation:** Only calculate fees in frontend, send dollars to backend
- **Backend Storage:** Backend should store in CENTS in database
- **Response:** Backend returns amounts in cents; frontend divides by 100 for display

**Example Flow:**
```
User enters: "$50"
Frontend state: 50 (dollars)
Fee calculation: 50 * 0.2 = 10 (dollars fee)
API payload: { amount: 50 }  ← sent as dollars
Backend stores: 5000 (cents)
Response: { amount: 5000, platformFee: 1000, netAmount: 4000 }
Display: $50.00 | $10.00 | $40.00
```

---

### 9.2 Campaign ID Mapping
- Backend may use `_id` (MongoDB field)
- Frontend normalizes to `id` field: `id: campaign.id || campaign._id`
- All API calls use `campaign.id` in URL params

---

### 9.3 Payment Methods Flow
⚠️ **CRITICAL FIX APPLIED:**
- **BEFORE:** Donation form asked supporter to enter THEIR payment method
- **AFTER:** Donation form displays CREATOR's payment methods (from `campaign.payment_methods`)
- Step 2 is a SELECTOR, not an INPUT form

---

### 9.4 Donation Status Lifecycle
```
Creation:       status = 'pending'
User uploads proof or submits

Expected states:
pending → verified (admin approval)
pending → rejected (admin rejects with reason)
verified → (shows in creator's received donations)
```

---

### 9.5 Cache Invalidation Pattern
When user successfully donates:
```typescript
queryClient.invalidateQueries(['donations', 'list'])      // Clear user's donation list
queryClient.invalidateQueries(['donations', 'stats'])     // Clear user's stats
queryClient.invalidateQueries(['donations', 'campaignMetrics', campaignId])  // Clear campaign metrics
// Campaign listing is NOT invalidated (stays cached)
```

---

### 9.6 React Query Stale Time Strategy
| Type | Stale Time | GC Time | Refetch |
|------|-----------|---------|---------|
| Campaign List | 10 min | 30 min | No auto |
| Campaign Detail | 5 min | 15 min | No auto |
| Campaign Analytics | 3 min | 15 min | 5 min auto |
| Donations List | 5 min | 15 min | No auto |
| Donation Stats | 10 min | 30 min | No auto |
| Trending | 15 min | 60 min | No auto |

---

## 10. FILE ORGANIZATION REFERENCE

```
honestneed-frontend/
├── app/
│   ├── (campaigns)/
│   │   ├── campaigns/
│   │   │   ├── page.tsx           ← Browse page (routes to CampaignGrid)
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx       ← Campaign detail page
│   │   │   │   ├── donate/
│   │   │   │   │   └── page.tsx   ← Protected donation page
│   │   │   │   └── analytics/
│   │   │   └── new/
│   │   └── layout.tsx
│   ├── providers.tsx              ← React Query, Zustand init
│   └── layout.tsx
│
├── api/
│   ├── services/
│   │   ├── campaignService.ts     ← Campaign API methods
│   │   └── donationService.ts     ← Donation API methods
│   └── hooks/
│       ├── useCampaigns.ts        ← Campaign hooks
│       └── useDonations.ts        ← Donation hooks
│
├── components/
│   ├── campaign/
│   │   ├── CampaignGrid.tsx       ← Grid layout
│   │   ├── CampaignCard.tsx       ← Card component
│   │   ├── FiltersSidebar.tsx     ← Filter controls
│   │   └── SearchBar.tsx          ← Search input
│   ├── donation/
│   │   ├── DonationWizard.tsx     ← Main wizard container
│   │   ├── DonationStep1Amount.tsx
│   │   ├── DonationStep2PaymentMethod.tsx
│   │   ├── DonationStep3Confirmation.tsx
│   │   ├── DonationSuccessModal.tsx
│   │   └── FeeBreakdown.tsx       ← Fee display
│   └── ui/
│       └── Button.tsx, Modal.tsx, etc.
│
├── store/
│   ├── filterStore.ts             ← Browse filters (Zustand)
│   └── donationWizardStore.ts     ← Donation form state (Zustand)
│
├── utils/
│   └── validationSchemas.ts       ← Zod schemas for donation & browse
│
├── lib/
│   └── api.ts                     ← Axios client with interceptors
│
└── hooks/
    └── useToast.ts               ← Toast notification hook
```

---

## 11. SUMMARY: API CONTRACTS AT A GLANCE

### Campaigns Browse
```
GET /campaigns
  Params: page, limit, search, needTypes, location, radius, scope, minGoal, maxGoal, status, sort
  Response: { data: Campaign[], pagination: {...} }
  
GET /campaigns/{id}
  Response: { data: CampaignDetail }
  
GET /campaigns/{id}/analytics
  Response: { data: CampaignAnalytics } (auto-refetch every 5 min)
```

### Donations
```
POST /campaigns/{id}/donations
  Body: { amount: number (dollars), paymentMethod: string }
  Response: { transactionId, id, campaignId, amount (cents), platformFee, netAmount, status, ... }
  
GET /donations
  Params: page, limit
  Response: { data: { donations[], pagination } }
  
GET /campaigns/{id}/donations/metrics
  Response: { totalDonations, totalRaised (cents), avgDonation, donationsByDate, topDonor }
```

---

**END OF TECHNICAL INVENTORY**
