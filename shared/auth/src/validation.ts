/**
 * @fileoverview Authentication validation utilities
 */

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.string()
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type UserData = z.infer<typeof userSchema>;