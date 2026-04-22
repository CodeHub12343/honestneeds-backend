# Campaign Progress Calculations - Complete Analysis

## Summary
Campaign progress is calculated across multiple files with **inconsistent field naming conventions**:
- **Backend/API Level**: snake_case (`total_donation_amount`, `goal_amount`, `raised_amount`)
- **Dashboard Services**: camelCase (`raisedAmount`, `goalAmount`)
- **Campaign Detail Page**: snake_case (`raised_amount`, `goal_amount`)
- **Analytics Page**: mixed (uses `campaign.goals[0]` for goal, `analytics.totalRaised` for raised)

---

## 1. **Browse/Discover - CampaignCard.tsx**
**File**: [honestneed-frontend/components/campaign/CampaignCard.tsx](honestneed-frontend/components/campaign/CampaignCard.tsx#L318-L330)

### Data Sources
```typescript
// Line 318-320: Extract goal from goals array
const goalAmount = campaign.goals?.length > 0 
  ? campaign.goals[0].target_amount 
  : 0

// Line 323: Get raised amount from backend field
const raisedAmount = campaign.total_donation_amount || 0
```

### Progress Calculation (Line 325-326)
```typescript
const progressPercent = goalAmount > 0
  ? Math.min((raisedAmount / goalAmount) * 100, 100)
  : 0
```

### Display (Line 449-454)
```jsx
<ProgressPercent>
  {progressPercent.toFixed(0)}%
</ProgressPercent>
<ProgressBarFill $percentage={progressPercent} />
```

### Field Details
- **Raised**: `campaign.total_donation_amount` (in cents)
- **Goal**: `campaign.goals[0].target_amount` (in cents)
- **Progress**: Percentage, capped at 100%

---

## 2. **Creator Dashboard - CampaignCard.tsx**
**File**: [honestneed-frontend/app/(creator)/dashboard/components/CampaignCard.tsx](honestneed-frontend/app/(creator)/dashboard/components/CampaignCard.tsx#L312)

### Progress Calculation (Line 312)
```typescript
const progressPercentage = campaign.goal > 0 ? (campaign.raised / campaign.goal) * 100 : 0
```

### Display (Line 344-347)
```jsx
<span>{Math.round(progressPercentage)}%</span>
<ProgressFill $percentage={progressPercentage} />
```

### Field Details
- **Raised**: `campaign.raised` (in cents)
- **Goal**: `campaign.goal` (in cents)
- **Progress**: Rounded percentage

### Local Interface Type (Line 7)
```typescript
interface Campaign {
  id: string;
  title: string;
  description: string;
  createdAt: string | Date;
  goalAmount: number;     // In cents
  raisedAmount: number;   // In cents
  status: string;
  campaignType?: string;
  donorCount?: number;
  healthScore?: number;
  engagementScore?: number;
  conversionRate?: number;
  performanceTrend?: string;
  lastActivityAt?: string;
}
```

---

## 3. **Campaign Detail Page - Progress Section**
**File**: [honestneed-frontend/app/(campaigns)/campaigns/[id]/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/[id]/page.tsx#L1135-L1244)

### Goal Definition (Line 1135-1136)
```typescript
const goalAmount = campaign.goal_amount || 0
const goalInDollars = goalAmount > 0 ? (goalAmount / 100).toLocaleString('en-US', {
  style: 'currency',
  currency: 'USD',
}) : '$0.00'
```

### Progress Bar Display (Line 1207-1244)
```typescript
if (campaign && campaign.goal_amount > 0) {
  meters.push(
    createMeterData(
      'money',
      campaign.raised_amount || 0,  // Line 1207
      campaign.goal_amount          // Line 1208
    )
  )
}

// Single meter display (Line 1240-1244)
if (meters.length === 1 && campaign.goal_amount > 0) {
  return (
    <ProgressBar
      current={campaign.raised_amount || 0}  // Line 1243
      goal={campaign.goal_amount}            // Line 1244
      size="lg"
      showPercentage={true}
      showValues={true}
    />
  )
}
```

### Field Details
- **Raised**: `campaign.raised_amount` (in cents)
- **Goal**: `campaign.goal_amount` (in cents)
- **Progress**: Calculated inside `ProgressBar` component (current/goal * 100)

---

## 4. **Campaign Analytics Page**
**File**: [honestneed-frontend/app/(campaigns)/campaigns/[id]/analytics/page.tsx](honestneed-frontend/app/(campaigns)/campaigns/[id]/analytics/page.tsx#L340-L358)

### Data Sources
```typescript
// Line 343: Get goal from campaign goals array
const goalAmountCents = campaign?.goals?.[0]?.target_amount ?? 0;

// Line 344: Get raised from analytics service
const raisedAmountCents = analytics?.totalRaised ?? 0;

// Line 345-347: Calculate percentage
const goalProgressPercentage = goalAmountCents > 0 
  ? (raisedAmountCents / goalAmountCents) * 100 
  : 0;
```

### Console Log (Line 349-357)
```typescript
console.log('💡 [Analytics] Corrected data sources:', {
  campaignId: id,
  goalAmountCents,
  raisedAmountCents,
  goalProgressPercentage: goalProgressPercentage.toFixed(2),
  totalDonations: analytics?.totalDonations,
  uniqueDonors: analytics?.uniqueDonors,
  source: 'campaign.goals[0] + analytics.totalRaised',
})
```

### Display Usage
```typescript
// Line 535 & 561
{parseFloat(goalProgressPercentage.toFixed(2))}% of...
<StatValue>{parseFloat(goalProgressPercentage.toFixed(2))}%</StatValue>
```

### Field Details
- **Goal**: `campaign.goals[0].target_amount` (in cents)
- **Raised**: `analytics.totalRaised` (in cents)
- **Progress**: Formatted to 2 decimal places

---

## 5. **Export & Report Services**
**File**: [honestneed-frontend/app/(creator)/dashboard/services/exportService.ts](honestneed-frontend/app/(creator)/dashboard/services/exportService.ts#L95-L210)

### Progress Calculation Examples

#### In CSV Export (Line 102)
```typescript
const progress =
  campaign.goalAmount > 0
    ? Math.round((campaign.raisedAmount / campaign.goalAmount) * 100)
    : 0;
```

#### In Campaign Summary (Line 205)
```typescript
const progress = c.goalAmount > 0 ? (c.raisedAmount / c.goalAmount) * 100 : 0;
```

#### In Average Progress Calculation (Line 201-209)
```typescript
const avgProgressPercentage =
  campaigns.length > 0
    ? Math.round(
        campaigns.reduce((sum, c) => {
          const progress = c.goalAmount > 0 ? (c.raisedAmount / c.goalAmount) * 100 : 0;
          return sum + progress;
        }, 0) / campaigns.length
      )
    : 0;
```

### Field Details
- **Raised**: `campaign.raisedAmount` (in cents, camelCase)
- **Goal**: `campaign.goalAmount` (in cents, camelCase)
- **Progress**: Rounded percentage

---

## 6. **Campaign Service Type Definitions**
**File**: [honestneed-frontend/api/services/campaignService.ts](honestneed-frontend/api/services/campaignService.ts#L21-L65)

### Campaign Interface (Line 21-65)
```typescript
export interface Campaign {
  id: string
  _id?: string
  title: string
  description: string
  image?: CampaignImage
  creator_id: string
  creator_name: string
  creator_avatar?: string
  need_type: string
  campaign_type?: 'fundraising' | 'sharing'
  status: 'draft' | 'active' | 'paused' | 'completed' | 'rejected'
  goal_amount?: number                    // in cents (computed from goals array)
  raised_amount?: number                  // in cents (optional, use total_donation_amount)
  total_donation_amount: number           // actual field from backend, in cents
  total_donations: number
  donation_count?: number
  goals?: Array<{
    goal_type: string
    goal_name: string
    target_amount: number
    current_amount: number
  }>
  share_count: number
  supporter_count?: number
  unique_supporters?: string[]
  total_donors: number
  trending: boolean
  geographic_scope?: string
  location?: string | { address: string; city: string; state: string; country: string }
  created_at: string
  updated_at: string
  view_count?: number
  is_boosted?: boolean
  current_boost_tier?: 'basic' | 'pro' | 'premium'
  last_boost_date?: string
  visibility_weight?: number
  share_config?: { ... }
  metrics?: {
    total_donations: number
    total_donation_amount: number
    unique_supporters: string[]
    [key: string]: any
  }
}
```

---

## Key Inconsistencies & Issues

### 1. **Field Naming Inconsistency**
| Purpose | Field Names Used |
|---------|------------------|
| Raised Amount | `campaign.total_donation_amount`, `campaign.raised_amount`, `campaign.raised`, `raisedAmount`, `analytics.totalRaised` |
| Goal Amount | `campaign.goal_amount`, `campaign.goalAmount`, `campaign.goal`, `campaign.goals[0].target_amount` |

### 2. **Field Priority**
According to comments in campaignService.ts (Line 28-29):
```typescript
raised_amount?: number                  // in cents (optional, use total_donation_amount instead)
total_donation_amount: number           // actual field from backend, in cents
```
**Primary field should be**: `total_donation_amount`

### 3. **Goal Source Confusion**
- Sometimes: `campaign.goal_amount` (direct field)
- Sometimes: `campaign.goals[0].target_amount` (from array)
- Comment suggests these should be equivalent, but no clear mapping

### 4. **Dashboard Service Mismatch**
Dashboard services use a local interface with camelCase (`raisedAmount`, `goalAmount`) instead of using the Campaign interface from campaignService.ts

---

## Progress Calculation Formula (Consistent)

**All implementations use the same formula:**

```
progressPercent = (raisedAmount / goalAmount) × 100
```

With variations in:
- **Rounding**: `toFixed(0)`, `toFixed(2)`, `Math.round()`
- **Capping**: Some cap at 100%, others don't
- **Null handling**: Default to 0 if no goal or division by zero

---

## Recommendations for Consistency

1. **Standardize field names**: Use snake_case across all frontend code or migrate to camelCase
2. **Choose primary fields**:
   - Raised: Always use `total_donation_amount` (per comment, it's the "actual field")
   - Goal: Always use `campaign.goals[0].target_amount`
3. **Update dashboard services**: Replace local Campaign interface with imported CampaignService.Campaign
4. **Add data transformation layer**: Create utility functions to normalize inconsistent field names
5. **Document field purposes**: Add JSDoc comments explaining what each field represents
