# Phase 2.1-2.2: Share Wizard Architecture & Integration

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Campaign Detail Page                         │
│             (honestneed-frontend/app/.../[id]/page.tsx)           │
│                                                                   │
│  ┌─────────────────────────────────────┐                         │
│  │  Check: campaign?.campaign_type     │                         │
│  │                                     │                         │
│  │  'sharing' ──┐      'fundraising'──┐                          │
│  └─────────────────────────────────────┘                         │
│        │                    │                                    │
│        ├─→ Show "Share to   ├─→ Show "Donate Now"                │
│        │   Earn" Button     │   Button (existing)                │
│        │                    │                                    │
│        ├─→ Show Badge:      ├─→ Show "Offer Help"                │
│        │   "💰 Share to     │   Button                           │
│        │   Earn"            │                                    │
│        │                    │                                    │
│        └─→ Render           └─→ Hide ShareInfoSection            │
│           ShareInfoSection                                       │
│           Component                                              │
│                                                                   │
│  ┌──────────────────────────────────────────────────┐             │
│  │ ShareInfoSection Component                       │             │
│  │ ├─ Earn per Share: $X.XX                        │             │
│  │ ├─ Total Budget: $XXX.XX                        │             │
│  │ ├─ Shares Available: ###                        │             │
│  │ └─ How it Works Instructions                    │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                   │
│  ┌──────────────────────────────────────────────────┐             │
│  │ CLICK "💰 Share to Earn" Button                  │             │
│  │              ↓                                   │             │
│  │ Modal State: isShareWizardOpen = true            │             │
│  │              ↓                                   │             │
│  │ ShareWizard Component Opens                      │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
         │
         │
         ├────────────────────────────────────────────────────┐
         │                                                    │
         ▼                                                    ▼
┌─────────────────────────┐                   ┌─────────────────────────┐
│  ShareWizard Component  │                   │ Campaign Card Component  │
│ honestneed-frontend/    │                   │ (campaign/CampaignCard)  │
│ components/campaign/    │                   │                         │
│ ShareWizard.tsx         │                   │ ├─ Shows Badge:          │
│                         │                   │ │  💰 Share to Earn     │
│ ┌─────────────────────┐ │                   │ │  (if sharing type)    │
│ │ STEP 1              │ │                   │ │                       │
│ │ Platform Selection  │ │                   │ ├─ Button Text:          │
│ │ - Twitter           │ │                   │ │  "💰 Share to Earn"   │
│ │ - Facebook          │ │                   │ │  (instead of Donate)  │
│ │ - LinkedIn          │ │                   │ │                       │
│ │ - Email             │ │                   │ └─ onClick: setWizardOpen│
│ │ - WhatsApp          │ │                   └─────────────────────────┘
│ │ - Telegram          │ │
│ │ - Reddit            │ │
│ │ - Copy Link         │ │
│ └─────────────────────┘ │
│         ↓               │
│ (User selects platform) │
│         ↓               │
│ ┌─────────────────────┐ │
│ │ STEP 2              │ │
│ │ Share Preview       │ │
│ │                     │ │
│ │ Campaign Title      │ │
│ │ Campaign Desc (150) │ │
│ │ Creator Name        │ │
│ │ Unique Link:        │ │
│ │ /campaigns/123      │ │
│ │ ?ref=SHARE-...      │ │
│ │ Earn: $0.50         │ │
│ │ [Copy Link] [Share] │ │
│ └─────────────────────┘ │
│         ↓               │
│ ┌─────────────────────┐ │
│ │ STEP 3              │ │
│ │ Confirmation       │ │
│ │                     │ │
│ │ ✓ Share Recorded!   │ │
│ │                     │ │
│ │ Next Steps:         │ │
│ │ 1. Open Twitter     │ │
│ │ 2. Post the link    │ │
│ │ 3. Wait 30 days    │ │
│ │ 4. Withdraw $       │ │
│ │ [Done]              │ │
│ └─────────────────────┘ │
└─────────────────────────┘
         │
         ├─────────────────────────────────────────────────┐
         │                                                  │
         ▼                                                  ▼
