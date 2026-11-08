import {
  Position,
  type Node,
  type NodeHandle,
  type NodeProps,
} from "@xyflow/react";
import { FileOutput } from "lucide-react";

import { BaseNode, type NodeStatus } from "../base-node";

export type OutputNodeData = {
  status?: NodeStatus;
  format?: "json" | "csv";
  destination?: string;
};

export type OutputNodeType = Node<OutputNodeData>;

const handles: NodeHandle[] = [
  { id: "result-input", type: "target", position: Position.Left, x: 0, y: 0 },
];

export function OutputNode({ data, selected }: NodeProps<OutputNodeType>) {
  return (
    <BaseNode
      title="Output"
      category="OUTPUT: RESULTS"
      icon={FileOutput}
      status={data.status ?? "idle"}
      selected={selected}
      handles={handles}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Format</span>
          <span className="font-medium uppercase">{data.format ?? "JSON"}</span>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Destination</span>
          <span className="truncate font-medium">
            {data.destination ?? "Workflow result"}
          </span>
        </div>
      </div>
    </BaseNode>
  );
}
