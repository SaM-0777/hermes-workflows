import { useCallback } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import { Code2 } from "lucide-react";
import { NodeWidget } from "./node-widget";
import { BaseNode } from "./base-node";
import type { NodeData, WorkflowNode } from "@/lib/node";

const nodeTypes = {
  base: ({ data, selected }: NodeProps<WorkflowNode>) => (
    <BaseNode data={data} icon={Code2} selected={selected} />
  ),
};

export default function FlowCanvas() {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = (connection: Connection) => {
    setEdges((currentEdges) => addEdge(connection, currentEdges));
  };

  const onCreateNode = useCallback(() => {}, []);
  const onAddNode = useCallback(
    (data: NodeData) => {
      const id = crypto.randomUUID();
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      setNodes((currentNodes) => [
        ...currentNodes,
        {
          type: "base",
          id,
          position,
          data,
        },
      ]);
    },
    [screenToFlowPosition, setNodes],
  );

  return (
    <main className="relative w-full h-full text-foreground">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        colorMode="dark"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border)"
        />
        <Controls />
        <MiniMap
          position="bottom-right"
          nodeColor="#3b82f6"
          maskColor="rgba(0, 0, 0, 0.65)"
          style={{
            position: "absolute",
            top: "auto",
            left: "auto",
            right: 12,
            bottom: 12,
          }}
        />
      </ReactFlow>

      <NodeWidget onAddNode={onAddNode} onCreateNode={onCreateNode} />
    </main>
  );
}
