import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(80, 'Team name cannot exceed 80 characters'),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(1000, 'Description cannot exceed 1000 characters'),
  hackathonId: z.string().uuid('Invalid hackathon ID format'),
  maxSize: z.coerce.number().int().min(2, 'Team capacity must be at least 2').max(10, 'Team capacity cannot exceed 10').default(4),
});

export const updateTeamSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().min(5).max(1000).optional(),
  maxSize: z.coerce.number().int().min(2).max(10).optional(),
});

export const joinRequestSchema = z.object({
  message: z.string().trim().max(500, 'Message cannot exceed 500 characters').optional().default(''),
});

export const inviteSchema = z.object({
  expiresInHours: z.coerce.number().int().min(1).max(168).optional().default(24),
});

export const transferLeadershipSchema = z.object({
  newLeaderId: z.string().uuid('Invalid user ID format'),
});

