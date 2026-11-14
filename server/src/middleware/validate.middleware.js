import { errorResponse } from '../utils/response.js';

export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const formatted = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    return errorResponse(res, 'Validation failed', 400, 'VALIDATION_ERROR', formatted);
  }
  req.body = result.data;
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    const formatted = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    return errorResponse(res, 'Invalid query parameters', 400, 'QUERY_VALIDATION_ERROR', formatted);
  }
  req.query = result.data;
  next();
};

