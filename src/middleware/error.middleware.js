const { fail } = require('../utils/apiResponse');

// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
    return fail(res, 'Internal server error', status);
  }
  return fail(res, err.message || 'Something went wrong', status, err.details);
}

module.exports = errorMiddleware;
