import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { RouterClient } from "@pharos-router/sdk";
import { jobSpecSchema, type JobSpec } from "@pharos-router/workflow";

/**
 * MCP server for the Pharos Multi-Agent Job Router.
 *
 * Exposes a flat list of tools that map to the eight router
 * operations (create, approve, route, execute, verify, cancel,
 * retry, inspect). Tools are read/write; financial tools require an
 * explicit `confirm: true` argument.
 */

const FINANCIAL_TOOLS = new Set([
  "pharos_router_execute",
]);

export interface McpOptions {
  readonly apiBaseUrl?: string;
}

export function buildMcpServer(options: McpOptions = {}) {
  const client = new RouterClient({
    baseUrl: options.apiBaseUrl ?? "http://127.0.0.1:8787",
  });
  const server = new Server(
    { name: "pharos-router", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      tool("pharos_router_create", "Create a job from a JobSpec."),
      tool("pharos_router_approve", "Approve a job (requires jobId and approver)."),
      tool("pharos_router_route", "Route a job to qualified agents."),
      tool("pharos_router_execute", "Execute an approved job. Financial."),
      tool("pharos_router_verify", "Re-verify results for a job."),
      tool("pharos_router_cancel", "Cancel a job (requires jobId and reason)."),
      tool("pharos_router_retry", "Retry a task within a job."),
      tool("pharos_router_inspect", "Inspect a job (requires jobId)."),
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    if (FINANCIAL_TOOLS.has(name) && args.confirm !== true) {
      return {
        content: [{ type: "text", text: "Confirmation required: pass confirm=true" }],
        isError: true,
      };
    }
    const jobId = String(args.jobId ?? "");
    let parsed: JobSpec | undefined;
    if (name === "pharos_router_create") {
      parsed = jobSpecSchema.parse(args.spec);
    }
    switch (name) {
      case "pharos_router_create":
        return wrap(await client.createJob(parsed!));
      case "pharos_router_approve":
        return wrap(await client.approveJob(jobId, String(args.approver ?? "unknown")));
      case "pharos_router_route":
        return wrap(await client.routeJob(jobId));
      case "pharos_router_execute":
        return wrap(await client.executeJob(jobId));
      case "pharos_router_verify":
        return wrap(await client.verifyJob(jobId));
      case "pharos_router_cancel":
        return wrap(await client.cancelJob(jobId, String(args.reason ?? "")));
      case "pharos_router_retry":
        return wrap(await client.retryJob(jobId, String(args.taskId ?? "")));
      case "pharos_router_inspect":
        return wrap(await client.inspectJob(jobId));
      default:
        return { content: [{ type: "text", text: `unknown_tool:${name}` }], isError: true };
    }
  });
  return server;
}

function tool(name: string, description: string) {
  return { name, description, inputSchema: { type: "object", additionalProperties: true } };
}

function wrap(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export async function startMcpServer(options: McpOptions = {}): Promise<void> {
  const server = buildMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}