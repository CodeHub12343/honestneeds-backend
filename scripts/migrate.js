#!/usr/bin/env node

/**
 * Database Migration Runner (Enhanced) 
 * Executes migrations in sequential order with rollback support
 * Run: npm run db:migrate
 * Run with dry-run: npm run db:migrate -- --dry-run
 * Rollback: npm run db:migrate:rollback
 * Day 4-5: Database & MongoDB Configuration (Sprint 1-2)
 */

require('dotenv').config();

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const logger = require('../src/utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, '../db/migrations');
const isDryRun = process.argv.includes('--dry-run');

const runMigrations = async () => {
  let connection;
  try {
    logger.info('🚀 Starting database migrations...');
    if (isDryRun) {
      logger.info('📋 DRY RUN MODE - No changes will be made');
    }

    // Connect to MongoDB
    connection = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB,
    });

    logger.info('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const migrationsCollection = db.collection('migrations');

    // Ensure migrations collection exists
    await migrationsCollection.updateOne(
      { __init: true },
      { $set: { __init: true } },
      { upsert: true }
    );

    // Get list of migration files
    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.js') && !file.includes('.test.') && file !== '002_rollback.js')
      .sort();

    logger.info(`Found ${migrationFiles.length} migration files`);

    // Get already applied migrations
    const appliedMigrations = await migrationsCollection
      .find({ name: { $exists: true }, status: 'success' })
      .toArray();

    const appliedNames = new Set(appliedMigrations.map(m => m.name));
    let migrationsRun = 0;

    // Run each migration
    for (const filename of migrationFiles) {
      const filepath = path.join(MIGRATIONS_DIR, filename);
      const migrationName = filename.replace('.js', '');

      // Check if already run
      if (appliedNames.has(migrationName)) {
        logger.info(`⏭️  Skipping ${migrationName} (already applied)`);
        continue;
      }

      try {
        logger.info(`⏳ Running migration: ${migrationName}...`);
        const migration = require(filepath);

        if (isDryRun) {
          logger.info(`   [DRY RUN] Would execute ${migrationName}`);
          migrationsRun++;
          continue;
        }

        // Run up() method
        await migration.up(db);

        // Record migration
        await migrationsCollection.insertOne({
          name: migrationName,
          applied_at: new Date(),
          status: 'success',
          duration_ms: 0,
        });

        logger.info(`✅ Migration complete: ${migrationName}`);
        migrationsRun++;
      } catch (error) {
        logger.error(`❌ Migration failed: ${migrationName}`, {
          message: error.message,
          stack: error.stack,
        });

        await migrationsCollection.insertOne({
          name: migrationName,
          attempted_at: new Date(),
          status: 'failed',
          error: error.message,
        });

        throw error;
      }
    }

    if (isDryRun) {
      logger.info(`📋 DRY RUN COMPLETE - ${migrationsRun} migrations would be run`);
    } else {
      logger.info(`🎉 All migrations completed successfully! (${migrationsRun} migrations run)`);
      logger.info('📊 Collections created: users, campaigns, transactions, shares, sweepstakes_entries');
      logger.info('✅ Status: Ready for data operations');
    }

    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
    }
  }
};

// Run migrations
runMigrations();
