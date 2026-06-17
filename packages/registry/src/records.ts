import { z } from "zod";
import { hashString, type Hash } from "@pharos-router/workflow";

/**
 * Agent and skill registration records.
 *
 * Agents and skills are registered with a content-addressed release
 * hash. CertiK scan verdicts are required at registration time; an
 * expired or failing verdict means the agent is not eligible for
 * routing, and the registry will not return it to the routing engine.
 */

const hash = (s: string): Hash => hashString(s);

export const skillReleaseSchema = z
  .object({
    skillId: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    releaseHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) as z.ZodType<Hash>,
    imageDigest: z.string().min(1),
    publishedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    capabilities: z.array(z.string().min(1)).min(1),
    certikVerdict: z.enum(["pass", "fail", "expired"]),
    certikVerdictAt: z.number().int().nonnegative(),
    certikReportUrl: z.string().url(),
  })
  .strict();
export type SkillRelease = z.infer<typeof skillReleaseSchema>;

export const heartbeatSchema = z
  .object({
    agentId: z.string().min(1),
    endpoint: z.string().url(),
    issuedAt: z.number().int().nonnegative(),
    nonce: z.string().min(8),
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  })
  .strict();
export type Heartbeat = z.infer<typeof heartbeatSchema>;

export const agentRecordSchema = z
  .object({
    agentId: z.string().min(1),
    displayName: z.string().min(1),
    endpoint: z.string().url(),
    pricingMicrousd: z.bigint().nonnegative(),
    trustScore: z.number().min(0).max(100),
    capabilities: z.array(z.string().min(1)).min(1),
    activeSkillRelease: z.string().regex(/^0x[0-9a-fA-F]{64}$/) as z.ZodType<Hash>,
    lastHeartbeat: z.number().int().nonnegative(),
    registeredAt: z.number().int().nonnegative(),
  })
  .strict()
  .refine((a) => a.trustScore >= 0 && a.trustScore <= 100, {
    message: "trustScore out of range",
  });
export type AgentRecord = z.infer<typeof agentRecordSchema>;

export const registrarErrorSchema = z.enum([
  "agent_not_found",
  "skill_not_found",
  "expired_release",
  "failed_verdict",
  "endpoint_mismatch",
  "stale_heartbeat",
  "duplicate",
]);
export type RegistrarError = z.infer<typeof registrarErrorSchema>;