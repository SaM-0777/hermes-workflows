import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { Edge } from "@xyflow/react";
import {
  isRecord,
  runNode,
  type NodeRuntimeState,
  type WorkflowNode,
} from "@/lib/node";

const WorkflowState = Annotation.Root({
  results: Annotation<Record<string, unknown>>({
    reducer: (current, update) => ({
      ...current,
      ...update,
    }),
    default: () => ({}),
  }),
});

export async function buildFlowGraph(
  nodes: WorkflowNode[],
  edges: Edge[],
  onNodeStateChange?: (nodeId: string, state: NodeRuntimeState) => void,
) {
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

  const nodeNames = connectedNodes.map((node) => node.id);
  const graph = new StateGraph(WorkflowState, {
    nodes: nodeNames,
  });

  for (const node of connectedNodes) {
    graph.addNode(node.id, async (state) => {
      const startedAt = Date.now();
      const inputs: Record<string, unknown> = {};

      try {
        const incomingEdges = connectedEdges.filter(
          (edge) => edge.target === node.id,
        );

        for (const edge of incomingEdges) {
          const sourceHandle = edge.sourceHandle;
          const targetHandle = edge.targetHandle;
          if (!sourceHandle || !targetHandle) {
            throw new Error(
              `Missing handle information for connection ${edge.source} → ${edge.target}`,
            );
          }

          const sourceResult = state.results[edge.source];
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

        const result = await runNode(node, inputs);
        const completedAt = Date.now();

        onNodeStateChange?.(node.id, {
          status: "success",
          inputs,
          output: result.output,
          startedAt,
          completedAt,
        });

        return {
          results: {
            [node.id]: {
              status: result.status,
              output: result.output,
            },
          },
        };
      } catch (error) {
        const completedAt = Date.now();
        onNodeStateChange?.(node.id, {
          status: "error",
          inputs,
          error: {
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof Error && error.stack
              ? { traceback: error.stack }
              : {}),
          },
          startedAt,
          completedAt,
        });

        throw error;
      }
    });
  }

  const incoming = new Set(connectedEdges.map((edge) => edge.target));
  const outgoing = new Set(connectedEdges.map((edge) => edge.source));

  for (const node of connectedNodes) {
    if (!incoming.has(node.id)) {
      graph.addEdge(START, node.id);
    }
    if (!outgoing.has(node.id)) {
      graph.addEdge(node.id, END);
    }
  }
  for (const edge of connectedEdges) {
    graph.addEdge(edge.source, edge.target);
  }

  const compiledGraph = graph.compile();
  return compiledGraph;
}
