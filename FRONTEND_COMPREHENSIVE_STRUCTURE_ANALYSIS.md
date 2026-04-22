# HonestNeed Frontend - Comprehensive Structure Analysis
**Generated: April 6, 2026**

## Executive Summary
The HonestNeed frontend is built with **Next.js 16.2** (App Router), **TypeScript**, **React Hook Form**, **TanStack React Query v5**, **Zustand** state management, and **Styled Components**. It implements JWT-based authentication with role-based access control (Admin/Creator/Supporter).

---

## 1. ROUTE STRUCTURE (Next.js App Router)

### Authentication Routes (Public, with redirect if authenticated)
```
/(auth)/
  ├── login/                           [POST /auth/login]
  ├── register/                        [POST /auth/register]
  ├── forgot-password/                 [POST /auth/request-password-reset]
  ├── reset-password/[token]           [GET /auth/verify-reset-token, POST /auth/reset-password]
  └── layout.tsx                       (Auth layout wrapper)
```

### Public Campaign Browsing Routes (No auth required)
```
/(campaigns)/
  ├── campaigns/                       [GET /campaigns - lists with filters]
  │   ├── page.tsx                     (Campaign browse/discovery page)
  │   ├── [id]/                        [GET /campaigns/{id}]
  │   │   ├── page.tsx                 (Campaign detail view)
  │   │   ├── donate/                  (Donation page within campaign)
  │   │   └── analytics/               [GET /campaigns/{id}/analytics - QR analytics]
  │   └── new/                         (Redirects to create if authenticated)
  └── layout.tsx
```

### Creator Dashboard Routes (Creator role required)
```
/(creator)/
  ├── dashboard/                       [GET /campaigns - creator's campaigns]
  │   └── page.tsx                     (Creator dashboard with campaign list)
  ├── campaigns/
  │   ├── new/                         (Campaign creation wizard)
  │   │   └── page.tsx                 [POST /campaigns - multipart]
  │   ├── [id]/                        (Single campaign management)
  │   │   └── edit/                    [PATCH /campaigns/{id}]
  │   │       └── page.tsx             (Edit draft campaign)
  │   └── layout.tsx
  ├── settings/
  │   └── page.tsx                     (Creator profile/settings)
  └── layout.tsx                        (Creator role guard)
```

### Supporter Dashboard Routes (Supporter role required)
```
/(supporter)/
  ├── donations/                       [GET /donations - supporter's donations]
  │   └── page.tsx
  ├── shares/                          [GET /shares - supporter's shares/referrals]
  │   └── page.tsx
  ├── sweepstakes/                     [GET /sweepstakes/my-entries, /sweepstakes/my-winnings]
  │   └── page.tsx
  └── layout.tsx                        (Supporter role guard)
```

### Admin Dashboard Routes (Admin role required)
```
/admin/
  ├── dashboard/                       [GET /admin/overview, /admin/activity-feed, /admin/alerts]
  │   └── page.tsx
  ├── campaigns/                       [GET /admin/campaigns/moderation]
  │   └── page.tsx
  ├── users/                           [GET /admin/users, /admin/users/{id}]
  │   └── page.tsx
  ├── transactions/                    [GET /admin/transactions, /admin/transactions/{id}]
  │   └── page.tsx
  ├── manage-sweepstakes/              [GET /admin/sweepstakes/stats, /admin/sweepstakes/drawings]
  │   └── page.tsx
  ├── settings/                        [GET /admin/settings, PATCH /admin/settings]
  │   └── page.tsx
  └── layout.tsx                        (Admin role guard)
```

### Error & Special Pages
```
/
  ├── page.tsx                         (Homepage/landing)
  ├── layout.tsx                       (Root layout - all routes)
  ├── unauthorized.tsx                 (Role access denied)
  ├── error.tsx                        (Error boundary)
  ├── not-found.tsx                    (404 page)
  ├── auth-hydrator.tsx                (Client-side auth initialization)
  └── providers.tsx                    (React Query, Zustand, styled-components)
```

---

## 2. API ENDPOINTS (Grouped by Feature)

### Base URL Configuration
- **Development**: `http://localhost:3001/api`
- **Production**: `process.env.NEXT_PUBLIC_API_URL`
- **Prefix**: All endpoints shown WITHOUT `/api` prefix in service layer (apiClient already includes it)
- **Auth**: Bearer token in `Authorization` header (set by request interceptor)

---

## 2.1 AUTHENTICATION ENDPOINTS

| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---------|----------|---------|
| `/auth/login` | POST | ❌ | `{email, password}` | `{user, token}` | Login user |
| `/auth/register` | POST | ❌ | `{email, displayName, password}` | `{user, token}` | Register new user |
| `/auth/request-password-reset` | POST | ❌ | `{email}` | `{message}` | Request reset email |
| `/auth/verify-reset-token/{token}` | GET | ❌ | - | `{email}` | Verify reset token validity |
| `/auth/reset-password` | POST | ❌ | `{token, password}` | `{message}` | Reset password |
| `/auth/check-email` | POST | ❌ | `{email}` | `{exists: boolean}` | Check email availability |
| `/auth/logout` | POST | ✅ | - | `{success}` | Logout (clear backend token) |

**Token Storage**: `localStorage.authToken`
**User Object**: `{id, email, name, role, avatar?}` stored in authStore (Zustand)

---

## 2.2 CAMPAIGN MANAGEMENT ENDPOINTS

### Supporter/Public - Campaign Discovery
| Endpoint | Method | Auth | Request Params | Response | Purpose |
|----------|--------|------|---|---|---|
| `/campaigns` | GET | ❌ | `page, limit, search?, needTypes?, location?, radius?, scope?, minGoal?, maxGoal?, status?, sort?` | `{campaigns[], total, page, limit, totalPages}` | Browse campaigns with filters |
| `/campaigns/{id}` | GET | ❌ | - | `CampaignDetail` | View single campaign |
| `/campaigns/{id}/analytics` | GET | ❌ | - | `{campaignId, totalDonations, totalRaised, uniqueDonors, totalShares, sharesByChannel, donationsByDate}` | Get campaign analytics (QR scans, etc.) |
| `/campaigns/trending` | GET | ❌ | `limit?` | `{campaigns[]}` | Get trending campaigns |
| `/campaigns/related` | GET | ❌ | `excludeId, needType, limit?` | `{campaigns[]}` | Get related campaigns by type |
| `/campaigns/need-types` | GET | ❌ | - | `[{id, name, count}]` | Get categories for filters |

