# Campaign Boost - Quick Reference

## 🚀 Quick Start

### For Creators (Using Boost)
```typescript
import { BoostCheckout } from '@/components/boost';

function MyCampaign() {
  const [boostActive, setBoostActive] = useState(false);

  return (
    <>
      {!boostActive && (
        <BoostCheckout
          campaignId={campaign._id}
          campaignTitle={campaign.title}
          onSuccess={() => setBoostActive(true)}
        />
      )}
    </>
  );
}
```

### Get Active Boost Info
```typescript
import { useGetCampaignBoost } from '@/api/hooks/useBoosts';

function BoostStatus({ campaignId }: { campaignId: string }) {
  const { data } = useGetCampaignBoost(campaignId);

  if (data?.has_active_boost) {
    return <div>Boost Active: {data.boost.tier.toUpperCase()}</div>;
  }
}
```

### View My Boosts
```typescript
import { BoostManager } from '@/components/boost';

function MyBoosts() {
  return <BoostManager />;
}
```

## 📊 Boost Tiers

| Tier | Cost | Multiplier | Duration |
|------|------|-----------|----------|
| Free | FREE | 1x | 30d |
| Basic | $9.99 | 5x | 30d |
| Pro | $24.99 | 15x | 30d |
| Premium | $99.99 | 50x | 30d |

## 🔌 API Endpoints

### Get Tiers (Public)
```bash
GET /api/boosts/tiers
Response: { tiers: [...] }
```

### Create Boost (Auth Required)
```bash
POST /api/boosts/create-session
Body: { campaign_id, tier }
Response: { checkout_url, checkout_session_id } | { boost_id } (free)
```

### Get Boost for Campaign (Public)
```bash
GET /api/boosts/campaign/:campaign_id
Response: { has_active_boost, boost? }
```

### List My Boosts (Auth Required)
```bash
GET /api/boosts/my-boosts?page=1&limit=10
Response: { boosts: [...], pagination: {...} }
```

### Extend Boost (Auth Required)
```bash
POST /api/boosts/:boost_id/extend
Response: { new_end_date, days_remaining: 30 }
```

### Cancel Boost (Auth Required)
```bash
POST /api/boosts/:boost_id/cancel
Body: { reason? }
Response: { success }
```

## 🔑 Key Files

**Backend**:
- Model: `src/models/CampaignBoost.js`
- Service: `src/services/StripeBoostService.js`
- Controller: `src/controllers/BoostController.js`
- Routes: `src/routes/boostRoutes.js`

**Frontend**:
- Schemas: `app/frontend/utils/boostValidationSchemas.ts`
- Service: `app/frontend/api/services/boostService.ts`
- Hooks: `app/frontend/api/hooks/useBoosts.ts`
- Components: `app/frontend/components/boost/*.tsx`

## 🎯 Common Tasks

### Check if Campaign Has Boost
```typescript
const { data: boostData } = useGetCampaignBoost(campaignId);
const hasBoost = boostData?.has_active_boost;
```

### Apply Visibility Weight to Campaigns
```typescript
// In list/ranking algorithm
const visibilityMultiplier = boost?.visibility_weight || 1;
const adjustedScore = campaignScore * visibilityMultiplier;
```

### Track Boost Performance
```typescript
// Boost stats are auto-tracked
{
  views_with_boost: 1250,
  engagement_with_boost: 42,
  conversions_with_boost: 8,
  roi_percentage: 185
}
```

## 💳 Stripe Integration

### Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`

### Webhook Events
- `checkout.session.completed` - Process paid boost
- `charge.succeeded` - Payment confirmed
- `charge.failed` - Payment failed

### Environment Vars Required
```env
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 🐛 Debug Checklist

- [ ] Auth token present and valid
- [ ] Campaign ID is valid MongoDB ObjectId
- [ ] Tier is valid: free | basic | pro | premium
- [ ] Stripe keys configured in .env
- [ ] Webhook endpoint accessible from internet
- [ ] Database indexes created
- [ ] CORS configured for frontend origin

## 📈 Metrics to Monitor

- Active boosts count
- Revenue by tier
- Avg boost ROI
- Completion rate (checkout)
- Boost renewal rate

## 📝 Notes

- Free boosts activate immediately (no payment)
- Paid boosts require Stripe checkout
- Boosts auto-expire after duration
- Extensions add 30 days as separate records
- Can't refund; can only cancel
- ROI calculated hourly with background job (optional)

---

**version**: 1.0.0  
**status**: ✅ Production Ready
