/**
 * Upload Middleware - Cloudinary Version
 * Handles multipart/form-data requests for campaign image uploads
 * 
 * Images are now uploaded directly to Cloudinary cloud storage
 * This eliminates the ephemeral filesystem problem on Render
 */

const path = require('path');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const winstonLogger = require('../utils/winstonLogger');

// Configuration
const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIMES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  FIELD_NAME: 'image',
};

/**
 * Extract boundary string from Content-Type header
 */
const extractBoundary = (contentType) => {
  const match = contentType.match(/boundary=([^;]+)/);
  return match ? match[1].replace(/"/g, '') : null;
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
 * Parse multipart form data from request buffer
 * Returns: { fields: { key: value }, file: { fieldname, filename, mimetype, data, size } }
 */
const parseMultipartData = (buffer, boundary) => {
  const fields = {};
  let file = null;

  const boundBytes = Buffer.from(`--${boundary}`);

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
 * Parse multipart form data from request stream
 * @param {object} req - Express request object
 * @param {number} maxFileSize - Maximum file size in bytes
 */
const parseMultipartFormData = (req, maxFileSize = 10 * 1024 * 1024) => {
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
      if (data.length > maxFileSize) {
        req.pause();
        reject(new Error(`File size exceeds ${maxFileSize / 1024 / 1024}MB limit`));
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
 * Factory function that creates upload middleware with custom configuration
 * @param {object} options - Configuration options
 * @param {string} options.folder - Cloudinary folder (default: 'honestneed/campaigns')
 * @param {number} options.maxFileSize - Max file size in bytes (default: 10MB)
 * @returns {Function} Express middleware function
 */
const createUploadMiddleware = (options = {}) => {
  const config = {
    folder: options.folder || 'honestneed/campaigns',
    maxFileSize: options.maxFileSize || (10 * 1024 * 1024),
  };

  return async (req, res, next) => {
    try {
      const { fields, file } = await parseMultipartFormData(req, config.maxFileSize);

      winstonLogger.info('📥 uploadMiddleware: Multipart data parsed', {
        fieldCount: Object.keys(fields).length,
        hasImageFile: !!file,
        imageFileName: file?.filename,
        imageSize: file?.size,
        folder: config.folder,
      });

      // Attach parsed fields to request body
      req.body = {
        ...req.body,
        ...fields,
      };

      // If image file exists, upload to Cloudinary
      if (file) {
        try {
          winstonLogger.info('☁️ Uploading to Cloudinary...', {
            filename: file.filename,
            size: file.size,
            folder: config.folder,
            cloudinaryConfig: {
              hasCloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
              hasApiKey: !!process.env.CLOUDINARY_API_KEY,
              hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
            },
          });

          const cloudinaryResult = await uploadToCloudinary(file.data, file.filename, {
            folder: config.folder,
          });

          // Attach Cloudinary info to request
          req.file = {
            fieldname: file.fieldname,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            // Cloudinary response
            image_url: cloudinaryResult.secure_url,
            image_public_id: cloudinaryResult.publicId,
            image_width: cloudinaryResult.width,
            image_height: cloudinaryResult.height,
            image_format: cloudinaryResult.format,
          };

          winstonLogger.info('✅ Cloudinary upload successful', {
            publicId: cloudinaryResult.publicId,
            url: cloudinaryResult.secure_url.substring(0, 100),
            folder: config.folder,
          });
        } catch (uploadError) {
          winstonLogger.error('❌ CRITICAL: Cloudinary upload failed - image will not be stored!', {
            error: uploadError.message,
            filename: file.filename,
            folder: config.folder,
            stack: uploadError.stack,
            cloudinaryEnvVars: {
              hasCloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
              hasApiKey: !!process.env.CLOUDINARY_API_KEY,
              hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
            },
          });
          // IMPORTANT: Fail the request - don't silently ignore Cloudinary errors
          return res.status(500).json({
            success: false,
            error: 'Cloudinary image upload failed',
            details: uploadError.message,
            code: 'CLOUDINARY_ERROR',
          });
        }
      }

      next();
    } catch (error) {
      winstonLogger.error('❌ uploadMiddleware error', {
        error: error.message,
        stack: error.stack,
      });

      return res.status(400).json({
        success: false,
        error: 'File upload failed',
        details: error.message,
        code: 'UPLOAD_FAILED',
      });
    }
  };
};

/**
 * Default upload middleware for campaigns (backward compatibility)
 */
const uploadMiddleware = createUploadMiddleware({ folder: 'honestneed/campaigns' });

module.exports = uploadMiddleware;
module.exports.createUploadMiddleware = createUploadMiddleware;
