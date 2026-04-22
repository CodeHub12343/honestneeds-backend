/**
 * Upload Middleware
 * Handles multipart/form-data requests for campaign image uploads
 * 
 * NOTE: This is a lightweight implementation without external libraries.
 * For production with larger files, install multer:
 *   npm install multer
 * Then replace this with multer configuration.
 * 
 * Supports:
 * - Image file uploads (maxSize: 10MB)
 * - Supported formats: jpeg, png, gif, webp
 * - Field name: 'image'
 * - Stores binary data in req.file object
 */

const path = require('path');
const fs = require('fs');
const winstonLogger = require('../utils/winstonLogger');

// Configuration
const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIMES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  UPLOAD_DIR: path.join(__dirname, '../../uploads'),
  FIELD_NAME: 'image',
};

// Ensure upload directory exists
const initializeUploadDir = () => {
  if (!fs.existsSync(UPLOAD_CONFIG.UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_CONFIG.UPLOAD_DIR, { recursive: true });
    winstonLogger.info(`Created upload directory: ${UPLOAD_CONFIG.UPLOAD_DIR}`);
  }
};

initializeUploadDir();

/**
 * Simple multipart form-data parser for image uploads
 * 
 * NOTE: This is a minimal implementation. For production with:
 * - Multiple file fields
 * - Concurrent uploads
 * - Large files requiring streaming
 * - Complex nested form data
 * 
 * Install and use multer instead:
 *   npm install multer
 * 
 * Usage with multer:
 *   const multer = require('multer');
 *   const upload = multer({
 *     dest: './uploads',
 *     limits: { fileSize: 10 * 1024 * 1024 },
 *     fileFilter: (req, file, cb) => {
 *       if (UPLOAD_CONFIG.ALLOWED_MIMES.includes(file.mimetype)) {
 *         cb(null, true);
 *       } else {
 *         cb(new Error('Invalid file type'));
 *       }
 *     }
 *   });
 */

const parseMultipartFormData = (req) => {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';

    // Not a multipart request
    if (!contentType.includes('multipart/form-data')) {
      return resolve({ fields: {}, file: null });
    }

    const boundary = extractBoundary(contentType);
    if (!boundary) {
      return reject(new Error('Invalid multipart boundary'));
    }

    let data = Buffer.alloc(0);

    req.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);

      // Safety check: prevent memory exhaustion
      if (data.length > UPLOAD_CONFIG.MAX_FILE_SIZE) {
        req.pause();
        reject(new Error(`File size exceeds ${UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB limit`));
      }
    });

    req.on('end', () => {
      try {
        const parsed = parseMultipartData(data, boundary);
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', (error) => {
      reject(error);
    });
  });
};

/**
 * Extract boundary string from Content-Type header
 */
const extractBoundary = (contentType) => {
  const match = contentType.match(/boundary=([^;]+)/);
  return match ? match[1].replace(/"/g, '') : null;
};

/**
 * Parse multipart form data buffer
 * Returns: { fields: { key: value }, file: { fieldname, filename, mimetype, data, size } }
 */
const parseMultipartData = (buffer, boundary) => {
  const fields = {};
  let file = null;

  const boundBytes = Buffer.from(`--${boundary}`);
  const endBoundBytes = Buffer.from(`--${boundary}--`);

  let currentPos = 0;

  while (currentPos < buffer.length) {
    const partStart = buffer.indexOf(boundBytes, currentPos);
    if (partStart === -1) break;

    const partEnd = buffer.indexOf(boundBytes, partStart + boundBytes.length);
    let part = buffer.slice(partStart + boundBytes.length, partEnd === -1 ? buffer.length : partEnd);

    // Remove leading/trailing CRLF
    if (part[0] === 13 && part[1] === 10) part = part.slice(2);
    if (part[part.length - 1] === 10 && part[part.length - 2] === 13) {
      part = part.slice(0, part.length - 2);
    }

    // Split headers and content
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) {
      currentPos = partEnd === -1 ? buffer.length : partEnd;
      continue;
    }

    const headerBuffer = part.slice(0, headerEnd);
    const contentBuffer = part.slice(headerEnd + 4);

    // Parse headers
    const headers = parseHeaders(headerBuffer.toString());

    // Handle file field
    if (headers['content-disposition'] && headers['content-disposition'].includes('filename')) {
      const filename = extractFilename(headers['content-disposition']);
      const fieldname = extractFieldname(headers['content-disposition']);
      const mimetype = headers['content-type'] || 'application/octet-stream';

      // Validate file
      if (fieldname === UPLOAD_CONFIG.FIELD_NAME && validateImageFile(filename, mimetype, contentBuffer.length)) {
        file = {
          fieldname,
          filename,
          mimetype,
          data: contentBuffer,
          size: contentBuffer.length,
        };
      }
    } else if (headers['content-disposition'] && headers['content-disposition'].includes('name=')) {
      // Regular form field
      const fieldname = extractFieldname(headers['content-disposition']);
      const value = contentBuffer.toString('utf-8');
      fields[fieldname] = value;
    }

    currentPos = partEnd === -1 ? buffer.length : partEnd;
  }

  return { fields, file };
};

