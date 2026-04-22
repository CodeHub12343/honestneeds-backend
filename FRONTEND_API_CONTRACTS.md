# HonestNeed Frontend - Complete API Contract Extraction

**Analysis Date:** April 5, 2026  
**Frontend Version:** Next.js 13+ with TypeScript  
**API Client:** Axios with Bearer Token Authentication

---

## Table of Contents

1. [API Infrastructure](#api-infrastructure)
2. [Authentication Endpoints](#authentication-endpoints)
3. [Campaign Endpoints](#campaign-endpoints)
4. [Donation Endpoints](#donation-endpoints)
5. [Sharing & Referral Endpoints](#sharing--referral-endpoints)
6. [Payment Method Endpoints](#payment-method-endpoints)
7. [Sweepstakes Endpoints](#sweepstakes-endpoints)
8. [Volunteer Endpoints](#volunteer-endpoints)
9. [Admin Endpoints](#admin-endpoints)
10. [Campaign Updates Endpoints](#campaign-updates-endpoints)
11. [QR Code & Analytics Endpoints](#qr-code--analytics-endpoints)
12. [Validation Rules](#validation-rules)
13. [Error Handling](#error-handling)
14. [Authentication & Authorization](#authentication--authorization)
15. [State Management](#state-management)

---

## API Infrastructure

### Base URL Configuration
```
Process Environment: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
Base Path: /api (most endpoints), full URL for some services
Timeout: 30 seconds
```

### Request Headers
```
Authorization: Bearer {auth_token}
Content-Type: application/json (default)
Content-Type: multipart/form-data (for file uploads)
```

### Authentication Storage
- **Token Storage:** `localStorage.getItem('auth_token')`
- **User Data Storage:** `localStorage.getItem('user')` (JSON string)
- **Middleware Storage:** Cookies (`auth_token`, `user_role`)

### Axios Configuration
**File:** `lib/api.ts`

```typescript
apiClient: AxiosInstance = axios.create({
  baseURL: API_URL (http://localhost:3001/api),
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// Request interceptor: Adds Bearer token from localStorage
// Response interceptor: Handles errors, retry logic, auto-logout on 401
```

### Retry Logic
- **Max Retries:** 3 attempts
- **Retry Trigger:** 5xx server errors, network errors (no response)
- **Backoff Strategy:** Exponential delay: `1000 * 2^retryCount + random jitter (0-1000ms)`
- **Non-retryable:** 4xx errors (validation, auth failures)

---

## Authentication Endpoints

### POST /auth/login
**Purpose:** User login with email and password

**Request Body:**
```typescript
{
  email: string (lowercase)
  password: string
}
```

**Response (Success - 200):**
```typescript
{
  user: {
    id: string
    email: string
    name: string
    role: 'admin' | 'creator' | 'supporter' | 'guest'
    avatar?: string
  }
  token: string (JWT)
}
```

**Response (Error - 400/401):**
```typescript
{
  message: string
  error?: string
}
```

**Frontend Handling:**
- Sets `auth_token` in localStorage
- Sets user object in localStorage
- Redirects to `/dashboard` or stored redirect URL
- Shows toast notification on error

---

### POST /auth/register
**Purpose:** New user registration

**Request Body:**
```typescript
{
  email: string (lowercase)
  displayName: string (2-100 chars)
  password: string (8+ chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char)
}
```

**Response (Success - 200):**
```typescript
{
  user: User
  token: string
}
```

**Response (Error - 400):**
```typescript
{
  message: "Email already exists" | other messages
}
```

**Frontend Handling:**
- Auto-login if successful
- Special handling for "Email already exists" error
- Redirects to `/dashboard` on success

---

### POST /auth/logout
**Purpose:** Clear server-side token session

**Request Body:** Empty

**Response (Success - 200):**
```typescript
{ success: true }
```

**Frontend Handling:**
- Clears localStorage (auth_token, user)
- Redirects to `/`

---

### POST /auth/request-password-reset
**Purpose:** Request password reset email

**Request Body:**
```typescript
{
  email: string (lowercase)
}
```

**Response (Success - 200):**
```typescript
{
  message: string (confirmation text)
}
```

**Response (Error - 400/404):**
```typescript
{
  message: "Email not found" | "Rate limited" | other messages
}
```

---

### GET /auth/verify-reset-token/{token}
**Purpose:** Verify password reset token validity

**URL Parameters:**
```
token: string
```

**Response (Success - 200):**
```typescript
{
  email: string
}
```

**Response (Error - 400/401):**
```typescript
{
  message: "Invalid or expired token"
}
```

---

### POST /auth/reset-password
**Purpose:** Reset password with valid token

**Request Body:**
```typescript
{
  token: string
  password: string (8+ chars, meets complexity requirements)
}
```

**Response (Success - 200):**
```typescript
{
  message: string
}
```

**Response (Error - 400):**
```typescript
{
  message: "Invalid token" | "Token expired" | other messages
}
```

---

### POST /auth/check-email
**Purpose:** Check if email is already registered (for form validation)

**Request Body:**
```typescript
{
  email: string (lowercase)
}
```

**Response:**
```typescript
{
  exists: boolean
}
```

---

## Campaign Endpoints

### GET /campaigns
**Purpose:** Fetch campaigns list with pagination and filters

**Query Parameters:**
```
page: number (default: 1)
limit: number (default: 12)
search?: string
needTypes?: string (comma-separated)
location?: string
radius?: number (miles)
scope?: 'local' | 'regional' | 'national' | 'global'
minGoal?: number (cents)
maxGoal?: number (cents)
status?: 'all' | 'active' | 'completed' | 'paused'
sort?: 'trending' | 'newest' | 'goalAsc' | 'goalDesc' | 'raised'
```

**Response (Success - 200):**
```typescript
{
  campaigns: Campaign[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface Campaign {
  id: string
  title: string
  description: string
  image: { url: string; alt: string }
  creatorId: string
  creatorName: string
  creatorAvatar?: string
  needType: string
  status: 'draft' | 'active' | 'paused' | 'completed' | 'rejected'
  goalAmount: number // cents
  raisedAmount: number // cents
  donationCount: number
  shareCount: number
  supporterCount: number
  trending: boolean
  geographicScope?: 'local' | 'regional' | 'national' | 'global'
  location?: string
  createdAt: string (ISO)
  updatedAt: string (ISO)
}
```

---

### GET /campaigns/{id}
**Purpose:** Fetch single campaign detail

**URL Parameters:**
```
id: string (campaign ID)
```

**Response (Success - 200):**
```typescript
interface CampaignDetail extends Campaign {
  fullDescription: string
  paymentMethods: Array<{
    type: string
    username?: string
    email?: string
    cashtag?: string
    routingNumber?: string
    accountNumber?: string
    walletAddress?: string
    details?: string
    [key: string]: any
  }>
  category: string
  tags: string[]
  duration: number // days
  endDate: string (ISO)
  scopeDescription?: string
  relatedCampaigns: Campaign[]
}
```

**Response (Error - 404):**
```typescript
{
  message: "Campaign not found"
}
```

---

### POST /campaigns
**Purpose:** Create new campaign (multipart form data)

**Content-Type:** `multipart/form-data`

**Request Body (Form Data):**
```typescript
// Common fields
{
  title: string (5-200 chars)
  description: string (20-2000 chars)
  category: string
  location: string (optional)
  campaignType: 'fundraising' | 'sharing'
  image: File (optional, max 10MB, JPEG/PNG/WebP)
  
  // Fundraising-specific
  goalAmount?: string (in cents, as string)
  duration?: string (7-90 days)
  tags?: string (CSV: "tag1,tag2,tag3")
  paymentMethods?: string (JSON stringified array)
  
  // Sharing-specific
  meterType?: string
  platforms?: string (CSV: "facebook,twitter,...")
  rewardPerShare?: string (in cents)
  budget?: string (in cents)
  maxShares?: string
}
```

**Response (Success - 201):**
```typescript
{
  id: string
  campaign: CampaignDetail
}
```

**Response (Error - 400):**
```typescript
{
  message: string (validation error)
}
```

**Frontend Handling:**
- Converts dollar amounts to cents before sending
- Formats arrays as CSV strings
- Converts objects to JSON strings
- Uses FormData API for multipart encoding

---

### GET /campaigns/need-types
**Purpose:** Get list of available campaign need types for filters

**Response (Success - 200):**
```typescript
Array<{
  id: string
  name: string
  count: number (campaigns in this category)
}>
```

---

### GET /campaigns/trending
**Purpose:** Get trending campaigns

**Query Parameters:**
```
limit?: number (default: 6)
```

**Response:**
```typescript
{
  campaigns: Campaign[]
}
```

---

### GET /campaigns/related
**Purpose:** Get related campaigns by need type

**Query Parameters:**
```
excludeId: string
needType: string
limit?: number (default: 3)
```

**Response:**
```typescript
{
  campaigns: Campaign[]
}
```

---

### POST /campaigns/{id}/share
**Purpose:** Record a campaign share action

**URL Parameters:**
```
id: string (campaign ID)
```

**Request Body:**
```typescript
{
  channel: 'facebook' | 'twitter' | 'linkedin' | 'email' | 'whatsapp' | 'link'
}
```

**Response (Success - 200):**
```typescript
{
  shareId: string
  referralUrl: string
}
```

---

### GET /campaigns/{id}/analytics
**Purpose:** Get campaign analytics and metrics

**URL Parameters:**
```
id: string (campaign ID)
```

**Response (Success - 200):**
```typescript
interface CampaignAnalytics {
  campaignId: string
  totalDonations: number
  totalRaised: number (cents)
  uniqueDonors: number
  totalShares: number
  sharesByChannel: Record<string, number>
  donationsByDate: Array<{
    date: string (ISO date)
    amount: number (cents)
    count: number
  }>
  lastUpdated: string (ISO)
}
```

---

### POST /campaigns/{id}/track-qr-scan
**Purpose:** Track QR code scans for analytics

**URL Parameters:**
```
id: string (campaign ID)
```

**Request Body:**
```typescript
{
  storeLocationId?: string
  source?: string
  timestamp: string (ISO)
  userAgent: string
}
```

**Response:**
- No specific response format required, success is HTTP 200+
- Failures don't break the app (tracking is non-critical)

---

### GET /campaigns/{id}/qr-analytics
**Purpose:** Get QR code scan analytics

**Response:**
```typescript
{
  // Format unspecified in frontend code
  // Backend should return scan metrics by location/channel
}
```

---

### GET /campaigns/{id}/store-impressions
**Purpose:** Get store-level impression data for QR scans

**Response:**
```typescript
{
  // Format for store location tracking and impressions
}
```

---

## Donation Endpoints

### POST /campaigns/{campaignId}/donations
**Purpose:** Create a new donation for a campaign

**URL Parameters:**
```
campaignId: string
```

**Request Body:**
```typescript
{
  amount: number (cents)
  paymentMethod: {
    type: 'venmo' | 'paypal' | 'cashapp' | 'bank' | 'crypto' | 'other'
    username?: string
    email?: string
    cashtag?: string
    routingNumber?: string
    accountNumber?: string
    walletAddress?: string
    details?: string
  }
  screenshotProof?: string (optional, file reference or base64)
}
```

**Response (Success - 201):**
```typescript
{
  transactionId: string
  id: string
  campaignId: string
  campaignTitle: string
  donorId: string
  donorEmail: string
  donorName: string
  amount: number (cents, gross)
  platformFee: number (cents, 20%)
  netAmount: number (cents)
  paymentMethod: PaymentMethodDetails
  status: 'pending' | 'verified' | 'rejected'
  createdAt: string (ISO)
}
```

**Response (Error - 400):**
```typescript
{
  message: string
}
```

**Frontend Handling:**
- Converts dollar amounts to cents
- Calculates fee locally: `fee = gross * 0.2`, `net = gross - fee`
- Expects 20% platform fee deduction

---

### GET /donations
**Purpose:** Get current user's donations

**Query Parameters:**
```
page?: number (default: 1)
limit?: number (default: 25)
```

**Response (Success - 200):**
```typescript
{
  donations: Donation[]
  total: number
  pages: number
}
```

---

### GET /donations/{donationId}
**Purpose:** Get specific donation details

**URL Parameters:**
```
donationId: string
```

**Response:**
```typescript
interface Donation {
  transactionId: string
  id: string
  campaignId: string
  campaignTitle: string
  donorId: string
  donorEmail: string
  donorName: string
  amount: number (cents)
  platformFee: number (cents)
  netAmount: number (cents)
  paymentMethod: PaymentMethodDetails
  status: 'pending' | 'verified' | 'rejected'
  statusReason?: string
  createdAt: string (ISO)
  verifiedAt?: string (ISO)
}
```

---

### GET /donations/stats
**Purpose:** Get user's donation statistics dashboard

**Response (Success - 200):**
```typescript
{
  totalDonations: number
  totalAmount: number (cents)
  averageDonation: number (cents)
  recentDonations: Donation[]
}
```

---

### GET /campaigns/{campaignId}/donations/metrics
**Purpose:** Get campaign donation metrics

**URL Parameters:**
```
campaignId: string
```

**Response (Success - 200):**
```typescript
interface CampaignDonationMetrics {
  campaignId: string
  totalDonations: number
  totalRaised: number (cents)
  avgDonation: number (cents)
  topDonor?: {
    name: string
    amount: number (cents)
  }
  donationsByDate: Array<{
    date: string (ISO date)
    count: number
    amount: number (cents)
  }>
}
```

---

### GET /admin/campaigns/{campaignId}/donations
**Purpose:** Get all donations for a campaign (admin view)

**Query Parameters:**
```
page?: number
limit?: number
status?: 'pending' | 'verified' | 'rejected'
```

**Response:**
```typescript
{
  donations: Donation[]
  total: number
  pages: number
}
```

**Authentication:** Admin role required

---

### POST /admin/donations/{donationId}/verify
**Purpose:** Verify a donation (admin action)

**URL Parameters:**
```
donationId: string
```

**Response:**
```typescript
Donation (updated with status = 'verified')
```

---

### POST /admin/donations/{donationId}/reject
**Purpose:** Reject a donation (admin action)

**Request Body:**
```typescript
{
  reason: string
}
```

**Response:**
```typescript
Donation (updated with status = 'rejected', statusReason = reason)
```

---

## Sharing & Referral Endpoints

### POST /campaigns/{campaignId}/share/generate
**Purpose:** Generate referral link for a campaign

**URL Parameters:**
```
campaignId: string
```

**Response (Success - 200):**
```typescript
{
  shareLink: string (full URL with referral ID)
  referralId: string
  qrCode: string (QR code data URL or image)
}
```

---

### GET /campaigns/{campaignId}/share/metrics
**Purpose:** Get share metrics for a campaign

**Response:**
```typescript
interface CampaignShareMetrics {
  campaignId: string
  totalShares: number
  sharesByChannel: Record<string, number>
  uniqueShareholders: number
  referralLinkClicks: number
  shareLink: string
  referralId: string
}
```

---

### GET /shares
**Purpose:** Get current user's shares

**Query Parameters:**
```
page?: number (default: 1)
limit?: number (default: 25)
```

**Response:**
```typescript
{
  shares: ShareRecord[]
  stats: ReferralStats
  total: number
  pages: number
}

interface ShareRecord {
  id: string
  campaignId: string
  userId: string
  channel: 'facebook' | 'twitter' | 'linkedin' | 'email' | 'whatsapp' | 'link'
  shareLink: string
  referralId: string
  createdAt: string (ISO)
}

interface ReferralStats {
  totalShares: number
  sharesByChannel: Record<string, number>
  referrals: number
  conversions: number
  rewardEarned?: number (cents)
}
```

---

### GET /shares/stats
**Purpose:** Get user's sharing statistics

**Response:**
```typescript
ReferralStats
```

---

### POST /share/qrcode
**Purpose:** Generate QR code for a share link

**Request Body:**
```typescript
{
  shareLink: string
}
```

**Response:**
```typescript
interface QRCodeData {
  url: string
  dataUrl: string (base64 encoded PNG)
}
```

---

### POST /referrals/{referralId}/click
**Purpose:** Track referral link click

**URL Parameters:**
```
referralId: string
```

**Response:**
```typescript
{
  success: boolean
}
```

---

### GET /referrals/history
**Purpose:** Get referral history for user

**Query Parameters:**
```
page?: number
limit?: number
```

**Response:**
```typescript
{
  referrals: Array<{
    id: string
    email: string
    status: 'pending' | 'registered' | 'converted'
    bounty?: number (cents)
    createdAt: string (ISO)
  }>
  total: number
  pages: number
}
```

---

## Payment Method Endpoints

**Note:** This service uses a separate axios client with base URL `http://localhost:3001` instead of the standard API client.

### GET /api/payment-methods
**Purpose:** Get all payment methods for current user

**Response (Success - 200):**
```typescript
{
  success: true
  data: PaymentMethod[]
}

interface PaymentMethod {
  id?: string
  type: 'venmo' | 'paypal' | 'cashapp' | 'bank' | 'crypto' | 'wise' | 'sendwave' | 'westernunion' | 'other'
  username?: string (for Venmo, starts with @)
  email?: string (for PayPal)
  cashtag?: string (for Cash App, starts with $)
  routingNumber?: string (for bank)
  accountNumber?: string (for bank)
  walletAddress?: string (for crypto)
  cryptoType?: 'bitcoin' | 'ethereum' | 'usdc' | 'other'
  details?: string (for other types)
  isPrimary?: boolean
}
```

---

### GET /api/payment-methods/primary
**Purpose:** Get primary payment method

**Response:**
```typescript
{
  success: true
  data: PaymentMethod
}
```

---

### POST /api/payment-methods
**Purpose:** Add new payment method

**Request Body:**
```typescript
PaymentMethod (partial, without id)
```

**Response:**
```typescript
{
  success: true
  data: PaymentMethod (with id assigned)
}
```

---

### PATCH /api/payment-methods/{id}
**Purpose:** Update payment method

**Request Body:**
```typescript
Partial<PaymentMethod>
```

**Response:**
```typescript
{
  success: true
  data: PaymentMethod (updated)
}
```

---

### DELETE /api/payment-methods/{id}
**Purpose:** Delete payment method

**Response:**
```typescript
{
  success: true
  data: null
}
```

---

### PATCH /api/payment-methods/{id}/set-primary
**Purpose:** Set payment method as primary

**Response:**
```typescript
{
  success: true
  data: PaymentMethod
}
```

---

### POST /api/payment-methods/{id}/verify
**Purpose:** Verify payment method (test transaction)

**Response:**
```typescript
{
  success: true
  data: null
}
```

---

### GET /api/payment-methods/supported
**Purpose:** Get supported payment method types

**Response (Success - 200):**
```typescript
{
  success: true
  data: Array<{
    type: string
    label: string
    emoji: string
    icon: string
    international?: boolean
  }>
}
```

**Fallback Response (if service unavailable):**
Returns hardcoded list of 9 payment types (PayPal, Venmo, Cash App, Bank, Crypto, Wise, SendWave, Western Union, Other)

---

## Sweepstakes Endpoints

### GET /sweepstakes/my-entries
**Purpose:** Get current user's sweepstakes entries and information

**Response (Success - 200):**
```typescript
interface SweepstakesStats {
  currentDrawing: Drawing
  userEntries: SweepstakesEntryBreakdown
  winnings: Winnings[]
  leaderboard: Winner[]
}

interface SweepstakesEntryBreakdown {
  campaignCreation: number
  donations: number
  donationAmount: number (cents)
  shares: number
  total: number
}

interface Drawing {
  id: string
  targetDate: string (ISO)
  drawDate?: string (ISO)
  prize: number (cents)
  winners: number
  currentEntries: number
  status: 'pending' | 'drawn' | 'completed'
  createdAt: string (ISO)
}

interface UserDrawing extends Drawing {
  userEntries: number
  userStatus: 'not_won' | 'won_unclaimed' | 'won_claimed'
  userPrize?: number (cents)
}

interface Winnings {
  id: string
  userId: string
  drawingId: string
  drawingDate: string (ISO)
  prize: number (cents)
  status: 'won_unclaimed' | 'won_claimed'
  claimDate?: string (ISO)
  claimedVia?: DonationPaymentMethod
  createdAt: string (ISO)
}

interface Winner {
  id: string
  userId: string
  drawingId: string
  userName: string
  partialName: string (e.g., "John D.")
  entryCount: number
  position: number
  claimedAt?: string (ISO)
  createdAt: string (ISO)
}
```

---

### GET /sweepstakes/campaigns/{campaignId}/entries
**Purpose:** Get entries for a specific campaign

**Response:**
```typescript
{
  entries: SweepstakesEntryBreakdown
  currentDrawing: Drawing
}
```

---

### GET /sweepstakes/current-drawing
**Purpose:** Get current active drawing details

**Response:**
```typescript
UserDrawing
```

---

### GET /sweepstakes/my-winnings
**Purpose:** Get user's past winnings

**Query Parameters:**
```
page?: number (default: 1)
limit?: number (default: 10)
```

**Response:**
```typescript
{
  winnings: Winnings[]
  total: number
  pages: number
}
```

---

### GET /sweepstakes/leaderboard
**Purpose:** Get current drawing leaderboard

**Query Parameters:**
```
limit?: number (default: 10)
```

**Response:**
```typescript
Winner[]
```

---

### POST /sweepstakes/winnings/{winningId}/claim
**Purpose:** Claim a prize after winning

**Request Body:**
```typescript
{
  paymentMethod: DonationPaymentMethod
}

interface DonationPaymentMethod {
  type: 'venmo' | 'paypal' | 'cashapp' | 'bank' | 'crypto' | 'other'
  [key: string]: string
}
```

**Response (Success - 200):**
```typescript
{
  success: boolean
  transactionId: string
}
```

---

### GET /admin/sweepstakes/stats
**Purpose:** Get admin sweepstakes dashboard

**Response:**
```typescript
{
  currentDrawing: AdminDrawingStats
  upcomingDrawings: Drawing[]
  totalEarnings: number (cents)
}

interface AdminDrawingStats {
  drawingId: string
  targetDate: string (ISO)
  currentEntries: number
  winnersCount: number
  topParticipants: Array<{
    name: string
    entryCount: number
  }>
  revenue?: number (cents)
}
```

---

### GET /admin/sweepstakes/drawings
**Purpose:** Get past drawings history (admin)

**Query Parameters:**
```
page?: number
limit?: number
```

**Response:**
```typescript
{
  drawings: Drawing[]
  total: number
  pages: number
}
```

---

### GET /admin/sweepstakes/drawings/{drawingId}
**Purpose:** Get specific drawing details (admin)

**Response:**
```typescript
Drawing
```

---

### POST /admin/sweepstakes/drawings/{drawingId}/force
**Purpose:** Force execute a drawing (admin action)

**Response:**
```typescript
{
  winnersCount: number
  totalPrizePool: number (cents)
}
```

---

### POST /sweepstakes/entries
**Purpose:** Record a sweepstakes entry

**Request Body:**
```typescript
{
  userId: string
  entryType: 'campaign_creation' | 'donation' | 'share'
  count?: number (default: 1)
  campaignId?: string
}
```

**Response:**
```typescript
SweepstakesEntry
```

---

### GET /sweepstakes/notification
**Purpose:** Check if user has won (notification check)

**Response:**
```typescript
// Format not specified - likely returns Winnings or null
```

---

## Volunteer Endpoints

### POST /volunteers/offers
**Purpose:** Create volunteer offer for a campaign

**Request Body:**
```typescript
interface CreateVolunteerOfferRequest {
  campaignId: string
  title: string
  description: string
  skillsOffered: Array<{
    name: string
    yearsOfExperience?: number
  }>
  availability: {
    startDate: string (ISO date)
    endDate: string (ISO date)
    hoursPerWeek: number
  }
  contactMethod: 'email' | 'phone' | 'inApp'
  screenshotProof?: string (file reference)
}
```

**Response (Success - 201):**
```typescript
interface VolunteerOffer {
  id: string
  campaignId: string
  campaignTitle: string
  volunteerId: string
  volunteerName: string
  volunteerEmail: string
  volunteerPhone?: string
  title: string
  description: string
  skillsOffered: VolunteerSkill[]
  availability: { startDate: string; endDate: string; hoursPerWeek: number }
  contactMethod: 'email' | 'phone' | 'inApp'
  status: 'pending' | 'accepted' | 'declined' | 'completed'
  createdAt: string (ISO)
  acceptedAt?: string (ISO)
  declinedAt?: string (ISO)
  declineReason?: string
  completedAt?: string (ISO)
  notes?: string
}
```

---

### GET /campaigns/{campaignId}/volunteer-offers
**Purpose:** Get volunteer offers for a campaign (creator view)

**Query Parameters:**
```
status?: 'pending' | 'accepted' | 'declined' | 'completed'
```

**Response:**
```typescript
VolunteerOffer[]
```

---

### GET /volunteers/offers/{volunteerId}
**Purpose:** Get specific volunteer offer

**Response:**
```typescript
VolunteerOffer
```

---

### PATCH /volunteers/offers/{volunteerId}/accept
**Purpose:** Accept volunteer offer (creator action)

**Request Body:**
```typescript
{
  notes?: string
}
```

**Response:**
```typescript
VolunteerOffer (status = 'accepted')
```

---

### PATCH /volunteers/offers/{volunteerId}/decline
**Purpose:** Decline volunteer offer (creator action)

**Request Body:**
```typescript
{
  declineReason: string
  notes?: string
}
```

**Response:**
```typescript
VolunteerOffer (status = 'declined')
```

---

### PATCH /volunteers/offers/{volunteerId}/complete
**Purpose:** Mark volunteer offer complete (creator action)

**Request Body:**
```typescript
{
  notes?: string
}
```

**Response:**
```typescript
VolunteerOffer (status = 'completed')
```

---

### GET /volunteers/my-offers
**Purpose:** Get current user's volunteer offers

**Query Parameters:**
```
page?: number
limit?: number
```

**Response:**
```typescript
VolunteerOffer[]
```

---

### GET /campaigns/{campaignId}/volunteer-metrics
**Purpose:** Get campaign volunteer statistics (creator analytics)

**Response:**
```typescript
interface CampaignVolunteerMetrics {
  campaignId: string
  totalVolunteerOffers: number
  acceptedVolunteers: number
  totalHoursCommitted: number
  skillsRepresented: string[]
  activeVolunteers: Array<{
    name: string
    skill: string
    hoursPerWeek: number
  }>
}
```

---

### GET /volunteers/statistics
**Purpose:** Get user's volunteer statistics

**Response:**
```typescript
interface VolunteerStatistics {
  totalOffers: number
  acceptedOffers: number
  pendingOffers: number
  completedOffers: number
  averageHoursPerWeek: number
  topSkillsNeeded: Array<{
    skill: string
    demandCount: number
  }>
}
```

---

## Admin Endpoints

### GET /admin/overview
**Purpose:** Admin dashboard overview stats

**Response:**
```typescript
interface AdminOverviewStats {
  activeCampaigns: number
  totalRevenue: number (cents)
  monthlyRevenue: number (cents)
  pendingTransactions: number
  totalPendingAmount: number (cents)
  nextDrawingDate: string (ISO)
  sweepstakesEntryCount: number
  platformUptime: number (percentage)
}
```

---

### GET /admin/activity-feed
**Purpose:** Get recent activity feed

**Query Parameters:**
```
limit?: number (default: 10)
```

**Response:**
```typescript
{
  items: ActivityFeedItem[]
}

interface ActivityFeedItem {
  id: string
  timestamp: string (ISO)
  type: 'campaign_created' | 'campaign_flagged' | 'transaction_received' | 'transaction_verified' | 'user_registered'
  actor: string
  description: string
  relatedId?: string
  relatedType?: string
}
```

---

### GET /admin/alerts
**Purpose:** Get admin alerts

**Response:**
```typescript
{
  alerts: AdminAlert[]
}

interface AdminAlert {
  id: string
  type: 'flagged_campaign' | 'high_value_transaction' | 'suspicious_activity' | 'system_health'
  severity: 'info' | 'warning' | 'error'
  count: number
  message: string
  link?: string
}
```

---

### GET /admin/campaigns/moderation
**Purpose:** Get campaigns for moderation queue

**Query Parameters:**
```
page?: number
limit?: number (default: 25)
status?: string
sort?: string
```

**Response:**
```typescript
interface CampaignModerationList {
  campaigns: CampaignForModeration[]
  total: number
  page: number
  limit: number
}

interface CampaignForModeration {
  id: string
  title: string
  creatorId: string
  creatorName: string
  goalAmount: number (cents)
  raisedAmount: number (cents)
  status: 'draft' | 'active' | 'paused' | 'completed' | 'flagged' | 'suspended'
  flagCount: number
  flags?: Array<{
    reason: string
    note?: string
    flaggedBy: string
    timestamp: string (ISO)
  }>
  isSuspended: boolean
  suspensionReason?: string
  suspensionExpiration?: string (ISO)
  createdAt: string (ISO)
}
```

---

### POST /admin/campaigns/{campaignId}/flag
**Purpose:** Flag a campaign for review

**Request Body:**
```typescript
{
  reason: string
  notes?: string
}
```

**Response:**
```typescript
{
  success: boolean
}
```

---

### POST /admin/campaigns/{campaignId}/unflag
**Purpose:** Remove flag from campaign

**Response:**
```typescript
{
  success: boolean
}
```

---

### POST /admin/campaigns/{campaignId}/suspend
**Purpose:** Suspend a campaign

**Request Body:**
```typescript
{
  reason: string
  duration: '7days' | '30days' | 'permanent'
  notifyCreator?: boolean (default: true)
}
```

**Response:**
```typescript
{
  success: boolean
}
```

---

### POST /admin/campaigns/{campaignId}/unsuspend
**Purpose:** Unsuspend a campaign

**Response:**
```typescript
{
  success: boolean
}
```

---

### POST /admin/campaigns/{campaignId}/approve
**Purpose:** Approve a campaign

**Response:**
```typescript
{
  success: boolean
}
```

---

### GET /admin/transactions
**Purpose:** Get transactions for verification

**Query Parameters:**
```
page?: number
limit?: number (default: 25)
status?: string
sort?: string
```

**Response:**
```typescript
interface TransactionList {
  transactions: Transaction[]
  total: number
  page: number
  limit: number
}

interface Transaction {
  id: string
  campaignId: string
  campaignTitle: string
  donorId: string
  donorName: string
  donorEmail: string
  amount: number (cents)
  paymentMethod: string
  status: 'pending' | 'verified' | 'rejected'
  proofUrl?: string
  createdAt: string (ISO)
  verifiedAt?: string (ISO)
  rejectionReason?: string
}
```

---

### GET /admin/transactions/{transactionId}
**Purpose:** Get transaction details

**Response:**
```typescript
Transaction
```

---

### POST /admin/transactions/{transactionId}/verify
**Purpose:** Verify a transaction

**Response:**
```typescript
{
  success: boolean
}
```

---

### POST /admin/transactions/bulk-verify
**Purpose:** Verify multiple transactions

**Request Body:**
```typescript
{
  transactionIds: string[]
}
```

**Response:**
```typescript
{
  success: boolean
  verified: number
  failed: number
}
```

---

### POST /admin/transactions/{transactionId}/reject
**Purpose:** Reject a transaction

**Request Body:**
```typescript
{
  reason: string
}
```

**Response:**
```typescript
{
  success: boolean
}
```

---

### GET /admin/users
**Purpose:** Get paginated user list

**Query Parameters:**
```
page?: number (default: 1)
limit?: number (default: 20)
role?: 'creator' | 'supporter'
verificationStatus?: 'unverified' | 'pending' | 'verified' | 'rejected'
isBlocked?: boolean (as string: "true"/"false")
search?: string
```

**Response:**
```typescript
{
  users: AdminUserListItem[]
  total: number
  page: number
  limit: number
}

interface AdminUserListItem {
  id: string
  email: string
  name: string
  role: 'creator' | 'supporter' | 'admin'
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected'
  isBlocked: boolean
  totalCampaigns: number
  totalDonations: number
  createdAt: string (ISO)
  lastLoginAt?: string (ISO)
}
```

---

### GET /admin/users/{userId}
**Purpose:** Get detailed user profile

**Response:**
```typescript
interface AdminUserProfile {
  id: string
  email: string
  name: string
  avatar?: string
  role: 'creator' | 'supporter' | 'admin'
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected'
  isBlocked: boolean
  blockReason?: UserBlockReason
  blockDate?: string (ISO)
  blockedBy?: string
  blockedReason?: string
  createdAt: string (ISO)
  lastLoginAt?: string (ISO)
  totalCampaigns: number
  totalDonations: number
  totalDonated: number (cents)
  totalShares: number
  sweepstakesEntries: number
  reports: UserReport[]
  reportCount: number
}

type UserBlockReason = 'fraud' | 'policy_violation' | 'spam' | 'inappropriate_content' | 'reported_by_users' | 'manual_admin' | 'other'

interface UserReport {
  id: string
  reportedUserId: string
  reportingUserId: string
  reason: string
  description: string
  status: 'pending' | 'resolved' | 'dismissed'
  createdAt: string (ISO)
  resolvedAt?: string (ISO)
}
```

---

### PATCH /admin/users/{userId}/verify
**Purpose:** Verify a user

**Request Body:**
```typescript
{
  notes?: string
}
```

**Response:**
```typescript
AdminUserProfile
```

---

### PATCH /admin/users/{userId}/reject-verification
**Purpose:** Reject user verification

**Request Body:**
```typescript
{
  reason: string
}
```

**Response:**
```typescript
AdminUserProfile
```

---

### PATCH /admin/users/{userId}/block
**Purpose:** Block a user

**Request Body:**
```typescript
{
  reason: UserBlockReason
  explanation?: string
}
```

**Response:**
```typescript
AdminUserProfile
```

---

### PATCH /admin/users/{userId}/unblock
**Purpose:** Unblock a user

**Response:**
```typescript
AdminUserProfile
```

---

### GET /admin/users/{userId}/reports
**Purpose:** Get reports about a user

**Response:**
```typescript
UserReport[]
```

---

### GET /admin/reports
**Purpose:** Get pending reports

**Query Parameters:**
```
page?: number
limit?: number
status?: 'pending' | 'resolved' | 'dismissed'
```

**Response:**
```typescript
{
  reports: UserReport[]
  total: number
  pages: number
}
```

---

### PATCH /admin/reports/{reportId}/resolve
**Purpose:** Resolve a report

**Request Body:**
```typescript
{
  decision: string (action taken)
}
```

**Response:**
```typescript
UserReport
```

---

### POST /admin/reports
**Purpose:** Create a report about a user

**Request Body:**
```typescript
{
  reportedUserId: string
  reason: string
  description: string
}
```

**Response:**
```typescript
UserReport
```

---

### GET /admin/users/{userId}/export
**Purpose:** Export user data (GDPR)

**Response:**
- File download (likely CSV or JSON)

---

### DELETE /admin/users/{userId}
**Purpose:** Delete user account

**Query Parameters:**
```
anonymize?: boolean (default: true)
```

**Response:**
```typescript
{
  success: boolean
}
```

---

### GET /admin/users/statistics
**Purpose:** Get user statistics for admin dashboard

**Response:**
```typescript
{
  totalUsers: number
  activeUsers: number
  newUsersThisMonth: number
  creatorCount: number
  supporterCount: number
  blockedCount: number
  verificationStats: {
    unverified: number
    pending: number
    verified: number
    rejected: number
  }
}
```

---

### GET /admin/settings
**Purpose:** Get admin settings

**Response:**
```typescript
interface AdminSettings {
  platformFee: number (percentage: 0.02 = 2%)
  minDonation: number (cents)
  maxDonation: number (cents)
  sweepstakesEnabled: boolean
  sweepstakesDrawingFrequency: string
  maintenanceMode: boolean
}
```

---

### PATCH /admin/settings
**Purpose:** Update admin settings

**Request Body:**
```typescript
Partial<AdminSettings>
```

**Response:**
```typescript
AdminSettings
```

---

### GET /admin/categories
**Purpose:** Get all campaign categories

**Response:**
```typescript
AdminCategory[]

interface AdminCategory {
  id: string
  name: string
  group: string
  description: string
  icon?: string
  order: number
  isActive: boolean
  campaignCount: number
}
```

---

### POST /admin/categories
**Purpose:** Create new category

**Request Body:**
```typescript
{
  name: string
  group: string
  description: string
  icon?: string
  order: number
}
```

**Response:**
```typescript
AdminCategory
```

---

### PATCH /admin/categories/{categoryId}
**Purpose:** Update category

**Request Body:**
```typescript
Partial<AdminCategory>
```

**Response:**
```typescript
AdminCategory
```

---

### DELETE /admin/categories/{categoryId}
**Purpose:** Delete category

**Response:**
```typescript
{
  success: boolean
}
```

---

### GET /admin/content/{type}
**Purpose:** Get platform content (manifesto, about, terms, privacy)

**URL Parameters:**
```
type: 'manifesto' | 'about' | 'terms' | 'privacy'
```

**Response:**
```typescript
interface PlatformContent {
  id: string
  type: 'manifesto' | 'about' | 'terms' | 'privacy'
  title: string
  content: string
  htmlContent: string
  updatedAt: string (ISO)
  updatedBy: string
  version: number
}
```

---

### PATCH /admin/content/{type}
**Purpose:** Update platform content

**Request Body:**
```typescript
{
  title: string
  content: string
}
```

**Response:**
```typescript
PlatformContent
```

---

### GET /admin/content/{type}/history
**Purpose:** Get content version history

**Response:**
```typescript
PlatformContent[]
```

---

### POST /admin/content/{type}/restore
**Purpose:** Restore previous version

**Request Body:**
```typescript
{
  version: number
}
```

**Response:**
```typescript
PlatformContent
```

---

## Campaign Updates Endpoints

### GET /campaigns/{campaignId}/updates
**Purpose:** Get all updates for a campaign

**Response:**
```typescript
CampaignUpdate[]

interface CampaignUpdate {
  id: string
  campaignId: string
  creatorId: string
  title: string
  content: string
  imageUrl?: string
  createdAt: string (ISO)
  updatedAt: string (ISO)
}
```

---

### POST /campaigns/{campaignId}/updates
**Purpose:** Create campaign update

**Request Body:**
```typescript
{
  title: string
  content: string
  imageUrl?: string
}
```

**Response:**
```typescript
CampaignUpdate
```

---

### GET /campaigns/{campaignId}/updates/{updateId}
**Purpose:** Get specific campaign update

**Response:**
```typescript
CampaignUpdate
```

---

### PUT /campaigns/{campaignId}/updates/{updateId}
**Purpose:** Update campaign update

**Request Body:**
```typescript
Partial<CreateUpdatePayload>
```

**Response:**
```typescript
CampaignUpdate
```

---

### DELETE /campaigns/{campaignId}/updates/{updateId}
**Purpose:** Delete campaign update

**Response:**
- HTTP 204 No Content or `{ success: true }`

---

## QR Code & Analytics Endpoints

### POST /campaigns/{campaignId}/track-qr-scan
**Purpose:** Track QR code scan

**Request Body:**
```typescript
{
  storeLocationId?: string
  source?: string
  timestamp: string (ISO)
  userAgent: string
}
```

**Response:**
- HTTP 200 success or error silently logged
- Failures don't break application flow

---

### GET /campaigns/{campaignId}/qr-analytics
**Purpose:** Get QR code scan analytics

**Response:**
```typescript
{
  // Format varies - backend determines structure
  // Likely includes: scans by location, time, channel
}
```

---

### GET /campaigns/{campaignId}/store-impressions
**Purpose:** Get store-level impression metrics

**Response:**
```typescript
{
  // Store location tracking data
}
```

---

## Validation Rules

### Campaign Validation

| Field | Type | Rules |
|-------|------|-------|
| title | string | min: 5, max: 200 chars |
| description | string | min: 20, max: 2000 chars |
| category | string | required, non-empty |
| location | string | optional |
| duration | number | min: 7, max: 90 days (fundraising only) |
| goalAmount | number | min: $1, max: $9,999,999 (cents) |
| tags | string[] | max: 10 tags |
| rewardPerShare | number | min: $0.10, max: $100 (cents) |
| budget | number | min: $10, max: $1,000,000 (cents) |
| platforms | string[] | min: 1, max: 8 platforms |
| image | File | optional, max: 10MB, JPEG/PNG/WebP |

### Authentication Validation

| Field | Type | Rules |
|-------|------|-------|
| email | string | valid email format, lowercase |
| password | string | min: 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special (!@#$%^&*) |
| displayName | string | 2-100 chars, trimmed |

### Payment Method Validation

**Venmo:**
- username: required, must start with @

**PayPal:**
- email: required, valid email

**Cash App:**
- cashtag: required, must start with $

**Bank:**
- routingNumber: 9 digits
- accountNumber: 9-17 digits

**Crypto:**
- walletAddress: min 10 chars
- cryptoType: bitcoin | ethereum | usdc | other

---

## Error Handling

### Standard Error Response Formats

**HTTP 400 - Bad Request (Validation Error):**
```typescript
{
  message: string
  error?: string
  // May include field-specific errors
}
```

**HTTP 401 - Unauthorized:**
```typescript
{
  message: string
}
```

**Frontend Action:** Clear auth, redirect to login, show toast

**HTTP 403 - Forbidden:**
```typescript
{
  message: string
}
```

**Frontend Action:** Show "Permission denied" toast

**HTTP 404 - Not Found:**
```typescript
{
  message: "Resource not found" | specific message
}
```

**Frontend Action:** Show toast, redirect or show empty state

**HTTP 5xx - Server Error:**
```typescript
{
  message: string
}
```

**Frontend Action:** Retry logic (exponential backoff), show error toast

### Error Handling in lib/api.ts

- **401 Unauthorized:** Auto-logout, redirect to login with redirect URL
- **403 Forbidden:** Show "Permission denied" toast
- **404 Not Found:** Show message from response
- **400 Bad Request:** Show validation message
- **5xx Server Error:** Show generic error message
- **Network Error:** Included in retry logic, shows timeout message
- **ECONNABORTED:** Timeout error handling

### Toast Notification Messages

Frontend uses `react-toastify` for error notifications:

```typescript
toast.error(errorMessage) // For errors
toast.success(message) // For success
toast.info(message) // For info
```

---

## Authentication & Authorization

### User Roles & Permissions

```typescript
enum UserRole {
  ADMIN = 'admin' // All permissions
  CREATOR = 'creator' // Create campaigns, view analytics
  SUPPORTER = 'supporter' // Donate, share, participate
  GUEST = 'guest' // Browse only (unauthenticated)
}

// Permission mapping:
admin -> ['all']
creator -> ['create_campaign', 'view_analytics', 'manage_campaigns']
supporter -> ['donate', 'share']
guest -> ['browse']
```

### Protected Routes (Next.js Middleware)

```
/dashboard - Requires auth
/creator/* - Requires creator role
/admin/* - Requires admin role
/profile/* - Requires auth
/donations/* - Requires auth

/login, /register, /forgot-password -> Redirect to dashboard if already auth
```

### Token Storage & Retrieval

**Frontend Storage:**
- `localStorage.setItem('auth_token', token)` - Bearer token
- `localStorage.setItem('user', JSON.stringify(user))` - User object
- Cookie-based for middleware: `auth_token`, `user_role`

**Request Header:**
```
Authorization: Bearer {token}
```

**Interceptor:** Automatically added to all API requests via `lib/api.ts`

---

## State Management

### Zustand Stores

**1. Auth Store (authStore.ts)**
```typescript
interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'creator' | 'supporter' | 'guest'
  avatar?: string
}

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  setAuth(user, token): void
  clearAuth(): void
  updateUser(updates): void
  hasRole(role): boolean
  hasPermission(permission): boolean
}
```

**Storage:** localStorage persistence with `zustand/middleware` persist

---

**2. Filter Store (filterStore.ts)**
```typescript
interface CampaignFilters {
  searchQuery: string
  needTypes: string[]
  location?: string
  locationRadius?: number
  geographicScope?: 'local' | 'regional' | 'national' | 'global' | 'all'
  minGoal?: number (cents)
  maxGoal?: number (cents)
  status: 'all' | 'active' | 'completed' | 'paused'
  sortBy: 'trending' | 'newest' | 'goalAsc' | 'goalDesc' | 'raised'
  page: number
  limit: number
}
```

**Storage:** localStorage persistence, name: 'campaign-filters'

---

**3. Wizard Store (wizardStore.ts)**
```typescript
interface WizardFormData {
  // Step 1: Type selection
  campaignType?: 'fundraising' | 'sharing'
  
  // Step 2: Basic info
  title?: string
  description?: string
  category?: string
  location?: string
  image?: File | null
  imageUrl?: string
  
  // Step 3: Type-specific
  // Fundraising
  goalAmount?: number
  duration?: number
  tags?: string[]
  paymentMethods?: Array<...>
  
  // Sharing
  meterType?: string
  platforms?: string[]
  rewardPerShare?: number
  budget?: number
  maxShares?: number
}
```

**Storage:** localStorage with key 'campaign-wizard-draft'

---

**4. Donation Wizard Store (donationWizardStore.ts)**
```typescript
interface DonationWizardFormData {
  amount?: number
  paymentMethod?: DonationPaymentMethod
  campaignId: string
  // Additional steps
}
```

**Storage:** localStorage with dynamic key: `donation-wizard-draft-${campaignId}`

---

### React Query Patterns

**Query Key Factory Pattern:**
```typescript
// Campaigns
campaignKeys = {
  all: ['campaigns'],
  lists: () => [...all, 'list'],
  list: (page, limit, filters) => [...lists(), { page, limit, ...filters }],
  details: () => [...all, 'detail'],
  detail: (id) => [...details(), id],
  analytics: () => [...all, 'analytics'],
  analyticsDetail: (id) => [...analytics(), id],
}

// Similar patterns for donations, sweepstakes, admin, etc.
```

**Stale Times (Cache Durations):**
- Campaign lists: 10 minutes
- Campaign details: 5 minutes
- Campaign analytics: 3 minutes (refetch every 5 min)
- Donations: 5 minutes
- Sweepstakes: 5-10 minutes
- Admin data: 2-5 minutes (refetch every 5-10 min)

**Garbage Collection Times:**
- Lists: 30 minutes
- Details: 15 minutes
- Analytics: 15 minutes

**Invalidation on Mutations:**
```typescript
// After creating campaign:
queryClient.invalidateQueries(['campaigns', 'list'])
queryClient.invalidateQueries(['campaigns', 'detail', id])

// After donation:
queryClient.invalidateQueries(['donations', 'list'])
queryClient.invalidateQueries(['campaigns', 'analytics', campaignId])
```

---

### Hooks Pattern

All API interactions use React Query hooks (useQuery, useMutation):

```typescript
// Query hooks
const { data, isLoading, error } = useCampaigns(page, limit, filters)
const { data: campaign } = useCampaign(id)
const { data: donations } = useDonations(page, limit)

// Mutation hooks with onSuccess/onError callbacks
const { mutate: createCampaign, isPending } = useCreateCampaign()
const { mutate: createDonation} = useCreateDonation()
const { mutate: claimPrize } = useClaimPrize()
```

---

## File Upload Handling

### Campaign Image Upload
**Method:** multipart/form-data via FormData API

```typescript
const formData = new FormData()
formData.append('title', campaign.title)
formData.append('image', imageFile, imageFile.name) // File object
formData.append('...other fields as strings...')

await apiClient.post('/campaigns', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
})
```

**Validation:**
- Max size: 10MB
- Formats: JPEG, PNG, WebP
- Required: No (optional image)

### Screenshot Proof for Donations
**Method:** File reference or base64 in request body

```typescript
formData.append('screenshotProof', screenshotFile, screenshotFile.name)
```

### QR Code Generation
**Method:** External service (QR Server API)

```typescript
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${url}`
```

---

## Currency Handling

**Frontend Expectation:**
- All amounts in API are **CENTS** (integer)
- Frontend displays as **DOLLARS** (divide by 100)
- Frontend sends **CENTS** (multiply user input by 100)

```typescript
// Send to API
Math.round(userInputDollars * 100) // Convert to cents

// Display from API
apiResponseCents / 100 // Convert to dollars

// Platform fee (20%)
const fee = Math.round(amount * 0.2)
const net = amount - fee
```

---

## Middleware & Interceptors

### Request Interceptor (lib/api.ts)
```typescript
// Adds Authorization header:
config.headers.Authorization = `Bearer ${localStorage.getItem('auth_token')}`

// Logs request in development:
console.log('[API Request]', method, url, data)
```

### Response Interceptor (lib/api.ts)
```typescript
// Logs response in development

// Handles errors:
- 401: Clear auth, redirect to login
- 403: Show forbidden message
- 404: Show not found message
- 400: Show validation error
- 5xx: Show server error
- Network: Included in retry logic

// Auto-retry with exponential backoff
```

### Next.js Middleware (middleware.ts)
```typescript
// Routes protected by auth check
// Role-based access control (admin/creator)
// Redirects unauthenticated users to login
// Redirects authenticated users away from auth pages
```

### useAuthHydration Hook
```typescript
// Restores auth state on app initialization
// Reads from localStorage
// Sets token in auth store
// Prevents hydration mismatch
```

---

## Environment Variables Expected

```
NEXT_PUBLIC_API_URL = http://localhost:3001/api (or production URL)
NEXT_PUBLIC_APP_URL = https://honestneed.com (or local URL)
NODE_ENV = development | production
```

---

## Summary of Key Contracts

### BaseURL Pattern
Most endpoints: `/api/{resource}`  
Some services: Direct `http://localhost:3001/api/` (paymentMethodService, etc.)

### Authentication
- **Method:** Bearer Token (JWT)
- **Storage:** localStorage, cookies
- **Header:** `Authorization: Bearer {token}`
- **Auto-logout:** 401 response

### Currency Standard
- **API:** Cents (integers)
- **User Display:** Dollars (divide by 100)
- **Platform Fee:** 20% deducted automatically

### Pagination
- **Default Limit:** 12-25 items
- **Query Params:** `page`, `limit`
- **Response Fields:** `total`, `pages` or `totalPages`

### File Uploads
- **Method:** multipart/form-data
- **Max Size:** 10MB
- **Formats:** JPEG, PNG, WebP
- **Field Names:** `image`, `screenshotProof`

### Error Format
- **Standard:** `{ message: string, error?: string }`
- **Validation:** May include field-specific errors
- **Status Codes:** 400, 401, 403, 404, 5xx

### User Roles
- **admin:** Full access to all endpoints
- **creator:** Campaign management, analytics
- **supporter:** Donate, share, participate
- **guest:** Browse only

