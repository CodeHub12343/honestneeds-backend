# Metrics & Analytics API Reference
**Status:** ✅ Production Ready  
**Last Updated:** April 11, 2026  
**Base URL:** `/api/metrics`

---

## 📊 Quick Start

All metrics endpoints require authentication. Base path is `/api/metrics`.

```bash
# Get time-series data
GET /metrics/campaigns/{id}/time-series?days=30&period=daily

# Get trend analysis
GET /metrics/campaigns/{id}/trends?days=30

# Get cohort insights
GET /metrics/campaigns/{id}/cohorts?days=90

# Predict future performance
GET /metrics/campaigns/{id}/predict?forecastDays=14

# Get everything (dashboard)
GET /metrics/campaigns/{id}/comprehensive?days=30
```

---

## 📈 TIME-SERIES ANALYTICS

### Get Time-Series Data
Retrieve historical metrics aggregated by time period (day/week/month).

```http
GET /metrics/campaigns/{campaignId}/time-series
  ?period=daily|weekly|monthly
  &days=7|14|30|60|90
```

**Query Parameters:**
- `period` (string): `daily`, `weekly`, or `monthly` — Default: `daily`
- `days` (number): Number of days to look back — Default: `30`

**Response:**
```json
{
  "success": true,
  "data": {
    "shares": {
      "success": true,
      "data": [
        {
          "date": "2026-04-11",
          "displayDate": "2026-04-11",
          "shares": 12,
          "paidShares": 10,
          "totalReward": 15600,
          "rewardUSD": 156.00,
          "avgReward": 1300,
          "channels": ["telegram", "facebook"]
        },
        ...
      ],
      "summary": {
        "total": 85,
        "totalRewardUSD": "$1,105.00",
        "avgPerDay": "2.83",
        "dataPoints": 30
      },
      "period": "daily",
      "days": 30,
      "dateRange": {
        "start": "2026-03-12T00:00:00.000Z",
        "end": "2026-04-11T00:00:00.000Z"
      }
    },
    "donations": {
      "success": true,
      "data": [
        {
          "date": "2026-04-11",
          "count": 5,
          "totalAmount": 25000,
          "amountUSD": 250.00,
          "avgAmount": 5000,
          "avgAmountUSD": 50.00,
          "maxAmount": 10000,
          "minAmount": 1000
        },
        ...
      ],
      "summary": {
        "total": 42,
        "totalAmountUSD": "$5,250.00",
        "avgPerDonation": "125.00"
      }
    },
    "engagement": {
      "shares": [...],
      "donations": [...],
      "conversions": [...]
    }
  }
}
```

---

## 📊 TREND ANALYSIS

### Get Comprehensive Trend Analysis
Analyze growth trends, momentum, and generate forecasts.

```http
GET /metrics/campaigns/{campaignId}/trends
  ?days=30
```