/**
 * Parse headers from multipart boundary
 */
const parseHeaders = (headerString) => {
  const headers = {};
  const lines = headerString.split('\r\n');

  for (const line of lines) {
    const [key, ...valueParts] = line.split(': ');
    if (key && valueParts.length > 0) {
      headers[key.toLowerCase()] = valueParts.join(': ');
    }
  }

  return headers;
};

/**
 * Extract filename from Content-Disposition header
 */
const extractFilename = (disposition) => {
  const match = disposition.match(/filename="?([^";\n]+)"?/);
  return match ? match[1] : null;
};

/**
 * Extract fieldname from Content-Disposition header
 */
const extractFieldname = (disposition) => {
  const match = disposition.match(/name="?([^";\n]+)"?/);
  return match ? match[1] : null;
};

/**
 * Validate image file
 */
const validateImageFile = (filename, mimetype, fileSize) => {
  if (!filename) return false;
  if (!UPLOAD_CONFIG.ALLOWED_MIMES.includes(mimetype)) {
    winstonLogger.warn(`Invalid MIME type: ${mimetype}`);
    return false;
  }

  const ext = path.extname(filename).toLowerCase();
  if (!UPLOAD_CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
    winstonLogger.warn(`Invalid file extension: ${ext}`);
    return false;
  }

  if (fileSize > UPLOAD_CONFIG.MAX_FILE_SIZE) {
    winstonLogger.warn(`File too large: ${fileSize} bytes`);
    return false;
  }

  return true;
};

/**
 * Save uploaded file to disk
 * Returns the relative file path for storage in database
 */
const saveUploadedFile = (file) => {
  if (!file) return null;

  try {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.filename);
    const savedFilename = `campaign_${timestamp}_${randomString}${ext}`;
    const filePath = path.join(UPLOAD_CONFIG.UPLOAD_DIR, savedFilename);

    fs.writeFileSync(filePath, file.data);

    const relativePath = path.join('uploads', savedFilename).replace(/\\/g, '/');
    winstonLogger.info(`File uploaded: ${relativePath} (${file.size} bytes)`);

    return relativePath;
  } catch (error) {
    winstonLogger.error(`File save failed: ${error.message}`);
    throw error;
  }
};

/**
 * Express middleware for handling multipart form-data uploads
 * 
 * Typical usage in routes:
 *   router.post('/', uploadMiddleware, controller.create);
 * 
 * In controller:
 *   const { imageUrl } = req.file ? { imageUrl: req.file.path } : { imageUrl: null };
 *   // Pass imageUrl to service layer
 */
