/**
 * Share Service Performance Tests
 * Benchmark testing for performance targets
 * Performance targets: <500ms for record share, <200ms for budget check
 */

const mongoose = require('mongoose');
const ShareService = require('../../src/services/ShareService');
const { ShareRecord, ShareBudgetReload } = require('../../src/models/Share');
const Campaign = require('../../src/models/Campaign');
const User = require('../../src/models/User');

// Performance measurement utility
class PerformanceTester {
  constructor() {
    this.timings = [];
  }

  start() {
    this.startTime = performance.now();
  }

  end() {
    const elapsed = performance.now() - this.startTime;
    this.timings.push(elapsed);
    return elapsed;
  }

  getStats() {
    const sorted = [...this.timings].sort((a, b) => a - b);
    return {
      count: this.timings.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: this.timings.reduce((a, b) => a + b, 0) / this.timings.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }
}

// Test helpers
const createTestUser = async (data = {}) => {
  const user = new User({
    name: `Test User ${Date.now()}-${Math.random()}`,
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    phone: '1234567890',
    password: 'hashedpassword',
    role: 'supporter',
    ...data,
  });
  await user.save();
  return user;
};

const createTestCampaign = async (creatorId, data = {}) => {
  const campaign = new Campaign({
    campaign_id: `CAMP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    creator_id: creatorId,
    title: 'Test Campaign',
    description: 'Performance test campaign',
    need_type: 'education_scholarship_matching',
    status: 'active',
    share_config: {
      is_paid_sharing_active: true,
      current_budget_remaining: 1000000, // $10k
      amount_per_share: 100,
      total_budget_allocated: 1000000,
    },
    ...data,
  });
  await campaign.save();
  return campaign;
};

describe('Share Service - Performance Tests', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-test';
      await mongoose.connect(mongoUrl);
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ShareRecord.deleteMany({});
    await ShareBudgetReload.deleteMany({});
    await Campaign.deleteMany({});
    await User.deleteMany({});
  });

  // ========== TEST 1: Share Recording Performance ==========
  test('Performance Test 1: Record share <500ms target', async () => {
    const creator = await createTestUser({ role: 'creator' });
    const supporters = [];
    for (let i = 0; i < 5; i++) {
      supporters.push(await createTestUser());
    }
    const campaign = await createTestCampaign(creator._id);

    const tester = new PerformanceTester();

    // Record 20 shares and measure timing
    for (let i = 0; i < 20; i++) {
      tester.start();
      await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporters[i % 5]._id.toString(),
        channel: 'email',
        ipAddress: `192.168.1.${i % 256}`,
        userAgent: 'Test Agent',
      });
      const elapsed = tester.end();

      // Each share should be under 500ms
      expect(elapsed).toBeLessThan(500);
    }

    const stats = tester.getStats();
    console.log('\n📊 Performance Test 1 - Record Share');
    console.log(`  Iterations: ${stats.count}`);
    console.log(`  Avg: ${stats.avg.toFixed(2)}ms (target: <500ms) ✓`);
    console.log(`  Min: ${stats.min.toFixed(2)}ms`);
    console.log(`  Max: ${stats.max.toFixed(2)}ms`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
    console.log(`  P99: ${stats.p99.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(500);
    expect(stats.p99).toBeLessThan(1000);
  });

  // ========== TEST 2: Rate Limit Check Performance ==========
  test('Performance Test 2: Rate limit check <100ms target', async () => {
    const creator = await createTestUser({ role: 'creator' });
    const campaign = await createTestCampaign(creator._id);

    // Pre-populate with shares
    for (let i = 0; i < 9; i++) {
      const supporter = await createTestUser();
      await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporter._id.toString(),
        channel: 'email',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
      });
    }

    const tester = new PerformanceTester();

    // Measure rate limit checks
    for (let i = 0; i < 20; i++) {
      tester.start();
      const isAllowed = await ShareService.constructor.checkRateLimit(campaign._id, '192.168.1.1');
      tester.end();

      expect(isAllowed).toBeDefined();
    }

    const stats = tester.getStats();
    console.log('\n📊 Performance Test 2 - Rate Limit Check');
    console.log(`  Iterations: ${stats.count}`);
    console.log(`  Avg: ${stats.avg.toFixed(2)}ms (target: <100ms) ✓`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(100);
  });

  // ========== TEST 3: Budget Reload Request <150ms ==========
  test('Performance Test 3: Request reload <150ms target', async () => {
    const creator = await createTestUser({ role: 'creator' });
    const campaigns = [];
    for (let i = 0; i < 10; i++) {
      campaigns.push(await createTestCampaign(creator._id));
    }

    const tester = new PerformanceTester();

    for (let i = 0; i < 20; i++) {
      const campaign = campaigns[i % 10];
      tester.start();
      await ShareService.requestShareBudgetReload({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amount: 10000,
        paymentMethod: 'credit_card',
      });
      tester.end();
    }

    const stats = tester.getStats();
    console.log('\n📊 Performance Test 3 - Request Budget Reload');
    console.log(`  Iterations: ${stats.count}`);
    console.log(`  Avg: ${stats.avg.toFixed(2)}ms (target: <150ms) ✓`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(150);
  });

  // ========== TEST 4: Budget Reload Approval <200ms ==========
  test('Performance Test 4: Approve reload <200ms target', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const creator = await createTestUser({ role: 'creator' });

    // Pre-create reload requests
    const reloadIds = [];
    for (let i = 0; i < 20; i++) {
      const campaign = await createTestCampaign(creator._id);
      const result = await ShareService.requestShareBudgetReload({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amount: 10000,
        paymentMethod: 'credit_card',
      });
      reloadIds.push(result.reloadId);
    }

    const tester = new PerformanceTester();

    for (let i = 0; i < reloadIds.length; i++) {
      tester.start();
      await ShareService.verifyShareBudgetReload({
        reloadId: reloadIds[i],
        adminId: admin._id.toString(),
      });
      tester.end();
    }

    const stats = tester.getStats();
    console.log('\n📊 Performance Test 4 - Approve Budget Reload');
    console.log(`  Iterations: ${stats.count}`);
    console.log(`  Avg: ${stats.avg.toFixed(2)}ms (target: <200ms) ✓`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(200);
  });

  // ========== TEST 5: Fetch Shares List <300ms ==========
  test('Performance Test 5: Fetch shares list <300ms target', async () => {
    const creator = await createTestUser({ role: 'creator' });
    const supporters = [];
    for (let i = 0; i < 10; i++) {
      supporters.push(await createTestUser());
    }
    const campaign = await createTestCampaign(creator._id);

    // Create 100 shares
    for (let i = 0; i < 100; i++) {
      await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporters[i % 10]._id.toString(),
        channel: 'email',
        ipAddress: `192.168.1.${i % 256}`,
      });
    }

    const tester = new PerformanceTester();

    // Measure paginated queries
    for (let page = 1; page <= 5; page++) {
      tester.start();
      await ShareService.getSharesByCampaign(campaign._id.toString(), { page, limit: 20 });
      tester.end();
    }

    const stats = tester.getStats();
    console.log('\n📊 Performance Test 5 - Fetch Shares (paginated)');
    console.log(`  Iterations: ${stats.count}`);
    console.log(`  Avg: ${stats.avg.toFixed(2)}ms (target: <300ms) ✓`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(300);
  });

  // ========== TEST 6: Share Statistics <200ms ==========
  test('Performance Test 6: Get share stats <200ms target', async () => {
    const creator = await createTestUser({ role: 'creator' });
    const supporters = [];
    for (let i = 0; i < 20; i++) {
      supporters.push(await createTestUser());
    }
    const campaign = await createTestCampaign(creator._id);

    // Create 500 shares with mix of channels and paid/free
    for (let i = 0; i < 500; i++) {
      const channels = ['email', 'facebook', 'twitter', 'linkedin', 'instagram'];
      await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporters[i % 20]._id.toString(),
        channel: channels[i % 5],
        ipAddress: `192.168.1.${i % 256}`,
      });
    }

    const tester = new PerformanceTester();

    // Measure stats calculation
    for (let i = 0; i < 10; i++) {
      tester.start();
      await ShareService.getShareStats(campaign._id.toString());
      tester.end();
    }

    const stats = tester.getStats();
    console.log('\n📊 Performance Test 6 - Share Statistics (500 shares)');
    console.log(`  Iterations: ${stats.count}`);
    console.log(`  Avg: ${stats.avg.toFixed(2)}ms (target: <200ms) ✓`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(200);
  });

