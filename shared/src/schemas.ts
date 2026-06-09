/**
 * Zod schemas for validating requests at the authority-service boundary.
 * These mirror the request types in `types.ts`.
 */

import { z } from 'zod';
import { NEWS_IMPACTS } from './constants.js';

export const orderRequestSchema = z.object({
  companyId: z.string().min(1).max(64),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().int().positive().max(100_000_000),
});
export type OrderRequestInput = z.infer<typeof orderRequestSchema>;

export const createTeamSchema = z.object({
  name: z.string().min(1).max(60),
  password: z.string().min(4).max(100),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const loginSchema = z.object({
  name: z.string().min(1).max(60),
  password: z.string().min(1).max(100),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const fireNewsSchema = z.object({
  companyIds: z.array(z.string().min(1)).min(1).max(25),
  impact: z.enum(NEWS_IMPACTS),
  magnitude: z.number().min(-0.5).max(0.5),
  headline: z.string().min(1).max(200),
  body: z.string().max(2000).default(''),
});
export type FireNewsInput = z.infer<typeof fireNewsSchema>;

export const setConfigSchema = z.object({
  currencyName: z.string().min(1).max(40).optional(),
  currencySymbol: z.string().min(1).max(8).optional(),
  startingCapital: z.number().int().positive().optional(),
});
export type SetConfigInput = z.infer<typeof setConfigSchema>;
