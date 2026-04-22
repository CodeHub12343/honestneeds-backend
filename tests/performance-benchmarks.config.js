/**
 * Performance Benchmarks Configuration
 * Defines performance thresholds and acceptance criteria for Day 5 Integration & Testing
 */

const performanceBenchmarks = {
  // Campaign Operations
  campaign: {
    create: {
      threshold: 500, // milliseconds
      description: 'Campaign creation should complete within 500ms',
      metric: 'p95 latency',
    },
    update: {
      threshold: 300,
      description: 'Campaign update should complete within 300ms',
      metric: 'p95 latency',
    },
    retrieve: {
      threshold: 100,
      description: 'Single campaign retrieval should complete within 100ms',
      metric: 'p99 latency',
    },
    publish: {
      threshold: 1000,
      description: 'Campaign publishing (including QR generation) should complete within 1000ms',
      metric: 'p95 latency',
    },
    list: {
      threshold: 1000,
      description: 'Listing 1000 campaigns should complete within 1 second',
      metric: 'p95 latency',
      recordCount: 1000,
    },
  },

  // Analytics Operations
  analytics: {
    query: {
      threshold: 500,
      description: 'Analytics query should complete within 500ms',
      metric: 'p95 latency',
    },
    metrics_update: {
      threshold: 100,
      description: 'Individual metric update should complete within 100ms',
      metric: 'p99 latency',
    },
    progress_snapshot: {
      threshold: 200,
      description: 'Progress snapshot recording should complete within 200ms',
      metric: 'p95 latency',
    },
    trend_calculation: {
      threshold: 300,
      description: 'Trend calculation should complete within 300ms',
      metric: 'p95 latency',
    },
  },

  // Database Operations
  database: {
    query: {
      threshold: 50,
      description: 'Database query should complete within 50ms (excluding I/O)',
      metric: 'p99 latency',
    },
    insert: {
      threshold: 100,
      description: 'Database insert should complete within 100ms',
      metric: 'p95 latency',
    },
    update: {
      threshold: 50,
      description: 'Database update should complete within 50ms',
      metric: 'p99 latency',
    },
    index_lookup: {
      threshold: 10,
      description: 'Index lookup should complete within 10ms',
      metric: 'p99 latency',
    },
  },

  // API Endpoints
  api: {
    response: {
      threshold: 500,
      description: 'API response should be delivered within 500ms',
      metric: 'p95 latency',
    },
    concurrent_load: {
      concurrent_users: 100,
      threshold: 2000,
      description: '100 concurrent creates should complete within 2 seconds',
      metric: 'p95 latency under load',
    },
  },

  // Pagination
  pagination: {
    page_size: 10,
    max_records: 10000,
    threshold: 1000,
    description: 'Pagination with 10k records should serve any page within 1 second',
    metric: 'p95 latency',
  },

  // Concurrent Operations
  concurrent: {
    writes_10: {
      count: 10,
      threshold: 3000,
      description: '10 concurrent writes should complete within 3 seconds',
      metric: 'p95 latency for all',
    },
    writes_100: {
      count: 100,
      threshold: 15000,
      description: '100 concurrent writes should complete within 15 seconds',
      metric: 'p95 latency for all',
    },
  },

  // Memory & Resource Usage
  resources: {
    memory: {
      max_mb: 512,
      description: 'Application should not exceed 512MB memory during normal operations',
      metric: 'resident set size',
    },
    cpu: {
      max_percent: 80,
      description: 'CPU usage should not exceed 80% during load tests',
      metric: 'user + system time',
    },
    heap: {
      max_mb: 256,
      description: 'Heap size should not exceed 256MB during normal operations',
      metric: 'V8 heap size',
    },
  },

  // Acceptance Criteria
  acceptance: {
    error_rate: {
      max_percent: 1,
      description: 'Error rate must be less than 1% across all operations',
    },
    timeout_rate: {
      max_percent: 0.5,
      description: 'Timeout rate must be less than 0.5%',
    },
    backend_health: {
      uptime_percent: 99.9,
      description: 'Backend must maintain 99.9% uptime during testing',
    },
    data_consistency: {
      lost_writes: 0,
      description: 'Zero lost writes or data corruption',
    },
  },

  // Test Coverage Requirements
  coverage: {
    unit_tests: {
      threshold: 90,
      description: 'Unit test coverage must be >= 90%',
    },
    integration_tests: {
      threshold: 85,
      description: 'Integration test coverage must be >= 85%',
    },
    overall: {
      threshold: 88,
      description: 'Overall code coverage must be >= 88%',
    },
  },
};

