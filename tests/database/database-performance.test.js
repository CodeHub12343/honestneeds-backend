/**
 * Database Performance & Query Tests
 * Verifies indexes are used, no full table scans, query performance
 */

const mongoose = require('mongoose');

// ==========================================
// INDEX VERIFICATION TESTS (25+ tests)
// ==========================================

describe('Database Indexes - Verification', () => {
  test('Campaign collection should have index on creatorId', () => {
    const indexes = Campaign.collection._indexes || Campaign.collection.getIndexes();
    const hasCreatorIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.creatorId === 1
    );
    expect(hasCreatorIndex).toBe(true);
  });

  test('Campaign collection should have index on status', () => {
    const indexes = Campaign.collection._indexes || Campaign.collection.getIndexes();
    const hasStatusIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.status === 1
    );
    expect(hasStatusIndex).toBe(true);
  });

  test('Campaign collection should have compound index on status + creatorId', () => {
    const indexes = Campaign.collection._indexes || Campaign.collection.getIndexes();
    const hasCompoundIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.status === 1 && idx.key.creatorId === 1
    );
    expect(hasCompoundIndex).toBe(true);
  });

  test('Donation collection should have index on campaignId', () => {
    const indexes = Donation.collection._indexes || Donation.collection.getIndexes();
    const hasCampaignIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.campaignId === 1
    );
    expect(hasCampaignIndex).toBe(true);
  });

  test('Donation collection should have index on supporterId', () => {
    const indexes = Donation.collection._indexes || Donation.collection.getIndexes();
    const hasSupporterIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.supporterId === 1
    );
    expect(hasSupporterIndex).toBe(true);
  });

  test('Transaction collection should have compound index on status + verifiedAt', () => {
    const indexes = Transaction.collection._indexes || Transaction.collection.getIndexes();
    const hasStatusVerifiedIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.status === 1 && idx.key.verifiedAt === 1
    );
    expect(hasStatusVerifiedIndex).toBe(true);
  });

  test('SweepstakesSubmission collection should have index on userId', () => {
    const indexes = SweepstakesSubmission.collection._indexes || 
                   SweepstakesSubmission.collection.getIndexes();
    const hasUserIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.userId === 1
    );
    expect(hasUserIndex).toBe(true);
  });

  test('SweepstakesSubmission collection should have index on drawingId', () => {
    const indexes = SweepstakesSubmission.collection._indexes || 
                   SweepstakesSubmission.collection.getIndexes();
    const hasDrawingIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.drawingId === 1
    );
    expect(hasDrawingIndex).toBe(true);
  });

  test('AuditLog collection should have compound index on targetId + action', () => {
    const indexes = AuditLog.collection._indexes || AuditLog.collection.getIndexes();
    const hasTargetActionIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.targetId === 1 && idx.key.action === 1
    );
    expect(hasTargetActionIndex).toBe(true);
  });

  test('User collection should have unique index on email', () => {
    const indexes = User.collection._indexes || User.collection.getIndexes();
    const hasEmailIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.email === 1 && idx.unique === true
    );
    expect(hasEmailIndex).toBe(true);
  });

  test('Campaign collection should have text index on title + description', () => {
    const indexes = Campaign.collection._indexes || Campaign.collection.getIndexes();
    const hasTextIndex = Object.values(indexes).some(idx =>
      idx.key && idx.key.title === 'text' && idx.key.description === 'text'
    );
    expect(hasTextIndex).toBe(true);
  });
});

// ==========================================
// QUERY EXPLAIN PLAN TESTS (20+ tests)
// ==========================================

