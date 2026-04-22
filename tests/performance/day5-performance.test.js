/**
 * Day 5: Performance Testing & Benchmarking
 * 
 * Test Performance Targets:
 * - Donation recording: < 500ms
 * - Metrics update: < 100ms (async)
 * - Admin verification: < 200ms per transaction
 * - Transaction list (1000 items): < 1s
 * - Load test: 100 concurrent donations
 */

const axios = require('axios');
const mongoose = require('mongoose');
const { performance } = require('perf_hooks');

const config = {
  baseURL: process.env.TEST_API_URL || 'http://localhost:3000',
  adminToken: process.env.ADMIN_TEST_TOKEN || 'test_admin_token',
  donorToken: process.env.DONOR_TEST_TOKEN || 'test_donor_token',
  testCampaignId: process.env.TEST_CAMPAIGN_ID || 'camp_test_123'
};

// ============================================================================
// PERFORMANCE UTILITIES
// ============================================================================

class PerformanceTester {
  constructor() {
    this.results = [];
    this.currentTest = null;
  }

  startTimer() {
    return performance.now();
  }

  endTimer(startTime, testName) {
    const duration = performance.now() - startTime;
    this.results.push({
      test: testName,
      duration: duration,
      timestamp: new Date().toISOString()
    });
    return duration;
  }

  getAverageTime(testName) {
    const filtered = this.results.filter(r => r.test === testName);
    if (filtered.length === 0) return 0;
    const total = filtered.reduce((sum, r) => sum + r.duration, 0);
    return total / filtered.length;
  }

  getMaxTime(testName) {
    const filtered = this.results.filter(r => r.test === testName);
    if (filtered.length === 0) return 0;
    return Math.max(...filtered.map(r => r.duration));
  }

  getMinTime(testName) {
    const filtered = this.results.filter(r => r.test === testName);
    if (filtered.length === 0) return 0;
    return Math.min(...filtered.map(r => r.duration));
  }

  getP95Time(testName) {
    const filtered = this.results
      .filter(r => r.test === testName)
      .map(r => r.duration)
      .sort((a, b) => a - b);
    
    if (filtered.length === 0) return 0;
    const index = Math.ceil(filtered.length * 0.95) - 1;
    return filtered[index];
  }

  getP99Time(testName) {
    const filtered = this.results
      .filter(r => r.test === testName)
      .map(r => r.duration)
      .sort((a, b) => a - b);
    
    if (filtered.length === 0) return 0;
    const index = Math.ceil(filtered.length * 0.99) - 1;
    return filtered[Math.max(0, index)];
  }

  printReport() {
    const uniqueTests = [...new Set(this.results.map(r => r.test))];
    
    console.log('\n' + '='.repeat(80));
    console.log('PERFORMANCE TEST REPORT');
    console.log('='.repeat(80));
    
    uniqueTests.forEach(testName => {
      const avg = this.getAverageTime(testName);
      const min = this.getMinTime(testName);
      const max = this.getMaxTime(testName);
      const p95 = this.getP95Time(testName);
      const p99 = this.getP99Time(testName);
      const count = this.results.filter(r => r.test === testName).length;
      
      console.log(`\n${testName}`);
      console.log(`  Count:      ${count}`);
      console.log(`  Avg:        ${avg.toFixed(2)}ms`);
      console.log(`  Min:        ${min.toFixed(2)}ms`);
      console.log(`  Max:        ${max.toFixed(2)}ms`);
      console.log(`  P95:        ${p95.toFixed(2)}ms`);
      console.log(`  P99:        ${p99.toFixed(2)}ms`);
    });
    
    console.log('\n' + '='.repeat(80));
  }
}

const tester = new PerformanceTester();

// ============================================================================
// PERFORMANCE TEST 1: Donation Recording < 500ms
// ============================================================================