### Creator - Campaign Creation & Management
| Endpoint | Method | Auth | Request Format | Response | Purpose |
|----------|--------|------|---|---|---|
| `/campaigns` | POST | ✅ | **FormData** (multipart) with fields: `title, description, category, location, campaignType` + type-specific fields + `image` (File, optional) | `{id, campaign: CampaignDetail}` | Create campaign |
| `/campaigns/{id}` | PATCH | ✅ | FormData or JSON | `CampaignDetail` | Update draft campaign |
| `/campaigns/{id}/publish` | POST | ✅ | - | `CampaignDetail` | Activate draft → active |
| `/campaigns/{id}/pause` | POST | ✅ | - | `CampaignDetail` | Pause active campaign |
| `/campaigns/{id}/unpause` | POST | ✅ | - | `CampaignDetail` | Unpause paused campaign |
| `/campaigns/{id}/complete` | POST | ✅ | - | `CampaignDetail` | Complete campaign |
| `/campaigns/{id}/increase-goal` | POST | ✅ | `{newGoal}` | `CampaignDetail` | Increase fundraising goal |
| `/campaigns/{id}` | DELETE | ✅ | - | `{success}` | Delete draft campaign |

**Campaign Type-Specific Fields in POST/PATCH:**
- **Fundraising**: `goalAmount` (cents), `duration`, `tags` (CSV), `paymentMethods` (JSON array)
- **Sharing**: `meterType`, `platforms` (CSV), `rewardPerShare` (cents), `budget` (cents), `maxShares`

---

## 2.3 DONATION ENDPOINTS

### Supporter - Donations
| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/campaigns/{campaignId}/donations` | POST | ✅ | `{amount (cents), paymentMethod, screenshotProof?}` | `Donation` | Make donation |
| `/donations` | GET | ✅ | `page?, limit?` | `{donations[], total, pages}` | List my donations |
| `/donations/{donationId}` | GET | ✅ | - | `Donation` | Get donation details |
| `/campaigns/{campaignId}/donations/metrics` | GET | ❌ | - | `{campaignId, totalDonations, totalRaised, avgDonation, topDonor?, donationsByDate[]}` | Campaign donation metrics |
| `/donations/stats` | GET | ✅ | - | `{totalDonations, totalAmount, averageDonation, recentDonations[]}` | User's donation statistics |

### Admin - Donation Management
| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/admin/campaigns/{campaignId}/donations` | GET | ✅ | `page, limit, status?` | `{donations[], total, pages}` | Get all donations for campaign |
| `/admin/donations/{donationId}/verify` | POST | ✅ | - | `Donation` | Verify pending donation |
| `/admin/donations/{donationId}/reject` | POST | ✅ | `{reason}` | `Donation` | Reject donation |

**Donation Object Structure:**
```javascript
{
  transactionId: string,
  id: string,
  campaignId: string,
  campaignTitle: string,
  donorId: string,
  donorEmail: string,
  donorName: string,
  amount: number,           // In cents (gross)
  platformFee: number,      // In cents (20% of gross)
  netAmount: number,        // In cents (gross - fee)
  paymentMethod: {
    type: 'venmo' | 'paypal' | 'cashapp' | 'bank' | 'crypto' | 'other',
    // Dynamic fields based on type
  },
  status: 'pending' | 'verified' | 'rejected',
  statusReason?: string,
  createdAt: string,
  verifiedAt?: string
}
```

---

## 2.4 SHARING/REFERRAL ENDPOINTS

| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/campaigns/{campaignId}/share/generate` | POST | ✅ | - | `{shareLink, referralId, qrCode}` | Generate shareable referral link |
| `/campaigns/{campaignId}/share` | POST | ✅ | `{channel}` | `ShareRecord` | Record share action |
| `/campaigns/{campaignId}/share/metrics` | GET | ❌ | - | `{campaignId, totalShares, sharesByChannel, uniqueShareholders, referralLinkClicks, shareLink, referralId}` | Campaign share metrics |
| `/shares` | GET | ✅ | `page?, limit?` | `{shares[], stats, total, pages}` | List my shares |
| `/shares/stats` | GET | ✅ | - | `{totalShares, sharesByChannel, referrals, conversions, rewardEarned?}` | User share statistics |
| `/share/qrcode` | POST | ✅ | `{shareLink}` | `{url, dataUrl (base64)}` | Generate QR code for share link |
| `/referrals/{referralId}/click` | POST | ✅ | - | `{success}` | Track referral link clicks |
| `/referrals/history` | GET | ✅ | `page?, limit?` | `{referrals[], total, pages}` | Get referral history |

**Platforms Supported**: facebook, twitter, linkedin, email, whatsapp, link (6 max per campaign)

---

## 2.5 SWEEPSTAKES ENDPOINTS

| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/sweepstakes/my-entries` | GET | ✅ | - | `SweepstakesStats` | Get user's current entries & stats |
| `/sweepstakes/campaigns/{campaignId}/entries` | GET | ✅ | - | `{entries, currentDrawing}` | Get entry breakdown by campaign |
| `/sweepstakes/current-drawing` | GET | ✅ | - | `UserDrawing` | Get current drawing info |
| `/sweepstakes/my-winnings` | GET | ✅ | `page?, limit?` | `{winnings[], total, pages}` | Get past winnings |
| `/sweepstakes/leaderboard` | GET | ❌ | `limit?` | `Winner[]` | Get current leaderboard |
| `/sweepstakes/winnings/{winningId}/claim` | POST | ✅ | `{paymentMethod}` | `{success, transactionId}` | Claim prize |

### Admin Sweepstakes
| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/admin/sweepstakes/stats` | GET | ✅ | - | `{currentDrawing, upcomingDrawings, totalEarnings}` | Dashboard stats |
| `/admin/sweepstakes/drawings` | GET | ✅ | `page?, limit?` | `{drawings[], total, pages}` | Past drawings history |
| `/admin/sweepstakes/drawings/{drawingId}` | GET | ✅ | - | `{drawing, winners[], entryDistribution[]}` | Drawing details |
| `/admin/sweepstakes/drawings/{drawingId}/force` | POST | ✅ | - | `{success, winnersCount, totalPrizePool}` | Force drawing (dev/admin) |

**Entry Types**: campaign_creation (1 entry), donation (1 entry per $10), share (1 entry per share)

---

## 2.6 VOLUNTEER SYSTEM ENDPOINTS

| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/volunteers/offers` | POST | ✅ | `{campaignId, title, description, skillsOffered[], availability, contactMethod, screenshotProof?}` | `VolunteerOffer` | Submit volunteer offer |
| `/campaigns/{campaignId}/volunteer-offers` | GET | ✅ | `status?` | `VolunteerOffer[]` | Get offers for campaign (creator) |
| `/volunteers/offers/{volunteerId}` | GET | ✅ | - | `VolunteerOffer` | Get offer details |
| `/volunteers/offers/{volunteerId}/accept` | PATCH | ✅ | `{notes?}` | `VolunteerOffer` | Accept offer (creator) |
| `/volunteers/offers/{volunteerId}/decline` | PATCH | ✅ | `{declineReason, notes?}` | `VolunteerOffer` | Decline offer (creator) |
| `/volunteers/offers/{volunteerId}/complete` | PATCH | ✅ | `{notes?}` | `VolunteerOffer` | Mark complete (creator) |
| `/volunteers/my-offers` | GET | ✅ | `page?, limit?, status?` | `{offers[], total, pages}` | Get my submitted offers |
| `/campaigns/{campaignId}/volunteer-metrics` | GET | ❌ | - | `CampaignVolunteerMetrics` | Campaign volunteer stats |
| `/volunteers/statistics` | GET | ✅ | - | `VolunteerStatistics` | User volunteer stats |

