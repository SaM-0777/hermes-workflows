import type { Edge, Node } from "@xyflow/react";

import { hostRest } from "@/lib/host";
import { normalizeNodeData, type WorkflowNode } from "@/lib/node";

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
      // Store the current vocabulary even when the caller still holds old types.
      nodes: (workflow.nodes as WorkflowNode[]).map((node) =>
        node.data ? { ...node, data: normalizeNodeData(node.data) } : node,
      ),
      edges: workflow.edges,
    },
  });
}

export async function loadWorkflow(id: string): Promise<Workflow> {
  const workflow = await hostRest<Workflow>(`/workflows/${id}`, {
    method: "GET",
  });

  // Stored documents may predate the current type vocabulary.
  return {
    ...workflow,
    nodes: (workflow.nodes as WorkflowNode[]).map((node) =>
      node.data ? { ...node, data: normalizeNodeData(node.data) } : node,
    ),
  };
}

export async function deleteWorkflow(id: string): Promise<string> {
  return hostRest<string>(`/workflows/${id}`, { method: "DELETE" });
}
