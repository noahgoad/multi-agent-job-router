import { z } from "zod";
import type { Hash } from "./hash.js";

/**
 * Job, task, assignment, and receipt schemas.
 *
 * Every value is validated with Zod before it enters the workflow
 * engine. The TypeScript types are derived from the Zod schemas via
 * `z.infer`. All hashes are 32-byte hex strings.
 */

const hashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/) as z.ZodType<Hash>;

const capabilitySchema = z.enum([
  "read",
  "compute",
  "fetch",
  "analyze",
  "summarize",
  "verify",
  "write",
  "financial",
]);

const taskStateSchema = z.enum([
  "PLANNED",
  "READY",
  "ASSIGNED",
  "RUNNING",
  "SUBMITTED",
  "VERIFIED",
  "FAILED",
  "CANCELLED",
]);

const verifierKindSchema = z.enum([
  "schema",
  "hash",
  "deterministic",
  "transaction",
  "human",
]);

export const jobSpecSchema = z
  .object({
    jobId: z.string().min(1).max(128),
    goal: z.string().min(1),
    goalHash: hashSchema,
    budgetMicrousd: z.bigint().nonnegative(),
    deadline: z.number().int().positive(),
    allowedCapabilities: z.array(capabilitySchema).min(1),
    policyHash: hashSchema,
    verifier: z.string().min(1),
    tasks: z
      .array(
        z.object({
          taskId: z.string().min(1).max(128),
          description: z.string().min(1),
          dependencies: z.array(z.string().min(1)).default([]),
          capability: capabilitySchema,
          inputHash: hashSchema,
          budgetMicrousd: z.bigint().nonnegative(),
          deadline: z.number().int().positive(),
          verifier: z.string().min(1),
          verifierKind: verifierKindSchema,
        }),
      )
      .min(1),
  })
  .strict();

export type JobSpec = z.infer<typeof jobSpecSchema>;

export const taskStateType = taskStateSchema;
export type TaskState = z.infer<typeof taskStateSchema>;

export const assignmentReceiptSchema = z
  .object({
    taskId: z.string().min(1),
    agentId: z.string().min(1),
    skillReleaseHash: hashSchema,
    score: z.number().min(0).max(100),
    assignedAt: z.number().int().nonnegative(),
    termsHash: hashSchema,
  })
  .strict();
export type AssignmentReceipt = z.infer<typeof assignmentReceiptSchema>;

export const taskResultSchema = z
  .object({
    taskId: z.string().min(1),
    agentId: z.string().min(1),
    outputHash: hashSchema,
    output: z.unknown(),
    submittedAt: z.number().int().nonnegative(),
    receiptTxHash: hashSchema.optional(),
    verifierKind: verifierKindSchema,
    verifierNote: z.string().default(""),
  })
  .strict();
export type TaskResult = z.infer<typeof taskResultSchema>;

export const verificationRecordSchema = z
  .object({
    taskId: z.string().min(1),
    verifierId: z.string().min(1),
    verdict: z.enum(["pass", "fail"]),
    reason: z.string().default(""),
    evidenceHash: hashSchema,
    verifiedAt: z.number().int().nonnegative(),
  })
  .strict();
export type VerificationRecord = z.infer<typeof verificationRecordSchema>;

export const jobReceiptSchema = z
  .object({
    jobId: z.string().min(1),
    dagHash: hashSchema,
    assignmentRoot: hashSchema,
    resultRoot: hashSchema,
    verificationRoot: hashSchema,
    completedAt: z.number().int().nonnegative(),
    totalSpentMicrousd: z.bigint().nonnegative(),
    chainId: z.number().int().positive(),
    registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    receiptTxHash: hashSchema,
  })
  .strict();
export type JobReceipt = z.infer<typeof jobReceiptSchema>;

export const workerManifestSchema = z
  .object({
    agentId: z.string().min(1),
    endpoint: z.string().url(),
    skillReleaseHash: hashSchema,
    capabilities: z.array(capabilitySchema).min(1),
    pricingMicrousd: z.bigint().nonnegative(),
    trustScore: z.number().min(0).max(100),
    certikVerdict: z.enum(["pass", "fail", "expired"]),
    certikVerdictAt: z.number().int().nonnegative(),
    lastHeartbeat: z.number().int().nonnegative(),
  })
  .strict();
export type WorkerManifest = z.infer<typeof workerManifestSchema>;

export const jobGraphSchema = z
  .object({
    jobId: z.string().min(1),
    nodes: z.array(
      z.object({
        taskId: z.string().min(1),
        dependsOn: z.array(z.string().min(1)),
        capability: capabilitySchema,
        budgetMicrousd: z.bigint().nonnegative(),
        deadline: z.number().int().positive(),
        verifierKind: verifierKindSchema,
        approvalRequired: z.boolean(),
      }),
    ),
    criticalPath: z.array(z.string().min(1)),
  })
  .strict();
export type JobGraph = z.infer<typeof jobGraphSchema>;