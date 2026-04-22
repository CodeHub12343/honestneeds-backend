#!/usr/bin/env node

/**
 * Query Validation & Performance Testing
 * Tests critical queries to ensure index usage and performance
 * Run: npm run test:queries
 */

require('dotenv').config();

const mongoose = require('mongoose');
const logger = require('../src/utils/logger');

const testQueries = async () => {
  let connection;
  try {
    logger.info('🔬 Running query performance tests...\n');

    // Connect to MongoDB
    connection = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB,
    });

    const db = mongoose.connection.db;

    const queries = [
      {
        name: 'Find user by email',
        collection: 'users',
        query: { email: 'test@example.com' },
        expectTime: 10,
      },
      {
        name: 'Find campaigns by creator and status',
        collection: 'campaigns',
        query: { creator_id: new mongoose.Types.ObjectId(), status: 'active' },
        expectTime: 10,
      },
      {
        name: 'List active campaigns sorted by date',
        collection: 'campaigns',
        query: { status: 'active' },
        sort: { published_at: -1 },
        expectTime: 50,
      },
      {
        name: 'Find transactions by campaign',
        collection: 'transactions',
        query: { campaign_id: new mongoose.Types.ObjectId() },
        expectTime: 10,
      },
      {
        name: 'List pending transactions',
        collection: 'transactions',
        query: { status: 'pending' },
        sort: { created_at: -1 },
        expectTime: 10,
      },
      {
        name: 'Find shares by campaign and status',
        collection: 'shares',
        query: { campaign_id: new mongoose.Types.ObjectId(), status: 'verified' },
        expectTime: 10,
      },
      {
        name: 'Find sweepstakes entries by user',
        collection: 'sweepstakes_entries',
        query: { user_id: new mongoose.Types.ObjectId() },
        expectTime: 10,
      },
    ];

    let passCount = 0;
    let totalTime = 0;

    logger.info('Query Performance Results:\n');
    logger.info('Query Name                                | Time (ms) | Status');
    logger.info('─'.repeat(70));

    for (const testCase of queries) {
      const collection = db.collection(testCase.collection);
      const startTime = Date.now();

      try {
        let cursor = collection.find(testCase.query);
        if (testCase.sort) {
          cursor = cursor.sort(testCase.sort);
        }
        
        // Execute query with limit to avoid timeout
        await cursor.limit(1).toArray();
        
        const duration = Date.now() - startTime;
        totalTime += duration;

        const status = duration <= testCase.expectTime ? '✅' : '⚠️ ';
        const statusText = duration <= testCase.expectTime ? 'PASS' : 'SLOW';

        logger.info(
          `${testCase.name.padEnd(40)} | ${String(duration).padStart(8)} | ${status} ${statusText}`
        );

        if (duration <= testCase.expectTime) {
          passCount++;
        }
      } catch (error) {
        logger.error(`❌ ${testCase.name} - Error: ${error.message}`);
      }
    }

    logger.info('─'.repeat(70));
    logger.info(`\n📊 Summary: ${passCount}/${queries.length} queries passed`);
    logger.info(`Total time: ${totalTime}ms (avg: ${(totalTime / queries.length).toFixed(2)}ms/query)`);

    if (passCount === queries.length) {
      logger.info('\n✅ All queries performing within expectations!');
      process.exit(0);
    } else {
      logger.warn('\n⚠️  Some queries are slow. Check indexes.');
      process.exit(1);
    }
  } catch (error) {
    logger.error('❌ Query test failed:', { message: error.message });
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
    }
  }
};

testQueries();
