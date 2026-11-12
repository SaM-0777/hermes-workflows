import type { Edge } from "@xyflow/react";
import {
  isRecord,
  runNode,
  type NodeRuntimeState,
  type WorkflowNode,
} from "@/lib/node";

export type WorkflowExecutionEvent =
  | {
      type: "node.started";
      nodeId: string;
      timestamp: number;
      inputs: Record<string, unknown>;
    }
  | {
      type: "node.completed";
      nodeId: string;
      timestamp: number;
      inputs: Record<string, unknown>;
      output: unknown;
      duration: number;
    }
  | {
      type: "node.failed";
      nodeId: string;
      timestamp: number;
      inputs: Record<string, unknown>;
      error: {
        message: string;
        traceback?: string;
      };
      duration: number;
    };

export type WorkflowExecutionLogs = {
  executionId: string;
  workflowId: string;
  status: "completed" | "failed";
  startedAt: number;
  completedAt: number;
  duration: number;
  events: WorkflowExecutionEvent[];
  nodes: Record<string, NodeRuntimeState>;
  outputs: Record<string, unknown>;
  error?: {
    message: string;
    traceback?: string;
  };
};

/** Per-node outcome kept between steps, mirroring the shape the graph used to
 *  merge into `state.results`. */
type NodeResult = {
  status: unknown;
  output: unknown;
};

export type FlowGraphRunner = {
  invoke: (input?: {
    results?: Record<string, NodeResult>;
  }) => Promise<{ results: Record<string, NodeResult> }>;
};

function errorDetails(error: unknown): { message: string; traceback?: string } {
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { traceback: error.stack } : {}),
  };
}

/**
 * Build an executable plan for a workflow.
 *
 * This replaces the previous LangGraph `StateGraph`: same scheduling contract
 * (a node runs once every parent has produced the handles it consumes, so
 * independent branches run concurrently and joins wait), same node events and
 * same error surface — implemented as a local dependency walk instead of a
 * ~900 KB runtime dependency.
 */
export async function buildFlowGraph(
  nodes: WorkflowNode[],
  edges: Edge[],
  onNodeStateChange?: (nodeId: string, state: NodeRuntimeState) => void,
  onExecutionEvent?: (event: WorkflowExecutionEvent) => void,
): Promise<FlowGraphRunner> {
  const connectedIds = new Set<string>();

  for (const edge of edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }

  const connectedNodes = nodes.filter((node) => connectedIds.has(node.id));
  if (connectedNodes.length === 0) {
    throw new Error("No connected nodes found in workflow.");
  }

  const connectedNodeIds = new Set(connectedNodes.map((node) => node.id));
  const connectedEdges = edges.filter(
    (edge) =>
      connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target),
  );

  const incomingEdges = new Map<string, Edge[]>(
    connectedNodes.map((node) => [node.id, []]),
  );

  for (const edge of connectedEdges) {
    incomingEdges.get(edge.target)?.push(edge);
  }

  /** Distinct parents per node: several edges from one parent (different
   *  handles) all settle together, so dependencies are counted per parent. */
  const parents = new Map<string, string[]>(
    connectedNodes.map((node) => {
      const sources = new Set(
        (incomingEdges.get(node.id) ?? []).map((edge) => edge.source),
      );
      return [node.id, [...sources]];
    }),
  );

  const runNodeWithInputs = async (
    node: WorkflowNode,
    results: Record<string, NodeResult>,
  ): Promise<NodeResult> => {
    const startedAt = Date.now();
    const inputs: Record<string, unknown> = {};

    try {
      for (const edge of incomingEdges.get(node.id) ?? []) {
        const sourceHandle = edge.sourceHandle;
        const targetHandle = edge.targetHandle;
        if (!sourceHandle || !targetHandle) {
          throw new Error(
            `Missing handle information for connection ${edge.source} → ${edge.target}`,
          );
        }

        const sourceResult = results[edge.source];
        if (!isRecord(sourceResult) || !isRecord(sourceResult.output)) {
          throw new Error(
            `Output from upstream node "${edge.source}" is unavailable.`,
          );
        }
        if (!(sourceHandle in sourceResult.output)) {
          throw new Error(
            `Output "${sourceHandle}" not found on node "${edge.source}".`,
          );
        }

        inputs[targetHandle] = sourceResult.output[sourceHandle];
      }

      onNodeStateChange?.(node.id, {
        status: "running",
        inputs,
        startedAt,
      });

      onExecutionEvent?.({
        type: "node.started",
        nodeId: node.id,
        timestamp: startedAt,
        inputs,
      });

      const result = await runNode(node, inputs);
      const completedAt = Date.now();

      onNodeStateChange?.(node.id, {
        status: "success",
        inputs,
        output: result.output,
        startedAt,
        completedAt,
      });

      onExecutionEvent?.({
        type: "node.completed",
        nodeId: node.id,
        timestamp: completedAt,
        inputs,
        output: result.output,
        duration: completedAt - startedAt,
      });

      return { status: result.status, output: result.output };
    } catch (error) {
      const completedAt = Date.now();
      const details = errorDetails(error);

      onNodeStateChange?.(node.id, {
        status: "error",
        inputs,
        error: details,
        startedAt,
        completedAt,
      });

      onExecutionEvent?.({
        type: "node.failed",
        nodeId: node.id,
        timestamp: completedAt,
        inputs,
        error: details,
        duration: completedAt - startedAt,
      });

      throw error;
    }
  };

  const invoke = async (
    input?: { results?: Record<string, NodeResult> },
  ): Promise<{ results: Record<string, NodeResult> }> => {
    const results: Record<string, NodeResult> = { ...(input?.results ?? {}) };
    const done = new Set(Object.keys(results));
    const scheduled = new Set<string>();

    // Repeatedly run every node whose parents have all finished. A wave runs
    // concurrently, so independent branches interleave the way the graph did.
    for (;;) {
      const ready = connectedNodes.filter(
        (node) =>
          !done.has(node.id) &&
          !scheduled.has(node.id) &&
          (parents.get(node.id) ?? []).every((parent) => done.has(parent)),
      );

      if (ready.length === 0) break;

      for (const node of ready) scheduled.add(node.id);

      await Promise.all(
        ready.map(async (node) => {
          results[node.id] = await runNodeWithInputs(node, results);
          done.add(node.id);
        }),
      );
    }

    const unfinished = connectedNodes.filter((node) => !done.has(node.id));
    if (unfinished.length > 0) {
      const ids = unfinished.map((node) => node.id).join(", ");
      throw new Error(
        `Workflow cannot run: ${ids} never became ready (check for a cycle).`,
      );
    }

    return { results };
  };

  return { invoke };
}
