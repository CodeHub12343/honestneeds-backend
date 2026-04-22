/**
 * @fileoverview Analytics Routes
 * Handles QR code generation, analytics tracking, and data export endpoints
 * 
 * Routes Summary:
 * - POST /qr/generate - Generate QR code for campaign
 * - GET /qr/:id/analytics - Get QR code scan/conversion analytics
 * - GET /campaigns/:id/flyer - Download campaign flyer with QR code
 * - GET /campaigns/:id/share-analytics - Get platform sharing analytics
 * - GET /campaigns/:id/donation-analytics - Get donation analytics (creator-only)
 * - GET /trending - Get trending campaigns dashboard data
 * - GET /user-activity - Get user activity dashboard (admin-only)
 * - GET /export - Export analytics data (admin-only, CSV/JSON)
 * 
 * @requires express
 * @requires ../middleware/auth
 * @requires ../controllers/AnalyticsController
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const AnalyticsController = require('../controllers/AnalyticsController');

// ============================================
// QR CODE ROUTES
// ============================================

/**
 * POST /api/analytics/qr/generate
 * @description Generate a QR code for a campaign
 * @access Protected - Campaign creator or admin
 * @param {string} campaign_id - Campaign ID (required)
 * @param {string} label - QR code label (optional, default: "QR Code")
 * @returns {Object} QR code data with image
 * 
 * @example
 * POST /api/analytics/qr/generate
 * Authorization: Bearer {token}
 * {
 *   "campaign_id": "507f1f77bcf86cd799439011",
 *   "label": "Main QR"
 * }
 * 
 * Response 201:
 * {
 *   "success": true,
 *   "qr_code": {
 *     "id": "507f1f77bcf86cd799439012",
 *     "code": "data:image/png;base64,iVBORw0KGgoAAAANS..."
 *     "url": "https://honestneed.com/campaigns/507f1f77bcf86cd799439011",
 *     "label": "Main QR",
 *     "campaign_id": "507f1f77bcf86cd799439011",
 *     "created_at": "2026-04-04T10:00:00Z"
 *   },
 *   "message": "QR code generated successfully"
 * }
 */
router.post('/qr/generate', authenticate, AnalyticsController.generateQRCode);

/**
 * GET /api/analytics/qr/:id/analytics
 * @description Get analytics for a specific QR code (scans, conversions)
 * @access Protected
 * @param {string} id - QR code ID (path parameter)
 * @param {string} startDate - Filter scans from date (optional, ISO 8601)
 * @param {string} endDate - Filter scans until date (optional, ISO 8601)
 * @returns {Object} QR code analytics data
 * 
 * @example
 * GET /api/analytics/qr/507f1f77bcf86cd799439012/analytics?startDate=2026-04-01&endDate=2026-04-05
 * Authorization: Bearer {token}
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "analytics": {
 *     "qr_id": "507f1f77bcf86cd799439012",
 *     "label": "Main QR",
 *     "url": "https://honestneed.com/campaigns/507f1f77bcf86cd799439011",
 *     "total_scans": 250,
 *     "total_conversions": 45,
 *     "conversion_rate": 18.0,
 *     "period_statistics": {
 *       "total_scans": 100,
 *       "total_conversions": 22,
 *       "conversion_rate": 22.0
 *     },
 *     "created_at": "2026-04-04T10:00:00Z",
 *     "status": "active",
 *     "recent_scans": [...],
 *     "recent_conversions": [...]
 *   }
 * }
 */
router.get('/qr/:id/analytics', authenticate, AnalyticsController.getQRAnalytics);

