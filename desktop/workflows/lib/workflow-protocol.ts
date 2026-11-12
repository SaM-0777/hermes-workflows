import {
  createWorkflow,
  deleteWorkflow,
  loadWorkflow,
  readWorkflows,
  saveWorkflow,
  readNodeLibrary,
  saveLibraryNode,
  updateLibraryNode,
  deleteLibraryNode,
  type WorkflowRest,
} from "./workflow-storage";
import {
  isRecord,
  isValidId,
  isValidWorkflowDocument,
  type WorkflowDocument,
} from "./workflow-validation";

export const PROTOCOL = "workflow-studio:v1";

export interface WorkflowMessage {
  protocol: typeof PROTOCOL;
  requestId: string;
  type: string;
  payload?: Record<string, unknown>;
}

export function isWorkflowMessage(value: unknown): value is WorkflowMessage {
  return (
    isRecord(value) &&
    value.protocol === PROTOCOL &&
    typeof value.requestId === "string" &&
    typeof value.type === "string"
  );
}

export function sendResponse(
  target: Window | null | undefined,
  requestId: string,
  type: string,
  payload: Record<string, unknown> = {},
): void {
  target?.postMessage(
    {
      protocol: PROTOCOL,
      requestId,
      type,
      ...payload,
    },
    "*",
  );
}

function assertPayload(message: WorkflowMessage): Record<string, unknown> {
  const payload = message.payload ?? {};
  if (!isRecord(payload)) throw new Error("Invalid request payload");
  return payload;
}

export async function handleWorkflowRequest(
  rest: WorkflowRest,
  message: WorkflowMessage,
): Promise<Record<string, unknown>> {
  const payload = assertPayload(message);

  if (message.type === "WORKFLOW_LIST") {
    const workflows = await readWorkflows(rest);
    return {
      workflows: workflows.filter((workflow) => isValidId(workflow.id)),
    };
  }

  if (message.type === "WORKFLOW_CREATE") {
    const name =
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim().slice(0, 120)
        : undefined;

    return { workflow: await createWorkflow(rest, name) };
  }

  if (message.type === "WORKFLOW_SAVE") {
    const { id, nodes, edges, name } = payload;

    if (!isValidId(id) || !Array.isArray(nodes) || !Array.isArray(edges)) {
      throw new Error("Invalid workflow data");
    }

    return {
      workflow: await saveWorkflow(rest, {
        id,
        nodes,
        edges,
        name,
      }),
    };
  }

  if (message.type === "WORKFLOW_LOAD") {
    const { id } = payload;
    if (!isValidId(id)) throw new Error("Invalid workflow ID");
    return { workflow: await loadWorkflow(rest, id) };
  }

  if (message.type === "WORKFLOW_DELETE") {
    const { id } = payload;
    if (!isValidId(id)) throw new Error("Invalid workflow ID");
    return { id: await deleteWorkflow(rest, id) };
  }

  if (message.type === "NODE_LIBRARY_LIST") {
    const nodes = await readNodeLibrary(rest);
    return { nodes };
  }

  if (message.type === "NODE_LIBRARY_SAVE") {
    const { data } = payload;
    if (!isRecord(data)) {
      throw new Error("Invalid node data");
    }
    const node = await saveLibraryNode(rest, data);
    return { node };
  }

  if (message.type === "NODE_LIBRARY_UPDATE") {
    const { id, data } = payload;
    if (!isValidId(id) || !isRecord(data)) {
      throw new Error("Invalid node update data");
    }
    const node = await updateLibraryNode(rest, id, data);
    return { node };
  }

  if (message.type === "NODE_LIBRARY_DELETE") {
    const { id } = payload;
    if (!isValidId(id)) {
      throw new Error("Invalid node ID");
    }
    return { id: await deleteLibraryNode(rest, id) };
  }

  throw new Error("Unsupported workflow operation");
}

export function isWorkflowPayload(value: unknown): value is WorkflowDocument {
  return isValidWorkflowDocument(value);
}
