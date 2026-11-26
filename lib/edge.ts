import {
  edgeStyleFor,
  CONTROL_EDGE_KIND,
  type WorkflowEdge,
} from "./control-flow";

export function normalizeEdges(edges: WorkflowEdge[]): WorkflowEdge[] {
  return edges.map((edge) => {
    const kind = edge.kind === CONTROL_EDGE_KIND ? CONTROL_EDGE_KIND : "data";

    return {
      ...edge,
      animated: false,
      style: edgeStyleFor(kind),
    };
  });
}
