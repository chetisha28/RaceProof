import prisma from '../src/config/database.js';

export const cleanDatabase = async () => {
  await prisma.auditLog.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.joinRequest.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.hackathon.deleteMany();
  await prisma.user.deleteMany();
};

export const disconnectDatabase = async () => {
  await prisma.$disconnect();
};