┌─────────────────────────┐                  ┌────────────────────────┐
│  recordShare            │                  │  Social Intent Opens   │
│  useRecordShare Hook    │                  │  in New Tab            │
│                         │                  │                        │
│ mutationFn({            │                  │ Twitter/Facebook/etc   │
│   campaignId,           │                  │ shows share dialog     │
│   channel               │                  │                        │
│ })                      │                  │ Pre-filled text:       │
│         ↓               │                  │ "Check out '..'"       │
│ POST /campaigns/        │                  │                        │
│      {id}/share         │                  │ URL included:          │
│                         │                  │ /campaigns/123?ref=... │
│ Backend Response:       │                  └────────────────────────┘
│ {                       │
│   shareId,              │
│   referralUrl           │
│ }                       │
│         ↓               │
│ Toast: "Share           │
│        recorded!"       │
└─────────────────────────┘
```

---

## Data Flow: From Share to Reward

```
SUPPORTER SHARING PHASE
┌─────────────────────────────────────────────────────────┐
│ 1. Supporter on Campaign Page                           │
│    └─ Sees "💰 Share to Earn" button                    │
│                                                         │
│ 2. Click "Share to Earn"                               │
│    └─ ShareWizard modal opens                          │
│       └─ Select Platform (Twitter, Facebook, etc.)     │
│          └─ recordShare() called                       │
│             ├─ campaignId: "507f1f77bcf86cd..."       │
│             └─ channel: "twitter"                      │
│                                                         │
│ 3. Backend recordShare Endpoint                        │
│    └─ Create ShareRecord:                             │
│       ├─ share_id: "SHARE-2026-ABC123"                │
│       ├─ campaign_id: "507f1f77bcf86cd..."           │
│       ├─ supporter_id: "507f1f77bcf86cd..."          │
│       ├─ channel: "twitter"                           │
│       ├─ referral_code: "SHARE-2026-ABC123"          │
│       └─ is_paid: true                               │
│                                                         │
│ 4. Share Link Generated                                │
│    └─ https://honestneed.com/campaigns/123            │
│       ?ref=SHARE-2026-ABC123                          │
│                                                         │
│ 5. Supporter Shares                                    │
│    └─ Posts link to Twitter                           │
│       └─ Followers see unique link                     │
│          (differentiates who shared it)                │
└─────────────────────────────────────────────────────────┘
                         ↓
         CLICK TRACKING PHASE (Phase 3.3)
┌─────────────────────────────────────────────────────────┐
│ 6. Potential Donor Clicks Link                          │
│    └─ Browser: GET /campaigns/123?ref=SHARE-2026...   │
│       └─ QueryParam captured: ref="SHARE-2026-ABC123" │
│          └─ Stored in sessionStorage                   │
│                                                         │
│ 7. Donation Page Loads                                 │
│    └─ Supporter sees campaign                          │
│       └─ Decides to donate                             │
└─────────────────────────────────────────────────────────┘
                         ↓
         CONVERSION PHASE (Phase 3.3)
┌─────────────────────────────────────────────────────────┐
│ 8. Donor Completes Donation                            │
│    └─ POST /donations with:                            │
│       ├─ campaignId                                    │
│       ├─ amount: 5000 (cents)                         │
│       └─ referral_code: "SHARE-2026-ABC123"           │
│          └─ Retrieved from sessionStorage              │
│                                                         │
│ 9. Backend Donation Processing                         │
│    └─ Process Payment                                  │
│       └─ Create Reward Transaction                     │
│          ├─ type: "sharing_reward"                     │
│          ├─ user_id: supporter_id                     │
│          ├─ amount: 50 cents ($X.XX)                  │
│          ├─ status: "pending_hold"                     │
│          ├─ hold_until_date: now + 30 days           │
│          └─ reference: donation_id                     │
│                                                         │
│ 10. Update Share Record                                │
│     └─ ShareRecord.conversions++                      │
│        └─ ShareRecord.conversion_ids.push(donation_id)│
│           └─ Track which donations came from this share│
└─────────────────────────────────────────────────────────┘
                         ↓
         30-DAY HOLD PHASE (Phase 3.1)
