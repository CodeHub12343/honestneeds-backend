# Analytics Components - Quick Reference Guide

## Component Import

All components are exported from `@/components/analytics`:

```typescript
import {
  TimeSeriesChart,
  TrendIndicator,
  TrendIndicatorRow,
  ForecastingChart,
  CohortRetentionTable,
  SeasonalHeatmap,
  PeriodComparisonChart,
  ChannelROIChart,
  OptimizationPanel,
  ActivityPredictionCard
} from '@/components/analytics'
```

---

## 1. TimeSeriesChart

**Purpose**: Display trends over time (shares, donations, signups, etc.)

**Props**:
- `data: TimeSeriesDataPoint[]` - Array of time-series points {date, displayDate, ...metrics}
- `title?: string` - Chart title
- `metrics: Metric[]` - Array of {key, label, color, type?} where type is 'line' | 'area' | 'bar'
- `height?: number` - Chart height in px (default: 400)
- `loading?: boolean` - Show loading state
- `showLegend?: boolean` - Display legend
- `showGrid?: boolean` - Display gridlines

**Example**:
```jsx
<TimeSeriesChart
  data={[
    { date: '2024-01-15', displayDate: 'Jan 15', shares: 125, donations: 500 },
    { date: '2024-01-16', displayDate: 'Jan 16', shares: 145, donations: 620 }
  ]}
  title="Daily Activity"
  metrics={[
    { key: 'shares', label: 'Shares', color: '#3b82f6', type: 'area' },
    { key: 'donations', label: 'Donations', color: '#10b981', type: 'line' }
  ]}
/>
```

**Data Format**:
```javascript
{
  date: "2024-01-15",           // ISO date string
  displayDate: "Jan 15",        // For x-axis labels
  shares: 125,                  // Numeric metrics
  donations: 500
}
```

---

## 2. TrendIndicator

**Purpose**: Show single metric with trend direction (↑↓→) and % change

**Props**:
- `value: number | string` - Metric value
- `label: string` - Metric label
- `unit?: string` - Unit suffix (e.g., "shares", "USD")
- `direction?: 'up' | 'down' | 'neutral'` - Trend direction (auto-detected if using percentChange)
- `percentChange?: number` - Percentage change
- `previousValue?: number` - Calculates percentChange if provided
- `size?: 'small' | 'medium' | 'large'` - Component size
- `showUnit?: boolean` - Display unit in value

**Example**:
```jsx
<TrendIndicator
  value={1250}
  label="Total Shares"
  unit="shares"
  percentChange={12.5}
  size="large"
/>
```

### TrendIndicatorRow

**Purpose**: Display multiple trend indicators in a grid

**Props**:
- `indicators: TrendIndicatorProps[]` - Array of indicator props
- `title?: string` - Section title

**Example**:
```jsx
<TrendIndicatorRow
  title="Performance Metrics"
  indicators={[
    { value: 1250, label: 'Shares', percentChange: 12.5 },
    { value: '5430', label: 'Audience', percentChange: 8.2 },
    { value: '$12,500', label: 'Donations', percentChange: -5.1 }
  ]}
/>
```

---

## 3. ForecastingChart

**Purpose**: Display predictions with confidence intervals

**Props**:
- `data: ForecastDataPoint[]` - Points with actual, forecast, upper, lower values
- `title?: string` - Chart title
- `confidence?: number` - Confidence level % (e.g., 95)
- `actualLabel?: string` - Label for actual data (default: "Actual")
- `forecastLabel?: string` - Label for forecast (default: "Forecast")
- `accuracy?: number` - Model accuracy %
- `height?: number` - Chart height in px
- `loading?: boolean` - Loading state

**Example**:
```jsx
<ForecastingChart
  data={[
    { date: '2024-01-20', actual: 150, forecast: 145, upper: 180, lower: 110 },
    { date: '2024-01-21', forecast: 155, upper: 185, lower: 125 }, // forecast-only
    { date: '2024-01-22', forecast: 160, upper: 190, lower: 130 }
  ]}
  title="7-Day Share Forecast"
  confidence={90}
  accuracy={87}
/>
```

**Data Format**:
```javascript
// Historical period (with actual data)
{
  date: "2024-01-20",
  actual: 150,
  forecast: 145,
  upper: 180,
  lower: 110
}

// Forecast period (actual is undefined)
{
  date: "2024-01-21",
  forecast: 155,
  upper: 185,
  lower: 125
}
```

---

## 4. CohortRetentionTable

**Purpose**: Display cohort retention rates over time

**Props**:
- `data: CohortData[]` - Array of {cohort, cohortSize, retention[]}
- `title?: string` - Table title
- `loading?: boolean` - Loading state
- `onCohortClick?: (cohort: string) => void` - Click handler

**Example**:
```jsx
<CohortRetentionTable
  data={[
    {
      cohort: 'Week of 2024-01-01',
      cohortSize: 500,
      retention: [
        { day: 0, rate: 100, count: 500 },
        { day: 7, rate: 85, count: 425 },
        { day: 30, rate: 60, count: 300 }
      ]
    }
  ]}
  title="User Cohort Retention"
/>
```

