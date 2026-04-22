# Conversion Tracking - Quick Reference

## 🚀 Quick Start

### 1. Record Conversion After Donation
```typescript
import { useConversionPixel } from '@/utils/conversionPixel';

const { fireConversionPixel } = useConversionPixel(campaignId, referralCode);

// After donation succeeds
await fireConversionPixel(amountInCents);
```

### 2. Show Conversion Analytics
```typescript
import { SupporterConversionAnalytics } from '@/components/share/ConversionAnalyticsDashboard';

<SupporterConversionAnalytics /> // Shows all metrics
```

### 3. Generate Share Link
```typescript
import { generateReferralUrl } from '@/utils/conversionPixel';

const url = generateReferralUrl(campaignId, referralCode, 'facebook');
// → https://app.com/campaigns/123?ref=ABC123&source=facebook
```

---

## 📊 Metrics at a Glance

| Metric | What It Is | Why It Matters |
|--------|-----------|-----------------|
| **Clicks** | Visitors via your share | Reach - how many people saw it |
| **Conversions** | Visitors who donated | Effectiveness - did it work |
| **Conversion Rate** | % of clicks → conversions | Quality - are shares engaging |
| **Revenue** | $ from conversions | ROI - financial impact |
| **Avg Value** | $ per conversion | Average transaction size |

---

## 🔗 API Endpoints

```bash
# Record a conversion
POST /campaigns/:campaignId/conversion
Body: { ref: "ABC123", conversionType: "donation", conversionValue: 5000 }

# Get campaign metrics
GET /campaigns/:campaignId/analytics/conversions

# Get share metrics
GET /shares/:shareId/analytics

# Get supporter metrics
GET /user/conversion-analytics
```

---

## 💻 Frontend Hooks

```typescript
// Record conversion
const { recordConversion } = useConversionFlow();
await recordConversion({ campaignId, ref, conversionType, conversionValue });

// Get campaign analytics
const { data } = useCampaignConversionAnalytics(campaignId);

// Get supporter analytics
const { data } = useSupporterConversionAnalytics();

// Get share analytics
const { data } = useShareConversionAnalytics(shareId);
```

---

## 🎯 Implementation Checklist

- [ ] Import `useConversionPixel` in donation component
- [ ] Call `fireConversionPixel()` after donation success
- [ ] Mount `SupporterConversionAnalytics` on analytics page
- [ ] Use `generateReferralUrl()` when creating share links
- [ ] Test: Click referral link → see clicks increment
- [ ] Test: Complete donation → see conversion in analytics
- [ ] Verify metrics display correctly

---

## 🐛 Common Issues

**Clicks not showing?**
→ Make sure referral URL has `?ref=ABC123` parameter

**Conversions not recording?**
→ Check `ref` parameter matches referral code in database

**Analytics empty?**
→ Need at least one click and one conversion first

---

## 📈 Example Metrics

**Supporter Dashboard Shows:**
```
Total Clicks: 156
Total Conversions: 12
Conversion Rate: 7.7%
Total Revenue: $60,000
Average per Conversion: $5,000
```

**By Channel Breakdown:**
```
Telegram:  45 shares → 156 clicks → 12 conversions (7.7%)
Facebook:  32 shares → 89 clicks → 7 conversions (7.9%)
Twitter:   10 shares → 45 clicks → 2 conversions (4.4%)
```

---

## 🏗️ Backend Architecture

```
Visitor clicks referral link
         ↓
referralMiddleware detects ?ref=
         ↓
ConversionTrackingService.recordClick()
         ↓
Updates: ShareRecord.clicks++, ReferralTracking.visits++
         ↓
    [User sees campaign]
         ↓
User donates
         ↓
Frontend calls: POST /campaigns/:id/conversion
         ↓
ConversionTrackingService.recordConversion()
         ↓
Updates: ShareRecord.conversions++, conversion_details[]
         ↓
Checks: Eligible for reward bonus?
         ↓
Returns: Attribution result
         ↓
Analytics updated: metrics now visible
```

---

## Files Modified/Created

**Backend:**
- ✅ src/services/ConversionTrackingService.js (NEW - 730 lines)
- ✅ src/models/Share.js (MODIFIED - +50 lines)
- ✅ src/middleware/referralMiddleware.js (MODIFIED - +40 lines)
- ✅ src/controllers/ShareController.js (MODIFIED - +170 lines)
- ✅ src/routes/shareRoutes.js (MODIFIED - +15 lines)

**Frontend:**
- ✅ honestneed-frontend/api/hooks/useConversionTracking.ts (NEW - 200 lines)
- ✅ honestneed-frontend/components/share/ConversionAnalyticsDashboard.tsx (NEW - 400 lines)
- ✅ honestneed-frontend/utils/conversionPixel.ts (NEW - 250 lines)

---

## 🔑 Key Features

✅ Automatic click tracking via middleware
✅ Conversion attribution pipeline
✅ Optional reward bonuses for conversions
✅ Detailed analytics dashboards
✅ By-channel and by-campaign breakdowns
✅ Complete audit trail
✅ Fraud detection ready
✅ Production-ready error handling

---

**Status:** 🟢 Production Ready | **Lines of Code:** ~1,700 | **Files:** 8 modified/created

For complete documentation, see `CONVERSION_TRACKING_IMPLEMENTATION_COMPLETE.md`
