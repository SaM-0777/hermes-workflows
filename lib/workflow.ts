import type { Edge, Node } from "@xyflow/react";

import { hostRest } from "@/lib/host";
import type { WorkflowRunner } from "@/lib/runner";

export type Workflow = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: Node[];
  edges: Edge[];
  /** Where node Python runs; absent on workflows saved before the selector. */
  runner?: WorkflowRunner;
  /** Per-workflow overrides for the provider's descriptor options. */
  runnerOptions?: Record<string, unknown>;
};

export type WorkflowSummary = Pick<
  Workflow,
  "id" | "name" | "createdAt" | "updatedAt"
>;

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  return hostRest<WorkflowSummary[]>("/workflows", { method: "GET" });
}

export async function createWorkflow(name?: string): Promise<Workflow> {
  return hostRest<Workflow>("/workflows", {
    method: "POST",
    body: { name },
  });
}

export async function saveWorkflow(
  workflow: Pick<Workflow, "id" | "nodes" | "edges"> & {
    name?: string;
    runner?: WorkflowRunner;
    runnerOptions?: Record<string, unknown>;
  },
): Promise<Workflow> {
  return hostRest<Workflow>(`/workflows/${workflow.id}`, {
    method: "PUT",
    body: {
      name: workflow.name,
      nodes: workflow.nodes,
      edges: workflow.edges,
      runner: workflow.runner,
      runnerOptions: workflow.runnerOptions,
    },
  });
}

export async function loadWorkflow(id: string): Promise<Workflow> {
  return hostRest<Workflow>(`/workflows/${id}`, { method: "GET" });
}

export async function deleteWorkflow(id: string): Promise<string> {
  return hostRest<string>(`/workflows/${id}`, { method: "DELETE" });
}
