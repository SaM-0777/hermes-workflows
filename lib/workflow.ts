import type { Edge, Node } from "@xyflow/react";

const PROTOCOL = "workflow-studio:v1";
const REQUEST_TIMEOUT = 15_000;

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

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<string, PendingRequest>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Receive responses from the native Hermes plugin.
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent) return;

  const message = event.data;

  if (
    !isRecord(message) ||
    message.protocol !== PROTOCOL ||
    typeof message.requestId !== "string" ||
    typeof message.type !== "string" ||
    !message.type.endsWith("_RESULT")
  ) {
    return;
  }

  const pending = pendingRequests.get(message.requestId);

  if (!pending) return;

  clearTimeout(pending.timeout);
  pendingRequests.delete(message.requestId);

  if (message.ok !== true) {
    pending.reject(
      new Error(
        typeof message.error === "string"
          ? message.error
          : "Workflow operation failed",
      ),
    );
    return;
  }

  pending.resolve(message);
});

function request<T>(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (window.parent === window) {
      reject(new Error("Workflow Studio must run inside Hermes Desktop"));
      return;
    }

    const requestId = crypto.randomUUID();

    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Request timed out: ${type}`));
    }, REQUEST_TIMEOUT);

    pendingRequests.set(requestId, {
      resolve: (value) => resolve(value as T),
      reject,
      timeout,
    });

    window.parent.postMessage(
      {
        protocol: PROTOCOL,
        requestId,
        type,
        payload,
      },
      "*",
    );
  });
}

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  const result = await request<{ workflows: WorkflowSummary[] }>(
    "WORKFLOW_LIST",
  );

  return result.workflows;
}

export async function createWorkflow(
  name?: string,
): Promise<Workflow> {
  const result = await request<{ workflow: Workflow }>("WORKFLOW_CREATE", {
    name,
  });

  return result.workflow;
}

export async function saveWorkflow(
  workflow: Pick<Workflow, "id" | "nodes" | "edges"> & {
    name?: string;
  },
): Promise<Workflow> {
  const result = await request<{ workflow: Workflow }>(
    "WORKFLOW_SAVE",
    workflow,
  );

  return result.workflow;
}

export async function loadWorkflow(id: string): Promise<Workflow> {
  const result = await request<{ workflow: Workflow }>("WORKFLOW_LOAD", { id });

  return result.workflow;
}

export async function deleteWorkflow(id: string): Promise<string> {
  const result = await request<{ id: string }>("WORKFLOW_DELETE", { id });

  return result.id;
}
