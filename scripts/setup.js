#!/usr/bin/env node

/**
 * Initial Project Setup Script
 * Sets up the development environment
 * Run: npm run setup
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const { logger } = require('../src/utils/logger');

const setup = async () => {
  try {
    logger.info('🚀 Starting HonestNeed Backend Setup...\n');

    // Check .env file
    logger.info('1️⃣  Checking environment configuration...');
    if (!fs.existsSync(path.join(__dirname, '../.env'))) {
      logger.warn('⚠️  No .env file found. Creating from .env.example...');
      const example = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
      fs.writeFileSync(path.join(__dirname, '../.env'), example);
      logger.info('✅ Created .env file. Please update with your configuration.');
    } else {
      logger.info('✅ .env file found');
    }

    // Check logs directory
    logger.info('\n2️⃣  Setting up directories...');
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      logger.info('✅ Created logs directory');
    } else {
      logger.info('✅ Logs directory exists');
    }

    logger.info('\n✅ Setup completed successfully!');
    logger.info('\n📝 Next steps:');
    logger.info('  1. Review and update .env file with your configuration');
    logger.info('  2. Run: npm install');
    logger.info('  3. Run: npm run dev   (to start development server)');
    logger.info('  4. Run: docker-compose up   (to start with Docker)');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Setup failed:', {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

// Run setup
setup();
