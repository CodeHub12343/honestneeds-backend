# Analytics & QR Code System - Quick Reference
**Last Updated**: April 5, 2026

---

## URL Quick Map

### Campaign Analytics
| Feature | Endpoint | Method | Auth |
|---------|----------|--------|------|
| Get Flyer | `/api/analytics/campaigns/:id/flyer?includeMetrics=true` | GET | Creator+ |
| Share Analytics | `/api/analytics/campaigns/:id/share-analytics?period=month` | GET | Creator+ |
| Donation Analytics | `/api/analytics/campaigns/:id/donation-analytics` | GET | Creator+ |

### Platform Analytics
| Feature | Endpoint | Method | Auth |
|---------|----------|--------|------|
| Dashboard | `/api/analytics/dashboard?period=month` | GET | Public |
| Campaign Performance | `/api/analytics/campaign-performance?limit=10` | GET | Public |
| Donation Trends | `/api/analytics/donation-trends?period=day&days=30` | GET | Public |
| Revenue Breakdown | `/api/analytics/revenue?period=month` | GET | Admin |
| Trending | `/api/analytics/trending?period=week&limit=10` | GET | Public |

### QR Code
| Feature | Endpoint | Method | Auth |
|---------|----------|--------|------|
| Generate QR | `/api/analytics/qr/generate` | POST | Creator+ |
| QR Analytics | `/api/analytics/qr/:id/analytics` | GET | Creator+ |

---

## Quick Curl Commands

### Get Flyer with Metrics
```bash
curl -X GET \
  "https://api.honestneed.com/api/analytics/campaigns/123/flyer?includeMetrics=true" \
  -H "Authorization: Bearer {token}"
```

### Get Share Analytics (Month)
```bash
curl -X GET \
  "https://api.honestneed.com/api/analytics/campaigns/123/share-analytics?period=month" \
  -H "Authorization: Bearer {token}"
```

### Generate QR Code
```bash
curl -X POST \
  "https://api.honestneed.com/api/analytics/qr/generate" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "123",
    "label": "Main QR"
  }'
```

### Get QR Analytics
```bash
curl -X GET \
  "https://api.honestneed.com/api/analytics/qr/507f1f77bcf86cd799439012/analytics" \
  -H "Authorization: Bearer {token}"
```

---

## React Hook Patterns

### useShareAnalytics Hook
```javascript
import { useQuery } from '@tanstack/react-query';

export const useShareAnalytics = (campaignId, period = 'all') => {
  return useQuery({
    queryKey: ['share-analytics', campaignId, period],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/campaigns/${campaignId}/share-analytics?period=${period}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 5 * 60 * 1000
  });
};

// In component:
const { data: analyticsData, isLoading } = useShareAnalytics(campaignId, 'month');
const { overall_stats, platform_breakdown, top_sharers } = analyticsData?.analytics || {};

// Display statistics
{overall_stats && (
  <div>
    <p>Total Shares: {overall_stats.total_shares}</p>
    <p>Click Rate: {overall_stats.average_click_rate}%</p>
    <p>Total Earnings: ${(overall_stats.total_earnings / 100).toFixed(2)}</p>
  </div>
)}
```

### useCampaignFlyer Hook
```javascript
export const useCampaignFlyer = (campaignId, includeMetrics = false) => {
  return useQuery({
    queryKey: ['campaign-flyer', campaignId, includeMetrics],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (includeMetrics) params.append('includeMetrics', 'true');
      
      const res = await fetch(
        `/api/analytics/campaigns/${campaignId}/flyer?${params}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 60 * 60 * 1000 // 1 hour
  });
};

// In component:
const { data: flyerData } = useCampaignFlyer(campaignId, true);
const flyer = flyerData?.flyer;

