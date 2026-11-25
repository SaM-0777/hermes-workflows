import z from "zod";
import { type Node } from "@xyflow/react";

import { hostRest } from "@/lib/host";
import type { WorkflowRunner } from "@/lib/runner";

export const categories = [
  { value: "data", label: "Data" },
  { value: "model", label: "Model" },
  { value: "processing", label: "Processing" },
  { value: "control-flow", label: "Control Flow" },
  { value: "utility", label: "Utility" },
  { value: "other", label: "Other" },
] as const;

export const dataTypes = [
  "Text",
  "Dataset",
  "Images",
  "Videos",
  "Audios",
  //"Files",
  //"JSON",
] as const;

export function getPortValue(
  values: unknown,
  name: string,
): { available: boolean; value: unknown } {
  if (
    typeof values !== "object" ||
    values === null ||
    Array.isArray(values) ||
    !Object.prototype.hasOwnProperty.call(values, name)
  ) {
    return { available: false, value: undefined };
  }

  const value = (values as Record<string, unknown>)[name];
  return {
    available: value !== undefined,
    value,
  };
}

export const generalSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(64, "Name must be 64 characters or fewer.")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      "Use letters, numbers, underscores, or hyphens. Start with a letter.",
    ),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer."),
  category: z.string().min(1, "Please select a category.").optional(),
});
export type GeneralFormValues = z.infer<typeof generalSchema>;

export const parameterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Parameter name is required.")
    .max(64, "Name must be 64 characters or fewer.")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      "Use letters, numbers, underscores, or hyphens.",
    ),
  type: z.enum(dataTypes),
  defaultValue: z.string(),
});
export const configSchema = z
  .object({
    parameters: z.array(parameterSchema),
  })
  .superRefine((values, ctx) => {
    const names = new Set<string>();
    values.parameters.forEach((parameter, index) => {
      const normalizedName = parameter.name.trim().toLowerCase();
      if (normalizedName && names.has(normalizedName)) {
        ctx.addIssue({
          code: "custom",
          message: "Parameter names must be unique.",
          path: ["parameters", index, "name"],
        });
      }
      names.add(normalizedName);
    });
  });

export type ConfigFormValues = z.infer<typeof configSchema>;

export const portSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Port name is required.")
    .max(64, "Name must be 64 characters or fewer.")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      "Use letters, numbers, underscores, or hyphens.",
    ),
  type: z.enum(dataTypes),
});
export const ioSchema = z
  .object({
    inputs: z.array(portSchema),
    outputs: z.array(portSchema),
  })
  .superRefine((values, ctx) => {
    for (const direction of ["inputs", "outputs"] as const) {
      const names = new Set<string>();
      values[direction].forEach((port, index) => {
        const normalizedName = port.name.trim().toLowerCase();
        if (normalizedName && names.has(normalizedName)) {
          ctx.addIssue({
            code: "custom",
            message: "Port names must be unique.",
            path: [direction, index, "name"],
          });
        }

        names.add(normalizedName);
      });
    }
  });
export type IoFormValues = z.infer<typeof ioSchema>;

export type NodeData = {
  general: GeneralFormValues;
  io?: IoFormValues;
  config?: ConfigFormValues;
  execution?: {
    pythonCode: string;
  };
};
export type WorkflowNode = Node<NodeData>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The node's declared parameters as typed values, which is what the backend
 * hands to build_output(parameters=...). The studio stores every default as a
 * string; Dataset and Text pass through, media types hold a JSON array of path
 * references, and a blank default is omitted so `parameters.get(name, fallback)`
 * behaves as documented.
 */
export function resolveParameters(data: NodeData): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const parameter of data.config?.parameters ?? []) {
    const raw = parameter.defaultValue ?? "";
    if (raw.trim() === "") continue;
    if (
      parameter.type === "Images" ||
      parameter.type === "Videos" ||
      parameter.type === "Audios"
    ) {
      try {
        resolved[parameter.name] = JSON.parse(raw);
      } catch {
        resolved[parameter.name] = raw;
      }
      continue;
    }
    resolved[parameter.name] = raw;
  }
  return resolved;
}

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}

export interface NodeExecutionResult {
  node_id: string;
  status: "idle" | "running" | "error" | "completed";
  output: unknown;
}

/** Cloud providers submit and return a run id; these poll that record. */
const RUN_POLL_MS = 1200;
const RUN_POLL_LIMIT_MS = 24 * 60 * 60 * 1000;

async function awaitRun(runId: string): Promise<Record<string, unknown>> {
  const deadline = Date.now() + RUN_POLL_LIMIT_MS;

  while (Date.now() < deadline) {
    const record = await hostRest<Record<string, unknown>>(
      `/runtime/runs/${runId}`,
      { method: "GET" },
    );
    const status = record?.status;

    if (status === "completed") {
      return { status: "completed", output: record.output, run_id: runId };
    }
    if (status === "failed") {
      const error = isRecord(record.error) ? record.error : {};
      throw new Error(
        typeof error.message === "string" ? error.message : "Node run failed.",
      );
    }
    if (status === "cancelled") {
      throw new Error("Node run was cancelled.");
    }

    await new Promise((resolve) => setTimeout(resolve, RUN_POLL_MS));
  }

  throw new Error(`Node run ${runId} did not finish; check it in the runtime runs list.`);
}

export async function runNode(
  node: WorkflowNode,
  inputs: Record<string, unknown> = {},
  runner?: WorkflowRunner,
  runnerOptions?: Record<string, unknown>,
  sessionId?: string | null,
): Promise<Record<string, unknown>> {
  const code = node.data.execution?.pythonCode;
  if (!code?.trim()) {
    throw new Error(`Node "${node.id}" has no valid Execution.`);
  }

  // The backend runs the node wherever `runner` points. Built-in providers run
  // synchronously; a remote provider answers 202 with a run id and the studio
  // polls the record, so one node may take hours without holding a request open.
  // `parameters` carries the node's declared defaults, resolved once here, so
  // build_output receives them instead of an empty dict.
  //
  // `session_id` is present only for a runtime that keeps one sandbox for the
  // whole run: the node then joins the sandbox the first node created instead of
  // allocating its own. Per-node runtimes never send it.
  const body: Record<string, unknown> = {
    node_id: node.id,
    code,
    inputs,
    parameters: resolveParameters(node.data),
    runner,
    runner_options: runnerOptions,
  };
  if (sessionId) body.session_id = sessionId;

  const result = await hostRest<Record<string, unknown>>("/run", {
    method: "POST",
    body,
  });

  if (isRecord(result) && typeof result.run_id === "string") {
    return awaitRun(result.run_id);
  }

  if (
    !isRecord(result) ||
    typeof result.node_id !== "string" ||
    result.status !== "completed" ||
    !("output" in result)
  ) {
    throw new Error("Invalid node execution response.");
  }

  return result;
}

export type NodeStatus = "idle" | "ready" | "running" | "success" | "error";
export type NodeExecutionError = {
  type?: string;
  message: string;
  traceback?: string;
};
export type NodeRuntimeState = {
  status: NodeStatus;
  inputs?: Record<string, unknown>;
  output?: unknown;
  error?: NodeExecutionError;
  startedAt?: number;
  completedAt?: number;
};
export type WorkflowRuntimeState = Record<string, NodeRuntimeState>;
