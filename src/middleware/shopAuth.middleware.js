const { verifyToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

function requireShop(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Missing or invalid Authorization header', 401));
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.scope !== 'shop') {
      return next(new AppError('Invalid or expired token', 401));
    }
    req.shop = decoded;
    next();
  } catch (err) {
    next(new AppError('Invalid or expired token', 401));
  }
}

module.exports = { requireShop };
