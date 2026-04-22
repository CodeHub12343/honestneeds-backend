const logger = require('../utils/winstonLogger');

/**
 * Error Tracking Service
 * Handles error collection, categorization, and reporting
 * Prepared for Sentry integration but works standalone
 */
class ErrorTracker {
  constructor() {
    this.errorCounts = {};
    this.lastError = null;
    this.criticalErrors = [];
    this.slackWebhook = process.env.SLACK_WEBHOOK_URL;
  }

  /**
   * Track error occurrence
   */
  trackError(error, context = {}) {
    const errorKey = `${error.code || 'UNKNOWN'}:${error.statusCode || 500}`;
    this.errorCounts[errorKey] = (this.errorCounts[errorKey] || 0) + 1;
    this.lastError = {
      timestamp: new Date(),
      error,
      context,
    };

    // Log to Winston
    logger.error('Error Tracked', {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
      stack: error.stack,
      context,
      userId: context.userId,
      endpoint: context.endpoint,
    });

    // Check if critical and send alert
    if (this.isCritical(error)) {
      this.criticalErrors.push({
        timestamp: new Date(),
        error,
        context,
      });
      this.alertCritical(error, context);
    }
  }

  /**
   * Determine if error is critical
   */
  isCritical(error) {
    // Database connection errors
    if (error.code === 'MONGO_CONNECTION_ERROR') return true;
    if (error.code === 'REDIS_CONNECTION_ERROR') return true;

    // Authentication errors at scale
    if (error.code === 'AUTH_FAILURE' && this.getErrorCount('AUTH_FAILURE') > 10) {
      return true;
    }

    // All 5xx errors
    if (error.statusCode >= 500) return true;

    // Custom critical codes
    const criticalCodes = ['CRITICAL_ERROR', 'SYSTEM_FAILURE', 'PAYMENT_ERROR'];
    if (criticalCodes.includes(error.code)) return true;

    return false;
  }

  /**
   * Get count of specific error type
   */
  getErrorCount(errorKey) {
    return this.errorCounts[errorKey] || 0;
  }

  /**
   * Get all tracked errors summary
   */
  getSummary() {
    return {
      totalErrors: Object.values(this.errorCounts).reduce((a, b) => a + b, 0),
      errorsByType: this.errorCounts,
      criticalErrorsCount: this.criticalErrors.length,
      lastError: this.lastError,
    };
  }

  /**
   * Alert on critical error
   */
  async alertCritical(error, context) {
    logger.warn('CRITICAL ALERT', {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      context,
    });

    // Send to Sentry if configured
    if (
      process.env.SENTRY_DSN &&
      process.env.NODE_ENV === 'production'
    ) {
      this.sendToSentry(error, context);
    }

    // Send to Slack if webhook configured
    if (this.slackWebhook && process.env.NODE_ENV === 'production') {
      await this.sendToSlack(error, context);
    }
  }

  /**
   * Send error to Sentry (prepared for integration)
   */
  sendToSentry(error, context) {
    // This will be enabled when Sentry package is installed
    // For now, just log the intent
    logger.info('Sentry Alert Prepared', {
      dsn: process.env.SENTRY_DSN?.substring(0, 50) + '...',
      error: error.message,
      context,
    });

    // When Sentry is integrated:
    // const Sentry = require('@sentry/node');
    // Sentry.withScope((scope) => {
    //   Object.keys(context).forEach((key) => {
    //     scope.setContext(key, context[key]);
    //   });
    //   Sentry.captureException(error);
    // });
  }

  /**
   * Send alert to Slack
   */
  async sendToSlack(error, context) {
    if (!this.slackWebhook) return;

    try {
      const message = {
        text: '🚨 Critical Error Alert',
        attachments: [
          {
            color: 'danger',
            fields: [
              {
                title: 'Error',
                value: error.message,
                short: false,
              },
              {
                title: 'Code',
                value: error.code || 'UNKNOWN',
                short: true,
              },
              {
                title: 'Status',
                value: error.statusCode || 500,
                short: true,
              },
              {
                title: 'Endpoint',
                value: context.endpoint || 'N/A',
                short: true,
              },
              {
                title: 'User ID',
                value: context.userId || 'N/A',
                short: true,
              },
              {
                title: 'Environment',
                value: process.env.NODE_ENV || 'development',
                short: true,
              },
              {
                title: 'Timestamp',
                value: new Date().toISOString(),
                short: true,
              },
            ],
          },
        ],
      };

      // Use fetch to send to Slack (Node 18+ has native fetch)
      const response = await fetch(this.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        logger.warn('Failed to send Slack alert', {
          status: response.status,
        });
      }
    } catch (slackError) {
      logger.error('Error sending Slack alert', {
        message: slackError.message,
      });
    }
  }

  /**
   * Reset error tracking (for testing)
   */
  reset() {
    this.errorCounts = {};
    this.lastError = null;
    this.criticalErrors = [];
  }
}

// Export singleton
module.exports = new ErrorTracker();
