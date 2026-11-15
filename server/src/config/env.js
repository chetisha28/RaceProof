import dotenv from 'dotenv';
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

// Phase 4B: Production secret enforcement - fail safely if production secrets are missing
if (NODE_ENV === 'production') {
  const missingSecrets = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    missingSecrets.push('JWT_SECRET (must be set and >= 32 characters long in production)');
  }
  if (!process.env.COOKIE_SECRET) {
    missingSecrets.push('COOKIE_SECRET (required in production)');
  }
  if (!process.env.DATABASE_URL) {
    missingSecrets.push('DATABASE_URL (required in production)');
  }
  if (!process.env.CLIENT_URL) {
    missingSecrets.push('CLIENT_URL (required in production)');
  }

  if (missingSecrets.length > 0) {
    console.error('❌ FATAL PRODUCTION CONFIGURATION ERROR:');
    missingSecrets.forEach((s) => console.error(`   - Missing or insecure: ${s}`));
    throw new Error(`Production startup aborted due to missing secrets: ${missingSecrets.join(', ')}`);
  }
}

export const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:123456789@127.0.0.1:5432/raceproof?schema=public',
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://postgres:123456789@127.0.0.1:5432/raceproof_test?schema=public',
  JWT_SECRET: process.env.JWT_SECRET || (NODE_ENV === 'production' ? '' : 'dev-only-secret-key-32chars-minimum-safety!'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  COOKIE_SECRET: process.env.COOKIE_SECRET || (NODE_ENV === 'production' ? '' : 'dev-only-cookie-secret-2026'),
  INVITE_EXPIRY_HOURS: parseInt(process.env.INVITE_EXPIRY_HOURS || '24', 10),
};