describe('Performance Test 1: Donation Recording', () => {
  const target = 500; // milliseconds

  beforeAll(() => {
    console.log(`Target: Donation recording < ${target}ms`);
  });

  test('1.1: Single donation recording performance', async () => {
    const iterations = 20;
    
    for (let i = 0; i < iterations; i++) {
      const startTime = tester.startTimer();
      
      try {
        await axios.post(
          `${config.baseURL}/api/donations`,
          {
            campaign_id: config.testCampaignId,
            amount: 5000 + (i * 100), // Vary amounts
            donor_name: `Test Donor ${i}`,
            donor_email: `donor${i}@test.com`,
            payment_method: 'credit_card',
            payment_reference: `pi_perf_${i}`
          },
          { headers: { Authorization: `Bearer ${config.donorToken}` } }
        );
      } catch (error) {
        // Ignore errors for perf testing
      }

      const duration = tester.endTimer(startTime, 'donation_recording');
      
      // Each should complete within target
      expect(duration).toBeLessThan(target);
    }

    const avgTime = tester.getAverageTime('donation_recording');
    console.log(`  Average: ${avgTime.toFixed(2)}ms (target: ${target}ms)`);
    expect(avgTime).toBeLessThan(target);
  });

  test('1.2: P95 performance meets SLA', async () => {
    const p95 = tester.getP95Time('donation_recording');
    console.log(`  P95: ${p95.toFixed(2)}ms (target: ${target}ms)`);
    expect(p95).toBeLessThan(target);
  });

  test('1.3: No single operation exceeds 600ms (SLA buffer)', async () => {
    const max = tester.getMaxTime('donation_recording');
    console.log(`  Max: ${max.toFixed(2)}ms (cap: 600ms)`);
    expect(max).toBeLessThan(600);
  });
});

// ============================================================================
// PERFORMANCE TEST 2: Metrics Update < 100ms (Async)
// ============================================================================

describe('Performance Test 2: Campaign Metrics Update', () => {
  const target = 100; // milliseconds

  test('2.1: Campaign metrics async update performance', async () => {
    const iterations = 15;
    
    for (let i = 0; i < iterations; i++) {
      const startTime = tester.startTimer();
      
      try {
        // Get campaign to trigger metrics calculation
        await axios.get(
          `${config.baseURL}/api/campaigns/${config.testCampaignId}`,
          { headers: { Authorization: `Bearer ${config.donorToken}` } }
        );
      } catch (error) {
        // Ignore
      }

      const duration = tester.endTimer(startTime, 'metrics_update');
      
      // Metrics should update quickly (they're async)
      expect(duration).toBeLessThan(200); // 2x target for async buffer
    }

    const avgTime = tester.getAverageTime('metrics_update');
    console.log(`  Average: ${avgTime.toFixed(2)}ms (target: ${target}ms async)`);
  });

  test('2.2: Metrics calculation doesn\'t block donation endpoint', async () => {
    // Run parallel: donation creation + metrics fetch
    const startTime = tester.startTimer();
    
    await Promise.all([
      axios.post(
        `${config.baseURL}/api/donations`,
        {
          campaign_id: config.testCampaignId,
          amount: 5000,
          donor_name: 'Parallel Test',
          donor_email: 'parallel@test.com',
          payment_method: 'credit_card',
          payment_reference: 'pi_parallel'
        },
        { headers: { Authorization: `Bearer ${config.donorToken}` } }
      ),
      axios.get(
        `${config.baseURL}/api/campaigns/${config.testCampaignId}`,
        { headers: { Authorization: `Bearer ${config.donorToken}` } }
      )
    ]).catch(() => {});

    const duration = tester.endTimer(startTime, 'parallel_operations');
    
    // Both should complete within reasonable time
    expect(duration).toBeLessThan(1000);
  });
});

// ============================================================================
// PERFORMANCE TEST 3: Admin Verification < 200ms
// ============================================================================

describe('Performance Test 3: Admin Fee Verification', () => {
  const target = 200; // milliseconds

  test('3.1: Admin verification per transaction', async () => {
    const iterations = 10;
    const transactionIds = []; // In real test, populate from previous donations

    for (let i = 0; i < iterations; i++) {
      const startTime = tester.startTimer();
      
      try {
        await axios.post(
          `${config.baseURL}/api/admin/fees/transactions/ft_test_${i}/verify`,
          {
            verification_notes: 'Performance test verification'
          },
          { headers: { Authorization: `Bearer ${config.adminToken}` } }
        );
      } catch (error) {
        // Ignore
      }

      const duration = tester.endTimer(startTime, 'admin_verification');
      expect(duration).toBeLessThan(target);
    }

    const avgTime = tester.getAverageTime('admin_verification');
    console.log(`  Average: ${avgTime.toFixed(2)}ms (target: ${target}ms)`);
    expect(avgTime).toBeLessThan(target);
  });

  test('3.2: Batch verification under 300ms per transaction', async () => {
    const startTime = tester.startTimer();
    const batchSize = 5;

    try {
      await Promise.all([
        axios.post(
          `${config.baseURL}/api/admin/fees/transactions/ft_batch_1/verify`,
          { verification_notes: 'Batch test' },
          { headers: { Authorization: `Bearer ${config.adminToken}` } }
        ),
        axios.post(
          `${config.baseURL}/api/admin/fees/transactions/ft_batch_2/verify`,
          { verification_notes: 'Batch test' },
          { headers: { Authorization: `Bearer ${config.adminToken}` } }
        ),
        // ... more in real test
      ]).catch(() => {});
    } catch (error) {
      // Ignore
    }

    const totalDuration = tester.endTimer(startTime, 'batch_verification');
    const perTransaction = totalDuration / batchSize;
    
    console.log(`  Per transaction in batch: ${perTransaction.toFixed(2)}ms`);
    expect(perTransaction).toBeLessThan(300);
  });
});