**Offer Statuses**: pending, accepted, declined, completed

---

## 2.7 PAYMENT METHOD ENDPOINTS

| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/api/payment-methods` | GET | ✅ | - | `PaymentMethod[]` | List my payment methods |
| `/api/payment-methods/primary` | GET | ✅ | - | `PaymentMethod` | Get primary method |
| `/api/payment-methods` | POST | ✅ | `PaymentMethod` | `PaymentMethod` | Add method |
| `/api/payment-methods/{id}` | PATCH | ✅ | `Partial<PaymentMethod>` | `PaymentMethod` | Update method |
| `/api/payment-methods/{id}` | DELETE | ✅ | - | `null` | Delete method |
| `/api/payment-methods/{id}/set-primary` | PATCH | ✅ | - | `PaymentMethod` | Set as primary |
| `/api/payment-methods/{id}/verify` | POST | ✅ | - | `null` | Verify with test transaction |
| `/api/payment-methods/supported` | GET | ❌ | - | `[{type, label, emoji, icon}]` | Get supported types |

**Types**: paypal, venmo, cashapp, bank, crypto, other

---

## 2.8 ADMIN - USERS & MODERATION

### User Management
| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/admin/users` | GET | ✅ | `page?, limit?, role?, verificationStatus?, isBlocked?, search?` | `{users[], total, page, limit}` | List users |
| `/admin/users/{userId}` | GET | ✅ | - | `AdminUserProfile` | Get detailed profile |
| `/admin/users/{userId}/verify` | PATCH | ✅ | `{notes?}` | `AdminUserProfile` | Verify user |
| `/admin/users/{userId}/reject-verification` | PATCH | ✅ | `{reason}` | `AdminUserProfile` | Reject verification |
| `/admin/users/{userId}/block` | PATCH | ✅ | `{reason, blockReason}` | `AdminUserProfile` | Block user |
| `/admin/users/{userId}/unblock` | PATCH | ✅ | - | `AdminUserProfile` | Unblock user |
| `/admin/users/{userId}/reports` | GET | ✅ | - | `UserReport[]` | Get reports against user |
| `/admin/users/{userId}/export` | GET | ✅ | `format?` | File/PDF | Export user data |
| `/admin/users/{userId}` | DELETE | ✅ | `{reason?, permanent?}` | `{success}` | Delete user account |
| `/admin/users/statistics` | GET | ✅ | - | `{totalUsers, totalCreators, totalSupporters, verificationRate}` | User statistics |

### Reporting & Moderation
| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/admin/reports` | GET | ✅ | `page?, limit?, status?` | `{reports[], total, pages}` | List pending reports |
| `/admin/reports` | POST | ✅ | `{reportedUserId, reason, description}` | `UserReport` | File report against user |
| `/admin/reports/{reportId}/resolve` | PATCH | ✅ | `{resolution, notes}` | `UserReport` | Resolve report |

### Campaign Moderation
| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/admin/campaigns/moderation` | GET | ✅ | `page?, limit?, status?, sort?` | `{campaigns[], total, page, limit}` | Moderation queue |
| `/admin/campaigns/{campaignId}/flag` | POST | ✅ | `{reason, notes?}` | `{success}` | Flag campaign |
| `/admin/campaigns/{campaignId}/unflag` | POST | ✅ | - | `{success}` | Remove flag |
| `/admin/campaigns/{campaignId}/suspend` | POST | ✅ | `{reason, duration?}` | `{success}` | Suspend campaign |
| `/admin/campaigns/{campaignId}/unsuspend` | POST | ✅ | - | `{success}` | Lift suspension |

---

## 2.9 ADMIN - OVERVIEW & SETTINGS

| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/admin/overview` | GET | ✅ | - | `AdminOverviewStats` | Dashboard stats |
| `/admin/activity-feed` | GET | ✅ | `limit?` | `ActivityFeedItem[]` | Recent activity log |
| `/admin/alerts` | GET | ✅ | - | `AdminAlert[]` | System alerts |
| `/admin/transactions` | GET | ✅ | `page?, limit?, status?, campaignId?` | `TransactionList` | All transactions |
| `/admin/transactions/{transactionId}` | GET | ✅ | - | `Transaction` | Transaction details |
| `/admin/transactions/{transactionId}/verify` | POST | ✅ | - | `{success}` | Verify transaction |
| `/admin/transactions/{transactionId}/reject` | POST | ✅ | `{reason}` | `{success}` | Reject transaction |
| `/admin/settings` | GET | ✅ | - | `AdminSettings` | Get platform settings |
| `/admin/settings` | PATCH | ✅ | `Partial<AdminSettings>` | `AdminSettings` | Update settings |

### Content Management
| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/admin/categories` | GET | ✅ | - | `CategoryGroup[]` | List categories |
| `/admin/categories` | POST | ✅ | `{name, description, icon}` | `CategoryGroup` | Create category |
| `/admin/categories/{categoryId}` | PATCH | ✅ | `Partial<CategoryGroup>` | `CategoryGroup` | Update category |
| `/admin/categories/{categoryId}` | DELETE | ✅ | - | `{success}` | Delete category |
| `/admin/categories/reorder` | POST | ✅ | `{categories: []}` | `{success}` | Reorder categories |
| `/admin/content/{type}` | GET | ✅ | - | Object | Get content page (hero, about, faq) |
| `/admin/content/{type}` | PATCH | ✅ | Object | Object | Update content page |
| `/admin/content/{type}/history` | GET | ✅ | - | `{versions[]}` | Content version history |
| `/admin/content/{type}/restore` | POST | ✅ | `{version}` | Object | Restore previous version |
| `/admin/settings/maintenance` | PATCH | ✅ | `{maintenanceMode, message?}` | `{success}` | Toggle maintenance mode |
| `/admin/settings/changelog` | GET | ✅ | `limit?` | `{changes[]}` | Settings changelog |
| `/admin/settings/reset-to-defaults` | POST | ✅ | - | `{success}` | Reset settings |
| `/admin/settings/validate` | POST | ✅ | `settings` | `{valid, errors?}` | Validate settings |

---

## 2.10 CAMPAIGN UPDATES ENDPOINTS

| Endpoint | Method | Auth | Request | Response | Purpose |
|----------|--------|------|---|---|---|
| `/campaigns/{campaignId}/updates` | GET | ❌ | - | `CampaignUpdate[]` | Get campaign updates |
| `/campaigns/{campaignId}/updates/{updateId}` | GET | ❌ | - | `CampaignUpdate` | Get single update |
| `/campaigns/{campaignId}/updates` | POST | ✅ | `{title, content, imageUrl?}` | `CampaignUpdate` | Create update |
| `/campaigns/{campaignId}/updates/{updateId}` | PUT | ✅ | `Partial<CreateUpdatePayload>` | `CampaignUpdate` | Update post |
| `/campaigns/{campaignId}/updates/{updateId}` | DELETE | ✅ | - | `void` | Delete update |

