const { fail } = require('../utils/apiResponse');
const prisma = require('../config/prisma');

// A 5xx that only shows up on real devices and never reproduces from a dev
// machine is otherwise invisible without live access to Render's own log
// stream — this writes just enough to the database (which we *can* query
// directly, from anywhere) to see the real error next time it happens.
// Fire-and-forget and defensively wrapped: logging a failure must never be
// the thing that makes the original request handling fail harder.
function logServerError(err, req, status) {
  prisma.errorLog
    .create({
      data: {
        method: req.method,
        path: req.originalUrl,
        statusCode: status,
        message: String(err.message || err).slice(0, 2000),
        stack: err.stack ? String(err.stack).slice(0, 4000) : null,
        shopId: req.shop?.id || null,
        bodyPreview: req.body ? JSON.stringify(req.body).slice(0, 1000) : null,
      },
    })
    .catch((logErr) => console.error('[errorLog] failed to persist error log:', logErr.message));
}

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
    logServerError(err, req, status);
    return fail(res, 'Internal server error', status);
  }
  return fail(res, err.message || 'Something went wrong', status, err.details);
}

module.exports = errorMiddleware;
