# Dashboard Implementation Technical Specifications

**Document**: Enhanced Creator Dashboard - Technical Details  
**Version**: 1.0  
**Date**: April 11, 2026

---

## 1. Frontend Architecture

### 1.1 New File Structure

```
honestneed-frontend/app/(creator)/dashboard/
│
├── page.tsx                          # Main dashboard page (refactored - 400 lines)
├── layout.tsx                        # Dashboard layout wrapper
│
├── components/                       # ~15 new/modified components
│   ├── DashboardHeader.tsx          # Page title, create button, view toggles
│   ├── QuickStats.tsx               # KPI cards with trends (3-4 cards)
│   ├── ActivityFeed.tsx             # Timeline of recent activities
│   ├── CampaignCard.tsx             # Reusable campaign card (grid/list)
│   ├── CampaignList.tsx             # Table view of campaigns
│   ├── CampaignGrid.tsx             # Grid view of campaigns
│   ├── PerformanceChart.tsx         # Line/area charts
│   ├── ComparisonView.tsx           # Multi-campaign comparison table
│   ├── FilterPanel.tsx              # Advanced filtering UI
│   ├── SortMenu.tsx                 # Sorting options
│   ├── QuickActionsBar.tsx          # Bulk action buttons
│   ├── ViewToggle.tsx               # List/Grid/Detail view switcher
│   ├── HealthScore.tsx              # Campaign health score display
│   ├── RecommendationsPanel.tsx     # AI-powered suggestions
│   ├── SavedViewsList.tsx           # Saved filter views
│   ├── ExportModal.tsx              # CSV/PDF export UI
│   └── NotificationBanner.tsx       # Real-time notification display
│
├── hooks/                           # Custom React hooks
│   ├── useDashboardData.ts          # Fetches all dashboard data
│   ├── useCampaignFilters.ts        # Filter state management
│   ├── useActivityFeed.ts           # Real-time activity updates
│   ├── useCampaignComparison.ts     # Comparison data fetching
│   ├── useSavedViews.ts             # Manage saved filter views
│   ├── useDashboardExport.ts        # Export logic
│   └── useDashboardNotifications.ts # Notification handling
│
├── utils/                           # Utility functions
│   ├── dashboardCalculations.ts     # Health score, trends, forecasts
│   ├── filterBuilders.ts            # Build query from filters
│   ├── sortHelpers.ts               # Campaign sorting logic
│   ├── searchSyntax.ts              # Advanced search parsing
│   ├── exportGenerators.ts          # CSV/PDF generation
│   └── constants.ts                 # Dashboard constants
│
└── types/                           # TypeScript types
    ├── dashboard.types.ts           # Dashboard-specific types
    ├── campaign.types.ts            # Campaign types
    └── filter.types.ts              # Filter types
```

### 1.2 State Management Architecture

#### Global Application State (Zustand Store)
```typescript
// store/useDashboardStore.ts
export const useDashboardStore = create((set) => ({
  // View State
  viewMode: 'list' | 'grid' | 'detail', // Default: 'list'
  
  // Filter State
  filters: {
    status: ['active', 'draft'], // Multi-select
    type: ['fundraising', 'sharing'],
    progress: [0, 100],
    created: { from?: Date, to?: Date },
    custom: '',
  },
  
  // Sort State
  sortBy: 'created-desc',
  
  // Pagination
  currentPage: 1,
  pageSize: 10,
  
  // Preferences
  preferences: {
    showActivityFeed: true,
    showHealthScores: true,
    showCharts: true,
    compactView: false,
  },
  
  // Notifications
  notifications: []
  
  // Actions
  setViewMode: (mode) => set({ viewMode: mode }),
  setFilters: (filters) => set({ filters }),
  setSortBy: (sort) => set({ sortBy: sort }),
  // ... other setters
}))
```

#### React Query Keys (Hierarchy)
```typescript
// hooks/queryKeys.ts
export const dashboardKeys = {
  all: ['dashboard'],
  list: () => [...dashboardKeys.all, 'list'],
  listWithFilters: (filters) => [...dashboardKeys.list(), filters],
  campaigns: () => [...dashboardKeys.all, 'campaigns'],
  campaignList: (page, limit, filters) => 
    [...dashboardKeys.campaigns(), { page, limit, filters }],
  stats: () => [...dashboardKeys.all, 'stats'],
  activity: () => [...dashboardKeys.all, 'activity'],
  performance: (period) => [...dashboardKeys.all, 'performance', period],
  comparison: (ids) => [...dashboardKeys.all, 'comparison', ids],
  savedViews: () => [...dashboardKeys.all, 'saved-views'],
}
```

