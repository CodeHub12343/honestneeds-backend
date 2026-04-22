#!/usr/bin/env node

/**
 * Database Reset Script
 * Clears the development database and recreates collections
 * Run: npm run db:reset
 */

require('dotenv').config();

const mongoose = require('mongoose');

const { logger } = require('../src/utils/logger');

const resetDatabase = async () => {
  try {
    logger.info('🔄 Starting database reset...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB,
    });

    logger.info('✅ Connected to MongoDB');

    // Drop the entire database
    logger.warn('⚠️  Dropping database...');
    await mongoose.connection.dropDatabase();
    logger.info('✅ Database dropped');

    logger.info('\n🎉 Database reset completed successfully!');
    logger.warn(
      '⚠️  All data has been deleted. Run npm run db:seed to populate with test data.'
    );

    process.exit(0);
  } catch (error) {
    logger.error('❌ Database reset failed:', {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

// Run reset
resetDatabase();
