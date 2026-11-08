export type WorkflowNode = unknown;
export type WorkflowEdge = unknown;

export interface WorkflowDocument {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  [key: string]: unknown;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}

export function isWorkflowDocument(value: unknown): value is WorkflowDocument {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges)
  );
}

export function isValidWorkflowDocument(
  value: unknown,
  expectedId?: string,
): value is WorkflowDocument {
  return (
    isWorkflowDocument(value) &&
    isValidId(value.id) &&
    (expectedId === undefined || value.id === expectedId)
  );
}
