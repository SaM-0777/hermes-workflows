import {
  isValidId,
  isValidWorkflowDocument,
  isWorkflowDocument,
  type WorkflowDocument,
  type WorkflowEdge,
  type WorkflowNode,
} from "./workflow-validation";

export const FILE_PREFIX = "workflow-";

export interface WorkflowFileEntry {
  name: string;
  isDirectory: boolean;
}

export type WorkflowFilesResult<T extends object = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error?: string; message?: string };

export interface WorkflowFiles {
  list: (
    folder: "data",
  ) => Promise<WorkflowFilesResult<{ entries: WorkflowFileEntry[] }>>;
  readText: (
    folder: "data",
    path: string,
  ) => Promise<WorkflowFilesResult<{ text: string }>>;
  writeText: (
    folder: "data",
    path: string,
    text: string,
    options?: { exclusive?: boolean },
  ) => Promise<WorkflowFilesResult<Record<string, never>>>;
  trash: (folder: "data", path: string) => Promise<WorkflowFilesResult>;
}

function resultMessage(
  result: { message?: string; error?: string },
  fallback: string,
): string {
  return result.message || result.error || fallback;
}

export function workflowPath(id: string): string {
  return `${FILE_PREFIX}${id}.json`;
}

export async function readWorkflows(
  files: WorkflowFiles,
): Promise<WorkflowDocument[]> {
  const listing = await files.list("data");
  if (!listing.ok) {
    throw new Error(resultMessage(listing, "Unable to list workflows"));
  }

  const workflows: WorkflowDocument[] = [];

  for (const entry of listing.entries) {
    if (
      entry.isDirectory ||
      !entry.name.startsWith(FILE_PREFIX) ||
      !entry.name.endsWith(".json")
    ) {
      continue;
    }

    const result = await files.readText("data", entry.name);
    if (!result.ok) continue;

    try {
      const workflow: unknown = JSON.parse(result.text);
      if (isWorkflowDocument(workflow)) {
        workflows.push({
          id: workflow.id,
          name: workflow.name || "Untitled workflow",
          nodes: workflow.nodes,
          edges: workflow.edges,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        });
      }
    } catch {
      // Invalid workflow files stay hidden from the library.
    }
  }

  return workflows.sort(
    (a, b) =>
      new Date(b.updatedAt ?? "").getTime() -
      new Date(a.updatedAt ?? "").getTime(),
  );
}

export async function createWorkflow(
  files: WorkflowFiles,
  name?: string,
): Promise<WorkflowDocument> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const defaultName = `workspace-${id}`;
  const workflow: WorkflowDocument = {
    id,
    name: name?.trim() ? name.trim() : defaultName,
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
  };

  const result = await files.writeText(
    "data",
    workflowPath(id),
    JSON.stringify(workflow, null, 2),
    { exclusive: true },
  );

  if (!result.ok) {
    throw new Error(resultMessage(result, "Could not create workflow"));
  }

  return workflow;
}

export async function saveWorkflow(
  files: WorkflowFiles,
  input: {
    id: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    name?: unknown;
  },
): Promise<WorkflowDocument> {
  if (!isValidId(input.id)) {
    throw new Error("Invalid workflow data");
  }

  const path = workflowPath(input.id);
  const existing = await files.readText("data", path);
  if (!existing.ok) throw new Error("Workflow not found");

  let previous: unknown;
  try {
    previous = JSON.parse(existing.text);
  } catch {
    throw new Error("Existing workflow file is invalid");
  }

  if (!isWorkflowDocument(previous)) {
    throw new Error("Existing workflow file is invalid");
  }

  const now = new Date().toISOString();
  const workflow: WorkflowDocument = {
    id: input.id,
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : previous.name || `workspace-${input.id}`,
    createdAt: previous.createdAt || now,
    updatedAt: now,
    nodes: input.nodes,
    edges: input.edges,
  };

  const result = await files.writeText(
    "data",
    path,
    JSON.stringify(workflow, null, 2),
  );
  if (!result.ok) {
    throw new Error(resultMessage(result, "Could not save workflow"));
  }

  return workflow;
}

export async function loadWorkflow(
  files: WorkflowFiles,
  id: string,
): Promise<WorkflowDocument> {
  if (!isValidId(id)) throw new Error("Invalid workflow ID");

  const result = await files.readText("data", workflowPath(id));
  if (!result.ok) {
    throw new Error(resultMessage(result, "Could not load workflow"));
  }

  let workflow: unknown;
  try {
    workflow = JSON.parse(result.text);
  } catch {
    throw new Error("Workflow file contains invalid JSON");
  }

  if (!isValidWorkflowDocument(workflow, id)) {
    throw new Error("Invalid workflow file structure");
  }

  return workflow;
}

export async function deleteWorkflow(
  files: WorkflowFiles,
  id: string,
): Promise<string> {
  if (!isValidId(id)) throw new Error("Invalid workflow ID");

  const result = await files.trash("data", workflowPath(id));
  if (!result.ok) {
    throw new Error(resultMessage(result, "Could not delete workflow"));
  }

  return id;
}
