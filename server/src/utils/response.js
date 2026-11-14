export const successResponse = (res, data, message = 'Success', statusCode = 200, pagination = null) => {
  const payload = {
    success: true,
    message,
    data,
  };

  if (pagination) {
    payload.pagination = pagination;
  }

  return res.status(statusCode).json(payload);
};

export const errorResponse = (res, message = 'Internal server error', statusCode = 500, errorCode = 'INTERNAL_ERROR', details = null) => {
  const payload = {
    success: false,
    message,
    code: errorCode,
  };

  if (details) {
    payload.details = details;
  }

  return res.status(statusCode).json(payload);
};