---

## 2. Component Specifications

### 2.1 DashboardHeader Component

```typescript
// components/DashboardHeader.tsx
interface DashboardHeaderProps {
  totalCampaigns: number
  activeCampaigns: number
  onCreateClick: () => void
  onExportClick: () => void
  viewMode: 'list' | 'grid'
  onViewModeChange: (mode: 'list' | 'grid') => void
}

export function DashboardHeader(props: DashboardHeaderProps) {
  return (
    <header className="dashboard-header">
      <div className="header-left">
        <h1>Creator Dashboard</h1>
        <p className="subtitle">{props.activeCampaigns} active campaigns</p>
      </div>
      
      <div className="header-right">
        {/* View Mode Toggles */}
        <div className="view-toggles">
          <button
            className={props.viewMode === 'list' ? 'active' : ''}
            onClick={() => props.onViewModeChange('list')}
            title="List view"
          >
            <List size={18} />
          </button>
          <button
            className={props.viewMode === 'grid' ? 'active' : ''}
            onClick={() => props.onViewModeChange('grid')}
            title="Grid view"
          >
            <Grid size={18} />
          </button>
        </div>
        
        {/* Action Buttons */}
        <button className="btn-secondary" onClick={props.onExportClick}>
          <Download size={16} /> Export
        </button>
        <button className="btn-primary" onClick={props.onCreateClick}>
          <Plus size={16} /> Create Campaign
        </button>
      </div>
    </header>
  )
}
```

### 2.2 QuickStats Component

```typescript
// components/QuickStats.tsx
interface StatCardProps {
  title: string
  value: string | number
  unit?: string
  trend?: {
    value: number // percentage
    direction: 'up' | 'down' | 'neutral'
    period: string
  }
  goal?: {
    label: string
    value: number
    percentage: number
  }
  icon?: React.ReactNode
  color?: 'blue' | 'green' | 'purple' | 'orange'
  onClick?: () => void
  actionLabel?: string
}

export function QuickStats(props: { stats: CreatorStats }) {
  return (
    <div className="quick-stats">
      <StatCard
        title="Total Raised"
        value={formatCurrency(props.stats.totalRaised)}
        trend={{
          value: 18,
          direction: 'up',
          period: 'last 30 days'
        }}
        goal={{
          label: 'Target',
          value: 150000,
          percentage: props.stats.totalRaised / 1500
        }}
        icon={<DollarSign />}
        color="green"
        actionLabel="View breakdown"
      />
      
      <StatCard
        title="Active Campaigns"
        value={props.stats.activeCampaigns}
        unit="campaigns"
        trend={{
          value: 2, // +2 since last month
          direction: 'up',
          period: 'vs last month'
        }}
        icon={<TrendingUp />}
        color="blue"
      />
      
      <StatCard
        title="Total Donors"
        value={props.stats.totalDonors}
        unit="supporters"
        trend={{
          value: 32,
          direction: 'up',
          period: '30 days'
        }}
        icon={<Users />}
        color="purple"
      />
      
      <StatCard
        title="Conversion Rate"
        value={`${props.stats.conversionRate.toFixed(1)}%`}
        unit="visitors → donors"
        trend={{
          value: 5,
          direction: 'up',
          period: 'vs previous period'
        }}
        icon={<BarChart3 />}
        color="orange"
      />
    </div>
  )
}
```

### 2.3 ActivityFeed Component

