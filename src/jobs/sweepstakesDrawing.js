/**
 * SWEEPSTAKES DRAWING SCHEDULER
 * 
 * Executes monthly sweepstakes drawings automatically
 * Scheduled: 1st day of each month at 2:00 AM UTC
 * 
 * Process:
 * 1. Collect all SweepstakesSubmission records for current period
 * 2. Execute drawing using Vose's Alias Method
 * 3. Select winner based on weighted entry distribution
 * 4. Create SweepstakesDrawing record
 * 5. Send winner notification email
 * 6. Lock entries for this period
 * 7. Initialize entries for next period
 */

const schedule = require('node-schedule');
const { DrawingService } = require('../services/DrawingService');
const { SweepstakesService } = require('../services/SweepstakesService');
const { NotificationService } = require('../services/NotificationService');
const { User, SweepstakesDrawing, SweepstakesSubmission } = require('../models');
const { winstonLogger } = require('../utils/logger');

/**
 * Execute drawing for the current month
 * Called automatically on 1st of each month at 2 AM UTC
 */
async function executeMontlyDrawing() {
  const startTime = Date.now();
  const monthStr = new Date().toISOString().slice(0, 7); // YYYY-MM format
  
  try {
    winstonLogger.info('Starting scheduled sweepstakes drawing', { 
      monthStr,
      timestamp: new Date().toISOString()
    });

    // ============================================
    // STEP 1: Validate drawing window
    // ============================================
    const lastDrawing = await SweepstakesDrawing.findOne({
      status: 'drawn'
    }).sort({ createdAt: -1 });

    if (lastDrawing) {
      const lastDrawingMonth = lastDrawing.drawingPeriod;
      if (lastDrawingMonth === monthStr) {
        winstonLogger.warn('Drawing already executed for this period', {
          period: monthStr,
          previousDrawing: lastDrawing.id
        });
        return { status: 'skipped', reason: 'Already drawn for this period' };
      }
    }

    // ============================================
    // STEP 2: Collect submissions for this period
    // ============================================
    const submissions = await SweepstakesSubmission.find({
      drawingPeriod: monthStr,
      isValid: true  // Only count valid entries
    }).lean();

    if (submissions.length === 0) {
      winstonLogger.info('No valid submissions for drawing period', { monthStr });
      return { 
        status: 'completed',
        reason: 'No participants',
        period: monthStr 
      };
    }

    // ============================================
    // STEP 3: Build weighted distribution
    // ============================================
    const weights = submissions.map((sub) => sub.entryCount);
    const totalEntries = weights.reduce((a, b) => a + b, 0);

    winstonLogger.info('Drawing participation metrics', {
      participants: submissions.length,
      totalEntries: totalEntries.toFixed(1),
      avgEntriesPerUser: (totalEntries / submissions.length).toFixed(2),
      weightRange: {
        min: Math.min(...weights),
        max: Math.max(...weights)
      }
    });

    // ============================================
    // STEP 4: Execute drawing using Vose algorithm
    // ============================================
    const aliasTable = DrawingService.buildAliasTable(weights);
    
    // Generate random seed from blockchain or secure source
    // For now, using hash of timestamp + previous block
    const seed = DrawingService.generateSeed(lastDrawing?.randomSeed);
    
    const winnerIndex = DrawingService.selectFromAliasTable(
      aliasTable,
      seed
    );

    const winnerSubmission = submissions[winnerIndex];
    const winnerUserId = winnerSubmission.userId;

    const winnerProbability = weights[winnerIndex] / totalEntries;

    winstonLogger.info('Winner selected', {
      winnerId: winnerUserId,
      entryCount: winnerSubmission.entryCount,
      probability: (winnerProbability * 100).toFixed(2) + '%'
    });

    // ============================================
    // STEP 5: Determine prize amount
    // ============================================
    // Configure prize pool here (could be variable based on total entries)
    const PRIZE_POOL_CENTS = 50000; // $500 default
    const prizeAmount = PRIZE_POOL_CENTS;

    // ============================================
    // STEP 6: Lock entries for this period
    // ============================================
    const lockTime = new Date();
    await SweepstakesSubmission.updateMany(
      { drawingPeriod: monthStr },
      { 
        submittedAt: lockTime,
        isDrawnFor: true
      }
    );

    // ============================================
    // STEP 7: Create drawing record
    // ============================================
    const drawing = await SweepstakesDrawing.create({
      drawingPeriod: monthStr,
      winningUserId: winnerUserId,
      totalParticipants: submissions.length,
      totalEntries: totalEntries,
      winnerEntryCount: winnerSubmission.entryCount,
      winnerProbability: winnerProbability,
      prizeAmount: prizeAmount,
      randomSeed: seed,
      algorithm: 'vose_alias_method',
      status: 'drawn',
      drawnAt: lockTime,
      claimDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      metadata: {
        aliasTableSize: aliasTable.length,
        topParticipants: submissions
          .sort((a, b) => b.entryCount - a.entryCount)
          .slice(0, 10)
          .map(s => ({
            userId: s.userId,
            entries: s.entryCount,
            probability: ((s.entryCount / totalEntries) * 100).toFixed(2) + '%'
          }))
      }
    });

    winstonLogger.info('Drawing record created', {
      drawingId: drawing.id,
      period: monthStr,
      status: drawing.status
    });

    // ============================================
    // STEP 8: Fetch winner details for notification
    // ============================================
    const winner = await User.findById(winnerUserId).lean();
    if (!winner) {
      throw new Error(`Winner user not found: ${winnerUserId}`);
    }

    // ============================================
    // STEP 9: Send winner notification
    // ============================================
    try {
      await NotificationService.sendEmail({
        to: winner.email,
        templateId: 'sweepstakes_winner_notification',
        data: {
          firstName: winner.firstName || 'Friend',
          prizeAmount: (prizeAmount / 100).toFixed(2),
          period: monthStr,
          claimUrl: `${process.env.FRONTEND_URL}/sweepstakes/my-winnings`,
          claimDeadline: new Date(drawing.claimDeadline).toLocaleDateString(),
          entryCount: winnerSubmission.entryCount,
          totalParticipants: submissions.length,
          probability: (winnerProbability * 100).toFixed(2)
        }
      });

      // Create in-app notification
      await NotificationService.createInAppNotification({
        userId: winnerUserId,
        type: 'sweepstakes_winner',
        title: '🎉 Congratulations! You Won!',
        message: `You won $${(prizeAmount / 100).toFixed(2)} in our ${monthStr} sweepstakes drawing!`,
        actionUrl: '/sweepstakes/my-winnings',
        priority: 'high'
      });

      winstonLogger.info('Winner notifications sent', {
        drawingId: drawing.id,
        winnerId: winnerUserId,
        email: winner.email
      });
    } catch (notificationError) {
      winstonLogger.error('Failed to send winner notifications', {
        drawingId: drawing.id,
        winnerId: winnerUserId,
        error: notificationError.message
      });
      // Don't fail drawing if notification fails, but log it
    }

    // ============================================
    // STEP 10: Create leaderboard snapshot
    // ============================================
    const topWinners = submissions
      .sort((a, b) => b.entryCount - a.entryCount)
      .slice(0, 50)
      .map((sub, index) => ({
        rank: index + 1,
        userId: sub.userId,
        entryCount: sub.entryCount,
        probability: ((sub.entryCount / totalEntries) * 100).toFixed(4)
      }));

    drawing.leaderboard = topWinners;
    await drawing.save();

    // ============================================
    // STEP 11: Log summary
    // ============================================
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    winstonLogger.info('Monthly sweepstakes drawing completed', {
      drawingId: drawing.id,
      period: monthStr,
      duration: `${duration}s`,
      summary: {
        totalParticipants: submissions.length,
        totalEntries: totalEntries.toFixed(1),
        winnerId: winnerUserId,
        prizeAmount: `$${(prizeAmount / 100).toFixed(2)}`,
        claimDeadline: drawing.claimDeadline.toISOString()
      }
    });

    return {
      status: 'completed',
      drawingId: drawing.id,
      period: monthStr,
      participants: submissions.length,
      totalEntries: totalEntries,
      winnerId: winnerUserId,
      prizeAmount: prizeAmount
    };

  } catch (error) {
    winstonLogger.error('Scheduled drawing failed', {
      error: error.message,
      stack: error.stack,
      monthStr
    });

    // Send alert to admin
    try {
      await NotificationService.sendEmail({
        to: process.env.ADMIN_EMAIL,
        templateId: 'admin_alert_drawing_failed',
        data: {
          monthStr,
          errorMessage: error.message,
          timestamp: new Date().toISOString()
        }
      });
    } catch (alertError) {
      winstonLogger.error('Failed to send admin alert', { error: alertError });
    }

    throw error;
  }
}

