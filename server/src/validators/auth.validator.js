import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name must be at most 80 characters'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100, 'Password must be at most 100 characters'),
  bio: z.string().max(500, 'Bio cannot exceed 500 characters').optional().nullable(),
  skills: z.array(z.string().trim().min(1)).optional().default([]),
  githubUrl: z.string().url('Invalid GitHub URL').optional().nullable().or(z.literal('')),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().max(500).optional().nullable(),
  skills: z.array(z.string().trim().min(1)).optional(),
  githubUrl: z.string().url().optional().nullable().or(z.literal('')),
});

