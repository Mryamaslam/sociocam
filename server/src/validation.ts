import { z } from "zod";
import { ACCESSORIES, CLOTHING_COLORS, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_COLORS } from "./avatarOptions.js";

// Every socket/HTTP payload gets parsed through one of these before touching any application
// logic. Reject first, trust nothing about shape/type/range from the wire — this is what
// "schema validation" and "never trust client input" mean in practice, not just in principle.

export const avatarConfigSchema = z
  .object({
    skinColor: z.enum(SKIN_COLORS as [string, ...string[]]),
    hairStyle: z.enum(HAIR_STYLES as [string, ...string[]]),
    hairColor: z.enum(HAIR_COLORS as [string, ...string[]]),
    eyeColor: z.enum(EYE_COLORS as [string, ...string[]]),
    clothingColor: z.enum(CLOTHING_COLORS as [string, ...string[]]),
    accessory: z.enum(ACCESSORIES as [string, ...string[]]),
  })
  .partial();

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "letters, numbers, underscore, dot, hyphen only");

export const passwordSchema = z.string().min(6).max(200);

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(40).optional(),
  avatarConfig: avatarConfigSchema.optional(),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(500),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  avatarConfig: avatarConfigSchema.optional(),
});

export const gameResultSchema = z.object({
  sessionId: z.string().uuid(),
  score: z.number().int().min(0).max(10_000),
});

const roomCodeSchema = z.string().trim().toUpperCase().length(5);

export const roomJoinSchema = roomCodeSchema;

const normalized01 = z.number().min(-0.5).max(1.5); // small tolerance past 0..1 for tracking noise, not an open range
const handPositionSchema = z
  .object({
    x: normalized01,
    y: normalized01,
    z: z.number().min(-2).max(2),
  })
  .nullable();

export const handUpdateSchema = z.object({
  leftHand: handPositionSchema,
  rightHand: handPositionSchema,
});

const rtcSdpSchema = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string().max(20_000).optional(),
});

const rtcCandidateSchema = z.object({
  candidate: z.string().max(2000).optional(),
  sdpMid: z.string().max(200).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(100).nullable().optional(),
  usernameFragment: z.string().max(200).nullable().optional(),
});

export const webrtcOfferSchema = z.object({ to: z.string().min(1).max(100), sdp: rtcSdpSchema });
export const webrtcAnswerSchema = z.object({ to: z.string().min(1).max(100), sdp: rtcSdpSchema });
export const webrtcIceSchema = z.object({ to: z.string().min(1).max(100), candidate: rtcCandidateSchema });

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function validate<T>(schema: z.ZodType<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues.map((i) => i.message).join("; ") };
}
