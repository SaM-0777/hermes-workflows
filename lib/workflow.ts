import type { Edge, Node } from "@xyflow/react";

import { hostRest } from "@/lib/host";

export type Workflow = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: Node[];
  edges: Edge[];
};

export type WorkflowSummary = Pick<
  Workflow,
  "id" | "name" | "createdAt" | "updatedAt"
>;

// Straight to the plugin's own backend routes; ctx.rest is installed by register().

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
  },
): Promise<Workflow> {
  return hostRest<Workflow>(`/workflows/${workflow.id}`, {
    method: "PUT",
    body: {
      name: workflow.name,
      nodes: workflow.nodes,
      edges: workflow.edges,
    },
  });
}

export async function loadWorkflow(id: string): Promise<Workflow> {
  return hostRest<Workflow>(`/workflows/${id}`, { method: "GET" });
}

export async function deleteWorkflow(id: string): Promise<string> {
  return hostRest<string>(`/workflows/${id}`, { method: "DELETE" });
}
