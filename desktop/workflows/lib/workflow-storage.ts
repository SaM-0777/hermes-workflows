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
  const defaultName = `workflow-${id}`;
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

export const NODE_LIBRARY_FILE = "node-library.json";

export interface SavedNode<TData = unknown> {
  id: string;
  data: TData;
  createdAt: string;
  updatedAt: string;
}

export async function writeNodeLibrary<TData>(
  files: WorkflowFiles,
  nodes: SavedNode<TData>[],
): Promise<void> {
  const result = await files.writeText(
    "data",
    NODE_LIBRARY_FILE,
    JSON.stringify(nodes, null, 2),
  );
  if (!result.ok) {
    throw new Error(
      result.message || result.error || "Could not save node library",
    );
  }
}

export async function readNodeLibrary<TData = unknown>(
  files: WorkflowFiles,
): Promise<SavedNode<TData>[]> {
  const result = await files.readText("data", NODE_LIBRARY_FILE);
  if (!result.ok) {
    if (result.error === "not-found") return [];
    throw new Error(
      result.message || result.error || "Could not load node library",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    throw new Error("Node library contains invalid JSON");
  }

  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (node) =>
        node !== null &&
        typeof node === "object" &&
        typeof node.id === "string" &&
        typeof node.data === "object" &&
        node.data !== null &&
        typeof node.createdAt === "string" &&
        typeof node.updatedAt === "string",
    )
  ) {
    throw new Error("Invalid node library structure");
  }
  return parsed as SavedNode<TData>[];
}

export async function saveLibraryNode<TData>(
  files: WorkflowFiles,
  data: TData,
): Promise<SavedNode<TData>> {
  const nodes = await readNodeLibrary<TData>(files);
  const now = new Date().toISOString();
  const savedNode: SavedNode<TData> = {
    id: crypto.randomUUID(),
    data,
    createdAt: now,
    updatedAt: now,
  };
  await writeNodeLibrary(files, [...nodes, savedNode]);
  return savedNode;
}

export async function updateLibraryNode<TData>(
  files: WorkflowFiles,
  id: string,
  data: TData,
): Promise<SavedNode<TData>> {
  const nodes = await readNodeLibrary<TData>(files);
  const existingNode = nodes.find((node) => node.id === id);
  if (!existingNode) {
    throw new Error("Node not found");
  }
  const updatedNode: SavedNode<TData> = {
    ...existingNode,
    data,
    updatedAt: new Date().toISOString(),
  };
  const updatedNodes = nodes.map((node) =>
    node.id === id ? updatedNode : node,
  );
  await writeNodeLibrary(files, updatedNodes);
  return updatedNode;
}

export async function deleteLibraryNode(
  files: WorkflowFiles,
  id: string,
): Promise<string> {
  const nodes = await readNodeLibrary(files);
  const updatedNodes = nodes.filter((node) => node.id !== id);
  if (updatedNodes.length === nodes.length) {
    throw new Error("Node not found");
  }
  await writeNodeLibrary(files, updatedNodes);
  return id;
}

