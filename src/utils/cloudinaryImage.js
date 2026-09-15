const cloudinary = require('../config/cloudinary');
const AppError = require('./AppError');

function isConfigured() {
  const cfg = cloudinary.config();
  return Boolean(cfg.cloud_name && cfg.api_key && cfg.api_secret);
}

// Cloudinary's upload response includes public_id directly, but assets
// uploaded from the phone (unsigned preset) only ever have their secure_url
// synced down — so deletes/replacements from the admin side recover the
// public_id by parsing it back out of that URL instead of tracking it
// separately end to end.
function extractPublicId(url) {
  if (!url) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
  return match ? match[1] : null;
}

function uploadBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });
}

// Uploads a new image and returns its URL. If previousUrl pointed at an
// existing Cloudinary asset, best-effort deletes it afterward — a cleanup
// failure there shouldn't fail the request, it just leaves a harmless
// orphaned asset.
async function replaceImage({ buffer, folder, previousUrl }) {
  if (!isConfigured()) {
    throw new AppError(
      'Image upload is not configured on this server (missing Cloudinary credentials)',
      503
    );
  }
  const result = await uploadBuffer(buffer, folder);
  if (previousUrl) {
    const previousPublicId = extractPublicId(previousUrl);
    if (previousPublicId) {
      await cloudinary.uploader.destroy(previousPublicId).catch(() => {});
    }
  }
  return result.secure_url;
}

async function deleteImage(url) {
  if (!url) return;
  if (!isConfigured()) {
    throw new AppError(
      'Image upload is not configured on this server (missing Cloudinary credentials)',
      503
    );
  }
  const publicId = extractPublicId(url);
  if (publicId) {
    await cloudinary.uploader.destroy(publicId).catch(() => {});
  }
}

module.exports = { isConfigured, extractPublicId, replaceImage, deleteImage };