```typescript
// components/ActivityFeed.tsx
interface ActivityFeedProps {
  activities: Activity[]
  isLoading?: boolean
  onViewMore?: () => void
  limit?: number
}

export function ActivityFeed(props: ActivityFeedProps) {
  const { activities, isLoading, limit = 5 } = props
  
  if (isLoading) return <LoadingSpinner />
  
  return (
    <div className="activity-feed">
      <div className="feed-header">
        <h3>Recent Activity</h3>
        <button size="sm" variant="ghost">View all →</button>
      </div>
      
      <div className="activity-timeline">
        {activities.slice(0, limit).map((activity) => (
          <div key={activity.id} className="activity-item">
            <div className="activity-time">
              {formatRelativeTime(activity.timestamp)}
            </div>
            
            <div className="activity-icon">
              {getActivityIcon(activity.type)}
            </div>
            
            <div className="activity-content">
              <p className="activity-title">{activity.title}</p>
              {activity.description && (
                <p className="activity-description">{activity.description}</p>
              )}
              {activity.metadata?.amount && (
                <span className="activity-amount">
                  +{formatCurrency(activity.metadata.amount)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 2.4 FilterPanel Component

```typescript
// components/FilterPanel.tsx
interface FilterPanelProps {
  filters: FilterConfig
  onFilterChange: (filters: FilterConfig) => void
  onSaveView?: (viewName: string) => void
  savedViews?: SavedView[]
  onLoadView?: (viewId: string) => void
}

