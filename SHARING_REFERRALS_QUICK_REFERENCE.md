# Sharing & Referrals - Quick Reference

**Status**: Production Ready | **Last Updated**: April 5, 2026

## Quick Endpoint Map

```
CAMPAIGN SHARING
POST   /campaigns/:id/share                  → Record share
GET    /campaigns/:id/share-metrics          → Get metrics
POST   /campaigns/:id/share/generate         → Generate link (CRITICAL)
POST   /campaigns/:id/track-qr-scan          → Track scan

GENERAL SHARING
GET    /shares                               → List user's shares
GET    /shares/stats                         → Platform statistics
POST   /referrals/:token/click               → Record click
GET    /referrals/history                    → User's history
```

## Common Tasks

### 1. Record a Share (Anonymous)
```bash
curl -X POST http://localhost:3000/api/campaigns/abc123/share \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "facebook",
    "message": "Check this campaign!",
    "rewardPerShare": 0.50
  }'
```

**Response**
```json
{
  "success": true,
  "data": {
    "share_id": "SHARE-2026-ABC123",
    "platform": "facebook",
    "created_at": "2026-04-05T10:30:00Z"
  }
}
```

### 2. Generate Referral Link (Auth Required)
```bash
curl -X POST http://localhost:3000/api/campaigns/abc123/share/generate \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "facebook",
    "notes": "Initial launch"
  }'
```

**Response**
```json
{
  "success": true,
  "data": {
    "shareLink": "https://honestneed.com/ref/abc123def456",
    "qrCode": "data:image/png;base64,iVBORw0KGgo...",
    "token": "abc123def456",
    "expires_at": "2026-07-04T10:30:00Z"
  }
}
```

### 3. Get Campaign Metrics
```bash
curl http://localhost:3000/api/campaigns/abc123/share-metrics \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Response**
```json
{
  "success": true,
  "data": {
    "totalShares": 45,
    "totalClicks": 230,
    "totalConversions": 12,
    "conversionRate": 5.22,
    "byPlatform": {
      "facebook": { "shares": 20, "clicks": 120, "conversions": 8 }
    }
  }
}
```

### 4. List User's Shares
```bash
curl "http://localhost:3000/api/shares?page=1&limit=20&platform=facebook" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Response**
```json
{
  "success": true,
  "data": [
    {
      "token": "abc123def456",
      "platform": "facebook",
      "click_count": 45,
      "conversion_count": 3,
      "conversion_rate": "6.67",
      "status": "active"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 45 }
}
```

### 5. Track QR Scan
```bash
curl -X POST http://localhost:3000/api/campaigns/abc123/track-qr-scan \
  -H "Content-Type: application/json" \
  -d '{
    "qrCodeId": "qr_xyz123",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "deviceType": "mobile"
  }'
```

### 6. Record Referral Click
```bash
curl -X POST http://localhost:3000/api/referrals/abc123def456/click \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 7. Get Referral History
```bash
curl "http://localhost:3000/api/referrals/history?page=1&status=converted" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## React Integration Examples

### Hook: useRecordShare
```javascript
const { mutate: recordShare, isLoading } = useMutation(
  ({ campaignId, platform, message }) =>
    apiService.post(`/campaigns/${campaignId}/share`, {
      platform,
      message
    }),
  {
    onSuccess: () => toast.success('Share recorded!'),
    onError: (error) => toast.error(error.message)
  }
);

// Usage
recordShare({
  campaignId: campaign._id,
  platform: 'facebook',
  message: 'Help this cause!'
});
```

### Hook: useGenerateReferralLink
```javascript
const { mutate: generateLink, data: link } = useMutation(
  ({ campaignId, platform }) =>
    apiService.post(`/campaigns/${campaignId}/share/generate`, {
      platform
    }),
  {
    onSuccess: () => {
      toast.success('Referral link generated!');
      queryClient.invalidateQueries(['shareMetrics']);
    }
  }
);

// Usage
generateLink({ campaignId: campaign._id, platform: 'facebook' });
```

### Hook: useShareMetrics
```javascript
const { data: metrics, isLoading } = useQuery(
  ['shareMetrics', campaignId, timeframe],
  () => apiService.get(`/campaigns/${campaignId}/share-metrics`, {
    params: { timeframe, includeBreakdown: true }
  }),
  { staleTime: 5 * 60 * 1000 }  // 5 min cache
);
```

