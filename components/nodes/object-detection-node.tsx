import {
  Position,
  type Node,
  type NodeHandle,
  type NodeProps,
} from "@xyflow/react";
import { ScanEye } from "lucide-react";

import { BaseNode, type NodeStatus } from "../base-node";

export type ObjectDetectionNodeData = {
  status?: NodeStatus;
  model?: string;
  confidence?: number;
  device?: string;
};

export type ObjectDetectionNodeType = Node<ObjectDetectionNodeData>;

const handles: NodeHandle[] = [
  { id: "frames-input", type: "target", position: Position.Left, x: 0, y: 0 },
  {
    id: "detections-output",
    type: "source",
    position: Position.Right,
    x: 0,
    y: 0,
  },
];

export function ObjectDetectionNode({
  data,
  selected,
}: NodeProps<ObjectDetectionNodeType>) {
  return (
    <BaseNode
      title="Object Detection"
      category="VISION · DETECTION"
      icon={ScanEye}
      status={data.status ?? "idle"}
      selected={selected}
      handles={handles}
    >
      <div className="space-y-2.5">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">MODEL</p>
          <div className="rounded-md border bg-muted/40 px-2.5 py-2">
            <p className="truncate text-xs font-medium">
              {data.model ?? "yolo26x.pt"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Confidence</span>
          <span className="font-medium">
            {((data.confidence ?? 0.25) * 100).toFixed(0)}%
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Device</span>
          <span className="font-medium">{data.device ?? "Auto"}</span>
        </div>
      </div>
    </BaseNode>
  );
}