export function FilterPanel(props: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  return (
    <div className="filter-panel">
      <div className="filter-header">
        <button onClick={() => setIsExpanded(!isExpanded)}>
          <Filter size={16} />
          Filters {props.filters && '(Active)'}
        </button>
      </div>
      
      {isExpanded && (
        <div className="filter-content">
          {/* Status Filter */}
          <div className="filter-group">
            <label>Campaign Status</label>
            <div className="filter-options">
              {['draft', 'active', 'paused', 'completed'].map((status) => (
                <label key={status} className="checkbox">
                  <input
                    type="checkbox"
                    checked={props.filters.status?.includes(status)}
                    onChange={(e) => {
                      const newStatus = e.target.checked
                        ? [...(props.filters.status || []), status]
                        : props.filters.status?.filter((s) => s !== status)
                      props.onFilterChange({ ...props.filters, status: newStatus })
                    }}
                  />
                  {capitalize(status)}
                </label>
              ))}
            </div>
          </div>
          
          {/* Campaign Type Filter */}
          <div className="filter-group">
            <label>Campaign Type</label>
            <div className="filter-options">
              {['fundraising', 'sharing'].map((type) => (
                <label key={type} className="checkbox">
                  <input
                    type="checkbox"
                    checked={props.filters.type?.includes(type)}
                    onChange={(e) => {
                      const newType = e.target.checked
                        ? [...(props.filters.type || []), type]
                        : props.filters.type?.filter((t) => t !== type)
                      props.onFilterChange({ ...props.filters, type: newType })
                    }}
                  />
                  {capitalize(type)}
                </label>
              ))}
            </div>
          </div>
          
          {/* Progress Range Filter */}
          <div className="filter-group">
            <label>Progress (%)</label>
            <input
              type="range"
              min="0"
              max="100"
              value={props.filters.progressRange?.[0] || 0}
              onChange={(e) => {
                const current = props.filters.progressRange || [0, 100]
                props.onFilterChange({
                  ...props.filters,
                  progressRange: [parseInt(e.target.value), current[1]]
                })
              }}
            />
            <span>{props.filters.progressRange?.[0]}% - {props.filters.progressRange?.[1]}%</span>
          </div>
          
          {/* Date Range Filter */}
          <div className="filter-group">
            <label>Created Date</label>
            <input
              type="date"
              value={props.filters.createdDate?.from?.toISOString().split('T')[0] || ''}
              onChange={(e) => {
                props.onFilterChange({
                  ...props.filters,
                  createdDate: {
                    ...props.filters.createdDate,
                    from: new Date(e.target.value)
                  }
                })
              }}
            />
            <input
              type="date"
              value={props.filters.createdDate?.to?.toISOString().split('T')[0] || ''}
              onChange={(e) => {
                props.onFilterChange({
                  ...props.filters,
                  createdDate: {
                    ...props.filters.createdDate,
                    to: new Date(e.target.value)
                  }
                })
              }}
            />
          </div>
          
          {/* Actions */}
          <div className="filter-actions">
            <button
              variant="ghost"
              onClick={() => props.onFilterChange({
                status: [],
                type: [],
                progressRange: [0, 100],
                createdDate: {}
              })}
            >
              Reset Filters
            </button>
            {props.onSaveView && (
              <button
                variant="primary"
                onClick={() => {
                  const name = prompt('Save view as:')
                  if (name) props.onSaveView(name)
                }}
              >
                Save as View
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

### 2.5 PerformanceChart Component

```typescript
// components/PerformanceChart.tsx
interface PerformanceChartProps {
  campaignIds?: string[] // If empty, show all campaigns
  metric: 'revenue' | 'donors' | 'shares' | 'engagement'
  period: '7d' | '30d' | '90d'
  compareToGoal?: boolean
  onExport?: () => void
}

export function PerformanceChart(props: PerformanceChartProps) {
  const { data, isLoading } = usePerformanceData(props.campaignIds, props.period)
  
  if (isLoading) return <LoadingSpinner />
  
  const chartData = data && data.map((point) => ({
    date: format(point.date, 'MMM dd'),
    [props.metric]: point[props.metric],
    goal: props.compareToGoal ? point.dailyGoal : undefined
  }))
  
  return (
    <div className="performance-chart">
      <div className="chart-header">
        <h3>Performance Trend ({props.period})</h3>
        <button onClick={props.onExport}>
          <Download size={16} /> Export
        </button>
      </div>
      
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value) => formatCurrency(value)} />
          <Legend />
          <Line
            type="monotone"
            dataKey={props.metric}
            stroke="#3b82f6"
            strokeWidth={2}
          />
          {props.compareToGoal && (
            <Line
              type="monotone"
              dataKey="goal"
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="5 5"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

## 3. Hook Specifications

### 3.1 useDashboardData Hook

```typescript
// hooks/useDashboardData.ts
interface UseDashboardDataProps {
  page?: number
  limit?: number
  filters?: FilterConfig
  sortBy?: string
}

export function useDashboardData(props: UseDashboardDataProps) {
  const { page = 1, limit = 10, filters = {}, sortBy = 'created-desc' } = props
  
  // Fetch campaigns
  const campaignsQuery = useQuery({
    queryKey: dashboardKeys.campaignList(page, limit, filters),
    queryFn: async () => {
      const params = buildQueryParams({ page, limit, ...filters, sortBy })
      const response = await apiClient.get('/campaigns/my-campaigns', { params })
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
  
  // Fetch stats
  const statsQuery = useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: async () => {
      const response = await apiClient.get('/campaigns/my-stats')
      return response.data.data
    },
    staleTime: 5 * 60 * 1000,
  })
  
  // Fetch activity
  const activityQuery = useQuery({
    queryKey: dashboardKeys.activity(),
    queryFn: async () => {
      const response = await apiClient.get('/activity-feed?limit=20')
      return response.data
    },
    staleTime: 2 * 60 * 1000,
  })
  
  // Fetch performance
  const performanceQuery = useQuery({
    queryKey: dashboardKeys.performance('30d'),
    queryFn: async () => {
      const response = await apiClient.get('/campaigns/performance?period=30d')
      return response.data
    },
    staleTime: 30 * 60 * 1000,
  })
  
  return {
    campaigns: campaignsQuery.data?.campaigns || [],
    stats: statsQuery.data,
    activity: activityQuery.data|| [],
    performance: performanceQuery.data,
    isLoading:
      campaignsQuery.isLoading ||
      statsQuery.isLoading ||
      activityQuery.isLoading ||
      performanceQuery.isLoading,
    error: campaignsQuery.error || statsQuery.error,
    refetch: async () => {
      await Promise.all([
        campaignsQuery.refetch(),
        statsQuery.refetch(),
        activityQuery.refetch(),
        performanceQuery.refetch(),
      ])
    }
  }
}
```

### 3.2 useCampaignFilters Hook

```typescript
// hooks/useCampaignFilters.ts
export function useCampaignFilters(initialFilters?: FilterConfig) {
  const [filters, setFilters] = useState<FilterConfig>(
    initialFilters || {
      status: ['active'],
      type: null,
      progressRange: [0, 100],
    }
  )
  
  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    
    if (filters.status?.length) {
      params.append('status', filters.status.join(','))
    }
    if (filters.type?.length) {
      params.append('type', filters.type.join(','))
    }
    if (filters.progressRange) {
      params.append('progressMin', filters.progressRange[0].toString())
      params.append('progressMax', filters.progressRange[1].toString())
    }
    if (filters.createdDate?.from) {
      params.append('createdFrom', filters.createdDate.from.toISOString())
    }
    if (filters.createdDate?.to) {
      params.append('createdTo', filters.createdDate.to.toISOString())
    }
    
    return params.toString()
  }, [filters])
  
  const addFilter = (key: string, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: Array.isArray(prev[key])
        ? [...prev[key], value]
        : value
    }))
  }
  
  const removeFilter = (key: string, value?: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: Array.isArray(prev[key]) && value
        ? prev[key].filter((v) => v !== value)
        : undefined
    }))
  }
  
  const resetFilters = () => {
    setFilters({
      status: ['active'],
      type: null,
      progressRange: [0, 100],
    })
  }
  
  return {
    filters,
    setFilters,
    addFilter,
    removeFilter,
    resetFilters,
    queryString,
  }
}
```

---

## 4. Backend API Endpoints

### 4.1 Existing Endpoints (Verify These Work)

```
GET /api/campaigns/my-campaigns
├── Query: page, limit, status, sort
└── Response: {campaigns: [], total: 0, pages: 0}

