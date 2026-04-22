# Sharing Meter Selection Implementation

## Overview
Implemented a comprehensive meter selection feature for sharing-type campaigns in the HonestNeed campaign wizard. This allows creators to choose how they want to measure and reward supporter engagement.

## Changes Made

### 1. UI Component - Step3GoalsBudget.tsx
**File**: `honestneed-frontend/components/campaign/wizard/Step3GoalsBudget.tsx`

#### Added Styled Components
```typescript
const MeterCard = styled.div<{ selected?: boolean }>`
  - Displays individual meter option cards
  - Selected state with blue border (#6366F1) and light blue background
  - Hover effect for better interactivity
  - Contains title and description
```

```typescript
const MeterGridContainer = styled.div`
  - Responsive grid layout
  - Auto-fit columns with 280px minimum width
  - Full width on mobile devices
```

#### Added Meter Options
Four meter types available for selection:
1. **Impression Meter** - Pay per view or impression of campaign content
2. **Engagement Meter** - Pay when supporters interact (likes, comments, shares)
3. **Conversion Meter** - Pay only when supporters complete desired actions
4. **Custom Meter** - Define your own metrics and pay on custom events

#### Updated SharingStep Component
- Added meter selection section before budget & rewards
- Displays meter options in responsive grid
- Updates form data when meter is selected
- Meter selection is prominently displayed with instructions

### 2. Validation Schema - validationSchemas.ts
**File**: `honestneed-frontend/utils/validationSchemas.ts`

Updated `sharingCampaignSchema` to include:
```typescript
meterType: z.enum(['impression_meter', 'engagement_meter', 'conversion_meter', 'custom_meter'], {
  errorMap: () => ({ message: 'Please select a sharing meter' })
})
```

- **Requirement**: Meter type selection is now mandatory for sharing campaigns
- **Type Safety**: Enforces specific meter type values
- **Error Message**: Clear user feedback if meter is not selected

### 3. Store Update - wizardStore.ts
**File**: `honestneed-frontend/store/wizardStore.ts`

Updated `SharingData` interface:
```typescript
export interface SharingData {
  meterType?: 'impression_meter' | 'engagement_meter' | 'conversion_meter' | 'custom_meter'
  platforms: string[]
  rewardPerShare: number
  budget: number
  maxShares: number
}
```

- Added `meterType` field to sharing campaign data structure
- Maintains type safety with specific enum values
- Optional property (?) allows for gradual migration

### 4. API Service Update - campaignService.ts
**File**: `honestneed-frontend/api/services/campaignService.ts`

Updated `createCampaign` method:
```typescript
} else if (data.campaignType === 'sharing') {
  formData.append('meterType', data.meterType)  // Added this line
  formData.append('platforms', data.platforms?.join(',') || '')
  // ... rest of sharing fields
}
```

- Passes `meterType` to backend API
- Follows multipart form-data pattern used by backend
- Sent as single string field (not converted to cents)

## User Flow

### Campaign Creation Wizard - Sharing Type

**Step 3: Goals & Budget**
1. **Meter Selection** (NEW)
   - User sees 4 meter options in a grid layout
   - Each card shows meter name and description
   - User clicks to select their preferred meter
   - Selected meter is highlighted (blue border)

2. **Budget & Rewards** (Existing)
   - Set Total Budget ($10-$1,000,000)
   - Set Reward Per Share ($0.10-$100)

3. **Platforms** (Existing)
   - Select up to 8 sharing platforms
   - Platform selection remains unchanged

## Visual Design

### Meter Card
- **Dimensions**: 280px minimum width, responsive
- **Border**: 2px, changes color on selection (gray → blue)
- **Background**: Light gray by default, light blue when selected
- **Hover State**: Border becomes blue, background becomes light blue
- **Content**: Bold title + description text
- **Spacing**: 1.5rem padding, 1rem gap between cards

### Responsive Behavior
- **Desktop**: Multiple columns (auto-fit)
- **Tablet**: 2-3 columns depending on screen width
- **Mobile**: Single column (full width)

## Backend Integration

### API Endpoint
- **POST** `/campaigns` (multipart/form-data)

### Form Data Fields (Sharing)
```
meterType: 'impression_meter' | 'engagement_meter' | 'conversion_meter' | 'custom_meter'
platforms: 'instagram,tiktok,youtube'  // CSV format
rewardPerShare: '50'  // Cents
budget: '5000'  // Cents
maxShares: ''  // Optional
```

## Validation Flow

1. **Client-Side** (Zod Schema)
   - Validates meterType is selected
   - Validates as one of 4 allowed values
   - Provides clear error message

2. **Form State**
   - Stored in `wizardStore.SharingData.meterType`
   - Persisted in draft
   - Submitted with campaign creation

3. **API Request**
   - Included in multipart form-data
   - Backend validates and stores in database

## Testing Checklist

- [ ] Meter options display correctly in Step 3
- [ ] Card selection updates form data
- [ ] Visual feedback (hover/selected states) works
- [ ] Responsive layout works on mobile/tablet/desktop
- [ ] Form validation requires meter selection
- [ ] Validation error message displays correctly
- [ ] Campaign creation API includes meterType
- [ ] Draft saves include meterType
- [ ] Draft loading restores meterType selection

## Files Modified

1. `honestneed-frontend/components/campaign/wizard/Step3GoalsBudget.tsx`
   - Added 2 styled components
   - Added meter options constant
   - Updated SharingStep component

2. `honestneed-frontend/utils/validationSchemas.ts`
   - Updated sharingCampaignSchema

3. `honestneed-frontend/store/wizardStore.ts`
   - Updated SharingData interface

4. `honestneed-frontend/api/services/campaignService.ts`
   - Updated createCampaign method

## Future Enhancements

1. **Icons for Meters**: Add icon for each meter type
2. **Meter Configuration**: Allow custom parameters per meter type
3. **Help Text**: Add tooltips explaining each meter in detail
4. **Analytics Dashboard**: Display meter-specific analytics after launch
5. **Backend Meter Processing**: Implement actual meter tracking logic

## Notes

- Meter selection is **required** for sharing campaigns
- Meter type is formatted as a string enum on the frontend
- Backend receives meterType as a form field string
- No monetary conversion needed (unlike budget/reward fields)
- Meter selection is **immutable** after campaign creation (based on backend patterns)