**Response:**
```json
{
  "success": true,
  "data": {
    "campaign": {
      "success": true,
      "campaignId": "...",
      "period": {
        "start": "2026-03-12T00:00:00.000Z",
        "end": "2026-04-11T00:00:00.000Z",
        "days": 30
      },
      "trend": {
        "slope": "0.1234",
        "intercept": "8.50",
        "r_squared": "0.8765",
        "direction": "strongly_uptrend"
      },
      "movingAverages": {
        "avg_7day": "9.43",
        "avg_30day": "8.17"
      },
      "momentum": {
        "value": "0.45",
        "interpretation": "accelerating"
      },
      "volatility": {
        "standardDeviation": "3.24",
        "coefficient": "0.3421",
        "interpretation": "medium"
      },
      "anomalies": {
        "count": 2,
        "items": [
          {
            "date": "2026-04-05",
            "value": 45,
            "deviation": 2.5
          }
        ]
      },
      "forecast": {
        "next_7_days": "75",
        "confidence_interval": {
          "upper": "95.50",
          "lower": "54.50"
        }
      },
      "recommendation": "🟢 Strong uptrend detected. Momentum is accelerating. Campaign is performing well."
    },
    "byPlatform": {
      "platformTrends": [
        {
          "platform": "telegram",
          "totalShares": 45,
          "totalReward": 58500,
          "trend": {
            "direction": "uptrend",
            "strength": "8.43",
            "growthRate": "12.50"
          },
          "forecast": {
            "nextPeriod": 8,
            "confidence": "87.65"
          }
        },
        ...
      ],
      "topPerformers": [...],
      "underperformers": [...]
    },
    "seasonal": {
      "dayOfWeekMetrics": {
        "Monday": {
          "shares": 18,
          "rewards": 23400,
          "hourlyBreakdown": {
            "2": 4,
            "14": 8,
            "18": 6
          }
        },
        ...
      },
      "bestDay": "Friday",
      "bestDayShares": 22,
      "worstDay": "Sunday",
      "worstDayShares": 8,
      "recommendation": "Peak sharing occurs on Fridays. Consider scheduling promotional content for that day. Best time for sharing: 14:00 (2PM)."
    }
  }
}
```

### Get Platform Trends
Which channels are trending up or down?

```http
GET /metrics/campaigns/{campaignId}/platform-trends
  ?days=30
```

### Get Seasonal Pattern Analysis
Best days and times for engagement.

```http
GET /metrics/campaigns/{campaignId}/seasonal
  ?days=60
```

### Compare Performance Across Periods
Week-over-week, month-over-month, or year-over-year comparison.

```http
GET /metrics/campaigns/{campaignId}/compare-periods
  ?type=WoW|MoM|YoY
```

**Response:**
```json
{
  "success": true,
  "data": {
    "comparisonType": "WoW",
    "current": {
      "period": [...],
      "total": 42
    },
    "previous": {
      "period": [...],
      "total": 38
    },
    "growth": "10.53",
    "changeType": "positive"
  }
}
```

---

## 👥 COHORT ANALYSIS

### Get Campaign Cohort Insights
Analyze supporter groups by acquisition period and track retention.

```http
GET /metrics/campaigns/{campaignId}/cohorts
  ?days=90
```

**Response:**
```json
{
  "success": true,
  "data": {
    "campaign": {
      "success": true,
      "campaignId": "...",
      "lookbackDays": 90,
      "cohortCount": 13,
      "cohorts": [
        {
          "cohortName": "Week of 2026-04-01",
          "cohortDate": "2026-04-01",
          "size": 12,
          "acquisition": {
            "firstActive": "2026-04-01",
            "size": 12,
            "primaryChannel": "telegram"
          },
          "retention": {
            "day7": "75.0%",
            "day30": "58.3%",
            "day60": "41.7%",
            "rate": "58.3%"
          },
          "lifetime": {
            "totalShares": 85,
            "totalEarnings": 110500,
            "earningsUSD": "1105.00",
            "avgPerSupporter": "92.08"
          },
          "channelBreakdown": [
            {
              "channel": "telegram",
              "count": 8,
              "earnings": 80000
            },
            ...
          ]
        },
        ...
      ],
      "summary": {
        "totalCohorts": 13,
        "bestCohort": "Week of 2026-04-01",
        "bestCohortEarnings": "$1105.00",
        "avgRetentionRate": "72.3%",
        "recommendation": "✅ Strong retention across cohorts"
      }
    },
    "byChannel": {
      "success": true,
      "campaignId": "...",
      "channelCohorts": [
        {
          "channel": "telegram",
          "supporters": 45,
          "totalShares": 125,
          "totalEarnings": 162500,
          "earningsUSD": "1625.00",
          "avgSharesPerSupporter": "2.78",
          "avgEarningsPerSupporter": "36.11",
          "roi": "high"
        },
        ...
      ]
    }
  }
}
```