GET /api/campaigns/my-stats
└── Response: {data: {totalCampaigns: 0, activeCampaigns: 0, ...}}

POST /api/campaigns/:id/pause
POST /api/campaigns/:id/unpause
POST /api/campaigns/:id/complete
DELETE /api/campaigns/:id
```

### 4.2 Endpoints to Implement

#### Batch Operations
```
POST /api/campaigns/batch/pause
{
  "campaignIds": ["id1", "id2"]
}
Response: {success: true, updated: 2}

POST /api/campaigns/batch/complete
POST /api/campaigns/batch/delete
```

#### Comparison View
```
GET /api/campaigns/comparison?ids=id1,id2,id3&metrics=revenue,donors,progress
Response: [
  {
    campaignId: "id1",
    title: "Food Drive",
    revenue: 8000,
    goal: 10000,
    donors: 45,
    progress: 80,
    trendDirection: "up",
    trendPercentage: 15
  },
  ...
]
```

#### Performance Data
```
GET /api/campaigns/:id/performance?period=30d
Response: {
  timeSeries: [
    {
      date: "2026-03-12",
      revenue: 100,
      donors: 2,
      shares: 5,
      engagement: 7
    },
    ...
  ]
}
```

#### Activity Feed
```
GET /api/activity-feed?limit=20&offset=0
Response: [
  {
    id: "...",
    type: "campaign_activated",
    campaignId: "...",
    campaignTitle: "...",
    timestamp: "2026-04-11T14:30:00Z",
    title: "Campaign activated",
    description: "Food Drive just went live",
    metadata: {}
  },
  ...
]
```

#### Saved Views
```
POST /api/dashboard/views
{
  "name": "Active Campaigns",
  "filters": {...}
}
Response: {id: "view1", name: "...", filters: {...}}

GET /api/dashboard/views
Response: [{id: "view1", name: "...", filters: {...}}, ...]

DELETE /api/dashboard/views/:id
```

#### Export
```
GET /api/campaigns/export/csv?ids=id1,id2&format=detailed
Response: CSV file

GET /api/campaigns/export/pdf?ids=id1,id2
Response: PDF file

POST /api/reports/schedule
{
  "frequency": "weekly",
  "day": "monday",
  "time": "09:00",
  "recipients": ["email@example.com"]
}
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

```typescript
// __tests__/utils/dashboardCalculations.test.ts
describe('dashboardCalculations', () => {
  it('calculateHealthScore should return 0-100', () => {
    const campaign = { /* mock campaign */ }
    const score = calculateHealthScore(campaign)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
  
  it('calculateTrendPercentage should handle up/down/neutral', () => {
    expect(calculateTrendPercentage(100, 80)).toEqual({
      direction: 'up',
      percentage: 25
    })
  })
})

// __tests__/hooks/useCampaignFilters.test.ts
describe('useCampaignFilters', () => {
  it('should build query string from filters', () => {
    const { result } = renderHook(() => useCampaignFilters({
      status: ['active', 'draft'],
      progressRange: [50, 100]
    }))
    
    expect(result.current.queryString).toContain('status=active,draft')
    expect(result.current.queryString).toContain('progressMin=50')
  })
})
```

### 5.2 Integration Tests