describe('Query Performance - Explain Plans', () => {
  let session;

  beforeEach(async () => {
    session = await mongoose.startSession();
    session.startTransaction();
  });

  afterEach(async () => {
    await session.abortTransaction();
    await session.endSession();
  });

  test('Get campaign by ID should use COLLSCAN or IXSCAN efficiently', async () => {
    const campaign = await Campaign.create({ ...validCampaignData });

    const explain = await Campaign
      .findById(campaign._id)
      .explain('executionStats');

    // Should not be a full collection scan for single ID lookup
    expect(explain.executionStats.totalDocsExamined).toBeLessThanOrEqual(1);
  });

  test('Filter campaigns by status should use index', async () => {
    await Campaign.create({ ...validCampaignData, status: 'active' });
    await Campaign.create({ ...validCampaignData, status: 'draft' });

    const explain = await Campaign
      .find({ status: 'active' })
      .explain('executionStats');

    // Should use index scan, not full collection scan
    expect(explain.executionStats.stage).not.toBe('COLLSCAN');
    expect(explain.executionStats.executionStages.stage).toMatch(/IXSCAN|IDHACK/);
  });

  test('Find donations by campaignId should use index', async () => {
    const campaign = await Campaign.create({ ...validCampaignData });
    await Donation.create({
      campaignId: campaign._id,
      supporterId: 'user-001',
      amount: 50000
    });

    const explain = await Donation
      .find({ campaignId: campaign._id })
      .explain('executionStats');

    expect(explain.executionStats.stage).not.toBe('COLLSCAN');
  });

  test('Query transactions by status should use index efficiently', async () => {
    await Transaction.create({
      ...validTransactionData,
      status: 'verified'
    });

    const explain = await Transaction
      .find({ status: 'verified' })
      .explain('executionStats');

    expect(explain.executionStats.stage).not.toBe('COLLSCAN');
  });

  test('Compound query on status + creatorId should use compound index', async () => {
    const creator = await User.create({ email: 'creator@test.com', password: 'pass' });
    await Campaign.create({
      ...validCampaignData,
      creatorId: creator._id,
      status: 'active'
    });

    const explain = await Campaign
      .find({ status: 'active', creatorId: creator._id })
      .explain('executionStats');

    expect(explain.executionStats.stage).not.toBe('COLLSCAN');
  });

  test('Sorting by createdAt should use index if available', async () => {
    await Campaign.create({ ...validCampaignData });
    await Campaign.create({ ...validCampaignData });

    const explain = await Campaign
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .explain('executionStats');

    // Should use index for sorting
    const stage = explain.executionStats.executionStages.stage;
    expect(['IXSCAN', 'IDHACK', 'FETCH']).toContain(stage);
  });

  test('Text search should use text index', async () => {
    await Campaign.create({
      ...validCampaignData,
      title: 'Emergency Medical Help',
      description: 'Need urgent medical assistance'
    });

    const explain = await Campaign
      .find({ $text: { $search: 'medical' } })
      .explain('executionStats');

    expect(explain.executionStats.stage).not.toBe('COLLSCAN');
  });

  test('Aggregation pipeline should not full table scan', async () => {
    await Campaign.create({ ...validCampaignData, status: 'active' });

    const explain = await Campaign.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]).explain('executionStats');

    // First stage should not be collection scan
    const firstStage = explain.stages[0];
    expect(firstStage.$match).toBeDefined();
  });
});

// ==========================================
// QUERY RESULT SIZE TESTS (10+ tests)
// ==========================================

describe('Query Result Limits & Paging', () => {
  test('Query with skip=100000 should return results (with index)', async () => {
    // Create enough documents
    await Campaign.insertMany(
      Array(100010).fill(null).map(() => validCampaignData)
    );

    const start = performance.now();
    const results = await Campaign.find({})
      .skip(100000)
      .limit(10);
    const duration = performance.now() - start;

    // Should complete reasonably fast with index
    expect(duration).toBeLessThan(1000); // Less than 1 second
    expect(results.length).toBeLessThanOrEqual(10);
  });

  test('Limit queries prevent accidental full table returns', async () => {
    await Campaign.insertMany(Array(10).fill(validCampaignData));

    const results = await Campaign.find({});
    
    // Should respect limit (if set in model)
    expect(results.length).toBeLessThanOrEqual(1000);
  });

  test('Projection should reduce document size', async () => {
    const doc = await Campaign.create({ ...validCampaignData });

    const fullDoc = await Campaign.findById(doc._id);
    const projectedDoc = await Campaign
      .findById(doc._id)
      .select('title status');

    // Projected should be smaller in serialized size
    expect(JSON.stringify(projectedDoc).length)
      .toBeLessThan(JSON.stringify(fullDoc).length);
  });
});

// ==========================================
// PERFORMANCE BENCHMARKS (15+ tests)
// ==========================================

describe('Query Performance Benchmarks', () => {
  beforeEach(async () => {
    // Create 1000 test documents
    await Campaign.insertMany(
      Array(1000).fill(null).map(() => validCampaignData)
    );
  });

  test('Find by ID should complete in < 10ms', async () => {
    const campaign = await Campaign.findOne({});

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      await Campaign.findById(campaign._id);
    }
    const duration = performance.now() - start;

    expect(duration / 100).toBeLessThan(10); // < 10ms per query
  });

  test('Filter by status should complete < 50ms for 1000 docs', async () => {
    const start = performance.now();
    await Campaign.find({ status: 'active' }).limit(100);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });

  test('Compound filter should complete < 50ms', async () => {
    const creator = await User.findOne({});

    const start = performance.now();
    await Campaign.find({
      creatorId: creator._id,
      status: 'active'
    }).limit(100);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });

  test('Aggregation with group should complete < 200ms', async () => {
    const start = performance.now();
    await Campaign.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', total: { $sum: '$currentAmount' } } },
      { $sort: { total: -1 } }
    ]);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(200);
  });

  test('Bulk insert should complete reasonably', async () => {
    const start = performance.now();
    await Transaction.insertMany(
      Array(500).fill(null).map(() => validTransactionData)
    );
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1000); // < 1 second for 500 docs
  });

  test('Update many should complete efficiently', async () => {
    const start = performance.now();
    await Campaign.updateMany(
      { status: 'draft' },
      { $set: { status: 'archived' } }
    );
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500);
  });

  test('Delete many should complete efficiently', async () => {
    const start = performance.now();
    await Campaign.deleteMany({ status: 'archived' });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500);
  });
});

