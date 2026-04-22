# Referral Tracking - Quick Start Guide

**Quick Reference for Developers** | Last Updated: April 10, 2026

---

## 📦 New Components & Hooks

| Component | Location | Purpose |
|-----------|----------|---------|
| `ReferralUrlDisplay` | `components/campaign/` | Show trackable URL with stats |
| `ReferralClickTracker` | `components/campaign/` | Auto-track clicks when loading campaign |
| `ShareResult` | `components/campaign/` | Success screen after sharing |
| `ReferralAnalyticsDashboard` | `components/campaign/` | Show creator's referral stats |
| `useReferralUrl` | `api/hooks/` | Generate & manage referral URLs (existing, enhanced) |
| `useReferralCode` | `api/hooks/` | Extract & manage referral codes in donations (new) |

---

## 🚀 3-Minute Integration

### Step 1: Add Click Tracking to Campaign Page
```tsx
import ReferralClickTracker from '@/components/campaign/ReferralClickTracker'

// In your campaign detail page:
<ReferralClickTracker campaignId={campaignId} />
```

### Step 2: Add Referral Code to Donation Flow
```tsx
import { useReferralCodeFromUrl } from '@/api/hooks/useReferralCode'

// In your donation form:
const { referralCode, attachReferralCode } = useReferralCodeFromUrl(campaignId)

// When submitting:
const payload = attachReferralCode({
  amount: 5000,
  campaignId,
  payment_method: 'stripe'
})
```

### Step 3: Show Analytics Dashboard
```tsx
import ReferralAnalyticsDashboard from '@/components/campaign/ReferralAnalyticsDashboard'

// In creator analytics page:
<ReferralAnalyticsDashboard campaignId={campaignId} />
```

---

## 💡 Common Patterns

### Display Referral URL After Share
```tsx
import ShareResult from '@/components/campaign/ShareResult'

<ShareResult
  campaignId="507f..."
  campaignTitle="Help Education"
  referralCode="ABC123"
  rewardAmount={1300}
  onClose={() => setShowResult(false)}
/>
```

### Show Referral Stats in Share Card
```tsx
import ReferralUrlDisplay from '@/components/campaign/ReferralUrlDisplay'

<ReferralUrlDisplay
  campaignId={id}
  referralCode={code}
  stats={{
    clicks: 24,
    conversions: 3,
    conversionRate: 12.5
  }}
/>
```

### Extract Referral Code for Any Flow
```tsx
import { useReferralCodeFromUrl } from '@/api/hooks/useReferralCode'

const { referralCode, isFromReferral } = useReferralCodeFromUrl(campaignId)

if (isFromReferral) {
  // User came via referral link - they can earn the referrer a reward
}
```

---

## 🔗 URL Formats

| Purpose | Format | Example |
|---------|--------|---------|
| Campaign with referral | `/campaigns/{id}?ref={code}` | `/campaigns/507f...?ref=ABC123` |
| Donation via referral | Same campaign URL when donating | Donation form auto-detects `?ref=` |
| Analytics API | `/api/campaigns/{id}/referrals` | Returns all share data |
| Track click API | `/api/referral/track` | POST to record click |

---

## 📊 Data You Get

### From ReferralUrlDisplay
```javascript
{
  campaignId: "...",
  referralCode: "ABC123",
  clicks: 24,
  conversions: 3,
  conversionRate: 12.5,
  earned: 3900 // cents
}
```

### From useReferralCodeFromUrl
```javascript
{
  referralCode: "ABC123" || null,
  isFromReferral: true/false,
  attachReferralCode(data) {} // Helper function
}
```

### From ReferralAnalyticsDashboard Query
```javascript
{
  total_shares: 15,
  total_clicks: 127,
  total_conversions: 16,
  total_earned: 20800, // cents
  platform_breakdown: {
    twitter: 8,
    facebook: 5
  },
  shares: [ /* array of individual shares */ ]
}
```

---

## ✅ Checklist for Integration

Adding referral tracking to your campaign feature:

- [ ] Import `ReferralClickTracker` in campaign detail page
- [ ] Add `<ReferralClickTracker campaignId={id} />` to campaign page
- [ ] Import `useReferralCodeFromUrl` in donation component
- [ ] Use `attachReferralCode()` when submitting donation
- [ ] Update ShareWizard result screen to show `ShareResult` component
- [ ] Add `ReferralAnalyticsDashboard` to creator analytics
- [ ] Test with URL: `/campaigns/{id}?ref=ABC123`
- [ ] Verify donation backend receives and processes `referralCode`

