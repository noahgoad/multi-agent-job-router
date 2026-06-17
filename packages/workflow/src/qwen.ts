import type { JobSpec } from "./schema.js";
import { compileJobSpec, type CompiledGraph } from "./compiler.js";
import { jobSpecSchema, type JobSpec as JobSpecType } from "./schema.js";
import type { Hash } from "./hash.js";

/**
 * Qwen-assisted task decomposition proposer.
 *
 * Qwen may *propose* a decomposition but cannot authorize execution.
 * The proposed `JobSpec` is treated as untrusted input: it is
 * validated with the same Zod schema used for hand-authored specs,
 * compiled through the same compiler, and only used after explicit
 * human approval. The default `deterministic-only` proposer returns
 * the input unchanged.
 */

export interface ProposeOptions {
  readonly now: number;
  readonly maxFanout?: number;
  readonly maxDepth?: number;
}

export interface ProposeResult {
  readonly accepted: boolean;
  readonly proposalHash: Hash;
  readonly reason: string;
  readonly compiled?: CompiledGraph;
  readonly jobSpec?: JobSpecType;
}

export interface QwenProposer {
  readonly kind: "deterministic-only" | "qwen-assisted";
  propose(input: JobSpec, options: ProposeOptions): Promise<ProposeResult>;
}

export class DeterministicProposer implements QwenProposer {
  readonly kind = "deterministic-only" as const;
  async propose(
    input: JobSpec,
    options: ProposeOptions,
  ): Promise<ProposeResult> {
    const parsed = jobSpecSchema.parse(input);
    const compiled = compileJobSpec(parsed, options);
    return {
      accepted: true,
      proposalHash: compiled.dagHash,
      reason: "deterministic_passthrough",
      compiled,
      jobSpec: parsed,
    };
  }
}

export class QwenAssistedProposer implements QwenProposer {
  readonly kind = "qwen-assisted" as const;
  constructor(
    private readonly client: {
      decompose(spec: JobSpec): Promise<JobSpec>;
    },
    private readonly approve: (proposal: JobSpec) => Promise<boolean>,
  ) {}
  async propose(
    input: JobSpec,
    options: ProposeOptions,
  ): Promise<ProposeResult> {
    const candidate = await this.client.decompose(input);
    const parsed = jobSpecSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        accepted: false,
        proposalHash: ("0x" + "00".repeat(32)) as Hash,
        reason: `qwen_output_invalid:${parsed.error.issues
          .map((i) => i.path.join(".") + ":" + i.message)
          .join(";")}`,
      };
    }
    const compiled = compileJobSpec(parsed.data, options);
    const approved = await this.approve(parsed.data);
    if (!approved) {
      return {
        accepted: false,
        proposalHash: compiled.dagHash,
        reason: "human_approval_denied",
        compiled,
        jobSpec: parsed.data,
      };
    }
    return {
      accepted: true,
      proposalHash: compiled.dagHash,
      reason: "qwen_proposal_approved",
      compiled,
      jobSpec: parsed.data,
    };
  }
}