┌─────────────────────────────────────────────────────────┐
│ 11-30. Days 1-30: Fraud Detection                      │
│        └─ Reward held in "pending_hold" status         │
│           └─ No funds transferred yet                   │
│              └─ Monitor for chargebacks                │
│                 └─ Check behavioral patterns           │
│                                                         │
│ 31. ProcessShareHolds Job Runs                         │
│     └─ Find all pending_hold with hold_until <= now   │
│        ├─ Run fraud detection                         │
│        │  ├─ Check ROI anomaly                        │
│        │  ├─ Check account age                        │
│        │  ├─ Check IP reputation                      │
│        │  └─ Check behavioral patterns                │
│        │                                               │
│        ├─ If FRAUD DETECTED:                          │
│        │  ├─ status = "rejected"                      │
│        │  ├─ Send rejection email                     │
│        │  └─ Supporter doesn't earn                   │
│        │                                               │
│        └─ If NO FRAUD:                                │
│           ├─ status = "approved"                      │
│           ├─ Move to available_balance                │
│           ├─ Send approval email                      │
│           └─ Supporter can withdraw!                  │
└─────────────────────────────────────────────────────────┘
                         ↓
         WITHDRAWAL PHASE (Phase 4)
┌─────────────────────────────────────────────────────────┐
│ 32. Supporter Earnings Dashboard                        │
│     └─ See: $X.XX available                            │
│        └─ Request withdrawal                           │
│           ├─ Select method: Stripe/ACH/PayPal         │
│           └─ Process payment                          │
│              └─ Funds transferred to supporter        │
└─────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

```
Campaign Detail Page
├── Hero Section
│   └─ Campaign Image & Title
├── Main Content
│   ├── Main Column
│   │   ├── Campaign Progress
│   │   ├── [SHARING CAMPAIGN] ShareInfoSection ✨ NEW
│   │   ├── About Campaign
│   │   ├── Progress Updates
│   │   └── Related Campaigns
│   └── Sidebar
│       ├── CTA Buttons Container
│       │   ├── [FUNDRAISING] Donate Now Button
│       │   └── [SHARING] Share to Earn Button ✨ MODIFIED
│       │   ├── Offer Help / Copy Link (conditional)
│       │   ├── Social Share Buttons
│       │   ├── Report Button
│       │   └── [SHARING] Budget Info Card ✨ NEW
│       ├── Creator Profile
│       ├── Campaign Details
│       └── Last Updated
└── Footers
    ├── OfferHelpModal
    └── ShareWizard Modal ✨ NEW
        ├── Header (Close Button)
        ├── Content
        │   ├── Step 1: Platform Selection
        │   │   └── PlatformGrid (8 cards)
        │   ├── Step 2: Share Preview
        │   │   ├── PreviewCard
        │   │   ├── RewardBadge
        │   │   └── ShareURLInput
        │   └── Step 3: Confirmation
        │       ├── SuccessMessage
        │       └── Next Steps Instructions
        └── Footer (Back / Share / Done buttons)
```

---

## Campaign Card Component Tree

```
CampaignCard
├── ImageContainer
│   ├── Image (or Placeholder)
│   └── BadgesContainer
│       ├── [SHARING] ShareToEarnBadge ✨ NEW
│       ├── ScopeBadge (if geographic_scope)
│       ├── TrendingBadge (if trending)
│       └── CompletedBadge (if completed)
├── ContentSection
│   ├── TitleCreatorSection
│   │   ├── Campaign Title Link
│   │   └── Creator Link
│   ├── ProgressSection
│   │   ├── Progress Bar
│   │   └── Progress Values
│   ├── MetricsGrid
│   │   ├── Donations Count
│   │   ├── Shares Count
│   │   └── Supporters Count
│   ├── ActionsContainer
│   │   ├── [FUNDRAISING] Donate Button + Share Button
│   │   └── [SHARING] Share to Earn Button + Donate Icon ✨ MODIFIED
│   └── View Details Link
```

