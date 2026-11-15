import { errorResponse } from '../utils/response.js';
import { env } from '../config/env.js';

/**
 * High-performance sliding window rate limiter
 */
export const createRateLimiter = ({
  windowMs = 60 * 1000,
  max = 30,
  message = 'Too many requests, please try again later.',
  code = 'RATE_LIMIT_EXCEEDED',
}) => {
  const ipRequests = new Map();

  // Periodic cleanup every 3 minutes
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of ipRequests.entries()) {
      if (now > record.resetTime) {
        ipRequests.delete(key);
      }
    }
  }, 3 * 60 * 1000);

  // Unref interval so it does not keep Node process alive
  interval.unref?.();

  return (req, res, next) => {
    // In test environment, skip unless explicitly requesting rate limit verification
    if (env.NODE_ENV === 'test' && !req.headers['x-test-ratelimit']) {
      return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    let record = ipRequests.get(ip);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      ipRequests.set(ip, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return errorResponse(res, message, 429, code, { retryAfter: retryAfterSeconds });
    }

    next();
  };
};

export const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  code: 'LOGIN_RATE_LIMIT_EXCEEDED',
});

export const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many accounts registered from this IP. Please try again later.',
  code: 'REGISTER_RATE_LIMIT_EXCEEDED',
});

export const inviteInspectLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many invite verification requests. Please wait.',
  code: 'INVITE_RATE_LIMIT_EXCEEDED',
});

export const inviteAcceptLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many invite acceptance attempts. Please wait a moment.',
  code: 'INVITE_ACCEPT_RATE_LIMIT_EXCEEDED',
});

export const teamCreateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many teams created from this IP. Please wait before creating another team.',
  code: 'TEAM_CREATE_RATE_LIMIT_EXCEEDED',
});

export const joinRequestLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Too many join requests submitted. Please wait before sending more.',
  code: 'JOIN_REQUEST_RATE_LIMIT_EXCEEDED',
});

export const demoLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Demo benchmark rate limit reached. Please wait 1 minute.',
  code: 'DEMO_RATE_LIMIT_EXCEEDED',
});
