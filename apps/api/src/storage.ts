/**
 * Simple JSON-file persistence for JobStore.
 *
 * Writes the entire job map atomically (temp file + rename) so a
 * crash mid-write can't corrupt the data. Loaded once on startup
 * and cached in memory; mutations from the API flush the cache
 * back to disk.
 *
 * Used only when `PHAROS_ROUTER_DATA_DIR` is set. Tests leave it
 * unset so each test starts with an empty in-memory store.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { TaskState } from "@pharos-router/workflow";
import type {
  AssignmentReceipt,
  Hash,
  JobReceipt,
  TaskResult,
  VerificationRecord,
} from "@pharos-router/workflow";
import type { JobGraph, JobSpec } from "@pharos-router/workflow";
import type { StoredJob } from "./app.js";

export class FileStorage {
  private readonly filePath: string;
  private cached: Map<string, StoredJob> | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
    // eslint-disable-next-line no-console
    console.log(`[FileStorage] initialised, target=${filePath}`);
  }

  load(): Map<string, StoredJob> {
    if (this.cached) return this.cached;
    if (!existsSync(this.filePath)) {
      this.cached = new Map();
      return this.cached;
    }
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      this.cached = deserializeJobs(raw);
      console.log(
        `[FileStorage] loaded ${this.cached.size} job(s) from ${this.filePath}`
      );
      return this.cached;
    } catch (err) {
      console.error(`[FileStorage] failed to load ${this.filePath}:`, err);
      this.cached = new Map();
      return this.cached;
    }
  }

  save(jobs: Map<string, StoredJob>): void {
    this.cached = jobs;
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    const serialized = serializeJobs(jobs);
    // eslint-disable-next-line no-console
    console.log(
      `[FileStorage] saving ${jobs.size} job(s) to ${this.filePath} (${serialized.length} bytes)`
    );
    writeFileSync(tmpPath, serialized, "utf-8");
    renameSync(tmpPath, this.filePath);
  }
}

/* ── (de)serialization ────────────────────────────────────────────── */

function serializeJobs(jobs: Map<string, StoredJob>): string {
  const obj: Record<string, unknown> = {};
  for (const [id, job] of jobs) obj[id] = serializeJob(job);
  return JSON.stringify({ version: 1, jobs: obj }, (_key, value) => {
    if (typeof value === "bigint") return `${value.toString()}n`;
    return value;
  });
}

function serializeJob(job: StoredJob): Record<string, unknown> {
  return {
    spec: job.spec,
    graph: job.graph,
    dagHash: job.dagHash,
    approval: job.approval,
    state: Object.fromEntries(job.state),
    assignments: job.assignments,
    results: job.results,
    verifications: job.verifications,
    receipt: job.receipt,
    cancelled: job.cancelled,
    createdAt: job.createdAt,
  };
}

function deserializeJobs(raw: string): Map<string, StoredJob> {
  const data: unknown = JSON.parse(raw, (_key, value) => {
    if (typeof value === "string" && /^-?\d+n$/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return value;
  });
  const jobs = new Map<string, StoredJob>();
  if (!data || typeof data !== "object") return jobs;
  const rawJobs = (data as { jobs?: Record<string, unknown> }).jobs;
  if (!rawJobs || typeof rawJobs !== "object") return jobs;
  for (const [id, value] of Object.entries(rawJobs)) {
    if (!value || typeof value !== "object") continue;
    jobs.set(id, deserializeJob(value as Record<string, unknown>));
  }
  return jobs;
}

function deserializeJob(j: Record<string, unknown>): StoredJob {
  const stateObj = (j.state ?? {}) as Record<string, TaskState>;
  return {
    spec: j.spec as JobSpec,
    graph: j.graph as JobGraph,
    dagHash: j.dagHash as Hash,
    approval: (j.approval ?? null) as StoredJob["approval"],
    state: new Map<string, TaskState>(Object.entries(stateObj)),
    assignments: (j.assignments ?? []) as AssignmentReceipt[],
    results: (j.results ?? []) as TaskResult[],
    verifications: (j.verifications ?? []) as VerificationRecord[],
    receipt: (j.receipt ?? undefined) as JobReceipt | undefined,
    cancelled: Boolean(j.cancelled),
    createdAt: Number(j.createdAt ?? 0),
  };
}
