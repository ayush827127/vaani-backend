const multer = require('multer');
const AppError = require('../utils/AppError');

// Memory storage — files are small (product photos/logos) and go straight
// to Cloudinary, never touch disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  },
});

// Multer's own errors (file too large, wrong type) aren't AppError instances
// and would otherwise fall through to the generic 500 handler — surface them
// as a proper 400 instead.
function imageUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) return next(new AppError(err.message, 400));
    next();
  });
}

module.exports = { imageUpload };