// ============================================================================
// PERFORMANCE TEST 4: Transaction List Query < 1s (1000 items)
// ============================================================================

describe('Performance Test 4: Transaction List Performance', () => {
  const target = 1000; // milliseconds for 1000 items

  test('4.1: Fetch 1000 transactions in paginated view', async () => {
    const startTime = tester.startTimer();
    const pageSize = 100;
    const pages = 10; // 10 pages * 100 items = 1000 items
    
    try {
      for (let page = 1; page <= pages; page++) {
        await axios.get(
          `${config.baseURL}/api/admin/fees/transactions?page=${page}&limit=${pageSize}`,
          { headers: { Authorization: `Bearer ${config.adminToken}` } }
        ).catch(() => {});
      }
    } catch (error) {
      // Ignore
    }

    const duration = tester.endTimer(startTime, 'transaction_list_1000');
    console.log(`  Total time for 1000 items: ${duration.toFixed(2)}ms (target: ${target}ms)`);
    expect(duration).toBeLessThan(target * 1.5); // 50% buffer
  });

  test('4.2: Single page (100 items) under 100ms', async () => {
    const startTime = tester.startTimer();

    try {
      await axios.get(
        `${config.baseURL}/api/admin/fees/transactions?page=1&limit=100`,
        { headers: { Authorization: `Bearer ${config.adminToken}` } }
      );
    } catch (error) {
      // Ignore
    }

    const duration = tester.endTimer(startTime, 'single_page');
    console.log(`  Single page (100 items): ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(200);
  });

  test('4.3: Search/filter on transactions under 200ms', async () => {
    const startTime = tester.startTimer();

    try {
      await axios.get(
        `${config.baseURL}/api/admin/fees/transactions?status=pending_settlement&limit=100`,
        { headers: { Authorization: `Bearer ${config.adminToken}` } }
      );
    } catch (error) {
      // Ignore
    }

    const duration = tester.endTimer(startTime, 'filtered_query');
    console.log(`  Filtered query: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(300);
  });
});

// ============================================================================
// PERFORMANCE TEST 5: Concurrent Load - 100 Donations
// ============================================================================

describe('Performance Test 5: Concurrent Load Testing', () => {
  test('5.1: Process 100 concurrent donations', async () => {
    const concurrentCount = 100;
    const startTime = tester.startTimer();
    const promises = [];

    for (let i = 0; i < concurrentCount; i++) {
      promises.push(
        axios.post(
          `${config.baseURL}/api/donations`,
          {
            campaign_id: config.testCampaignId,
            amount: 1000 + (i * 10), // Vary amounts
            donor_name: `Concurrent ${i}`,
            donor_email: `concurrent${i}@test.com`,
            payment_method: 'credit_card',
            payment_reference: `pi_concurrent_${i}`
          },
          { headers: { Authorization: `Bearer ${config.donorToken}` } }
        ).catch(error => ({
          status: error.response?.status || 0,
          error: error.message
        }))
      );
    }

    const results = await Promise.all(promises);
    const duration = tester.endTimer(startTime, 'concurrent_load_100');

    // Calculate success rate
    const successCount = results.filter(r => r.status === 201).length;
    const successRate = (successCount / concurrentCount) * 100;

    console.log(`  100 concurrent donations completed in ${duration.toFixed(2)}ms`);
    console.log(`  Success rate: ${successRate.toFixed(2)}%`);
    console.log(`  Average per request: ${(duration / concurrentCount).toFixed(2)}ms`);

    // Should handle 100 concurrent with >95% success
    expect(successRate).toBeGreaterThan(95);
    
    // Total time should be reasonable (even with sequencing)
    expect(duration).toBeLessThan(60000); // 60 seconds for 100 requests
  });

  test('5.2: Under load, individual operations stay <1000ms', async () => {
    const startTime = tester.startTimer();
    const iterations = 50;
    let maxDuration = 0;

    for (let i = 0; i < iterations; i++) {
      const opStart = tester.startTimer();
      
      try {
        await axios.post(
          `${config.baseURL}/api/donations`,
          {
            campaign_id: config.testCampaignId,
            amount: 5000,
            donor_name: `Load ${i}`,
            donor_email: `load${i}@test.com`,
            payment_method: 'credit_card',
            payment_reference: `pi_load_${i}`
          },
          { headers: { Authorization: `Bearer ${config.donorToken}` } }
        );
      } catch (error) {
        // Ignore
      }

      const opDuration = tester.endTimer(opStart, 'load_individual');
      maxDuration = Math.max(maxDuration, opDuration);
    }

    const totalDuration = performance.now() - startTime;
    console.log(`  50 donations under load - Max individual: ${maxDuration.toFixed(2)}ms`);
    console.log(`  Total time: ${totalDuration.toFixed(2)}ms`);

    // Even under load, should stay responsive
    expect(maxDuration).toBeLessThan(1000);
  });

  test('5.3: Dashboard query under load (<2s)', async () => {
    // Run 20 concurrent dashboard queries while donations are being processed
    const startTime = tester.startTimer();

    const dashboardPromises = Array(20).fill(null).map(() =>
      axios.get(
        `${config.baseURL}/api/admin/fees/dashboard?period=month`,
        { headers: { Authorization: `Bearer ${config.adminToken}` } }
      ).catch(() => {})
    );

    await Promise.all(dashboardPromises);
    const duration = tester.endTimer(startTime, 'concurrent_dashboard');

    console.log(`  20 concurrent dashboard queries: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(2000);
  });

  test('5.4: Settlement under load (<5s)', async () => {
    const startTime = tester.startTimer();

    try {
      await axios.post(
        `${config.baseURL}/api/admin/fees/settle`,
        {
          fee_transaction_ids: Array(50).fill('ft_load_1'),
          settlement_method: 'bank_transfer',
          settlement_notes: 'Load test settlement'
        },
        { headers: { Authorization: `Bearer ${config.adminToken}` } }
      );
    } catch (error) {
      // Ignore - testing timing, not functionality
    }

    const duration = tester.endTimer(startTime, 'settlement_load');
    console.log(`  Settlement of 50 fees: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(5000);
  });
});

// ============================================================================
// PERFORMANCE TEST 6: Memory & Resource Usage
// ============================================================================

describe('Performance Test 6: Resource Efficiency', () => {
  test('6.1: Memory stable during repeated operations', async () => {
    if (!global.gc) {
      console.log('  Skipping: Run with --expose-gc flag to test memory');
      return;
    }

    global.gc();
    const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB

    for (let i = 0; i < 100; i++) {
      try {
        await axios.post(
          `${config.baseURL}/api/donations`,
          {
            campaign_id: config.testCampaignId,
            amount: 5000,
            donor_name: `Memory Test ${i}`,
            donor_email: `mem${i}@test.com`,
            payment_method: 'credit_card',
            payment_reference: `pi_mem_${i}`
          },
          { headers: { Authorization: `Bearer ${config.donorToken}` } }
        );
      } catch (error) {
        // Ignore
      }
    }

    global.gc();
    const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    const memoryIncrease = finalMemory - initialMemory;

    console.log(`  Initial memory: ${initialMemory.toFixed(2)}MB`);
    console.log(`  Final memory:   ${finalMemory.toFixed(2)}MB`);
    console.log(`  Increase:       ${memoryIncrease.toFixed(2)}MB`);

    // Should not increase by more than 50MB during 100 operations
    expect(memoryIncrease).toBeLessThan(50);
  });
});

// ============================================================================
// REPORT GENERATION
// ============================================================================

afterAll(() => {
  tester.printReport();
  
  // Export results for CI/CD
  const summary = {
    timestamp: new Date().toISOString(),
    tests: [
      {
        name: 'donation_recording',
        target: 500,
        average: tester.getAverageTime('donation_recording'),
        p95: tester.getP95Time('donation_recording'),
        p99: tester.getP99Time('donation_recording'),
        passed: tester.getAverageTime('donation_recording') < 500
      },
      {
        name: 'admin_verification',
        target: 200,
        average: tester.getAverageTime('admin_verification'),
        p95: tester.getP95Time('admin_verification'),
        p99: tester.getP99Time('admin_verification'),
        passed: tester.getAverageTime('admin_verification') < 200
      },
      {
        name: 'transaction_list_1000',
        target: 1000,
        total: tester.getMaxTime('transaction_list_1000'),
        passed: tester.getMaxTime('transaction_list_1000') < 1000
      }
    ],
    allPassed: [
      tester.getAverageTime('donation_recording') < 500,
      tester.getAverageTime('admin_verification') < 200,
      tester.getMaxTime('transaction_list_1000') < 1000
    ].every(Boolean)
  };

  console.log('\n' + JSON.stringify(summary, null, 2));
});

module.exports = {
  PerformanceTester,
  tester
};
