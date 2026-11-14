import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

export const generateSecureToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

export const hashSecureToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

