import prisma from '../config/database.js';
import { AppError } from '../middleware/error.middleware.js';

export const getAllHackathons = async () => {
  return prisma.hackathon.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      _count: {
        select: {
          teams: true,
          members: true,
        },
      },
    },
  });
};

export const getHackathonById = async (id) => {
  const hackathon = await prisma.hackathon.findUnique({
    where: { id },
    include: {
      teams: {
        where: { status: { not: 'DISBANDED' } },
        include: {
          leader: {
            select: { id: true, name: true, email: true },
          },
          members: {
            include: {
              user: {
                select: { id: true, name: true, skills: true },
              },
            },
          },
        },
      },
      _count: {
        select: { teams: true, members: true },
      },
    },
  });

  if (!hackathon) {
    throw new AppError('Hackathon not found', 404, 'HACKATHON_NOT_FOUND');
  }

  return hackathon;
};

