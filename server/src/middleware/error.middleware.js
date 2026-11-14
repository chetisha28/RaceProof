import { errorResponse } from '../utils/response.js';
import { env } from '../config/env.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    return errorResponse(res, err.message, err.statusCode, err.errorCode, err.details);
  }

  // Handle Prisma unique constraint violation (P2002)
  if (err.code === 'P2002') {
    const target = err.meta?.target || [];
    let message = 'A unique constraint violation occurred.';
    let code = 'DUPLICATE_ENTRY';

    if (Array.isArray(target) && target.includes('hackathonId') && target.includes('userId')) {
      message = 'User is already a member of a team in this hackathon.';
      code = 'ALREADY_IN_TEAM';
    } else if (Array.isArray(target) && target.includes('email')) {
      message = 'An account with this email address already exists.';
      code = 'EMAIL_ALREADY_EXISTS';
    } else if (Array.isArray(target) && target.includes('tokenHash')) {
      message = 'Invalid or duplicate invitation token.';
      code = 'INVALID_TOKEN';
    }

    return errorResponse(res, message, 409, code, { target });
  }

  // Handle Prisma record not found (P2025)
  if (err.code === 'P2025') {
    return errorResponse(res, 'The requested resource was not found.', 404, 'NOT_FOUND');
  }

  // Handle JSON parsing error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return errorResponse(res, 'Malformed JSON in request body', 400, 'MALFORMED_JSON');
  }

  // Fallback internal server error
  console.error('[UNHANDLED ERROR]:', err);
  const message = env.NODE_ENV === 'production' ? 'An unexpected server error occurred' : err.message;
  return errorResponse(res, message, 500, 'INTERNAL_SERVER_ERROR', env.NODE_ENV === 'development' ? err.stack : null);
};