// Display flyer
{flyer && (
  <FlyerCard>
    <img src={flyer.campaign_image} alt={flyer.campaign_title} />
    <h2>{flyer.campaign_title}</h2>
    {flyer.qr_code && <QRDisplay code={flyer.qr_code} />}
    <ShareButtons urls={flyer.share_urls} />
    {flyer.progress && <ProgressBar progress={flyer.progress} />}
  </FlyerCard>
)}
```

---

## Validation Rules

### Query Parameters

#### Share Analytics
```javascript
{
  period: 'all' | 'month' | 'week' | 'day'  // default: 'all'
}
```

#### Campaign Flyer
```javascript
{
  includeMetrics: true | false  // default: false
}
```

#### Request Payload (Generate QR)
```javascript
{
  campaign_id: string,        // required
  label: string              // optional, max 100 chars
}
```

---

## Response Structure

### Share Analytics Response
```javascript
{
  success: boolean,
  analytics: {
    campaign_id: string,
    campaign_title: string,
    campaign_status: string,
    period_analyzed: string,
    
    overall_stats: {
      total_shares: number,
      total_clicks: number,
      total_conversions: number,
      total_earnings: number,
      average_click_rate: number,
      average_conversion_rate: number,
      average_earning_per_share: number
    },
    
    platform_breakdown: [
      {
        platform: string,
        shares: number,
        clicks: number,
        click_rate: number,
        conversions: number,
        conversion_rate: number,
        earnings: number,
        average_earning_per_share: number
      }
    ],
    
    top_sharers: [
      {
        sharer_id: string,
        sharer_name: string,
        sharer_image: string,
        shares: number,
        clicks: number,
        conversions: number,
        earnings: number,
        platform: string,
        last_share_date: string
      }
    ],
    
    generated_at: string
  },
  message: string
}
```

### Campaign Flyer Response
```javascript
{
  success: boolean,
  flyer: {
    campaign_id: string,
    campaign_title: string,
    campaign_description: string,
    campaign_image: string,
    campaign_status: string,
    campaign_created_at: string,
    
    qr_code: string,           // base64 PNG
    flyer_url: string,
    download_url: string,
    
    share_urls: {
      facebook: string,
      twitter: string,
      linkedin: string,
      email: string,
      whatsapp: string
    },
    
    progress: {               // if includeMetrics=true
      goal_amount: number,
      raised_amount: number,
      progression_percent: number,
      remaining_amount: number,
      total_donors: number,
      total_shares: number
    },
    
    generated_at: string
  },
  message: string
}
```

---

## Error Codes Quick Reference

| Code | Status | Meaning |
|------|--------|---------|
| `CAMPAIGN_NOT_FOUND` | 404 | Campaign doesn't exist |
| `UNAUTHORIZED_FLYER_ACCESS` | 403 | Not campaign creator |
| `UNAUTHORIZED_ANALYTICS_ACCESS` | 403 | Not campaign creator |
| `FLYER_GENERATION_ERROR` | 500 | Server error |
| `SHARE_ANALYTICS_ERROR` | 500 | Server error |
| `VALIDATION_ERROR` | 400 | Invalid parameters |

---

## Data Formatting

### Currency (Cents → Dollars)
```javascript
// Backend returns amounts in cents
const amountInCents = 2500;
const amountInDollars = (amountInCents / 100).toFixed(2);
// Result: "25.00"
```

### Rates (Decimal → Percentage)
```javascript
// Backend returns rates as decimal percentages
const clickRate = 213.33;  // means 213.33%
const displayRate = `${clickRate.toFixed(2)}%`;
// Result: "213.33%"
```

### Dates (ISO 8601)
```javascript
// Backend returns ISO 8601 format
const dateString = "2026-04-05T10:30:00Z";
const dateObj = new Date(dateString);
const formatted = dateObj.toLocaleDateString('en-US');
// Result: "4/5/2026"
```

---

## Top Sharers Analysis

### Understanding the Data
```javascript
// From top_sharers array
{
  sharer_name: "John Doe",
  shares: 15,              // Posts made
  clicks: 45,              // Times link clicked
  conversions: 8,          // Actual donations from clicks
  earnings: 400,           // Revenue from conversions (cents)
  platform: "facebook",    // Where they shared
  last_share_date: "2026-04-05T10:00:00Z"
}

// Calculate metrics
const clickRate = (clicks / shares * 100);           // 300%
const conversionRate = (conversions / clicks * 100); // 17.78%
const avgEarning = earnings / shares / 100;          // $2.67 per share
```

### Common Queries
```javascript
// Top performer by earnings
const topEarner = topSharers[0];  // Already sorted

// Best conversion rate (manual calculation)
const bestConverters = shareData
  .map(s => ({
    ...s,
    conversionRate: s.conversions / s.clicks * 100
  }))
  .sort((a, b) => b.conversionRate - a.conversionRate);