**Data Format**:
```javascript
{
  cohort: "Week of 2024-01-01",  // Cohort identifier
  cohortSize: 500,               // Initial cohort size
  retention: [
    { day: 0, rate: 100, count: 500 },   // Day 0: 100% of 500
    { day: 7, rate: 85, count: 425 },    // Day 7: 85% of 500
    { day: 30, rate: 60, count: 300 }    // Day 30: 60% of 500
  ]
}
```

---

## 5. SeasonalHeatmap

**Purpose**: Show intensity patterns by two dimensions (e.g., day × hour)

**Props**:
- `data: HeatmapData[]` - Points with day, hour, value
- `title?: string` - Heatmap title
- `valueKey?: string` - Data key for intensities (default: "value")
- `xAxisKey?: string` - X-axis data key (default: "hour")
- `yAxisKey?: string` - Y-axis data key (default: "day")
- `loading?: boolean` - Loading state

**Example**:
```jsx
<SeasonalHeatmap
  data={[
    { day: 'Monday', hour: 9, engagement: 250 },
    { day: 'Monday', hour: 10, engagement: 320 },
    // ... all 7 days × 24 hours
  ]}
  title="Employee Activity Heatmap"
  valueKey="engagement"
  xAxisKey="hour"
  yAxisKey="day"
/>
```

**Color Coding**:
- Green (intense): High value ≥ 80%
- Blue: Medium-high 60-79%
- Yellow: Medium 40-59%
- Red: Low < 40%

---

## 6. PeriodComparisonChart

**Purpose**: Compare metrics across periods (WoW, MoM, YoY)

**Props**:
- `data: PeriodComparisonData[]` - Periods with metrics
- `title?: string` - Chart title
- `periods: Period[]` - Array of {key, label, color}
- `height?: number` - Chart height
- `bestIndicator?: boolean` - Highlight best values
- `loading?: boolean` - Loading state

**Example**:
```jsx
<PeriodComparisonChart
  data={[
    { period: 'Jan 2024', thisMonth: 1250, lastMonth: 1100 },
    { period: 'Feb 2024', thisMonth: 1450, lastMonth: 1250 }
  ]}
  periods={[
    { key: 'thisMonth', label: 'This Month', color: '#3b82f6' },
    { key: 'lastMonth', label: 'Last Month', color: '#d1d5db' }
  ]}
  bestIndicator={true}
/>
```

---

## 7. ChannelROIChart

**Purpose**: Compare ROI and spend across marketing channels

**Props**:
- `data: ChannelData[]` - Channels with spend, revenue, ROI
- `title?: string` - Chart title
- `height?: number` - Chart height
- `currencySymbol?: string` - Currency display (default: "$")
- `loading?: boolean` - Loading state

**Example**:
```jsx
<ChannelROIChart
  data={[
    {
      channel: 'Email',
      spend: 500,
      revenue: 2500,
      roi: 400,
      impressions: 10000,
      clicks: 250,
      conversions: 50
    },
    {
      channel: 'Social',
      spend: 1000,
      revenue: 3500,
      roi: 250,
      impressions: 50000,
      clicks: 1200,
      conversions: 120
    }
  ]}
  title="Channel Performance Analysis"
  currencySymbol="$"
/>
```

---

## 8. OptimizationPanel

**Purpose**: Display AI recommendations for improvements

**Props**:
- `recommendations: Recommendation[]` - Array of recommendations
- `title?: string` - Panel title
- `loading?: boolean` - Loading state

**Example** **:
```jsx
<OptimizationPanel
  recommendations={[
    {
      id: 'rec-1',
      title: 'Increase Reward per Share',
      description: 'Supporters engage 23% better with rewards ≥$2.50',
      impact: 'high',
      priority: 'critical',
      category: 'reward',
      action: 'Edit Campaign',
      expectedImprovement: 23
    },
    {
      id: 'rec-2',
      title: 'Expand to TikTok',
      description: 'Platform shows strong Gen Z engagement for similar campaigns',
      impact: 'high',
      priority: 'major',
      category: 'platform',
      expectedImprovement: 15
    }
  ]}
  title="Campaign Optimization Tips"
/>
```

**Recommendation Fields**:
- `id: string` - Unique ID
- `title: string` - Short title
- `description: string` - Detailed explanation
- `impact: 'high' | 'medium' | 'low'` - Expected impact
- `priority: 'critical' | 'major' | 'minor'` - Priority level
- `category: 'reward' | 'budget' | 'timing' | 'platform' | 'audience'` - Category
- `action?: string` - CTA button text
- `expectedImprovement?: number` - % improvement expected

---

## 9. ActivityPredictionCard

**Purpose**: Show predicted user engagement scores and activity patterns

**Props**:
- `predictions: ActivityPrediction[]` - Array of user predictions
- `title?: string` - Card title
- `loading?: boolean` - Loading state
- `onUserClick?: (userId: string) => void` - Click handler
- `currencySymbol?: string` - Currency (default: "$")

