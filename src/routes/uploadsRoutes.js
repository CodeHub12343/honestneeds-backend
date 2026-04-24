/**
 * Uploads Route Handler
 * Serves uploaded files (images, documents, etc.)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const { winstonLogger } = require('../utils/logger');

// Uploads directory path
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

/**
 * OPTIONS /api/uploads/:filename
 * Handle CORS preflight requests for file downloads
 */
router.options('/:filename', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range');
  res.set('Access-Control-Max-Age', '86400'); // 24 hours
  res.sendStatus(200);
});

/**
 * GET /api/uploads/:filename
 * Serves an uploaded file
 * 
 * @param {string} filename - The uploaded file name
 * @returns File content with appropriate MIME type
 */
router.get('/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Security: Prevent directory traversal attacks
    if (filename.includes('..') || filename.includes('/')) {
      winstonLogger.warn('Upload security: Directory traversal attempt', {
        filename,
        ip: req.ip,
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'FORBIDDEN',
      });
    }

    const filepath = path.join(UPLOADS_DIR, filename);

    // Check if file exists
    if (!fs.existsSync(filepath)) {
      winstonLogger.warn('Upload not found', {
        filename,
        expectedPath: filepath,
        ip: req.ip,
      });

      return res.status(404).json({
        success: false,
        error: 'File not found',
        code: 'NOT_FOUND',
      });
    }

    // Determine MIME type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let mimeType = 'application/octet-stream';

    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    if (mimeTypes[ext]) {
      mimeType = mimeTypes[ext];
    }

    winstonLogger.info('Serving uploaded file', {
      filename,
      mimeType,
      ip: req.ip,
    });

    // Ensure CORS headers are set properly for cross-origin image loading
    // Allow any origin for static image files (no credentials needed)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('X-Content-Type-Options', 'nosniff');
    
    // Send file with cache headers (1 week)
    res.set('Cache-Control', 'public, max-age=604800'); // 7 days
    res.set('ETag', `"${filename}"`);
    res.sendFile(filepath, { type: mimeType });
  } catch (error) {
    winstonLogger.error('Error serving uploaded file', {
      filename: req.params.filename,
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to serve file',
      code: 'SERVE_ERROR',
    });
  }
});

module.exports = router;
