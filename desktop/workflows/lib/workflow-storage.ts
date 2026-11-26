import {
  isRecord,
  type WorkflowDocument,
  type WorkflowEdge,
  type WorkflowNode,
} from "./workflow-validation";
import { normalizeNodeData, type NodeData } from "../../../lib/node";

export type WorkflowRest = <T = unknown>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: Record<string, unknown>;
  },
) => Promise<T>;

export async function readWorkflows(
  rest: WorkflowRest,
): Promise<WorkflowDocument[]> {
  return (await rest("/workflows", {
    method: "GET",
  })) as WorkflowDocument[];
}

export async function createWorkflow(
  rest: WorkflowRest,
  name?: string,
): Promise<WorkflowDocument> {
  return (await rest("/workflows", {
    method: "POST",
    body: { name },
  })) as WorkflowDocument;
}

export async function saveWorkflow(
  rest: WorkflowRest,
  input: {
    id: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    name?: unknown;
  },
): Promise<WorkflowDocument> {
  return (await rest(`/workflows/${input.id}`, {
    method: "PUT",
    body: {
      name: input.name,
      // Store the current vocabulary even when the caller still holds old types.
      nodes: input.nodes.map(normalizeStoredNode),
      edges: input.edges,
    },
  })) as WorkflowDocument;
}

/** Resolve stored port and parameter types onto the current vocabulary. */
function normalizeStoredData<TData>(data: TData): TData {
  if (!isRecord(data)) return data;

  return normalizeNodeData(data as unknown as NodeData) as TData;
}

/** Resolve a stored node's port and parameter types onto the current vocabulary. */
function normalizeStoredNode(node: WorkflowNode): WorkflowNode {
  if (!isRecord(node)) return node;

  return { ...node, data: normalizeStoredData(node.data) };
}

export async function loadWorkflow(
  rest: WorkflowRest,
  id: string,
): Promise<WorkflowDocument> {
  const document = (await rest(`/workflows/${id}`, {
    method: "GET",
  })) as WorkflowDocument;

  // Stored documents may predate the current type vocabulary.
  return { ...document, nodes: document.nodes.map(normalizeStoredNode) };
}

export async function deleteWorkflow(
  rest: WorkflowRest,
  id: string,
): Promise<string> {
  return (await rest(`/workflows/${id}`, {
    method: "DELETE",
  })) as string;
}

export interface SavedNode<TData = unknown> {
  id: string;
  data: TData;
  createdAt: string;
  updatedAt: string;
}

export async function writeNodeLibrary<TData>(
  rest: WorkflowRest,
  nodes: SavedNode<TData>[],
): Promise<void> {
  await rest("/node-library", {
    method: "PUT",
    body: { nodes },
  });
}

export async function readNodeLibrary<TData = unknown>(
  rest: WorkflowRest,
): Promise<SavedNode<TData>[]> {
  const nodes = (await rest("/node-library", {
    method: "GET",
  })) as SavedNode<TData>[];

  // Saved nodes may predate the current type vocabulary.
  return nodes.map((node) =>
    isRecord(node.data)
      ? {
          ...node,
          data: normalizeNodeData(node.data as unknown as NodeData) as TData,
        }
      : node,
  );
}

export async function saveLibraryNode<TData>(
  rest: WorkflowRest,
  data: TData,
): Promise<SavedNode<TData>> {
  return (await rest("/node-library/nodes", {
    method: "POST",
    body: { data: normalizeStoredData(data) },
  })) as SavedNode<TData>;
}

export async function updateLibraryNode<TData>(
  rest: WorkflowRest,
  id: string,
  data: TData,
): Promise<SavedNode<TData>> {
  return (await rest(`/node-library/nodes/${id}`, {
    method: "PUT",
    body: { data: normalizeStoredData(data) },
  })) as SavedNode<TData>;
}

export async function deleteLibraryNode(
  rest: WorkflowRest,
  id: string,
): Promise<string> {
  return (await rest(`/node-library/nodes/${id}`, {
    method: "DELETE",
  })) as string;
}