---

## 3. REQUEST/RESPONSE DATA STRUCTURES

### 3.1 Authentication & User Objects

```typescript
// User Object (in localStorage and authStore)
interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'creator' | 'supporter' | 'guest'
  avatar?: string
}

// Auth Response
interface AuthResponse {
  success: boolean
  data?: { user: User; token: string }
  error?: string
  message?: string
}

// Token Storage
localStorage.setItem('auth_token', token)
localStorage.setItem('user', JSON.stringify(user))
```

---

### 3.2 Campaign Objects

```typescript
// Campaign (Listing)
interface Campaign {
  id: string
  title: string                // 5-200 chars
  description: string          // 20-2000 chars
  image: { url: string; alt: string }
  creatorId: string
  creatorName: string
  creatorAvatar?: string
  needType: string
  status: 'draft' | 'active' | 'paused' | 'completed' | 'rejected'
  goalAmount: number           // In CENTS
  raisedAmount: number         // In CENTS
  donationCount: number
  shareCount: number
  supporterCount: number
  trending: boolean
  geographicScope?: 'local' | 'regional' | 'national' | 'global'
  location?: string
  createdAt: string
  updatedAt: string
}

// Campaign Detail
interface CampaignDetail extends Campaign {
  fullDescription: string
  paymentMethods: Array<{
    type: string
    username?: string  // Venmo
    email?: string     // PayPal
    cashtag?: string   // CashApp
    routingNumber?: string  // Bank
    accountNumber?: string  // Bank
    walletAddress?: string  // Crypto
    details?: string   // Other
  }>
  category: string
  tags: string[]
  duration: number              // Days: 7-90
  endDate: string
  scopeDescription?: string
  relatedCampaigns: Campaign[]
}

// Campaign Creation (FormData for multipart)
// Fundraising-specific fields:
// - goalAmount (number, in dollars before conversion to cents)
// - duration (7-90 days)
// - tags (CSV string on wire, array in form)
// - paymentMethods (JSON array with discriminated union)
// 
// Sharing-specific fields:
// - meterType ('impression_meter' | 'engagement_meter' | 'conversion_meter' | 'custom_meter')
// - platforms (CSV string on wire, max 8)
// - rewardPerShare (number, in dollars)
// - budget (number, in dollars, $10-$1M)
// - maxShares (optional)
```

---

### 3.3 Donation Objects

```typescript
interface Donation {
  transactionId: string
  id: string
  campaignId: string
  campaignTitle: string
  donorId: string
  donorEmail: string
  donorName: string
  amount: number               // In CENTS (gross, user input)
  platformFee: number         // In CENTS (20% of gross)
  netAmount: number           // In CENTS (amount - fee)
  paymentMethod: {
    type: 'venmo' | 'paypal' | 'cashapp' | 'bank' | 'crypto' | 'other'
    // Type-specific fields...
  }
  status: 'pending' | 'verified' | 'rejected'
  statusReason?: string
  createdAt: string
  verifiedAt?: string
}

interface DonationAmount {
  gross: number               // Cents
  platformFee: number         // Cents (20%)
  net: number                 // Cents (gross - fee)
}
```

**Platform Fee**: 20% calculated as `Math.round(gross * 0.2)`

---

### 3.4 Sharing/Referral Objects

```typescript
interface ShareRecord {
  id: string
  campaignId: string
  userId: string
  channel: 'facebook' | 'twitter' | 'linkedin' | 'email' | 'whatsapp' | 'link'
  shareLink: string
  referralId: string
  createdAt: string
}

interface ReferralStats {
  totalShares: number
  sharesByChannel: Record<string, number>
  referrals: number
  conversions: number
  rewardEarned?: number       // In cents
}

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

### 3.5 Sweepstakes Objects

```typescript
interface SweepstakesEntry {
  id: string
  userId: string
  campaignId?: string
  entryType: 'campaign_creation' | 'donation' | 'share'
  count: number
  earnedAt: string
}

interface SweepstakesEntryBreakdown {
  campaignCreation: number     // 1 per campaign created
  donations: number            // 1 per $10 donated
  donationAmount: number       // In cents
  shares: number               // 1 per share
  total: number
}

interface Drawing {
  id: string
  targetDate: string
  drawDate?: string
  prize: number                // In cents
  winners: number
  currentEntries: number
  status: 'pending' | 'drawn' | 'completed'
  createdAt: string
}

interface Winnings {
  id: string
  userId: string
  drawingId: string
  drawingDate: string
  prize: number               // In cents
  status: 'won_unclaimed' | 'won_claimed'
  claimDate?: string
  claimedVia?: PaymentMethod
  createdAt: string
}
```

---

### 3.6 Volunteer Objects

```typescript
interface VolunteerOffer {
  id: string
  campaignId: string
  campaignTitle: string
  volunteerId: string         // User ID of volunteer
  volunteerName: string
  volunteerEmail: string
  volunteerPhone?: string
  title: string              // "Helping with construction"
  description: string
  skillsOffered: Array<{
    name: string
    yearsOfExperience?: number
  }>
  availability: {
    startDate: string        // ISO date
    endDate: string
    hoursPerWeek: number
  }
  contactMethod: 'email' | 'phone' | 'inApp'
  status: 'pending' | 'accepted' | 'declined' | 'completed'
  createdAt: string
  acceptedAt?: string
  declinedAt?: string
  declineReason?: string
  completedAt?: string
  notes?: string
}

interface VolunteerStatistics {
  totalOffers: number
  acceptedOffers: number
  pendingOffers: number
  completedOffers: number
  averageHoursPerWeek: number
  topSkillsNeeded: Array<{ skill: string; demandCount: number }>
}
```

---

### 3.7 Analytics Objects

```typescript
interface CampaignAnalytics {
  campaignId: string
  totalDonations: number
  totalRaised: number        // In cents
  uniqueDonors: number
  totalShares: number
  sharesByChannel: Record<string, number>
  donationsByDate: Array<{
    date: string            // YYYY-MM-DD
    amount: number          // In cents
    count: number
  }>
  lastUpdated: string
}

interface AdminOverviewStats {
  activeCampaigns: number
  totalRevenue: number       // In cents
  monthlyRevenue: number     // In cents
  pendingTransactions: number
  totalPendingAmount: number // In cents
  nextDrawingDate: string
  sweepstakesEntryCount: number
  platformUptime: number     // Percentage
}
```

---

## 4. AUTHENTICATION FLOW & TOKEN USAGE

### 4.1 Initial Authentication (Login)
```
1. User enters email + password on /login
2. POST /auth/login { email, password }
3. Backend returns { user, token }
4. Frontend stores:
   - token → localStorage.authToken
   - user → authStore (Zustand) + localStorage.user
