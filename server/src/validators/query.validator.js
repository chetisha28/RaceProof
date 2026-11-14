import { z } from 'zod';

export const teamQuerySchema = z.object({
  hackathonId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  skill: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'FULL', 'DISBANDED', 'ALL']).optional().default('ACTIVE'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(12),
});

