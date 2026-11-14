import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:123456789@127.0.0.1:5432/raceproof?schema=public',
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://postgres:123456789@127.0.0.1:5432/raceproof_test?schema=public',
  JWT_SECRET: process.env.JWT_SECRET || 'super-secret-raceproof-jwt-key-2026-production-grade',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'super-secret-cookie-secret-2026',
  INVITE_EXPIRY_HOURS: parseInt(process.env.INVITE_EXPIRY_HOURS || '24', 10),
};