5. useAuthStore.setAuth(user, token)
6. Redirect to /dashboard (or stored redirect URL)
```

### 4.2 Token Lifecycle Management
```typescript
// Request Interceptor (apiClient.ts)
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Token auto-attached to ALL authenticated requests
// Prefix: "Bearer {token}"
```

### 4.3 Middleware Protection
```typescript
// Routes requiring authentication:
const PROTECTED_ROUTES = ['/dashboard', '/creator', '/admin', '/profile', '/donations']

// Admin-only routes:
const ADMIN_ROUTES = ['/admin']

// Creator-only routes:
const CREATOR_ROUTES = ['/creator']

// If no token: redirect to /login?redirect={pathname}
// If token but wrong role: redirect to /unauthorized
```

### 4.4 User Role-Based Permissions
```typescript
// From authStore.ts
const permissionMap = {
  admin: ['all'],
  creator: ['create_campaign', 'view_analytics', 'manage_campaigns'],
  supporter: ['donate', 'share'],
  guest: ['browse']
}

// Check: user.hasPermission('create_campaign')
```

### 4.5 Logout
```
1. POST /auth/logout (optional, clears backend tokens)
2. authStore.clearAuth() - removes from Zustand + localStorage
3. Redirect to /login
```

---

## 5. STATE MANAGEMENT

### 5.1 Zustand Stores

#### Auth Store (`store/authStore.ts`)
```typescript
interface AuthStore {
  user: User | null              // Current logged-in user
  token: string | null           // JWT token
  isAuthenticated: boolean
  isLoading: boolean
  
  setAuth(user, token): void     // Set user + token
  clearAuth(): void              // Logout
  updateUser(updates): void      // Update user in store
  hasRole(role): boolean         // Check role
  hasPermission(permission): boolean // Check permission
}

// Usage: const { user, token, setAuth } = useAuthStore()
// Persisted: localStorage ('auth_token', 'user')
```

#### Filter Store (`store/filterStore.ts`)
```typescript
interface FilterStore {
  filters: {
    searchQuery: string
    needTypes: string[]
    location?: string
    locationRadius?: number
    geographicScope?: 'local' | 'regional' | 'national' | 'global'
    minGoal?: number (cents)
    maxGoal?: number (cents)
    status: 'all' | 'active' | 'completed' | 'paused'
    sortBy: 'trending' | 'newest' | 'goalAsc' | 'goalDesc' | 'raised'
    page: number
    limit: number
  }
  
  // Setters and state management methods
  setSearchQuery(query): void
  setNeedTypes(types): void
  setLocation(location, radius): void
  setStatus(status): void
  setSortBy(sort): void
  resetFilters(): void
  getQueryParams(): Record<string, any>
}

// Persisted: localStorage ('campaign-filters')
```

#### Wizard Store (`store/wizardStore.ts`)
```typescript
interface WizardState {
  currentStep: number              // 1-4
  formData: {
    campaignType: 'fundraising' | 'sharing' | null
    title: string
    description: string
    category: string
    location: string
    image: File | null
    fundraisingData: { goalAmount, duration, tags, paymentMethods }
    sharingData: { meterType, platforms, rewardPerShare, budget, maxShares }
  }
  errors: Record<string, string>
  isSubmitting: boolean
  draftSaved: boolean
  
  // Actions
  setCurrentStep(step): void
  updateFormData(data): void
  setImage(file, preview): void
  setFundraisingData(data): void
  setSharingData(data): void
  saveDraft(): void
  loadDraft(): boolean
  clearDraft(): void
  resetWizard(): void
}

// Persisted: localStorage ('campaign-wizard-draft')
```

#### Donation Wizard Store (likely)
```typescript
// Used for multi-step donation process
// Similar to campaign wizard but simpler
```

---

### 5.2 React Query (TanStack Query v5)

#### Query Key Factory Pattern
```typescript
// Example: Campaign Keys
const campaignKeys = {
  all: ['campaigns'],
  lists: () => [...campaignKeys.all, 'list'],
  list: (page, limit, filters) => [...campaignKeys.lists(), { page, limit, ...filters }],
  details: () => [...campaignKeys.all, 'detail'],
  detail: (id) => [...campaignKeys.details(), id],
  analytics: () => [...campaignKeys.all, 'analytics'],
  analyticsDetail: (id) => [...campaignKeys.analytics(), id],
  trending: () => [...campaignKeys.all, 'trending'],
}
```

#### Cache Strategies
```typescript
// Lists
staleTime: 10 * 60 * 1000      // 10 minutes
gcTime: 30 * 60 * 1000         // 30 minutes garbage collection

// Details
staleTime: 5 * 60 * 1000       // 5 minutes
gcTime: 15 * 60 * 1000         // 15 minutes

// Analytics
staleTime: 3 * 60 * 1000       // 3 minutes (live data)
refetchInterval: 5 * 60 * 1000 // Auto-refetch every 5 minutes