### Get All Acquisition Cohorts (Admin)
Analyze all supporter acquisition cohorts across all campaigns.

```http
GET /metrics/user/cohorts
  ?days=180
```

Requires: `admin` role

### Get Channel Cohort Performance
How do different traffic sources perform?

```http
GET /metrics/campaigns/{campaignId}/channel-cohorts
```

---

## 🔮 PREDICTIVE ANALYTICS

### Predict Campaign Performance
Forecast future performance with confidence intervals.

```http
GET /metrics/campaigns/{campaignId}/predict
  ?forecastDays=14
```

**Response:**
```json
{
  "success": true,
  "data": {
    "forecast": {
      "success": true,
      "campaignId": "...",
      "forecastPeriod": {
        "start": "2026-04-11T00:00:00.000Z",
        "end": "2026-04-25T00:00:00.000Z",
        "days": 14
      },
      "historicalAverage": "2.83",
      "forecast": {
        "projectedShares": [3, 4, 3, 4, 4, 3, 5, 3, 4, 4, 3, 5, 4, 3],
        "totalProjectedShares": 52,
        "dailyAverage": "3.71",
        "trend": "increasing",
        "trendStrength": "0.3421"
      },
      "confidence": {
        "interval": "95%",
        "upper": [8, 10, 9, 11, 12, 10, 13, 10, 11, 12, 9, 13, 12, 10],
        "lower": [0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0]
      },
      "successMetrics": {
        "probability": "82.45",
        "likelihood": "Likely",
        "baselineComparison": "78.5% of goal achieved so far"
      },
      "budgetProjection": {
        "remainingBudgetUSD": "450.00",
        "projectedSpendUSD": "67.60",
        "depletionDays": null,
        "depletionDate": "Not expected"
      },
      "recommendations": [
        "✅ Campaign is on track to meet goals",
        "📊 Budget is sufficient for forecasted period"
      ]
    },
    "optimization": {
      "success": true,
      "campaignId": "...",
      "currentReward": 1300,
      "analysis": {
        "totalShares": 85,
        "avgReward": 1300,
        "avgRewardUSD": "13.00"
      },
      "recommendation": {
        "optimalRewardCents": 1500,
        "optimalRewardUSD": "15.00",
        "expectedShareIncrease": "12%",
        "reasoning": "Increasing reward to $15.00 could boost shares based on platform analysis"
      },
      "rewardBrackets": [...]
    }
  }
}
```

### Predict Supporter Activity
Will a specific supporter continue sharing?

```http
GET /metrics/user/{supporterId}/activity-predict
  ?campaignId={campaignId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "supporterId": "...",
    "campaignId": "...",
    "activityScore": 78,
    "metrics": {
      "totalShares": 15,
      "daysSinceLastShare": 2,
      "sharesPerWeek": "3.50",
      "momentum": "0.75",
      "isActive": true
    },
    "prediction": {
      "likelihood": "Very likely",
      "nextShareWithin": "2026-04-13",
      "expectedSharesNext30Days": 8
    }
  }
}
```

### Optimize Reward Strategy
What reward amount maximizes shares received?

```http
GET /metrics/campaigns/{campaignId}/optimize-rewards
```

---

## 📊 COMPREHENSIVE DASHBOARD

Get all analytics in one call for a complete dashboard.

```http
GET /metrics/campaigns/{campaignId}/comprehensive
  ?days=30
```

Combines:
- Time-series data
- Trend analysis  
- Cohort analysis
- Predictive analytics

Perfect for dashboard initialization.

---

## 🎯 SUPPORTER ANALYTICS

### Get Supporter Tier Trends
Analyze earning trends for individual supporter.

```http
GET /metrics/user/trends
  ?supporterId={id}&days=30
```

### Get All Supporter Cohorts (Admin)
Analyze all supporter acquisition cohorts.

```http
GET /metrics/user/cohorts
  ?days=180
```

---

