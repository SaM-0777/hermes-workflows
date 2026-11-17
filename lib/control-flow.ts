import type { Edge } from "@xyflow/react";

/**
 * Control-flow edges.
 *
 * A data edge carries a value into a named input port, so it only exists when
 * both nodes declare matching ports. A control edge carries nothing: it says
 * "run the target after the source finished", which is how a node with no
 * outputs — or one whose result is not an object — can sit in the middle of a
 * graph.
 *
 * The handles are reserved names that exist on every node regardless of its io:
 *   flow  (right side)  control leaves this node
 *   then  (left side)   this node runs after the upstream node
 * A control edge is always flow -> then. No port may be named flow or then.
 */
export const CONTROL_OUT_HANDLE = "flow";
export const CONTROL_IN_HANDLE = "then";

export const CONTROL_EDGE_KIND = "control";

/** Edge shape as persisted: `kind` and `label` are our additions. */
export type WorkflowEdge = Edge & {
  kind?: "control" | "data";
  label?: string;
};

export const DATA_EDGE_STYLE = {
  stroke: "#64748b",
  strokeWidth: 2,
} as const;

export const CONTROL_EDGE_STYLE = {
  // Same stroke as a data edge; the dash is what tells them apart.
  stroke: "#64748b",
  strokeWidth: 2,
  strokeDasharray: "6 4",
} as const;

/** True when a drag/pair of handles is the control pair. */
export function isControlHandlePair(
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
): boolean {
  return (
    sourceHandle === CONTROL_OUT_HANDLE && targetHandle === CONTROL_IN_HANDLE
  );
}

/** True when either end claims to be a control handle, in any combination. */
export function touchesControlHandle(
  handle: string | null | undefined,
): boolean {
  return handle === CONTROL_OUT_HANDLE || handle === CONTROL_IN_HANDLE;
}

/**
 * A saved control edge. The handle pair is authoritative; `kind` is honoured too
 * so an edge written by the tools stays control even if a handle name is edited
 * by hand.
 */
export function isControlEdge(edge: {
  sourceHandle?: string | null;
  targetHandle?: string | null;
  kind?: string;
}): boolean {
  if (edge.kind === CONTROL_EDGE_KIND) return true;
  return isControlHandlePair(edge.sourceHandle, edge.targetHandle);
}

/** Style an edge according to its kind. */
export function edgeStyleFor(kind: "control" | "data" | undefined) {
  return kind === CONTROL_EDGE_KIND ? { ...CONTROL_EDGE_STYLE } : { ...DATA_EDGE_STYLE };
}