```typescript
// __tests__/integration/dashboard.integration.test.ts
describe('Dashboard Integration', () => {
  it('should load dashboard with all data', async () => {
    render(<Dashboard />)
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Total Raised')).toBeInTheDocument()
      expect(screen.getByText(/Active Campaigns/)).toBeInTheDocument()
    })
  })
  
  it('should filter campaigns on filter change', async () => {
    render(<Dashboard />)
    
    const statusFilter = screen.getByRole('checkbox', { name: 'active' })
    fireEvent.click(statusFilter)
    
    await waitFor(() => {
      expect(screen.queryByText(/Draft Campaign/)).not.toBeInTheDocument()
    })
  })
})
```

### 5.3 E2E Tests (Cypress)

```javascript
// cypress/e2e/dashboard.cy.js
describe('Creator Dashboard', () => {
  beforeEach(() => {
    cy.login('creator@example.com')
    cy.visit('/dashboard')
  })
  
  it('user can view dashboard and campaigns', () => {
    cy.contains('Creator Dashboard').should('be.visible')
    cy.get('[data-testid="campaign-card"]').should('have.length.at.least', 1)
  })
  
  it('user can filter campaigns by status', () => {
    cy.get('[data-testid="status-filter-active"]').click()
    cy.get('[data-testid="campaign-card"]').each(($card) => {
      cy.wrap($card).contains('ACTIVE').should('be.visible')
    })
  })
  
  it('user can pause a campaign', () => {
    cy.get('[data-testid="campaign-actions-menu"]').first().click()
    cy.contains('Pause').click()
    cy.contains('Pause Campaign?').should('be.visible')
    cy.contains('Confirm').click()
    cy.contains('Campaign paused successfully').should('be.visible')
  })
})
```

---

## 6. Performance Optimization

### 6.1 Bundle Size Optimization

```
Chart library: Use Recharts (~40KB) instead of Chart.js
Date handling: Use date-fns (~13KB) instead of moment (~70KB)
Export: Lazy load PDF generation library (only when needed)
```

### 6.2 Image Optimization

```
Campaign images:
- Serve WebP format (30% smaller)
- Use responsive images (srcset)
- Lazy load below-the-fold images
- Max width: 400px for thumbnails
```

### 6.3 Query Optimization

```typescript
// Pagination strategy
const CAMPAIGNS_PER_PAGE = 10
const PREFETCH_MARGIN = 2 // Prefetch page +2

// Auto-prefetch next page
useEffect(() => {
  if (currentPage < totalPages - PREFETCH_MARGIN) {
    queryClient.prefetchInfiniteQuery({
      queryKey: dashboardKeys.campaignList(currentPage + 1, CAMPAIGNS_PER_PAGE),
      queryFn: () => fetchCampaigns(currentPage + 1),
    })
  }
}, [currentPage])
```

### 6.4 Rendering Optimization

```typescript
// Memoize expensive components
const CampaignCard = React.memo(({ campaign, onAction }) => {
  // Component renders only when campaign or onAction changes
  return <div>{/* ... */}</div>
}, (prevProps, nextProps) => {
  // Custom comparison
  return (
    prevProps.campaign._id === nextProps.campaign._id &&
    prevProps.onAction === nextProps.onAction
  )
})

// Virtual scrolling for long lists
import { FixedSizeList } from 'react-window'

<FixedSizeList
  height={600}
  itemCount={campaigns.length}
  itemSize={100}
  width="100%"
>
  {({ index, style }) => (
    <CampaignCard
      style={style}
      campaign={campaigns[index]}
    />
  )}
</FixedSizeList>
```

---

## 7. Security Considerations

### 7.1 XSS Prevention

```typescript
// Always sanitize user input
const sanitize = (html: string) => {
  const decoded = new DOMParser().parseFromString(html, 'text/html')
  return decoded.documentElement.textContent || ''
}

// In JSX, never use dangerouslySetInnerHTML
<p>{sanitize(campaign.title)}</p> // ✅ Safe
<p dangerouslySetInnerHTML={{__html: campaign.title}} /> // ❌ Unsafe
```

### 7.2 CSRF Protection

```typescript
// API client includes CSRF token from response headers
const response = await fetch('/api/campaigns/batch/pause', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken, // From meta tag or header
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ campaignIds: [...] })
})
```

### 7.3 Rate Limiting

