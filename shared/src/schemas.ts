/**
 * Zod schemas for validating requests at the authority-service boundary.
 * These mirror the request types in `types.ts`.
 */

import { z } from 'zod';
import { GAME_LENGTH_OPTIONS_MS, NEWS_TYPES, POSITION_LIMIT_OPTIONS, RESEARCH_EDGES } from './constants.js';

export const orderRequestSchema = z.object({
  companyId: z.string().min(1).max(64),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().int().positive().max(100_000_000),
  clientOrderId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  quotedPrice: z.number().int().positive().optional(),
});
export type OrderRequestInput = z.infer<typeof orderRequestSchema>;

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(60),
  password: z.string().min(4).max(100),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const loginSchema = z.object({
  name: z.string().min(1).max(60),
  password: z.string().min(1).max(100),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const resetPasswordSchema = z.object({
  password: z.string().min(4).max(100),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const tradingToggleSchema = z.object({
  enabled: z.boolean(),
});
export type TradingToggleInput = z.infer<typeof tradingToggleSchema>;

export const settingsSchema = z.object({
  gameLengthMs: z
    .number()
    .int()
    .refine((v) => GAME_LENGTH_OPTIONS_MS.includes(v))
    .optional(),
  startingCapital: z.number().int().min(1_000_00).max(1_000_000_000_00).optional(),
  feeBps: z.number().int().min(0).max(200).optional(),
  researchEdge: z.enum(RESEARCH_EDGES).optional(),
  maxPositionPct: z
    .number()
    .refine((v) => (POSITION_LIMIT_OPTIONS as readonly number[]).includes(v))
    .optional(),
  currencyName: z.string().min(1).max(40).optional(),
  currencySymbol: z.string().min(1).max(8).optional(),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const newGameSchema = z.object({
  keepCrews: z.boolean(),
});
export type NewGameInput = z.infer<typeof newGameSchema>;

export const fireNewsSchema = z.object({
  companyIds: z.array(z.string().min(1)).min(1).max(25),
  type: z.enum(NEWS_TYPES),
  magnitude: z
    .number()
    .min(-0.5)
    .max(0.5)
    .refine((m) => m !== 0),
  headline: z.string().trim().min(1).max(200),
  body: z.string().max(2000).default(''),
});
export type FireNewsInput = z.infer<typeof fireNewsSchema>;
