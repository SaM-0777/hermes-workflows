import {
  Position,
  type Node,
  type NodeHandle,
  type NodeProps,
} from "@xyflow/react";
import { Folder, FolderOpen } from "lucide-react";

import { BaseNode, type NodeStatus } from "../base-node";

export type DataNodeProps = {
  status?: NodeStatus;
  sourceType?: "local";
  directory?: string;
  fileCount?: number;
};
export type DataNodeType = Node<DataNodeProps>;

const handles: NodeHandle[] = [
  { id: "data-output", type: "source", position: Position.Right, x: 0, y: 0 },
];

export function DataNode({ data, selected }: NodeProps<DataNodeType>) {
  const directory = data.directory ?? "No directory selected";

  return (
    <BaseNode
      title="Data"
      category="INPUT: DATA SOURCE"
      icon={Folder}
      status={data.status ?? "idle"}
      selected={selected}
      handles={handles}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2.5">
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground">LOCAL DIRECTORY</p>
            <p className="truncate text-xs font-medium">{directory}</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Files discovered</span>
          <span className="font-medium">{data.fileCount ?? "—"}</span>
        </div>
      </div>
    </BaseNode>
  );
}