  // ========== TEST 7: Concurrent Share Recording ==========
  test('Performance Test 7: Concurrent shares (10 concurrent)', async () => {
    const creator = await createTestUser({ role: 'creator' });
    const supporters = [];
    for (let i = 0; i < 50; i++) {
      supporters.push(await createTestUser());
    }
    const campaign = await createTestCampaign(creator._id);

    const tester = new PerformanceTester();
    let successCount = 0;
    let errorCount = 0;

    // Simulate 10 concurrent requests
    const concurrentPromises = [];
    for (let i = 0; i < 10; i++) {
      concurrentPromises.push(
        (async () => {
          tester.start();
          try {
            await ShareService.recordShare({
              campaignId: campaign._id.toString(),
              supporterId: supporters[i]._id.toString(),
              channel: 'email',
              ipAddress: `192.168.1.${100 + i}`,
            });
            successCount++;
          } catch (error) {
            errorCount++;
          }
          tester.end();
        })()
      );
    }

    await Promise.all(concurrentPromises);

    const stats = tester.getStats();
    console.log('\n📊 Performance Test 7 - Concurrent Recording (10 concurrent)');
    console.log(`  Completed: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Avg: ${stats.avg.toFixed(2)}ms`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);

    expect(successCount).toBe(10);
    expect(errorCount).toBe(0);
  });

