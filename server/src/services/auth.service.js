import prisma from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/crypto.js';
import { signToken } from '../utils/jwt.js';
import { AppError } from '../middleware/error.middleware.js';

export const registerUser = async ({ name, email, password, bio, skills, timezone, githubUrl }) => {
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    throw new AppError('An account with this email address already exists', 409, 'EMAIL_ALREADY_EXISTS');
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      bio: bio || null,
      skills: skills || [],
      timezone: timezone || 'UTC',
      githubUrl: githubUrl || null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      bio: true,
      skills: true,
      timezone: true,
      githubUrl: true,
      createdAt: true,
    },
  });

  const token = signToken({ userId: user.id });

  return { user, token };
};

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const token = signToken({ userId: user.id });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      bio: user.bio,
      skills: user.skills,
      timezone: user.timezone,
      githubUrl: user.githubUrl,
      createdAt: user.createdAt,
    },
    token,
  };
};

export const getCurrentUserProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      bio: true,
      skills: true,
      timezone: true,
      githubUrl: true,
      createdAt: true,
      memberships: {
        include: {
          team: {
            select: {
              id: true,
              name: true,
              hackathonId: true,
              status: true,
              leaderId: true,
              hackathon: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
      joinRequests: {
        where: { status: 'PENDING' },
        include: {
          team: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  return user;
};

export const updateUserProfile = async (userId, data) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      bio: true,
      skills: true,
      timezone: true,
      githubUrl: true,
      updatedAt: true,
    },
  });

  return user;
};