/**
 * Performance Test Configuration
 * Defines test parameters for load and stress testing
 */
const performanceTestConfig = {
  // Load Test Profile 1: Steady State
  load_test_steady: {
    name: 'Steady State Load Test',
    duration: 300000, // 5 minutes
    rampUp: 30000, // 30 seconds to ramp up
    concurrentUsers: 50,
    operations: {
      create_campaign: 0.3, // 30%
      update_campaign: 0.2, // 20%
      list_campaigns: 0.2, // 20%
      query_analytics: 0.2, // 20%
      record_metric: 0.1, // 10%
    },
  },

  // Load Test Profile 2: Peak Load
  load_test_peak: {
    name: 'Peak Load Test',
    duration: 120000, // 2 minutes
    rampUp: 10000, // 10 seconds ramp
    concurrentUsers: 200,
    operations: {
      create_campaign: 0.25,
      update_campaign: 0.15,
      list_campaigns: 0.3,
      query_analytics: 0.2,
      record_metric: 0.1,
    },
  },

  // Load Test Profile 3: Stress Test
  load_test_stress: {
    name: 'Stress Test',
    duration: 60000, // 1 minute
    rampUp: 5000, // 5 seconds ramp
    concurrentUsers: 500,
    operations: {
      create_campaign: 0.4,
      update_campaign: 0.2,
      list_campaigns: 0.2,
      query_analytics: 0.15,
      record_metric: 0.05,
    },
    expectedFailureRate: 0.02, // Expect 2% failures at this load
  },

  // Load Test Profile 4: Endurance Test
  load_test_endurance: {
    name: 'Endurance Test',
    duration: 3600000, // 1 hour
    rampUp: 60000, // 1 minute ramp
    concurrentUsers: 75,
    operations: {
      create_campaign: 0.25,
      update_campaign: 0.2,
      list_campaigns: 0.25,
      query_analytics: 0.2,
      record_metric: 0.1,
    },
    checkMemoryLeaks: true,
    checkDatabaseLeaks: true,
  },
};

/**
 * Benchmark Thresholds by Environment
 */
const environmentThresholds = {
  development: {
    multiplier: 2.0, // More lenient in development
    skipLoadTests: false,
  },
  staging: {
    multiplier: 1.5,
    skipLoadTests: false,
  },
  production: {
    multiplier: 1.0, // Strict in production
    skipLoadTests: false,
  },
  ci: {
    multiplier: 2.5, // CI systems may be slower
    skipLoadTests: true, // Skip heavy load tests
  },
  test: {
    multiplier: 3.0, // Test environment
    skipLoadTests: true,
  },
};

/**
 * Test Data Sizes
 */
const testDataSizes = {
  small: {
    campaigns: 10,
    metrics_per_campaign: 5,
    progress_records: 1,
  },
  medium: {
    campaigns: 100,
    metrics_per_campaign: 50,
    progress_records: 7,
  },
  large: {
    campaigns: 1000,
    metrics_per_campaign: 500,
    progress_records: 30,
  },
  stress: {
    campaigns: 10000,
    metrics_per_campaign: 1000,
    progress_records: 90,
  },
};

/**
 * Alert Thresholds
 * Triggers alerts if exceeded during tests
 */
const alertThresholds = {
  p95_latency_increase: 1.5, // 50% increase from baseline
  p99_latency_increase: 1.8, // 80% increase from baseline
  error_rate_increase: 5, // 5x increase from baseline
  memory_growth_rate: 10, // MB per minute
  database_connection_pool_exhaustion: 0.8, // Alert at 80% pool usage
};

/**
 * Helper function to get threshold for environment
 */
function getThreshold(baselineThreshold, environmentName) {
  const environment = environmentThresholds[environmentName] || environmentThresholds.test;
  return Math.ceil(baselineThreshold * environment.multiplier);
}

/**
 * Helper function to validate performance result
 */
function validatePerformance(results, benchmarkName, environmentName = 'test') {
  const benchmark = performanceBenchmarks[benchmarkName];
  if (!benchmark) {
    return { valid: false, error: `Benchmark ${benchmarkName} not found` };
  }

  const threshold = getThreshold(benchmark.threshold, environmentName);
  const isValid = results.duration <= threshold;

  return {
    valid: isValid,
    threshold,
    actual: results.duration,
    exceeded: results.duration - threshold,
    exceedancePercent: Math.round(((results.duration - threshold) / threshold) * 100),
  };
}

module.exports = {
  performanceBenchmarks,
  performanceTestConfig,
  environmentThresholds,
  testDataSizes,
  alertThresholds,
  getThreshold,
  validatePerformance,
};