## 📥 DATA EXPORT

Export analytics data in your preferred format.

```http
GET /metrics/export
  ?campaignId={id}
  &format=json|csv
  &days=30
```

**Formats:**
- `json` - JSON format (default)
- `csv` - CSV download

**Response (JSON):**
```json
{
  "success": true,
  "data": {...},
  "exportedAt": "2026-04-11T12:34:56.000Z"
}
```

**Response (CSV):**
```
date,shares,rewards,avgReward
2026-04-01,5,6500,1300
2026-04-02,3,3900,1300
...
```

---

## ⏱️ Query Parameters Reference

| Parameter | Endpoint | Values | Default | Description |
|-----------|----------|--------|---------|-------------|
| `days` | most | 7, 14, 30, 60, 90 | 30 | Days to look back |
| `period` | time-series | daily, weekly, monthly | daily | Aggregation period |
| `forecastDays` | predict | 7, 14, 30 | 14 | Days to forecast |
| `type` | compare-periods | WoW, MoM, YoY | WoW | Comparison period |
| `format` | export | json, csv | json | Export format |

---

## 🔒 Authentication & Authorization

**All endpoints require:**
- `Authorization: Bearer {JWT}`
- Valid user session

**Some endpoints require specific roles:**
- `/user/cohorts` - `admin` only
- `/export` - `admin` or `creator`

---

## ⚡ Performance Tips

1. **Caching**: Time-series data is cached for 1 hour
2. **Aggregation**: Monthly aggregation is faster than daily
3. **Date Range**: Limit to last 90 days for faster queries
4. **Batch**: Use comprehensive endpoint for dashboard initialization
5. **Export**: CSV format is lighter weight than JSON

---

## 🐛 Error Handling

All endpoints return standard error responses:

```json
{
  "success": false,
  "error": "Campaign not found"
}
```

**Common Status Codes:**
- `200` - Success
- `400` - Invalid query parameters
- `401` - Unauthorized (missing/invalid JWT)
- `403` - Forbidden (insufficient permissions)
- `404` - Resource not found
- `500` - Server error

---

## 📚 Usage Examples

### Example 1: Dashboard Initialization
```javascript
const response = await fetch(
  '/api/metrics/campaigns/62f1e4c09f8a2b001a5c8d1e/comprehensive?days=30',
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);
const { data } = await response.json();
```

### Example 2: Real-time Monitoring
```javascript
// Fetch latest trends
const trends = await fetch(
  '/api/metrics/campaigns/62f1e4c09f8a2b001a5c8d1e/trends?days=7',
  { headers: { 'Authorization': `Bearer ${token}` } }
).then(r => r.json());

// Show direction & momentum
console.log(`Trend: ${trends.data.campaign.trend.direction}`);
console.log(`Momentum: ${trends.data.campaign.momentum.value}`);
```

### Example 3: Forecast & Plan
```javascript
const forecast = await fetch(
  '/api/metrics/campaigns/62f1e4c09f8a2b001a5c8d1e/predict?forecastDays=14',
  { headers: { 'Authorization': `Bearer ${token}` } }
).then(r => r.json());

// Check if budget will be depleted
if (forecast.data.forecast.budgetProjection.depletionDays) {
  console.log(`Budget depletes in ${forecast.data.forecast.budgetProjection.depletionDays} days`);
}
```

### Example 4: Cohort Analysis
```javascript  
const cohorts = await fetch(
  '/api/metrics/campaigns/62f1e4c09f8a2b001a5c8d1e/cohorts?days=90',
  { headers: { 'Authorization': `Bearer ${token}` } }
).then(r => r.json());

// Find best performing cohort
const best = cohorts.data.campaign.cohorts[0];
console.log(`Best cohort: ${best.cohortName} with ${best.lifetime.totalShares} shares`);
```

---

**Document Version:** 1.0  
**Status:** Production Ready  
**Last Updated:** April 11, 2026