// Invalidation on mutations
queryClient.invalidateQueries(campaignKeys.lists())
queryClient.invalidateQueries(campaignKeys.details())
```

---

## 6. COMPONENT HIERARCHY & KEY FEATURES

### 6.1 Page Components by Route
```
App Root (layout.tsx)
├── Navbar (layout/Navbar.tsx)
├── Main Content
│   ├── (auth)/login → LoginPage
│   ├── (auth)/register → RegisterPage
│   ├── (campaigns)/campaigns → CampaignBrowsePage
│   │   └── SearchBar
│   │   └── FiltersSidebar
│   │   └── CampaignGrid
│   ├── (campaigns)/campaigns/[id] → CampaignDetailPage
│   │   └── CampaignDetail
│   │   └── DonationForm
│   │   └── ShareButtons
│   ├── (creator)/dashboard → CreatorDashboard
│   │   └── StatsCards
│   │   └── CampaignsList
│   │   └── ManagementActions (pause, complete, delete)
│   ├── (creator)/campaigns/new → CampaignWizard (4 steps)
│   │   ├── Step 1: Type Selection
│   │   ├── Step 2: Basic Info
│   │   ├── Step 3: Type-Specific Details
│   │   └── Step 4: Review & Publish
│   ├── (creator)/campaigns/[id]/edit → EditCampaignPage
│   ├── (supporter)/donations → SupporterDonationsPage
│   ├── (supporter)/shares → SupporterSharesPage
│   ├── (supporter)/sweepstakes → SweepstakesPage
│   ├── admin/dashboard → AdminDashboard
│   ├── admin/users → AdminUsersPage
│   ├── admin/campaigns → AdminCampaignsPage
│   ├── admin/transactions → AdminTransactionsPage
│   └── admin/settings → AdminSettingsPage
└── Footer (layout/Footer.tsx)
```

### 6.2 Shared Component Library
```
components/
├── ui/
│   ├── Button.tsx             (CTA buttons with variants)
│   ├── Card.tsx               (Container component)
│   ├── Badge.tsx              (Status badges, tags)
│   ├── Modal.tsx              (Dialog/modal wrapper)
│   ├── FormField.tsx          (Form field wrapper with errors)
│   ├── Link.tsx               (Next.js Link wrapper)
│   ├── LoadingSpinner.tsx      (Spinner animation)
│   └── Divider.tsx            (Separator)
├── layout/
│   ├── Navbar.tsx             (Top navigation)
│   └── Footer.tsx             (Footer)
├── auth/
│   ├── LoginForm.tsx
│   ├── RegisterForm.tsx
│   ├── ForgotPasswordForm.tsx
│   └── PasswordStrengthMeter.tsx
├── campaign/
│   ├── CampaignGrid.tsx       (Campaign card grid)
│   ├── CampaignCard.tsx       (Individual campaign card)
│   ├── CampaignDetail.tsx     (Full campaign view)
│   ├── CampaignWizard.tsx     (4-step creation)
│   ├── CampaignBasicForm.tsx  (Step 2 reusable)
│   ├── CampaignGoalsForm.tsx  (Step 3 reusable)
│   ├── SearchBar.tsx          (Campaign search)
│   ├── FiltersSidebar.tsx     (Campaign filters)
│   ├── AddPaymentMethodForm.tsx
│   └── CampaignActions.tsx    (Status management buttons)
├── donation/
│   ├── DonationWizard.tsx     (Multi-step donation)
│   ├── DonationForm.tsx       (Amount + payment method)
│   ├── PaymentMethodSelector.tsx
│   └── ScreenshotUploader.tsx (Proof upload)
├── sweepstakes/
│   ├── SweepstakesOverview.tsx
│   ├── LeaderboardComponent.tsx
│   ├── PrizeClaimForm.tsx
│   └── EntryBreakdown.tsx
├── admin/
│   ├── AdminDashboard.tsx
│   ├── AdminUsersTable.tsx
│   ├── AdminCampaignsTable.tsx
│   ├── ModerationActions.tsx
│   └── AdminSettings.tsx
└── ProtectedRoute.tsx          (Role-based access wrapper)
```

### 6.3 Feature-Specific Components

**Campaign Creation Wizard**
- Page: `(creator)/campaigns/new/page.tsx`
- Component: `CampaignWizard.tsx`
- Steps:
  1. Type Selection (Fundraising vs. Sharing)
  2. Basic Info (Title, description, image, category)
  3. Type-Specific Details (Goals/platforms/rewards)
  4. Review & Publish
- State: `useWizardStore` (Zustand)
- Validation: `completeCampaignSchema` (Zod)

**Donation Flow**
- Pages: Per-campaign donation or supporter dashboard
- Components: `DonationWizard`, `DonationForm`, `PaymentMethodSelector`
- Payment Methods: Discriminated union (Venmo/@, PayPal/email, CashApp/$, Bank/routing+account, Crypto/wallet, Other/details)
- Fee Calculation: 20% platform fee, frontend calculates gross/fee/net

**Sweepstakes Entry Tracking**
- Entry types: Campaign creation, donation ($10 = 1 entry), share (1 entry/share)
- Display: Leaderboard, user's entries breakdown, prize claims
- Prize claiming: Select payment method from existing methods

**Share/Referral System**
- Per-campaign share links with referral tracking
- Support for 6 channels: Facebook, Twitter, LinkedIn, Email, WhatsApp, Direct Link
- QR code generation for physical flyers
- Metrics: Share count by channel, unique shareholders, referral click tracking

---

## 7. VALIDATION RULES ON FRONTEND FORMS

### 7.1 Authentication Schemas (Zod)

**Login Schema**
```typescript
loginSchema = {
  email: string (email format, lowercase),
  password: string (required)
}
```

**Register Schema**
```typescript
registerSchema = {
  email: string (email format, lowercase),
  displayName: string (2-100 chars, trimmed),
  password: string (
    8+ chars,
    1+ uppercase,
    1+ lowercase,
    1+ digit,
    1+ special char [!@#$%^&*]
  ),
  confirmPassword: string (must match password),
  acceptTerms: boolean (must be true)
}
```

**Forgot/Reset Password**
```typescript
forgotPasswordSchema = {
  email: string (valid email)
}

resetPasswordSchema = {
  password: string (same requirements as register),
  confirmPassword: string (must match)
}
```

---

### 7.2 Campaign Creation Schemas

**Basic Info (Step 2)**
```typescript
{
  title: string (5-200 chars),
  description: string (20-2000 chars),
  category: string (required),
  location: string (optional),
  imageFile: File (optional, max 10MB, JPEG/PNG/WebP)
}
```

**Payment Methods (Discriminated Union)**
```typescript
// Venmo
{ type: 'venmo', username: string (regex: ^@) }

// PayPal
{ type: 'paypal', email: string (valid email) }

// CashApp
{ type: 'cashapp', cashtag: string (regex: ^\$) }

// Bank
{
  type: 'bank',
  routingNumber: string (exactly 9 digits),
  accountNumber: string (9-17 digits)
}

// Crypto
{
  type: 'crypto',
  walletAddress: string (10+ chars),
  cryptoType: 'bitcoin' | 'ethereum' | 'usdc' | 'other'
}

// Other
{ type: 'other', details: string (5+ chars) }
```

**Fundraising Campaign (Step 3)**
```typescript
{
  campaignType: 'fundraising',
  goalAmount: number ($1 - $9,999,999),
  category: string (required),
  tags: string[] (max 10 tags),
  duration: number (7-90 days),
  paymentMethods: array (min 1, max 6)
}
```

**Sharing Campaign (Step 3)**
```typescript
{
  campaignType: 'sharing',
  meterType: 'impression_meter' | 'engagement_meter' | 'conversion_meter' | 'custom_meter',
  platforms: string[] (min 1, max 8),
  rewardPerShare: number ($0.10 - $100),
  budget: number ($10 - $1,000,000),
  maxShares: number (optional)
}
```

---

### 7.3 Donation Form Validation

```typescript
{
  amount: number (
    $0.01 - $9,999,999,
    converted to cents on submission
  ),
  paymentMethod: PaymentMethod (one of above types),
  screenshotProof: File (optional, upload with FormData)
}
```

**Fee Calculation (Frontend)**
```javascript
const platformFee = Math.round(amount * 0.2) // 20%
const netAmount = amount - platformFee
```

---

### 7.4 Volunteer Offer Validation

```typescript
{
  campaignId: string (required),
  title: string (required),
  description: string (required),
  skillsOffered: Array<{ name: string; yearsOfExperience?: number }> (min 1),
  availability: {
    startDate: string (ISO date),
    endDate: string (ISO date >= startDate),
    hoursPerWeek: number (1+)
  },
  contactMethod: 'email' | 'phone' | 'inApp',
  screenshotProof: File (optional)
}
```

---

### 7.5 Form Field Patterns

- **Password Strength Meter**: Visual feedback (0-4 score) with color coding
- **Email Uniqueness**: Real-time check via `/auth/check-email`
- **Category Tree**: 10 groups with 100+ subcategories
- **Tags Input**: Chips component, max 10, remove individual tags
- **Dynamic Fields**: Campaign type determines visible fields (discriminated union)
- **File Input**: Image validation (type + size) before submission
- **Currency Input**: Display dollars, submit cents

---

## 8. ERROR HANDLING PATTERNS

### 8.1 API Error Handling

**Request Interceptor (apiClient.ts)**
```typescript
// Exponential backoff retry (3 attempts)
// Retries on: network errors, 5xx server errors
// Does NOT retry on: 4xx client errors (immediately rejected)

const getExponentialBackoffDelay = (retryCount: number) => {
  const exponentialDelay = 1000 * Math.pow(2, retryCount) // 1s, 2s, 4s
  const jitter = Math.random() * 1000
  return exponentialDelay + jitter
}

// After 3 failed retries, error passed to response handler
```

**Response Error Handler**
```typescript
const handleApiError = (error: AxiosError) => {
  const message = error.response?.data?.message || error.message
  
  // Show toast notification
  if (status === 401) {
    // Unauthorized - clear auth
    authStore.clearAuth()
    router.push('/login')
  } else if (status === 403) {
    // Forbidden - show unauthorized page
    router.push('/unauthorized')
  } else if (status >= 500) {
    // Server error - show generic message
    toast.error('Server error. Please try again later.')
  } else {
    // Client error - show specific message
    toast.error(message)
  }
}
```

### 8.2 Form Error Handling

**React Hook Form + Zod**
```typescript
const {
  register,
  handleSubmit,
  formState: { errors },
  watch
} = useForm({
  resolver: zodResolver(loginSchema)
})

// Errors displayed in-field via FormField component
// Validation runs on blur + submit
```

**Custom Error Messages**
```typescript
// Example from authService:
if (message === 'Email already exists') {
  return 'This email is already registered'
} else if (message === 'Rate limited') {
  return 'Too many requests. Please try again later.'
}
```

### 8.3 Component-Level Error Boundaries

**Error Boundary Component** (error.tsx)
```typescript
// Catches errors during rendering, data fetching, server actions
// Displays fallback UI with retry button
// Can be nested per route segment
```

**useQuery Error Handling**
```typescript
const { data, error, isError } = useQuery({
  queryFn: campaignService.getCampaigns,
  retry: 1,  // Retry once before showing error
  onError: (error) => {
    toast.error('Failed to fetch campaigns')
    console.error(error)
  }
})

if (isError) {
  return <ErrorFallback error={error} />
}
```

### 8.4 Service Layer Error Handling

**Pattern: Try-Catch with Standardized Returns**
```typescript
async login(email, password) {
  try {
    const response = await apiClient.post('/auth/login', ...)
    return { success: true, data: response.data }
  } catch (error: any) {
    // Extract message from nested response
    return {
      success: false,
      error: error.response?.data?.message || 'Login failed'
    }
  }
}

// Caller checks success flag and handles error
if (!result.success) {
  throw new Error(result.error)
}
```

### 8.5 Toast Notification Pattern

**Using react-toastify**
```typescript
import { toast } from 'react-toastify'

// Success
toast.success('Campaign created successfully!')

// Error
toast.error('Failed to create campaign: Invalid title')

// Info
toast.info('Campaign paused')

// Top-right position, 5 second auto-close
```

**Mutation Error Handling with Toast**
```typescript
const mutation = useMutation({
  mutationFn: campaignService.createCampaign,
  onSuccess: () => {
    toast.success('Campaign created!')
    queryClient.invalidateQueries(['campaigns'])
  },
  onError: (error) => {
    toast.error(error.message || 'Failed to create campaign')
  }
})
```

### 8.6 Field-Level Validation Feedback

**React Hook Form Integration**
```typescript
<FormField
  label="Email"
  error={errors.email?.message}
  {...register('email')}
/>

// Displays red border + error message below field
// Clears error when user starts typing
```

**Real-time Validation Examples**
```typescript
// Email uniqueness
const emailExists = await checkEmailExists(email)

// Password strength
const strength = evaluatePasswordStrength(password)
// Returns { score: 0-4, label, color, feedback }

// Amount bounds
if (amount < 1 || amount > 9999999) {
  error = 'Amount out of range'
}
```

---

## 9. KEY FRONTEND ASSUMPTIONS ABOUT BACKEND

### 9.1 Data Format Assumptions

**Currency**
- Backend always returns amounts in **CENTS** (not dollars)
- Frontend converts to dollars for display: `amount / 100`
- Frontend converts user input to cents: `amount * 100`
- All monetary fields: goalAmount, raisedAmount, budget, rewardPerShare, donations, fees

**Date/Time**
- ISO 8601 format: `2026-04-06T10:30:00Z`
- Frontend formats for display using date libraries

**Arrays as Strings on Wire**
- Tags: Sent as CSV string `"tag1,tag2,tag3"`, parsed backend
- Platforms: Sent as CSV string `"facebook,twitter,linkedin"`
- Objects: Sent as JSON strings `JSON.stringify({...})`

### 9.2 Business Logic Assumptions

**Campaign Type Immutable After Creation**
- Types: 'fundraising' vs 'sharing'
- Type-specific fields only validated when type selected
- Cannot change campaign type after creation

**Campaign Status Flows**
```
Draft → Active (via /publish)
Active → Paused (via /pause)
Paused → Active (via /unpause)
Active/Paused → Completed (via /complete)
Any → Rejected (admin only)
Draft → Deleted (via /delete, immediately)
```

**Role-Based Access**
- Creators can only edit/manage their own campaigns
- Supporters can only view/manage their own donations & shares
- Admins have all permissions
- Middleware enforces: `/creator/*` → creator role, `/admin/*` → admin role

**Sweepstakes Entries**
- Campaign creation: 1 entry
- Donation: 1 entry per $10 (rounded)
- Share: 1 entry per successful share
- Entries are monthly drawings, prizes in cents

**Platform Fee**
- Hardcoded 20% on all donations
- Calculated frontend: `fee = Math.round(amount * 0.2)`
- Not configurable per campaign
- Admin can change via `/admin/settings`

### 9.3 Authentication & Authorization Assumptions

**JWT Token**
- Stored in localStorage as `auth_token`
- Added to all requests via interceptor: `Bearer {token}`
- No expiration handling visible (assumes long-lived tokens or refresh endpoint)
- Logout clears localStorage

**User Roles**
- Fixed set: admin, creator, supporter, guest
- Set once at registration, can be changed by admin
- Each role has hardcoded permissions in frontend
- Middleware prevents role-mismatch navigation

**Email-Based Registration**
- Email is unique identifier across platform
- Case-insensitive (lowercased before submission)
- Check availability before submission
- Used as username in some places

### 9.4 Integration Assumptions

**QR Code Generation**
- Uses external service: `https://api.qrserver.com/v1/create-qr-code/`
- Frontend generates, doesn't rely on backend QR service
- For PDF exports/flyers

**Payment Methods**
- Multiple types per user
- Can set primary method
- Used for both donations received and prize claims
- Stored securely backend (PCI compliance assumed)

**Image Uploads**
- Max 10MB per image
- Formats: JPEG, PNG, WebP
- Uploaded as multipart/form-data with campaign
- URL returned in response (backend stores on CDN/S3 assumed)

**Analytics Dashboard**
- Real-time QR scan tracking
- Share metrics by channel
- Donation trends by date
- Refetch every 5 minutes for live updates

---

## 10. FEATURE MODULES & API DEPENDENCIES

| Feature Module | Primary Pages | Key Services | API Dependencies | User Roles |
|---|---|---|---|---|
| **Authentication** | /login, /register, /forgot-password | authService | /auth/* | All |
| **Campaign Discovery** | /(campaigns)/campaigns, /campaigns/[id] | campaignService | GET /campaigns, GET /campaigns/{id} | Public |
| **Campaign Creation** | /(creator)/campaigns/new | campaignService | POST /campaigns | Creator |
| **Campaign Management** | /(creator)/dashboard, /(creator)/campaigns/[id]/edit | campaignService | PATCH /campaigns/{id}, POST /campaigns/{id}/publish, etc. | Creator |
| **Donations** | /(supporter)/donations, /campaigns/[id]/donate | donationService | POST /campaigns/{id}/donations, GET /donations | Supporter |
| **Sharing/Referrals** | /(supporter)/shares | sharingService, qrFlyerService | POST /campaigns/{id}/share, GET /shares | Supporter |
| **Sweepstakes** | /(supporter)/sweepstakes | sweepstakesService | GET /sweepstakes/*, POST /sweepstakes/winnings/{id}/claim | Supporter |
| **Volunteer System** | Campaign detail (volunteer offer) | volunteerService | POST /volunteers/offers, PATCH /volunteers/offers/{id}/* | All |
| **Admin Dashboard** | /admin/dashboard, /admin/campaigns, /admin/users, etc. | adminService, adminUserService, adminContentService | All /admin/* endpoints | Admin |

---

## 11. NOTABLE FRONTEND PATTERNS

### 11.1 Discriminated Union Pattern (Campaign Types)
```typescript
// One form, different fields based on type
const campaignCreationSchema = z.discriminatedUnion('campaignType', [
  fundraisingCampaignSchema,    // If type === 'fundraising'
  sharingCampaignSchema         // If type === 'sharing'
])

// Frontend shows/hides fields conditionally
{campaignType === 'fundraising' && <FundraisingFields />}
{campaignType === 'sharing' && <SharingFields />}
```

### 11.2 Query Key Factory Pattern
```typescript
// Centralized cache key management
const campaignKeys = {
  all: ['campaigns'],
  lists: () => [...campaignKeys.all, 'list'],
  list: (page, limit, filters) => [...campaignKeys.lists(), { page, limit, ...filters }],
}

// Consistent invalidation: queryClient.invalidateQueries(campaignKeys.lists())
```

### 11.3 FormData Wrapper for Multipart
```typescript
// Campaign creation with image
const formData = new FormData()
formData.append('title', data.title)
formData.append('image', imageFile)
formData.append('paymentMethods', JSON.stringify(data.paymentMethods))

await apiClient.post('/campaigns', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
})
```

### 11.4 Currency Normalization Pattern
```typescript
// Frontend always works in dollars (display)
// Backend always works in cents (storage)

// Before API call: dollars → cents
const apiData = { ...data, amount: Math.round(data.amount * 100) }

// After API call: cents → dollars
const displayData = { ...data, amount: data.amount / 100 }
```

### 11.5 Persistence Patterns
```typescript
// Zustand with persist middleware
const useWizardStore = create(
  persist(
    (set, get) => ({...}),
    { name: 'campaign-wizard-draft' }
  )
)

// Auto-saves to localStorage, loads on app start
// saveDraft() explicitly triggers storage
```

### 11.6 Retry & Backoff Pattern
```typescript
// Exponential backoff for network errors
const delay = (1000 * Math.pow(2, retryCount)) + jitter
setTimeout(() => retry(config), delay)

// Limits: 3 attempts max, only on 5xx or network errors
```

---

## 12. SUMMARY TABLE: FRONTEND ↔ BACKEND EXPECTATIONS

| Aspect | Frontend Implementation | Backend Expectation |
|---|---|---|
| **Authentication** | JWT token in localStorage | JWT validation on every request |
| **Currency** | Display dollars, submit cents | Store in cents, validate ranges |
| **Images** | FormData multipart, max 10MB | Store on CDN/S3, return URL |
| **Arrays** | Send as CSV strings (tags, platforms) | Parse CSV, validate length |
| **Objects** | Send as JSON strings (paymentMethods) | Parse JSON, validate structure |
| **Dates** | ISO 8601 format | Validate, store as ISO, return ISO |
| **Status Flows** | UI shows possible actions per status | Enforce state transitions, reject invalid |
| **Pagination** | page (1-indexed), limit (12-25 typical) | Validate page bounds, return total/pages |
| **Searching** | Lowercase, trim whitespace | Case-insensitive search, index optimization |
| **Validation** | Client-side Zod schemas | Server-side re-validation required |
| **Errors** | Extract message from response.data.message | Return standard error format |
| **Roles** | Check via authStore.user.role | Validate via token claims/DB |

---

## IMPLEMENTATION CHECKLIST

### Frontend is Expecting:
- ✅ JWT-based auth with standard bearer token format
- ✅ All amounts in cents (10000 = $100)
- ✅ ISO date/time format
- ✅ Standard error response format: `{message, error}`
- ✅ Simple paginated responses: `{data: [], total, pages}`
- ✅ Campaign filtering by 8+ parameters
- ✅ Role-based access control (admin/creator/supporter)
- ✅ Real-time analytics for campaigns
- ✅ QR code endpoints for flyer generation
- ✅ Sweepstakes entry tracking per campaign
- ✅ Payment method storage/retrieval for users
- ✅ Volunteer offer management system
- ✅ Admin moderation/suspension features
- ✅ Activity feed for admin dashboard

### Frontend Will handle:
- ✅ All UI/UX, form validation, error display
- ✅ Routing, role-based access control
- ✅ Client-side caching (React Query)
- ✅ State management (Zustand)
- ✅ Currency formatting (dollars ↔ cents)
- ✅ Date formatting for display
- ✅ File uploads (FormData)
- ✅ Real-time search/filter
- ✅ Pagination UI
- ✅ Toast notifications

---

**Document Generated**: April 6, 2026
**Frontend Framework**: Next.js 16.2 (App Router)
**API Base URL**: `NEXT_PUBLIC_API_URL` environment variable
**Authentication**: JWT Bearer Token
**State Management**: Zustand + React Query v5