/**
 * POST /api/analytics/qr/scan
 * @description Track QR code scan event and award sweepstakes entry
 * @access Public - No auth required, but user ID recommended
 * @param {string} campaignId - Campaign ID (required)
 * @param {string} userId - User ID who scanned (optional, for sweepstakes entry)
 * @param {string} qrCodeId - QR Code ID (optional, for specific QR tracking)
 * @param {string} ipAddress - IP address (auto-detected by backend if not provided)
 * @param {string} userAgent - User agent string (auto-detected by backend if not provided)
 * @param {Object} location - Geo location {country, region, city} (optional)
 * @returns {Object} Scan result with sweepstakes entry confirmation
 * 
 * @example
 * POST /api/analytics/qr/scan
 * {
 *   "campaignId": "507f1f77bcf86cd799439011",
 *   "userId": "507f1f77bcf86cd799439012",
 *   "qrCodeId": "507f1f77bcf86cd799439013",
 *   "location": { "country": "US", "region": "CA", "city": "SF" }
 * }
 * 
 * Response 201:
 * {
 *   "scanId": "SCAN-2026-ABC123",
 *   "success": true,
 *   "campaignId": "507f1f77bcf86cd799439011",
 *   "sweepstakesEntry": {
 *     "awarded": true,
 *     "entryCount": 1,
 *     "totalEntries": 45,
 *     "period": "2026-04"
 *   },
 *   "message": "QR scan tracked and sweepstakes entry awarded"
 * }
 */
router.post('/qr/scan', AnalyticsController.trackQRScan);

// ============================================
// CAMPAIGN SPECIFIC ANALYTICS ROUTES
// ============================================

/**
 * GET /api/analytics/campaigns/:id/flyer
 * @description Generate flyer for campaign with embedded QR code
 * @access Protected - Campaign creator or admin
 * @param {string} id - Campaign ID (path parameter)
 * @returns {Object} Flyer data with QR code and download URL
 * 
 * @example
 * GET /api/analytics/campaigns/507f1f77bcf86cd799439011/flyer
 * Authorization: Bearer {token}
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "flyer": {
 *     "campaign_id": "507f1f77bcf86cd799439011",
 *     "campaign_title": "Help Local Community",
 *     "campaign_description": "Building a community center...",
 *     "campaign_image": "https://cdn.honestneed.com/campaign-123.jpg",
 *     "goal_amount": 50000,
 *     "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANS...",
 *     "url": "https://example.com/campaigns/507f1f77bcf86cd799439011?utm_source=flyer",
 *     "download_url": "https://api.honestneed.com/analytics/campaigns/507f1f77bcf86cd799439011/flyer/download",
 *     "timestamp": "2026-04-04T10:00:00Z"
 *   },
 *   "message": "Flyer data generated successfully"
 * }
 */
router.get('/campaigns/:id/flyer', authenticate, AnalyticsController.generateFlyer);

/**
 * GET /api/analytics/campaigns/:id/share-analytics
 * @description Get sharing analytics for a campaign (by platform)
 * @access Protected - Campaign creator or admin
 * @param {string} id - Campaign ID (path parameter)
 * @returns {Object} Platform breakdown with shares, clicks, conversions, earnings
 * 
 * @example
 * GET /api/analytics/campaigns/507f1f77bcf86cd799439011/share-analytics
 * Authorization: Bearer {token}
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "analytics": {
 *     "campaign_id": "507f1f77bcf86cd799439011",
 *     "campaign_title": "Help Local Community",
 *     "total_shares": 150,
 *     "total_shares_earnings": 2500,
 *     "platform_breakdown": [
 *       {
 *         "platform": "facebook",
 *         "shares": 80,
 *         "clicks": 120,
 *         "conversions": 15,
 *         "earnings": 1500
 *       },
 *       {
 *         "platform": "instagram",
 *         "shares": 40,
 *         "clicks": 60,
 *         "conversions": 8,
 *         "earnings": 800
 *       }
 *     ],
 *     "top_sharers": [
 *       {
 *         "sharer": {
 *           "_id": "507f1f77bcf86cd799439020",
 *           "display_name": "John Doe"
 *         },
 *         "shares": 12,
 *         "conversions": 3,
 *         "earnings": 300,
 *         "platform": "facebook"
 *       }
 *     ]
 *   }
 * }
 */
router.get('/campaigns/:id/share-analytics', authenticate, AnalyticsController.getShareAnalytics);

