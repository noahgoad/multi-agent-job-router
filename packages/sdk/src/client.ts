import type {
  JobSpec,
  JobReceipt,
  TaskState,
  JobGraph,
  AssignmentReceipt,
  TaskResult,
  VerificationRecord,
  Hash,
} from "@pharos-router/workflow";

/**
 * Typed SDK for the Pharos Multi-Agent Job Router.
 *
 * The SDK is a thin fetch wrapper. It does not depend on Node APIs so
 * it works in the browser, in a server, or in an edge runtime. All
 * operations are typed; non-2xx responses raise an `RouterApiError`.
 */

export interface RouterClientOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly headers?: Record<string, string>;
}

export class RouterApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "RouterApiError";
  }
}

export interface JobView {
  readonly jobId: string;
  readonly spec: JobSpec;
  readonly graph: JobGraph;
  readonly dagHash: Hash;
  readonly state: Record<string, TaskState>;
  readonly assignments: ReadonlyArray<AssignmentReceipt>;
  readonly results: ReadonlyArray<TaskResult>;
  readonly verifications: ReadonlyArray<VerificationRecord>;
  readonly receipt?: JobReceipt;
}

export class RouterClient {
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;

  constructor(private readonly options: RouterClientOptions) {
    // In the browser, `fetch` is defined on `window` and must be
    // called with `window` as `this` (otherwise it throws
    // "Illegal invocation"). In Node 18+ `fetch` is a global. Bind
    // to `globalThis` so the call site `this.fetchImpl(url, ...)`
    // still works when the SDK is bundled for the browser.
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.headers = {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    };
  }

  async createJob(spec: JobSpec): Promise<JobView> {
    return this.post<JobView>("/jobs", spec);
  }

  async approveJob(jobId: string, approver: string): Promise<JobView> {
    return this.post<JobView>(`/jobs/${encodeURIComponent(jobId)}/approve`, {
      approver,
    });
  }

  async routeJob(jobId: string): Promise<JobView> {
    return this.post<JobView>(`/jobs/${encodeURIComponent(jobId)}/route`, {});
  }

  async executeJob(jobId: string): Promise<JobView> {
    return this.post<JobView>(`/jobs/${encodeURIComponent(jobId)}/execute`, {});
  }

  /**
   * Reset a job back to PLANNED with cleared assignments / results /
   * verifications / receipt. The DAG and spec are preserved.
   */
  async resetJob(jobId: string): Promise<JobView> {
    return this.post<JobView>(`/jobs/${encodeURIComponent(jobId)}/reset`, {});
  }

  /**
   * Run a job in slow motion for the dashboard's "Run demo" button.
   * The orchestrator paces each state transition by `tickMs`
   * milliseconds, so a polling client watching `inspectJob` can see
   * the job walk through every transition. `tickMs` defaults to
   * 600ms on the server.
   *
   * `scenario` selects which failure mode (if any) the orchestrator
   * should inject, so the dashboard can demo every DAG outcome:
   *   - "happy"   (default) — all tasks VERIFIED
   *   - "budget"            — t1 spends the whole job budget
   *   - "failure"           — t1 worker throws, retried, fails
   */
  async playJob(
    jobId: string,
    opts: {
      tickMs?: number;
      approver?: string;
      scenario?: "happy" | "verifier" | "failure";
    } = {}
  ): Promise<JobView> {
    return this.post<JobView>(`/jobs/${encodeURIComponent(jobId)}/play`, opts);
  }

  async verifyJob(jobId: string): Promise<JobView> {
    return this.post<JobView>(`/jobs/${encodeURIComponent(jobId)}/verify`, {});
  }

  async cancelJob(jobId: string, reason: string): Promise<JobView> {
    return this.post<JobView>(`/jobs/${encodeURIComponent(jobId)}/cancel`, {
      reason,
    });
  }

  async retryJob(jobId: string, taskId: string): Promise<JobView> {
    return this.post<JobView>(`/jobs/${encodeURIComponent(jobId)}/retry`, {
      taskId,
    });
  }

  async inspectJob(jobId: string): Promise<JobView> {
    return this.get<JobView>(`/jobs/${encodeURIComponent(jobId)}`);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.options.baseUrl + path, {
      method: "GET",
      headers: this.headers,
    });
    return this.parse<T>(res);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(this.options.baseUrl + path, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    return this.parse<T>(res);
  }

  private async parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      // keep as text
    }
    if (!res.ok) {
      throw new RouterApiError(
        `router_api_error:${res.status}`,
        res.status,
        parsed
      );
    }
    return parsed as T;
  }
}