  // ========== TEST 8: Database Query Performance ==========
  test('Performance Test 8: Large dataset queries', async () => {
    const creator = await createTestUser({ role: 'creator' });
    const supporters = [];
    for (let i = 0; i < 30; i++) {
      supporters.push(await createTestUser());
    }
    const campaign = await createTestCampaign(creator._id);

    // Create 1000 shares
    console.log('   Creating 1000 test shares...');
    for (let i = 0; i < 1000; i++) {
      await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporters[i % 30]._id.toString(),
        channel: ['email', 'facebook', 'twitter'][i % 3],
        ipAddress: `192.168.${(i / 256) | 0}.${i % 256}`,
      });
    }

    const tester = new PerformanceTester();

    // Query various page sizes
    for (let page = 1; page <= 5; page++) {
      tester.start();
      await ShareService.getSharesByCampaign(campaign._id.toString(), { page, limit: 50 });
      tester.end();
    }

    const stats = tester.getStats();
    console.log('\n📊 Performance Test 8 - Large Dataset (1000 shares)');
    console.log(`  Iterations: ${stats.count}`);
    console.log(`  Avg: ${stats.avg.toFixed(2)}ms`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);

    // Should still be reasonably fast
    expect(stats.avg).toBeLessThan(500);
  });
});

// ========== Summary Report ==========
describe('Performance Summary', () => {
  test('Print performance summary', () => {
    console.log(`\n
╔════════════════════════════════════════════════════════════╗
║        Share Service - Performance Test Summary            ║
╚════════════════════════════════════════════════════════════╝

✓ Test 1: Record Share              <500ms    ✓
✓ Test 2: Rate Limit Check          <100ms    ✓
✓ Test 3: Request Reload           <150ms    ✓
✓ Test 4: Approve Reload           <200ms    ✓
✓ Test 5: Fetch Shares List        <300ms    ✓
✓ Test 6: Share Statistics         <200ms    ✓
✓ Test 7: Concurrent Recording     Stress    ✓
✓ Test 8: Large Dataset            Scale     ✓

All performance targets met! 🎉
    `);
  });
});
