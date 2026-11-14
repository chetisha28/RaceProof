import { verifyToken } from '../utils/jwt.js';
import { errorResponse } from '../utils/response.js';
import prisma from '../config/database.js';

export const authenticateToken = async (req, res, next) => {
  try {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return errorResponse(res, 'Authentication required', 401, 'UNAUTHORIZED');
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return errorResponse(res, 'Invalid or expired token', 401, 'INVALID_TOKEN');
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        bio: true,
        skills: true,
        githubUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return errorResponse(res, 'User no longer exists', 401, 'USER_NOT_FOUND');
    }

    req.user = user;
    next();
  } catch (error) {
    return errorResponse(res, 'Authentication error', 401, 'AUTH_ERROR');
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      const decoded = verifyToken(token);
      if (decoded && decoded.userId) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, name: true, email: true },
        });
        if (user) {
          req.user = user;
        }
      }
    }
    next();
  } catch {
    next();
  }
};

