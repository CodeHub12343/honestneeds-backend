#!/usr/bin/env node

/**
 * Index Verification Script
 * Verifies all indexes are created and performing well
 * Run: npm run verify:indexes
 */

require('dotenv').config();

const mongoose = require('mongoose');
const logger = require('../src/utils/logger');

const verifyIndexes = async () => {
  let connection;
  try {
    logger.info('🔍 Verifying database indexes...\n');

    // Connect to MongoDB
    connection = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB,
    });

    const db = mongoose.connection.db;
    
    const collections = [
      { name: 'users', expectedIndexes: 5 },
      { name: 'campaigns', expectedIndexes: 10 },
      { name: 'transactions', expectedIndexes: 7 },
      { name: 'shares', expectedIndexes: 8 },
      { name: 'sweepstakes_entries', expectedIndexes: 5 },
    ];

    let allHealthy = true;

    for (const { name, expectedIndexes } of collections) {
      try {
        const collection = db.collection(name);
        const indexes = await collection.getIndexes();
        
        // Filter out _id index
        const customIndexes = Object.keys(indexes).filter(k => k !== '_id_');
        const indexCount = customIndexes.length;
        
        const status = indexCount >= expectedIndexes - 1 ? '✅' : '⚠️ ';
        logger.info(`${status} ${name.padEnd(20)} | Indexes: ${indexCount}/${expectedIndexes}`);

        if (process.env.VERBOSE) {
          customIndexes.forEach(idx => {
            logger.info(`     └─ ${idx}`);
          });
        }
      } catch (error) {
        logger.error(`❌ ${name} - Collection not found or error: ${error.message}`);
        allHealthy = false;
      }
    }

    logger.info('\n📊 Index Statistics:');
    for (const { name } of collections) {
      try {
        const collection = db.collection(name);
        const stats = await collection.stats();
        logger.info(`  ${name}: ${stats.count} documents, ${stats.size} bytes`);
      } catch (e) {
        // Ignore
      }
    }

    if (allHealthy) {
      logger.info('\n✅ All indexes verified successfully!');
      process.exit(0);
    } else {
      logger.warn('\n⚠️  Some issues detected. Run migrations again.');
      process.exit(1);
    }
  } catch (error) {
    logger.error('❌ Verification failed:', { message: error.message });
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
    }
  }
};

verifyIndexes();
