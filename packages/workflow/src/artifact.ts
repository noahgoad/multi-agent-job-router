import { contentHash, type Hash } from "./hash.js";
import type {
  AssignmentReceipt,
  JobReceipt,
  JobSpec,
  TaskResult,
  VerificationRecord,
  WorkerManifest,
} from "./schema.js";

/**
 * Off-chain artifact store.
 *
 * The router stores large DAG, result, and evidence blobs off-chain
 * and only anchors their content hash on Pharos. This module is a
 * pure in-memory implementation; production deployments can replace
 * the underlying storage (S3, OSS, IPFS) without changing the
 * workflow engine.
 */

export interface ArtifactRecord {
  readonly hash: Hash;
  readonly kind:
    | "JobSpec"
    | "JobGraph"
    | "AssignmentReceipt"
    | "TaskResult"
    | "VerificationRecord"
    | "JobReceipt"
    | "WorkerManifest";
  readonly storedAt: number;
  readonly payload: unknown;
}

export class ArtifactStore {
  private readonly byHash = new Map<Hash, ArtifactRecord>();

  put(kind: ArtifactRecord["kind"], payload: unknown, now: number): Hash {
    const hash = contentHash(payload);
    if (!this.byHash.has(hash)) {
      this.byHash.set(hash, { hash, kind, storedAt: now, payload });
    }
    return hash;
  }

  get(hash: Hash): ArtifactRecord | undefined {
    return this.byHash.get(hash);
  }

  has(hash: Hash): boolean {
    return this.byHash.has(hash);
  }

  size(): number {
    return this.byHash.size;
  }

  putJobSpec(spec: JobSpec, now: number): Hash {
    return this.put("JobSpec", spec, now);
  }
  putTaskResult(result: TaskResult, now: number): Hash {
    return this.put("TaskResult", result, now);
  }
  putVerification(record: VerificationRecord, now: number): Hash {
    return this.put("VerificationRecord", record, now);
  }
  putAssignment(record: AssignmentReceipt, now: number): Hash {
    return this.put("AssignmentReceipt", record, now);
  }
  putReceipt(receipt: JobReceipt, now: number): Hash {
    return this.put("JobReceipt", receipt, now);
  }
  putWorker(worker: WorkerManifest, now: number): Hash {
    return this.put("WorkerManifest", worker, now);
  }
}