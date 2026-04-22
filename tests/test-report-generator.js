/**
 * Test Report Generator & Utilities
 * Generates comprehensive test reports and tracks test metrics
 */

const fs = require('fs');
const path = require('path');
const moment = require('moment');

class TestReportGenerator {
  constructor(testName, destination = './test-reports') {
    this.testName = testName;
    this.destination = destination;
    this.startTime = new Date();
    this.metrics = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      coverage: {},
      performance: {},
      errors: [],
      warnings: [],
    };
    this.testResults = [];
    this.performanceResults = {};

    // Ensure destination exists
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }
  }

  /**
   * Record individual test result
   */
  recordTest(testName, passed, duration, metadata = {}) {
    this.metrics.total++;
    if (passed) {
      this.metrics.passed++;
    } else {
      this.metrics.failed++;
    }

    this.testResults.push({
      name: testName,
      status: passed ? 'PASSED' : 'FAILED',
      duration,
      timestamp: new Date(),
      ...metadata,
    });
  }

  /**
   * Record performance metric
   */
  recordPerformance(metricName, duration, threshold, passed) {
    if (!this.performanceResults[metricName]) {
      this.performanceResults[metricName] = {
        measurements: [],
        exceeded: 0,
        passed: 0,
      };
    }

    this.performanceResults[metricName].measurements.push({
      duration,
      threshold,
      passed,
      timestamp: new Date(),
    });

    if (passed) {
      this.performanceResults[metricName].passed++;
    } else {
      this.performanceResults[metricName].exceeded++;
    }
  }

  /**
   * Add error to report
   */
  addError(errorName, message, stackTrace) {
    this.metrics.errors.push({
      name: errorName,
      message,
      stackTrace,
      timestamp: new Date(),
    });
  }

  /**
   * Add warning to report
   */
  addWarning(warningName, message) {
    this.metrics.warnings.push({
      name: warningName,
      message,
      timestamp: new Date(),
    });
  }

  /**
   * Calculate statistics
   */
  getStatistics() {
    const totalDuration = this.testResults.reduce((sum, t) => sum + t.duration, 0);
    const avgDuration = this.metrics.total > 0 ? totalDuration / this.metrics.total : 0;
    const passRate = this.metrics.total > 0
      ? ((this.metrics.passed / this.metrics.total) * 100).toFixed(2)
      : 0;

    return {
      totalTests: this.metrics.total,
      passed: this.metrics.passed,
      failed: this.metrics.failed,
      skipped: this.metrics.skipped,
      passRate: `${passRate}%`,
      totalDuration: totalDuration.toFixed(2),
      avgDuration: avgDuration.toFixed(2),
      errors: this.metrics.errors.length,
      warnings: this.metrics.warnings.length,
    };
  }

  /**
   * Calculate performance statistics
   */
  getPerformanceStatistics() {
    const stats = {};
    for (const [metric, data] of Object.entries(this.performanceResults)) {
      const measurements = data.measurements;
      const durations = measurements.map(m => m.duration);
      const thresholds = measurements.map(m => m.threshold);

      stats[metric] = {
        measurements: measurements.length,
        passed: data.passed,
        exceeded: data.exceeded,
        min: Math.min(...durations),
        max: Math.max(...durations),
        avg: (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2),
        p95: this.calculatePercentile(durations, 0.95),
        p99: this.calculatePercentile(durations, 0.99),
        threshold: thresholds[0],
        passRate: `${((data.passed / measurements.length) * 100).toFixed(2)}%`,
      };
    }
    return stats;
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(values, percentile) {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile * sorted.length) - 1);
    return sorted[Math.max(0, index)].toFixed(2);
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport() {
    const stats = this.getStatistics();
    const perfStats = this.getPerformanceStatistics();
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const reportFileName = `${this.testName}-${moment().format('YYYY-MM-DD-HHmmss')}.html`;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>${this.testName} - Test Report</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f5f5;
            padding: 20px;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 { font-size: 28px; margin-bottom: 10px; }
        .header p { opacity: 0.9; }
        .content { padding: 30px; }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-card {
            background: #f9f9f9;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 20px;
            text-align: center;
        }
        .summary-card .value {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
            margin: 10px 0;
        }
        .summary-card .label {
            font-size: 12px;
            text-transform: uppercase;
            color: #999;
            letter-spacing: 0.5px;
        }
        .status-pass { color: #27ae60; }
        .status-fail { color: #e74c3c; }
        .status-skip { color: #f39c12; }
        .section { margin-bottom: 40px; }
        .section h2 {
            font-size: 20px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        th {
            background: #f5f5f5;
            font-weight: 600;
            color: #333;
        }
        tr:hover { background: #fafafa; }
        .error-item, .warning-item {
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 4px;
            border-left: 4px solid;
        }
        .error-item { background: #fee; border-color: #c33; }
        .warning-item { background: #fef3cd; border-color: #ff9800; }
        .error-title, .warning-title { font-weight: bold; margin-bottom: 5px; }
        .error-message, .warning-message { font-size: 12px; color: #666; }
        .footer {
            background: #f5f5f5;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #999;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: bold;
        }
        .badge-pass { background: #dff0d8; color: #3c763d; }
        .badge-fail { background: #f2dede; color: #a94442; }
        .badge-warn { background: #fcf8e3; color: #8a6d3b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 ${this.testName} Report</h1>
            <p>Generated on ${timestamp}</p>
        </div>

        <div class="content">
            <!-- Summary Section -->
            <div class="section">
                <h2>Test Summary</h2>
                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="label">Total Tests</div>
                        <div class="value">${stats.totalTests}</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">Passed</div>
                        <div class="value status-pass">${stats.passed}</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">Failed</div>
                        <div class="value status-fail">${stats.failed}</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">Pass Rate</div>
                        <div class="value status-pass">${stats.passRate}</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">Total Duration</div>
                        <div class="value">${stats.totalDuration}ms</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">Avg Duration</div>
                        <div class="value">${stats.avgDuration}ms</div>
                    </div>
                </div>
            </div>

            <!-- Performance Section -->
            <div class="section">
                <h2>Performance Metrics</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Metric</th>
                            <th>Measurements</th>
                            <th>Min</th>
                            <th>Max</th>
                            <th>Avg</th>
                            <th>P95</th>
                            <th>P99</th>
                            <th>Threshold</th>
                            <th>Pass Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(perfStats)
                          .map(([metric, data]) => `
                        <tr>
                            <td>${metric}</td>
                            <td>${data.measurements}</td>
                            <td>${data.min}ms</td>
                            <td>${data.max}ms</td>
                            <td>${data.avg}ms</td>
                            <td>${data.p95}ms</td>
                            <td>${data.p99}ms</td>
                            <td>${data.threshold}ms</td>
                            <td><span class="badge ${data.passRate === '100.00%' ? 'badge-pass' : 'badge-warn'}">${data.passRate}</span></td>
                        </tr>
                        `)
                          .join('')}
                    </tbody>
                </table>
            </div>

            ${this.metrics.errors.length > 0 ? `
            <!-- Errors Section -->
            <div class="section">
                <h2>Errors (${this.metrics.errors.length})</h2>
                ${this.metrics.errors
                  .map(err => `
                <div class="error-item">
                    <div class="error-title">${err.name}</div>
                    <div class="error-message">${err.message}</div>
                </div>
                `)
                  .join('')}
            </div>
            ` : ''}

            ${this.metrics.warnings.length > 0 ? `
            <!-- Warnings Section -->
            <div class="section">
                <h2>Warnings (${this.metrics.warnings.length})</h2>
                ${this.metrics.warnings
                  .map(warn => `
                <div class="warning-item">
                    <div class="warning-title">${warn.name}</div>
                    <div class="warning-message">${warn.message}</div>
                </div>
                `)
                  .join('')}
            </div>
            ` : ''}

            <!-- Test Details Section -->
            <div class="section">
                <h2>Test Results</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Test Name</th>
                            <th>Status</th>
                            <th>Duration</th>
                            <th>Timestamp</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.testResults
                          .map(result => `
                        <tr>
                            <td>${result.name}</td>
                            <td><span class="badge ${result.status === 'PASSED' ? 'badge-pass' : 'badge-fail'}">${result.status}</span></td>
                            <td>${result.duration}ms</td>
                            <td>${moment(result.timestamp).format('HH:mm:ss')}</td>
                        </tr>
                        `)
                          .join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="footer">
            <p>Report Generated: ${timestamp}</p>
            <p>Test Suite: ${this.testName}</p>
        </div>
    </div>
</body>
</html>
    `;

    const filePath = path.join(this.destination, reportFileName);
    fs.writeFileSync(filePath, html);
    return filePath;
  }

  /**
   * Generate JSON report
   */
  generateJSONReport() {
    const stats = this.getStatistics();
    const perfStats = this.getPerformanceStatistics();
    const reportFileName = `${this.testName}-${moment().format('YYYY-MM-DD-HHmmss')}.json`;

    const report = {
      metadata: {
        testName: this.testName,
        timestamp: new Date().toISOString(),
        duration: new Date() - this.startTime,
      },
      summary: stats,
      performance: perfStats,
      errors: this.metrics.errors,
      warnings: this.metrics.warnings,
      tests: this.testResults,
    };

    const filePath = path.join(this.destination, reportFileName);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    return filePath;
  }

  /**
   * Generate Markdown report
   */
  generateMarkdownReport() {
    const stats = this.getStatistics();
    const perfStats = this.getPerformanceStatistics();
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const reportFileName = `${this.testName}-${moment().format('YYYY-MM-DD-HHmmss')}.md`;

    let markdown = `# ${this.testName} - Test Report\n\n`;
    markdown += `**Generated:** ${timestamp}\n\n`;

    // Summary
    markdown += `## Test Summary\n\n`;
    markdown += `| Metric | Value |\n`;
    markdown += `|--------|-------|\n`;
    markdown += `| Total Tests | ${stats.totalTests} |\n`;
    markdown += `| Passed | ${stats.passed} |\n`;
    markdown += `| Failed | ${stats.failed} |\n`;
    markdown += `| Pass Rate | ${stats.passRate} |\n`;
    markdown += `| Duration | ${stats.totalDuration}ms |\n\n`;

    // Performance
    markdown += `## Performance Metrics\n\n`;
    markdown += `| Metric | Min | Max | Avg | P95 | P99 | Threshold | Pass |\n`;
    markdown += `|--------|-----|-----|-----|-----|-----|-----------|------|\n`;
    for (const [metric, data] of Object.entries(perfStats)) {
      markdown += `| ${metric} | ${data.min}ms | ${data.max}ms | ${data.avg}ms | ${data.p95}ms | ${data.p99}ms | ${data.threshold}ms | ${data.passRate} |\n`;
    }
    markdown += '\n';

    // Errors
    if (this.metrics.errors.length > 0) {
      markdown += `## Errors (${this.metrics.errors.length})\n\n`;
      for (const err of this.metrics.errors) {
        markdown += `### ${err.name}\n`;
        markdown += `${err.message}\n\n`;
      }
    }

    const filePath = path.join(this.destination, reportFileName);
    fs.writeFileSync(filePath, markdown);
    return filePath;
  }

  /**
   * Generate all report formats
   */
  generateAllReports() {
    return {
      html: this.generateHTMLReport(),
      json: this.generateJSONReport(),
      markdown: this.generateMarkdownReport(),
    };
  }

  /**
   * Print summary to console
   */
  printSummary() {
    const stats = this.getStatistics();
    const perfStats = this.getPerformanceStatistics();

    console.log('\n' + '='.repeat(60));
    console.log('TEST REPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n📋 ${this.testName}\n`);
    console.log(`Total Tests:     ${stats.totalTests}`);
    console.log(`✅ Passed:        ${stats.passed}`);
    console.log(`❌ Failed:        ${stats.failed}`);
    console.log(`⏭️  Skipped:       ${stats.skipped}`);
    console.log(`Pass Rate:       ${stats.passRate}`);
    console.log(`Duration:        ${stats.totalDuration}ms`);
    console.log(`Avg/Test:        ${stats.avgDuration}ms\n`);

    if (Object.keys(perfStats).length > 0) {
      console.log('Performance Metrics:');
      for (const [metric, data] of Object.entries(perfStats)) {
        console.log(`  ${metric}: Avg ${data.avg}ms (P95: ${data.p95}ms, P99: ${data.p99}ms) - Pass: ${data.passRate}`);
      }
    }

    if (this.metrics.warnings.length > 0) {
      console.log(`\n⚠️  Warnings: ${this.metrics.warnings.length}`);
    }

    if (this.metrics.errors.length > 0) {
      console.log(`\n🚨 Errors: ${this.metrics.errors.length}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }
}

module.exports = { TestReportGenerator };
