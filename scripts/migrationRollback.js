#!/usr/bin/env node

/**
 * Database Migration Rollback Script
 * Rolls back migrations in reverse order
 * Run: npm run db:migrate:rollback
 */

require('dotenv').config();

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const { logger } = require('../src/utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, '../db/migrations');

const rollbackMigrations = async () => {
  try {
    logger.info('⏮️  Starting database rollback...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB,
    });

    logger.info('✅ Connected to MongoDB');

    // Get migration collection
    const db = mongoose.connection.getClient().db(process.env.MONGODB_DB);
    const migrationsCollection = db.collection('migrations');

    // Get all migration files
    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.js'))
      .sort()
      .reverse();

    // Get applied migrations
    const applied = await migrationsCollection.find({}).toArray();
    const appliedNames = applied.map((m) => m.name);

    if (appliedNames.length === 0) {
      logger.info('ℹ️  No migrations to rollback');
      process.exit(0);
    }

    // Rollback each migration
    for (const file of migrationFiles) {
      const migrationName = path.parse(file).name;

      // Check if migration was applied
      if (!appliedNames.includes(migrationName)) {
        logger.info(`⏭️  Skipping: ${migrationName} (not applied)`);
        continue;
      }

      // Load and run rollback
      const migration = require(path.join(MIGRATIONS_DIR, file));

      if (!migration.down) {
        logger.warn(`⚠️  No rollback defined for: ${migrationName}`);
        continue;
      }

      try {
        logger.info(`▶️  Rolling back: ${migrationName}...`);
        await migration.down(db);
        logger.info(`✅ Rolled back: ${migrationName}`);

        // Remove migration record
        await migrationsCollection.deleteOne({ name: migrationName });
      } catch (error) {
        logger.error(`❌ Rollback failed: ${migrationName}`, {
          message: error.message,
          stack: error.stack,
        });
        throw error;
      }
    }

    logger.info('\n🎉 All migrations rolled back successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Rollback process failed:', {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

// Run rollback
rollbackMigrations();