---

## State Management Flow

```
Campaign Detail Page (React Component)
│
├─ State Variables:
│  ├─ [copied, setCopied] - For copy-to-clipboard feedback
│  ├─ [isOfferHelpOpen, setIsOfferHelpOpen] - Offer Help modal
│  └─ [isShareWizardOpen, setIsShareWizardOpen] ✨ NEW
│
├─ Hooks:
│  ├─ useParams() - Get campaignId from URL
│  ├─ useRouter() - For navigation
│  ├─ useAuthStore() - Current user
│  ├─ useCampaign() - Fetch campaign data
│  ├─ useCampaignAnalytics() - Analytics data
│  ├─ useRelatedCampaigns() - Similar campaigns
│  └─ useRecordShare() ✨ NEW HOOK INTEGRATION
│     └─ recordShareMutation.mutateAsync({campaignId, channel})
│
└─ Conditional Rendering:
   └─ if (campaign?.campaign_type === 'sharing')
      ├─ Show "Share to Earn" button
      ├─ Show ShareInfoSection
      ├─ Show budget info card
      └─ Open ShareWizard on button click
```

---

## Type Definitions

```typescript
// From campaignService.ts

interface Campaign {
  id: string
  campaign_type?: 'fundraising' | 'sharing' ✨ NEW
  
  share_config?: {                           ✨ NEW
    total_budget?: number           // cents
    current_budget_remaining?: number
    amount_per_share?: number       // cents
    is_paid_sharing_active?: boolean
    share_channels?: string[]
    last_config_update?: string
    config_updated_by?: string
  }
  
  // ... other fields
}

// ShareWizard Props
interface ShareWizardProps {
  isOpen: boolean
  onClose: () => void
  campaignId: string
  campaignTitle: string
  campaignDescription?: string
  creator_name?: string
  share_config?: Campaign['share_config']
}

// ShareInfoSection Props
interface ShareInfoSectionProps {
  share_config?: Campaign['share_config']
}
```

---

## API Integration Points

### Already Existing
```
GET  /campaigns/:id              - Fetch campaign details
GET  /campaigns/:id/analytics    - Fetch campaign analytics
POST /campaigns/:id/share        - Record share [EXPECTS RESPONSE]
GET  /campaigns/need-types       - Fetch category options
```

### ShareWizard Uses
```
POST /campaigns/:id/share
Request: {
  channel: 'twitter' | 'facebook' | 'linkedin' | 'email' | 'whatsapp' | 'telegram' | 'reddit'
}

Response: {
  shareId: string         // Unique share ID
  referralUrl: string     // Full referral link
}

Hook Integration:
useRecordShare()
└─ mutationFn: campaignService.recordShare(campaignId, channel)
```

---

## Mobile Responsive Breakpoints

```
0px - 479px: Mobile phones
│
├─ 2-column stats grid in ShareInfoSection
├─ Full-width buttons
├─ Compact padding
└─ Stacked layout

480px - 639px: Small tablets
│
├─ Transition to tablet layout
├─ Better spacing
└─ Readable font sizes

640px - 767px: Tablets
│
├─ 2-column sidebar layout begins
├─ Horizontal progress bar
└─ Grid view campaigns

768px+: Desktops
│
├─ Full 3-column layout working
├─ 3-column stats grid
└─ Optimal viewing experience
```

---

## Summary of Changes

✅ **New Components**: 2
- ShareWizard.tsx (main wizard)
- ShareInfoSection.tsx (info display)

✅ **Modified Components**: 3
- Campaign detail page (+ wizard integration)
- CampaignCard (+ sharing badge)
- campaignService.ts (+ types)

✅ **New Files**: 0 (no extra config needed)

✅ **Dependencies Added**: 0 (uses existing libraries)

✅ **Breaking Changes**: 0 (fully backward compatible)

---

**Architecture Complete & Production Ready** ✅