// Platform comparison
const fbData = platformBreakdown.find(p => p.platform === 'facebook');
const twitterData = platformBreakdown.find(p => p.platform === 'twitter');
const fbBetter = fbData.earnings > twitterData.earnings;
```

---

## Common Implementations

### Share Analytics Dashboard
```javascript
function ShareAnalyticsDashboard({ campaignId }) {
  const { data, isLoading } = useShareAnalytics(campaignId, 'month');
  
  if (isLoading) return <Spinner />;
  if (!data?.analytics) return <Empty />;
  
  const { overall_stats, platform_breakdown, top_sharers } = data.analytics;
  
  return (
    <Dashboard>
      {/* Summary Cards */}
      <Card>
        <Stat label="Total Shares" value={overall_stats.total_shares} />
        <Stat label="Total Earnings" value={`$${(overall_stats.total_earnings/100).toFixed(2)}`} />
        <Stat label="Conversion Rate" value={`${overall_stats.average_conversion_rate}%`} />
      </Card>
      
      {/* Platform Comparison */}
      <Chart
        data={platform_breakdown}
        x="platform"
        y="earnings"
        type="bar"
      />
      
      {/* Top Sharers */}
      <Table
        data={top_sharers}
        columns={['sharer_name', 'shares', 'conversions', 'earnings']}
      />
    </Dashboard>
  );
}
```

### Campaign Flyer Card
```javascript
function CampaignFlyerCard({ campaignId }) {
  const { data, isLoading } = useCampaignFlyer(campaignId, true);
  
  if (isLoading) return <Skeleton />;
  if (!data?.flyer) return <Error />;
  
  const { campaign_title, campaign_image, qr_code, share_urls, progress } = data.flyer;
  
  return (
    <Card>
      <img src={campaign_image} alt={campaign_title} />
      <h2>{campaign_title}</h2>
      
      {/* QR Code */}
      {qr_code && <img src={qr_code} alt="QR Code" width={200} />}
      
      {/* Progress */}
      {progress && (
        <ProgressSection>
          <ProgressBar value={progress.progression_percent} />
          <p>{progress.raised_amount / 100} raised of ${progress.goal_amount / 100}</p>
        </ProgressSection>
      )}
      
      {/* Share Buttons */}
      <ShareButtons>
        <a href={share_urls.facebook} target="_blank">Facebook</a>
        <a href={share_urls.twitter} target="_blank">Twitter</a>
        <a href={share_urls.linkedin} target="_blank">LinkedIn</a>
        <a href={share_urls.whatsapp}>WhatsApp</a>
        <a href={share_urls.email}>Email</a>
      </ShareButtons>
      
      {/* Download */}
      <DownloadButton href={data.flyer.download_url}>
        Download Flyer (PDF)
      </DownloadButton>
    </Card>
  );
}
```

---

## Period Filtering Guide

### Usage
```javascript
// Get last 7 days of shares
useShareAnalytics(campaignId, 'week')

// Get last month
useShareAnalytics(campaignId, 'month')

// Get today only
useShareAnalytics(campaignId, 'day')

// Get all time
useShareAnalytics(campaignId, 'all')
```

### What Gets Filtered
- Share creation dates
- Click-through dates
- Conversion dates
- Earnings recorded within period

---

## Performance Notes

- **Flyer generation**: ~800ms (includes QR generation if needed)
- **Share analytics**: ~750ms (faster with cache)
- **Platform breakdown**: O(n) where n = shares
- **Top sharers**: O(n log n) due to sorting

For campaigns with 1000+ shares, consider:
- Using shorter time periods (week/month vs all)
- Implementing pagination on top_sharers
- Client-side caching with React Query

---

## Testing Endpoints

### Postman Collection
Import this collection to test all endpoints:

```json
{
  "info": {
    "name": "Analytics & QR API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Share Analytics",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{base_url}}/api/analytics/campaigns/{{campaign_id}}/share-analytics?period=month",
          "host": ["{{base_url}}"],
          "path": ["api", "analytics", "campaigns", "{{campaign_id}}", "share-analytics"],
          "query": [{"key": "period", "value": "month"}]
        },
        "header": [
          {"key": "Authorization", "value": "Bearer {{token}}"}
        ]
      }
    },
    {
      "name": "Campaign Flyer",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{base_url}}/api/analytics/campaigns/{{campaign_id}}/flyer?includeMetrics=true",
          "host": ["{{base_url}}"],
          "path": ["api", "analytics", "campaigns", "{{campaign_id}}", "flyer"],
          "query": [{"key": "includeMetrics", "value": "true"}]
        },
        "header": [
          {"key": "Authorization", "value": "Bearer {{token}}"}
        ]
      }
    }
  ]
}
```

---

## Environment Variables

```bash
# .env
API_URL=https://api.honestneed.com
FRONTEND_URL=https://honestneed.com
JWT_SECRET=your_secret_here
NODE_ENV=production
```

---

**Document Version**: 1.0  
**Last Updated**: April 5, 2026
