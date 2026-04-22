const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

/**
 * Cloudinary Media Upload Service
 * Handles audio and video uploads for prayer support feature
 */

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload audio file to Cloudinary
 * @param {Buffer} fileBuffer - Audio file buffer from multer
 * @param {string} campaignId - Campaign ID for organization
 * @param {string} prayerId - Prayer ID for unique naming
 * @returns {Promise<Object>} Upload result with secure_url
 */
async function uploadAudio(fileBuffer, campaignId, prayerId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video', // Cloudinary treats audio as video resource
        folder: `prayers/audio/${campaignId}`,
        public_id: prayerId,
        format: 'm4a',
        eager: [
          {
            format: 'm4a',
            quality: 'auto',
          },
        ],
      },
      (error, result) => {
        if (error) {
          console.error('❌ [Cloudinary] Audio upload failed:', error.message);
          reject(error);
        } else {
          console.log('✅ [Cloudinary] Audio uploaded:', {
            url: result.secure_url,
            duration: result.duration,
            prayerId,
          });
          resolve({
            url: result.secure_url,
            duration: result.duration || null,
            publicId: result.public_id,
          });
        }
      }
    );

    // Convert buffer to stream and pipe to Cloudinary
    Readable.from(fileBuffer).pipe(uploadStream);
  });
}

/**
 * Upload video file to Cloudinary
 * @param {Buffer} fileBuffer - Video file buffer from multer
 * @param {string} campaignId - Campaign ID for organization
 * @param {string} prayerId - Prayer ID for unique naming
 * @returns {Promise<Object>} Upload result with secure_url and thumbnail_url
 */
async function uploadVideo(fileBuffer, campaignId, prayerId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder: `prayers/video/${campaignId}`,
        public_id: prayerId,
        eager: [
          {
            width: 300,
            height: 300,
            crop: 'fill',
            gravity: 'face',
            format: 'jpg',
          },
        ],
      },
      (error, result) => {
        if (error) {
          console.error('❌ [Cloudinary] Video upload failed:', error.message);
          reject(error);
        } else {
          console.log('✅ [Cloudinary] Video uploaded:', {
            url: result.secure_url,
            duration: result.duration,
            prayerId,
          });
          resolve({
            url: result.secure_url,
            duration: result.duration || null,
            thumbnailUrl: result.eager && result.eager[0] ? result.eager[0].secure_url : null,
            publicId: result.public_id,
          });
        }
      }
    );

    // Convert buffer to stream and pipe to Cloudinary
    Readable.from(fileBuffer).pipe(uploadStream);
  });
}

/**
 * Delete media from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - 'video' or 'image'
 * @returns {Promise<Object>} Deletion result
 */
async function deleteMedia(publicId, resourceType = 'video') {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    console.log('✅ [Cloudinary] Media deleted:', { publicId, result });
    return result;
  } catch (error) {
    console.error('❌ [Cloudinary] Delete failed:', error.message);
    throw error;
  }
}

/**
 * Get video metadata from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Video metadata
 */
async function getVideoMetadata(publicId) {
  try {
    const result = await cloudinary.api.resource(publicId, {
      resource_type: 'video',
    });
    console.log('✅ [Cloudinary] Metadata retrieved:', { publicId });
    return {
      duration: result.duration,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error('❌ [Cloudinary] Metadata fetch failed:', error.message);
    throw error;
  }
}

module.exports = {
  uploadAudio,
  uploadVideo,
  deleteMedia,
  getVideoMetadata,
};