/**
 * GET /api/analytics/campaigns/:id/donation-analytics
 * @description Get donation analytics for a campaign (creator-only)
 * @access Protected - Campaign creator or admin
 * @param {string} id - Campaign ID (path parameter)
 * @returns {Object} Donation metrics, timeline, top donors
 * 
 * @example
 * GET /api/analytics/campaigns/507f1f77bcf86cd799439011/donation-analytics
 * Authorization: Bearer {token}
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "analytics": {
 *     "campaign_id": "507f1f77bcf86cd799439011",
 *     "total_donations": 120,
 *     "total_amount": 15750,
 *     "average_donation": 131,
 *     "timeline": [
 *       {
 *         "date": "2026-04-01",
 *         "count": 10,
 *         "total": 1500
 *       },
 *       {
 *         "date": "2026-04-02",
 *         "count": 15,
 *         "total": 2100
 *       }
 *     ],
 *     "top_donors": [
 *       {
 *         "donor": {
 *           "_id": "507f1f77bcf86cd799439030",
 *           "display_name": "Jane Smith"
 *         },
 *         "amount": 500,
 *         "date": "2026-04-04T10:00:00Z",
 *         "message": "Yes"
 *       }
 *     ]
 *   }
 * }
 */
router.get('/campaigns/:id/donation-analytics', authenticate, AnalyticsController.getDonationAnalytics);

// ============================================
// PUBLIC & ADMIN ANALYTICS ROUTES
// ============================================

/**
 * GET /api/analytics/trending
 * @description Get trending campaigns (public endpoint)
 * @access Public
 * @param {string} period - Time period filter: "day", "week" (default), "month"
 * @param {number} limit - Number of campaigns to return (default: 10, max: 50)
 * @returns {Object} Array of trending campaigns sorted by donation amount
 * 
 * @example
 * GET /api/analytics/trending?period=week&limit=10
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "trending": {
 *     "period": "week",
 *     "campaigns": [
 *       {
 *         "campaign_id": "507f1f77bcf86cd799439011",
 *         "campaign_title": "Help Local Community",
 *         "campaign_status": "active",
 *         "donations_count": 120,
 *         "total_amount": 15750,
 *         "average_donation": 131
 *       }
 *     ]
 *   }
 * }
 */
router.get('/trending', AnalyticsController.getTrendingCampaigns);

/**
 * GET /api/analytics/user-activity
 * @description Get user activity dashboard (admin-only)
 * @access Admin Only
 * @param {string} period - Time period filter: "day", "week" (default), "month"
 * @returns {Object} Platform activity metrics
 * 
 * @example
 * GET /api/analytics/user-activity?period=week
 * Authorization: Bearer {admin_token}
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "activity": {
 *     "period": "week",
 *     "timeframe": {
 *       "start": "2026-03-28T00:00:00Z",
 *       "end": "2026-04-04T23:59:59Z"
 *     },
 *     "metrics": {
 *       "new_users": 45,
 *       "active_campaigns": 28,
 *       "total_donations": 380,
 *       "total_donation_amount": 52500,
 *       "unique_donors": 250
 *     }
 *   }
 * }
 */
router.get('/user-activity', authenticate, authorize('admin'), AnalyticsController.getUserActivity);

/**
 * GET /api/analytics/export
 * @description Export analytics data (admin-only, CSV/JSON)
 * @access Admin Only
 * @param {string} type - Export type: "campaigns", "donations", "users", "all" (default)
 * @returns {Object} Exportable analytics data with file headers for download
 * 
 * @example
 * GET /api/analytics/export?type=campaigns
 * Authorization: Bearer {admin_token}
 * 
 * Response 200:
 * Content-Type: application/json
 * Content-Disposition: attachment; filename="analytics-2026-04-04.json"
 * {
 *   "success": true,
 *   "exported": true,
 *   "type": "campaigns",
 *   "data": {
 *     "campaigns": [
 *       {
 *         "_id": "507f1f77bcf86cd799439011",
 *         "title": "Help Local Community",
 *         "status": "active",
 *         "goal_amount": 50000,
 *         "total_donated": 15750,
 *         "created_at": "2026-04-04T10:00:00Z"
 *       }
 *     ]
 *   },
 *   "timestamp": "2026-04-04T10:00:00Z"
 * }
 */
router.get('/export', authenticate, authorize('admin'), AnalyticsController.exportAnalytics);