```typescript
// Client-side rate limiting to prevent abuse
const rateLimiter = new Map()

function shouldThrottle(key: string, limit: number, window: number) {
  const now = Date.now()
  const count = rateLimiter.get(key) || []
  
  const recent = count.filter((t) => now - t < window)
  if (recent.length >= limit) return true
  
  recent.push(now)
  rateLimiter.set(key, recent)
  return false
}

// Usage
if (shouldThrottle('batch-pause', 3, 1000)) {
  showToast('Too many requests. Please wait.')
  return
}
```

---

## 8. Accessibility (WCAG 2.1 Level AA)

### 8.1 Keyboard Navigation

```typescript
// All interactive elements must be keyboard accessible
<button
  aria-label="View campaign details"
  onClick={handleView}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleView()
    }
  }}
>
  View
</button>
```

### 8.2 ARIA Labels

```typescript
// All images need alt text
<img src="campaign.jpg" alt="Food Drive campaign banner" />

// Form elements need labels
<label htmlFor="status-filter">Campaign Status</label>
<select id="status-filter">
  <option value="all">All</option>
  <option value="active">Active</option>
</select>

// Dynamic content updates need ARIA live regions
<div aria-live="polite" aria-atomic="true">
  {toastMessage}
</div>
```

### 8.3 Color Contrast

```
Minimum ratio: 4.5:1 for normal text
Minimum ratio: 3:1 for large text (18pt+)

Status colors must be distinguishable without relying only on color:
- Draft: Gray + dashed border
- Active: Green + checkmark
- Paused: Orange + pause icon
- Completed: Blue + checkmark
```

---

## 9. Monitoring & Analytics

### 9.1 Performance Monitoring

```typescript
// Track page load performance
const navigationTiming = performance.getEntriesByType('navigation')[0]
const pageLoadTime = navigationTiming.loadEventEnd - navigationTiming.fetchStart

// Track component render time
const startTime = performance.now()
// ... component code
const renderTime = performance.now() - startTime
console.debug(`Dashboard rendered in ${renderTime}ms`)

// Monitor API response times
const startTime = performance.now()
const response = await apiClient.get('/campaigns/my-campaigns')
const duration = performance.now() - startTime
analytics.track('api_request', {
  endpoint: '/campaigns/my-campaigns',
  duration,
  statusCode: response.status
})
```

### 9.2 Error Tracking

```typescript
// Setup Sentry for error tracking
import * as Sentry from "@sentry/react"

export const DashboardPage = Sentry.withProfiler(function CreatorDashboard() {
  // Component code
  // Errors automatically logged to Sentry
})

// Manually report errors
try {
  await fetchDashboardData()
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      component: 'dashboard',
      action: 'fetch_campaigns'
    }
  })
}
```

### 9.3 User Analytics

```typescript
// Track feature usage
analytics.track('dashboard_view_change', {
  from: 'list',
  to: 'grid'
})

analytics.track('campaign_filter_applied', {
  status: ['active'],
  progressRange: [50, 100]
})

analytics.track('campaign_action', {
  action: 'pause',
  campaignId: '...'
})
```

---

## 10. Deployment Checklist

### Pre-Deployment
- [ ] All tests passing (100% coverage for new code)
- [ ] Performance benchmarks met (< 2s page load)
- [ ] Accessibility audit passed (WCAG AA)
- [ ] Mobile tested on iOS Safari, Chrome Android
- [ ] Code reviewed by 2+ developers
- [ ] Security audit completed
- [ ] Bundle size analysis done
- [ ] Documentation updated
- [ ] Feature flag configured
- [ ] Rollback plan documented

### Deployment
- [ ] Create feature branch: `feature/dashboard-v2`
- [ ] Deploy to staging environment
- [ ] Run smoke tests
- [ ] Enable feature flag for 10% of users
- [ ] Monitor error rates for 24 hours
- [ ] If error rate > 0.5%, rollback
- [ ] Gradually increase to 100% over 1 week

### Post-Deployment
- [ ] Monitor performance metrics daily
- [ ] Respond to user feedback
- [ ] Fix any issues found in production
- [ ] Update documentation based on learnings
- [ ] Plan next iteration

---

**Version**: 1.0  
**Last Updated**: April 11, 2026  
**Status**: Ready for Implementation
