const { fail } = require('../utils/apiResponse');

// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  // Prisma unique-constraint violations (duplicate shop phone, plan name,
  // module key, shop-user phone, a negativeLocalId collision that outlasted
  // its retries, etc.) otherwise fall through as an opaque 500 — this turns
  // them into a clear 409 naming the field that collided.
  if (err.code === 'P2002') {
    const fields = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'value';
    return fail(res, `A record with this ${fields} already exists`, 409);
  }

  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
    return fail(res, 'Internal server error', status);
  }
  return fail(res, err.message || 'Something went wrong', status, err.details);
}

module.exports = errorMiddleware;