const uploadMiddleware = async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipartFormData(req);

    // ✅ FIX: Add comprehensive logging for debugging
    winstonLogger.info('📥 uploadMiddleware: Multipart data parsed successfully', {
      fieldCount: Object.keys(fields).length,
      fieldNames: Object.keys(fields),
      hasImageFile: !!file,
      imageFileName: file?.filename,
      imageFileSize: file?.size,
      imageMimeType: file?.mimetype,
      timestamp: new Date().toISOString(),
    });

    // Attach parsed fields and file to request
    req.body = {
      ...req.body,
      ...fields,
    };

    // ✅ FIX: Add specific logging for prayer_config field
    winstonLogger.info('📋 uploadMiddleware: FormData fields attached to req.body', {
      parsedFieldCount: Object.keys(fields).length,
      parsedFieldNames: Object.keys(fields),
      prayerConfigInFields: 'prayer_config' in fields,
      prayerConfigValue: fields.prayer_config ? fields.prayer_config.substring(0, 100) + '...' : 'NOT FOUND',
      finalReqBodyKeys: Object.keys(req.body),
      prayerConfigInReqBody: 'prayer_config' in req.body,
      prayerConfigInReqBodyValue: req.body.prayer_config ? req.body.prayer_config.substring(0, 100) + '...' : 'NOT FOUND',
      timestamp: new Date().toISOString(),
    });

    if (file) {
      // Save file and store path
      const filePath = saveUploadedFile(file);
      req.file = {
        ...file,
        path: filePath, // Relative path to save in database
        fieldname: file.fieldname,
        mimetype: file.mimetype,
        size: file.size,
      };

      // Add image path to body for service layer
      req.body.image_url = filePath;

      // ✅ FIX: Add detailed logging after file save
      winstonLogger.info('📁 uploadMiddleware: Image file saved and attached to request', {
        savedFilePath: filePath,
        imageUrlSetInReqBody: !!req.body.image_url,
        imageUrlValue: req.body.image_url,
        reqBodyKeys: Object.keys(req.body),
        fileDetails: {
          originalName: file.filename,
          size: file.size,
          mimetype: file.mimetype,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // ✅ FIX: Add warning when no image found
      winstonLogger.warn('⚠️ uploadMiddleware: NO image file found in multipart data', {
        availableFields: Object.keys(fields),
        contentType: req.headers['content-type'],
        hasContentType: !!req.headers['content-type'],
        timestamp: new Date().toISOString(),
      });
    }

    next();
  } catch (error) {
    // ✅ FIX: Add detailed error logging
    winstonLogger.error('❌ uploadMiddleware: Error parsing multipart data', {
      error: error.message,
      errorCode: error.code,
      contentType: req.headers['content-type'],
      requestMethod: req.method,
      requestPath: req.path,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    
    return res.status(400).json({
      success: false,
      message: `File upload failed: ${error.message}`,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Add .single() method to uploadMiddleware for multer compatibility
uploadMiddleware.single = (fieldName) => {
  return uploadMiddleware;
};

/**
 * For production with Multer installation:
 * 
 * Install: npm install multer
 * 
 * Then create multer config:
 * 
 *   const multer = require('multer');
 *   const storage = multer.diskStorage({
 *     destination: UPLOAD_CONFIG.UPLOAD_DIR,
 *     filename: (req, file, cb) => {
 *       const timestamp = Date.now();
 *       const randomStr = Math.random().toString(36).substring(2, 8);
 *       const ext = path.extname(file.originalname);
 *       const filename = `campaign_${timestamp}_${randomStr}${ext}`;
 *       cb(null, filename);
 *     }
 *   });
 *   
 *   const uploadMiddleware = multer({
 *     storage,
 *     limits: { fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE },
 *     fileFilter: (req, file, cb) => {
 *       if (!UPLOAD_CONFIG.ALLOWED_MIMES.includes(file.mimetype)) {
 *         return cb(new Error('Invalid file type. Allowed: JPEG, PNG, GIF, WebP'));
 *       }
 *       cb(null, true);
 *     }
 *   }).single('image');
 * 
 * Usage: Same as above - no changes needed in controller/routes
 */

module.exports = {
  uploadMiddleware,
  saveUploadedFile,
  validateImageFile,
  UPLOAD_CONFIG,
  // Utilities for testing or manual usage
  parseMultipartFormData,
  parseMultipartData,
};