**Example**:
```jsx
<ActivityPredictionCard
  predictions={[
    {
      userId: 'user-123',
      userName: 'John Doe',
      activityScore: 85,
      prediction: 'high',
      lastActivityDays: 2,
      engagementTrend: 'increasing',
      estimatedValue: 150.50,
      riskLevel: 'low',
      nextPredictedActivityDate: '2024-01-25'
    }
  ]}
  onUserClick={(userId) => navigateToUserProfile(userId)}
  currencySymbol="$"
/>
```

---

## Utility Functions

### dateFilters.ts

```typescript
import {
  getDateRange,
  formatDate,
  formatDateISO,
  groupByPeriod,
  aggregateMetrics,
  filterByDateRange,
  calculateDateOverDate,
  fillMissingDates,
  getComparisonRange,
  formatNumber,
  calculateMovingAverage
} from '@/utils/dateFilters'

// Get predefined date ranges
const range = getDateRange('30d')
// Returns: { startDate: Date, endDate: Date, label: 'Last 30 Days', type: '30d' }

// Custom date range
const custom = getDateRange('custom', startDate, endDate)

// Format for display
formatDate(new Date()) // "Jan 15, 24"
formatDate(new Date(), 'long') // "January 15, 2024"

// Format for API
formatDateISO(new Date()) // "2024-01-15"

// Group time-series data
const grouped = groupByPeriod(data, 'createdAt', 'day')
// Returns: Map with date keys and array values

// Aggregate grouped data
const aggregated = aggregateMetrics(grouped, ['shares', 'donations'], 'sum')

// Filter by date range
const filtered = filterByDateRange(data, 'createdAt', range)

// Calculate period-over-period change
const comparison = calculateDateOverDate(currentData, previousData, 'donations')
// Returns: { current: 5000, previous: 4500, change: 500, percentChange: 11.1 }

// Fill missing dates in time-series
const filled = fillMissingDates(data, 'date', 'day')

// Get comparison range for YoY/MoM/WoW
const lastYear = getComparisonRange(range, 'yoy')

// Format large numbers
formatNumber(1250000) // "1.3M"
formatNumber(1250) // "1.3K"

// Calculate 7-day moving average
const smoothed = calculateMovingAverage(data, 'shares', 7)
```

### useMetricsFilters Hook

```typescript
import { useMetricsFilters } from '@/hooks/useMetricsFilters'

const {
  state,          // { dateRange, filters, dateRangeType, ... }
  setDateRange,   // (type, startDate?, endDate?) => void
  setFilter,      // (key, value) => void
  clearFilter,    // (key) => void
  clearAllFilters,// () => void
  applyFilters    // (data, dateKey) => filtered[]
} = useMetricsFilters('30d')

// Change date range
setDateRange('7d')
setDateRange('custom', startDate, endDate)

// Set filters
setFilter('campaignType', 'fundraising')
setFilter('minAmount', { min: 100, max: 10000 }) // Range filter
setFilter('platforms', ['email', 'social']) // Multi-select

// Apply all filters  
const filtered = applyFilters(rawData, 'createdAt')

// Clear
clearFilter('campaignType')
clearAllFilters()
```

---

## Common Patterns

### Page Setup
```jsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { useMetricsFilters } from '@/hooks/useMetricsFilters'
import { TimeSeriesChart, ... } from '@/components/analytics'
import axios from 'axios'

export default function AnalyticsPage() {
  const { state, setDateRange, applyFilters } = useMetricsFilters('30d')
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', state.dateRange],
    queryFn: async () => {
      const res = await axios.get('/api/analytics', {
        params: {
          startDate: state.dateRange.startDate.toISOString(),
          endDate: state.dateRange.endDate.toISOString()
        }
      })
      return res.data
    }
  })

  return (
    <>
      <TimeSeriesChart data={data?.timeSeries} loading={isLoading} />
    </>
  )
}
```

### Error Handling
```jsx
{error && <ErrorMessage>Failed to load data</ErrorMessage>}
{isLoading && <LoadingMessage>Loading metrics...</LoadingMessage>}
{!data && <NoDataMessage>No data available for this period</NoDataMessage>}
```

### Responsive Grid
```jsx
const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  
  @media (min-width: 1200px) {
    grid-template-columns: repeat(2, 1fr);
  }
`

const FullWidth = styled.div`
  grid-column: 1 / -1;
`
```

---

## Color Reference

| Color | Hex | Usage |
|-------|-----|-------|
| Blue | #3b82f6 | Primary, default metric |
| Green | #10b981 | Success, growth |
| Purple | #8b5cf6 | Forecast, secondary |
| Amber | #f59e0b | Warning, medium priority |
| Red | #dc2626 | Error, critical |
| Gray | #6b7280 | Neutral, secondary text |

---

**Last Updated**: April 11, 2026  
**All Components**: Production Ready  
**Next Action**: Run `npm install` and test with API data