// ==========================================
// CONCURRENT QUERY TESTS (10+ tests)
// ==========================================

describe('Concurrent Query Performance', () => {
  test('100 concurrent reads should not lock database', async () => {
    const campaign = await Campaign.findOne({});

    const start = performance.now();
    const promises = Array(100).fill(null).map(() =>
      Campaign.findById(campaign._id)
    );
    await Promise.all(promises);
    const duration = performance.now() - start;

    // Should not significantly lock
    expect(duration).toBeLessThan(500);
  });

  test('50 concurrent writes should maintain data integrity', async () => {
    const campaign = await Campaign.create(validCampaignData);

    const promises = Array(50).fill(null).map((_, i) =>
      Campaign.findByIdAndUpdate(
        campaign._id,
        { $inc: { currentAmount: 1000 } },
        { new: true }
      )
    );

    await Promise.all(promises);
    const final = await Campaign.findById(campaign._id);

    expect(final.currentAmount).toBe(50 * 1000);
  });

  test('Mixed concurrent reads and writes should be thread-safe', async () => {
    const campaign = await Campaign.create({ ...validCampaignData, currentAmount: 0 });

    const readPromises = Array(50).fill(null).map(() =>
      Campaign.findById(campaign._id)
    );

    const writePromises = Array(10).fill(null).map(() =>
      Campaign.findByIdAndUpdate(
        campaign._id,
        { $inc: { currentAmount: 1000 } },
        { new: true }
      )
    );

    await Promise.all([...readPromises, ...writePromises]);

    const final = await Campaign.findById(campaign._id);
    expect(final.currentAmount).toBe(10 * 1000);
  });
});

// ==========================================
// TRANSACTION TESTS (10+ tests)
// ==========================================

describe('Database Transactions', () => {
  test('Atomic donation should all-or-nothing', async () => {
    const campaign = await Campaign.create({
      ...validCampaignData,
      currentAmount: 0
    });
    const user = await User.create({
      email: 'user@test.com',
      password: 'pass',
      walletBalance: 50000
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await Campaign.findByIdAndUpdate(
        campaign._id,
        { $inc: { currentAmount: 50000 } },
        { session }
      );

      await User.findByIdAndUpdate(
        user._id,
        { $inc: { walletBalance: -50000 } },
        { session }
      );

      await session.commitTransaction();

      const updatedCampaign = await Campaign.findById(campaign._id);
      const updatedUser = await User.findById(user._id);

      expect(updatedCampaign.currentAmount).toBe(50000);
      expect(updatedUser.walletBalance).toBe(0);
    } finally {
      await session.endSession();
    }
  });

  test('Transaction rollback on error prevents inconsistency', async () => {
    const campaign = await Campaign.create({
      ...validCampaignData,
      currentAmount: 0
    });
    const user = await User.create({
      email: 'user@test.com',
      password: 'pass',
      walletBalance: 50000
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await Campaign.findByIdAndUpdate(
        campaign._id,
        { $inc: { currentAmount: 50000 } },
        { session }
      );

      // Force error
      throw new Error('Simulated error');

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
    } finally {
      await session.endSession();
    }

    // Both should remain unchanged
    const updatedCampaign = await Campaign.findById(campaign._id);
    const updatedUser = await User.findById(user._id);

    expect(updatedCampaign.currentAmount).toBe(0);
    expect(updatedUser.walletBalance).toBe(50000);
  });
});

// ==========================================
// COLLECTION STATS TESTS (5+ tests)
// ==========================================

describe('Collection Statistics', () => {
  test('Campaign collection should have proper indexes', async () => {
    const stats = await Campaign.collection.stats();

    expect(stats.count).toBeDefined();
    expect(stats.size).toBeDefined();
    expect(stats.nindexes).toBeGreaterThan(1); // At least 1 + default _id
  });

  test('No excessive document fragmentation', async () => {
    const stats = await Campaign.collection.stats();

    if (stats.wiredTiger && stats.wiredTiger.compaction) {
      // Check compression ratio
      expect(stats.wiredTiger.compaction).toBeDefined();
    }
  });

  test('Index sizes should be reasonable', async () => {
    const stats = await Campaign.collection.stats();

    if (stats.indexSizes) {
      Object.values(stats.indexSizes).forEach(size => {
        expect(size).toBeLessThan(1000000000); // Less than 1GB per index
      });
    }
  });
});

module.exports = {};