// ============================================
// PLATFORM ANALYTICS ROUTES
// ============================================

/**
 * GET /api/analytics/dashboard
 * @description Get overall platform metrics dashboard
 * @access Public
 * @param {string} period - Time period: 'day' | 'week' | 'month' | 'year' (default: 'month')
 * @returns {Object} Dashboard metrics
 * 
 * @example
 * GET /api/analytics/dashboard?period=month
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "data": {
 *     "period": "month",
 *     "users": {
 *       "total": 5000,
 *       "active": 1200,
 *       "growth": 15.5
 *     },
 *     "campaigns": {
 *       "total": 250,
 *       "active": 85,
 *       "completed": 42
 *     },
 *     "donations": {
 *       "total": 450,
 *       "totalAmount": 125000,
 *       "avgAmount": 277.78
 *     },
 *     "volume": {
 *       "newUsersThisPeriod": 320,
 *       "newCampaignsThisPeriod": 28
 *     }
 *   }
 * }
 */
router.get('/dashboard', AnalyticsController.getDashboard);

/**
 * GET /api/analytics/campaign-performance
 * @description Get campaign performance metrics (top performers, trending, etc.)
 * @access Public
 * @param {string} sort - Sort by: 'donations' | 'progress' | 'trending' (default: 'donations')
 * @param {number} limit - Number of campaigns to return (default: 10, max: 100)
 * @returns {Object} Campaign performance data
 * 
 * @example
 * GET /api/analytics/campaign-performance?sort=donations&limit=10
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "data": {
 *     "campaigns": [
 *       {
 *         "id": "507f1f77bcf86cd799439011",
 *         "title": "Help Local Community",
 *         "creator": "John Doe",
 *         "goalAmount": 50000,
 *         "collectedAmount": 25000,
 *         "donorCount": 85,
 *         "completionPercentage": 50,
 *         "views": 1250,
 *         "createdAt": "2026-04-01T10:00:00Z"
 *       }
 *     ],
 *     "count": 10
 *   }
 * }
 */
router.get('/campaign-performance', AnalyticsController.getCampaignPerformance);

/**
 * GET /api/analytics/donation-trends
 * @description Get donation trends over specified time period
 * @access Public
 * @param {string} period - Time period: 'day' | 'week' | 'month' (default: 'day')
 * @param {number} days - Number of days to include (default: 30, max: 365)
 * @param {string} groupBy - Group by: 'date' | 'source' | 'method' (default: 'date')
 * @returns {Object} Donation trend data
 * 
 * @example
 * GET /api/analytics/donation-trends?period=day&days=30&groupBy=date
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "data": {
 *     "period": "day",
 *     "days": 30,
 *     "trends": [
 *       {
 *         "_id": "2026-04-04",
 *         "count": 25,
 *         "amount": 6750
 *       }
 *     ],
 *     "summary": {
 *       "totalDonations": 450,
 *       "totalAmount": 125000,
 *       "avgDonation": 277.78,
 *       "growth": 12.5
 *     }
 *   }
 * }
 */
router.get('/donation-trends', AnalyticsController.getDonationTrends);

/**
 * GET /api/analytics/revenue
 * @description Get platform revenue breakdown (admin-only)
 * @access Protected - Admin only
 * @param {string} period - Time period: 'month' | 'year' (default: 'month')
 * @param {boolean} detailed - Include detailed breakdown (default: false)
 * @returns {Object} Revenue metrics
 * 
 * @example
 * GET /api/analytics/revenue?period=month&detailed=true
 * Authorization: Bearer {admin_token}
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "data": {
 *     "period": "month",
 *     "revenue": {
 *       "gross": 125000,
 *       "platformFees": 25000,
 *       "net": 100000,
 *       "totalPayouts": 95000,
 *       "retained": 5000
 *     },
 *     "breakdown": {
 *       "bySource": [...],
 *       "byCreatorType": [...]
 *     },
 *     "summary": {
 *       "transactionCount": 450,
 *       "avgTransactionValue": 277.78
 *     }
 *   }
 * }
 */
router.get('/revenue', authenticate, authorize('admin'), AnalyticsController.getRevenue);

module.exports = router;

module.exports = router;