### Component: ShareStats
```javascript
function ShareStats({ campaignId }) {
  const { data: metrics } = useQuery(
    ['shareMetrics', campaignId],
    () => apiService.get(`/campaigns/${campaignId}/share-metrics`)
  );

  if (!metrics) return <LoadingSpinner />;

  return (
    <div className="share-stats">
      <StatCard
        title="Total Shares"
        value={metrics.totalShares}
        icon="share"
      />
      <StatCard
        title="Total Clicks"
        value={metrics.totalClicks}
        subtitle={`${metrics.conversionRate}% conversion`}
      />
      <StatCard
        title="Conversions"
        value={metrics.totalConversions}
        icon="check"
      />
      <PlatformBreakdown data={metrics.byPlatform} />
    </div>
  );
}
```

## Validation Rules Cheat Sheet

```javascript
// Platform enum
['facebook', 'twitter', 'linkedin', 'email', 'whatsapp', 'link', 'other']

// Message
max 500 characters

// Reward per share
$0.01 - $100

// Device type
['mobile', 'desktop', 'tablet', 'unknown']

// Coordinates
latitude: -90 to 90 (optional)
longitude: -180 to 180 (optional)

// Timeframe
['today', 'week', 'month', 'quarter', 'year', 'all']

// Pagination
page >= 1, limits: 1-100 (default 20)

// Status
['pending', 'converted', 'expired']
```

## Error Codes Quick Ref

| Code | HTTP | Meaning |
|------|------|---------|
| CAMPAIGN_NOT_FOUND | 404 | Campaign doesn't exist |
| REFERRAL_LINK_NOT_FOUND | 404 | Token invalid |
| REFERRAL_LINK_EXPIRED | 410 | Link expired (>90 days) |
| QR_CODE_NOT_FOUND | 404 | QR code not found |
| VALIDATION_ERROR | 400 | Input invalid |
| UNAUTHORIZED | 401 | Auth required/invalid |
| FORBIDDEN | 403 | Permission denied |

## Database Queries

### Get all shares for a campaign
```javascript
ReferralLink.find({ campaign_id: campaignId })
  .populate('created_by', 'name displayName')
  .sort({ created_at: -1 })
```

### Get top campaigns by shares this month
```javascript
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
ReferralLink.aggregate([
  { $match: { created_at: { $gte: thirtyDaysAgo } } },
  { $group: {
      _id: '$campaign_id',
      totalClicks: { $sum: '$click_count' },
      totalShares: { $sum: 1 }
    }
  },
  { $sort: { totalClicks: -1 } },
  { $limit: 10 }
])
```

### Get user's conversion stats
```javascript
ReferralLink.find({ created_by: userId }).lean().map(link => ({
  token: link.token,
  clicks: link.click_count,
  conversions: link.conversion_count,
  rate: link.conversion_rate.toFixed(2)
}))
```

## Performance Notes

- Metrics: Cached 5 min TTL
- Stats: Cached 15 min TTL
- Links: Indexed on token, campaign_id, created_by
- Scans: Append-only (no updates)
- Clicks: Rate-limited 10/hour per IP

## Testing

### Test Sharing Endpoint
```bash
# Mock campaign ID
CAMPAIGN_ID="507f1f77bcf86cd799439011"

# Create share
curl -X POST http://localhost:3000/api/campaigns/$CAMPAIGN_ID/share \
  -H "Content-Type: application/json" \
  -d '{"platform":"facebook"}'

# Expect: 201 with share_id
```

### Test Referral Link Generation
```bash
curl -X POST http://localhost:3000/api/campaigns/$CAMPAIGN_ID/share/generate \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform":"facebook"}'

# Expect: 201 with shareLink and qrCode
```

### Test Metrics Query
```bash
curl "http://localhost:3000/api/campaigns/$CAMPAIGN_ID/share-metrics?timeframe=week" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Expect: 200 with totalShares, clicks, conversions
```

## Production Deployment

```bash
# 1. Deploy backend
git pull origin main
npm install
npm run build
docker-compose up -d

# 2. Verify health
curl http://localhost:3000/health

# 3. Test key endpoints
npm run test:integration -- --testPathPattern=sharing

# 4. Monitor logs
tail -f logs/app.log | grep -i share

# 5. Deploy frontend (after backend stable for 30 min)
cd ../frontend && npm run deploy
```

## Support Escalation

**Debugging**:
1. Check logs: `grep "share\|referral" logs/app.log`
2. Verify MongoDB: `db.referral_links.findOne()`
3. Check token: `ReferralLink.findByToken("abc123")`
4. Test endpoint directly with curl
5. Check auth middleware

**Common Issues**:
- Links not generating → Check Campaign exists
- Clicks not recorded → Verify token format
- Metrics show zero → Check data exists, clear cache
- Cache stale → Manually invalidate or wait 5 min

---

**Need help?** Contact backend@honestneed.com