/**
 * Manual drawing execution for admin (testing / emergency)
 * Called via POST /api/sweepstakes/admin/draw
 */
async function executeManualDrawing(adminUserId, options = {}) {
  const {
    period = new Date().toISOString().slice(0, 7),
    skipNotifications = false,
    forceRedraw = false
  } = options;

  try {
    winstonLogger.info('Manual drawing initiated', {
      adminId: adminUserId,
      period,
      forceRedraw
    });

    // Check if admin is authorized
    const admin = await User.findById(adminUserId);
    if (!admin || !['admin', 'superadmin'].includes(admin.role)) {
      throw new Error('Unauthorized: Admin role required');
    }

    // Check if already drawn
    const existing = await SweepstakesDrawing.findOne({
      drawingPeriod: period,
      status: 'drawn'
    });

    if (existing && !forceRedraw) {
      throw new Error(`Drawing already executed for ${period}. Use forceRedraw=true to override.`);
    }

    // Execute drawing
    return await executeMontlyDrawing();

  } catch (error) {
    winstonLogger.error('Manual drawing failed', {
      error: error.message,
      adminId: adminUserId
    });
    throw error;
  }
}

/**
 * Schedule the job on server startup
 */
function scheduleDrawingJob() {
  try {
    // Run on 1st of each month at 2:00 AM UTC
    const job = schedule.scheduleJob('0 2 1 * *', async () => {
      try {
        await executeMontlyDrawing();
      } catch (error) {
        winstonLogger.error('Scheduled drawing job failed', { error });
        // Job continues to next month even if this one fails
      }
    });

    winstonLogger.info('Sweepstakes drawing job scheduled', {
      schedule: '0 2 1 * * (1st of month at 2 AM UTC)',
      nextExecution: job.nextInvocation().toISOString()
    });

    return job;

  } catch (error) {
    winstonLogger.error('Failed to schedule drawing job', { error });
    throw error;
  }
}

/**
 * Test/dry-run mode - execute drawing without persistence
 */
async function testDrawing(period = null) {
  const testPeriod = period || new Date().toISOString().slice(0, 7);
  
  try {
    const submissions = await SweepstakesSubmission.find({
      drawingPeriod: testPeriod,
      isValid: true
    }).lean();

    const weights = submissions.map(s => s.entryCount);
    const totalEntries = weights.reduce((a, b) => a + b, 0);

    const aliasTable = DrawingService.buildAliasTable(weights);
    const winnerIndex = DrawingService.selectFromAliasTable(aliasTable);
    const winner = submissions[winnerIndex];

    return {
      period: testPeriod,
      participants: submissions.length,
      totalEntries: totalEntries,
      selectedWinner: {
        userId: winner.userId,
        entryCount: winner.entryCount,
        probability: ((weights[winnerIndex] / totalEntries) * 100).toFixed(2) + '%'
      }
    };

  } catch (error) {
    winstonLogger.error('Drawing test failed', { error });
    throw error;
  }
}

module.exports = {
  executeMontlyDrawing,
  executeManualDrawing,
  scheduleDrawingJob,
  testDrawing
};
