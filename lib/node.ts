import z from "zod";
import { type Node } from "@xyflow/react";

import { hostRest } from "@/lib/host";

export const categories = [
  { value: "data", label: "Data" },
  { value: "model", label: "Model" },
  { value: "processing", label: "Processing" },
  { value: "control-flow", label: "Control Flow" },
  { value: "utility", label: "Utility" },
  { value: "other", label: "Other" },
] as const;

export const dataTypes = [
  "Any",
  "String",
  "Number",
  "Boolean",
  "Object",
  "Array",
  "Image",
  "Audio",
  "Video",
  "File",
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

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}

export interface NodeExecutionResult {
  node_id: string;
  status: "idle" | "running" | "error" | "completed";
  output: unknown;
}

export async function runNode(
  node: WorkflowNode,
  inputs: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const code = node.data.execution?.pythonCode;
  if (!code?.trim()) {
    throw new Error(`Node "${node.id}" has no valid Execution.`);
  }

  // The backend runs the node in an execute_code kernel child; this returns its
  // {node_id, status, output} envelope or throws with the child's message.
  const result = await hostRest<Record<string, unknown>>("/run", {
    method: "POST",
    body: {
      node_id: node.id,
      code,
      inputs,
    },
  });

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
