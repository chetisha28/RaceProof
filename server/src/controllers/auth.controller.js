import * as authService from '../services/auth.service.js';
import { successResponse } from '../utils/response.js';
import { env } from '../config/env.js';

const isProduction = env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const register = async (req, res, next) => {
  try {
    const { user, token } = await authService.registerUser(req.body);
    res.cookie('token', token, cookieOptions);
    return successResponse(res, { user, token }, 'Registration successful', 201);
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { user, token } = await authService.loginUser(req.body);
    res.cookie('token', token, cookieOptions);
    return successResponse(res, { user, token }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  });
  return successResponse(res, null, 'Logged out successfully');
};

export const me = async (req, res, next) => {
  try {
    const profile = await authService.getCurrentUserProfile(req.user.id);
    return successResponse(res, profile, 'User profile fetched');
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const updated = await authService.updateUserProfile(req.user.id, req.body);
    return successResponse(res, updated, 'Profile updated successfully');
  } catch (err) {
    next(err);
  }
};