---

## 🧩 Component Props

### ReferralUrlDisplay
```typescript
interface Props {
  campaignId: string              // Campaign ID
  referralCode: string            // From share record
  campaignTitle?: string          // Campaign name for messaging
  rewardAmount?: number           // In cents
  stats?: {
    clicks?: number
    conversions?: number
    conversionRate?: number
  }
  onCopySuccess?: () => void      // Callback when URL copied
}
```

### ReferralClickTracker
```typescript
interface Props {
  campaignId: string              // Campaign ID
  onSuccess?: (data) => void      // Called when click tracked
  onError?: (error) => void       // Called on error
}
```

### ShareResult
```typescript
interface Props {
  campaignId: string              // Campaign ID
  campaignTitle: string           // Campaign name
  referralCode: string            // From share record (e.g., "ABC123")
  rewardAmount: number            // In cents (e.g., 1300 = $13)
  sharedPlatform?: string         // Platform shared on (e.g., "Twitter")
  onCopySuccess?: () => void      // Called when URL copied
  onClose?: () => void            // Called when user clicks Done
}
```

### ReferralAnalyticsDashboard
```typescript
interface Props {
  campaignId: string              // Campaign ID
  // Component handles fetching its own data
}
```

---

## 🎯 Real-World Example

```tsx
// pages/campaigns/[id].tsx
'use client'
import ReferralClickTracker from '@/components/campaign/ReferralClickTracker'
import DonateButton from '@/components/DonateButton'

export default function CampaignPage({ params }) {
  return (
    <>
      {/* Track referral clicks automatically */}
      <ReferralClickTracker campaignId={params.id} />
      
      <div className="campaign-header">
        <h1>{campaign.title}</h1>
        <p>{campaign.description}</p>
      </div>
      
      {/* Donate button handles referral codes internally */}
      <DonateButton campaignId={params.id} />
      
      {/* Show analytics for creators */}
      {isCreator && (
        <ReferralAnalyticsDashboard campaignId={params.id} />
      )}
    </>
  )
}

// components/DonateButton.tsx
import { useReferralCodeFromUrl } from '@/api/hooks/useReferralCode'

export function DonateButton({ campaignId }) {
  const [showForm, setShowForm] = useState(false)
  const { referralCode, attachReferralCode } = useReferralCodeFromUrl(campaignId)

  const handleDonate = async (amount) => {
    const payload = attachReferralCode({ amount, campaignId })
    await submitDonation(payload)
  }

  return (
    <>
      <button onClick={() => setShowForm(true)}>
        Donate Now
      </button>
      
      {showForm && (
        <DonationForm
          campaignId={campaignId}
          hasReferralCode={!!referralCode}
          onDonate={handleDonate}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  )
}
```

---

## 📈 Conversion Flow Diagram

```
1. Affiliate clicks referral link
   /campaigns/123?ref=ABC123
        ↓
2. ReferralClickTracker detects ?ref=
   - Stores "ABC123" in sessionStorage
   - POSTs to /api/referral/track
        ↓
3. User clicks "Donate" button
        ↓
4. Donation form opens
   useReferralCodeFromUrl gets "ABC123"
        ↓
5. User enters amount & payment
        ↓
6. Form submission includes:
   {
     amount: 5000,
     campaignId: "123",
     referralCode: "ABC123"  ← Attached by hook
   }
        ↓
7. Backend receives donation
   - Finds ShareRecord with ref code
   - Creates REWARD transaction
   - Increments conversions counter
        ↓
8. Affiliate gets $$ (after 30-day hold)
```

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Referral code shows as undefined | Ensure URL has `?ref=CODE` parameter |
| Click tracker not working | Check ReferralClickTracker is mounted before user navigates away |
| Conversions not attributed | Verify referralCode is sent with donation request to backend |
| Analytics dashboard empty | Ensure campaign has shares recorded and API endpoint is live |
| Copy to clipboard fails | Check HTTPS is enabled (required for navigator.clipboard) |

---

## 📚 Where to Learn More

- **Full Docs:** `FRONTEND_REFERRAL_TRACKING_COMPLETE.md`
- **Backend Docs:** `REFERRAL_URL_TRACKING_COMPLETE.md`
- **Share Campaign Docs:** `SHARE_CAMPAIGN_END_TO_END_FLOW.md`

---

**Questions?** Check the component JSDoc comments or the full documentation files.
