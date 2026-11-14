import prisma from '../config/database.js';

export const createAuditLog = async (db, { actorId, teamId, action, metadata = {} }) => {
  const client = db || prisma;
  return client.auditLog.create({
    data: {
      actorId: actorId || null,
      teamId: teamId || null,
      action,
      metadata: metadata || {},
    },
  });
};

export const getTeamAuditLogs = async (teamId, limit = 50) => {
  return prisma.auditLog.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
};

