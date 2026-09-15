const AppError = require('../utils/AppError');

// Wraps a zod schema and validates req.body, req.params, or req.query.
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError('Validation failed', 422, result.error.flatten()));
    }
    req[source] = result.data;
    next();
  };
}

module.exports = validate;
