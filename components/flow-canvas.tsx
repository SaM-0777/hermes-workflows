import { useCallback, useEffect } from "react";
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
  type Edge,
  type IsValidConnection,
} from "@xyflow/react";
import { Code2 } from "lucide-react";
import type { NodeData, WorkflowNode } from "@/lib/node";
import { NodeWidget } from "./node-widget";
import { BaseNode } from "./base-node";

const nodeTypes = {
  base: ({ id, data, selected }: NodeProps<WorkflowNode>) => (
    <BaseNode id={id} data={data} icon={Code2} selected={selected} />
  ),
};

export default function FlowCanvas() {
  const { screenToFlowPosition, getNode } = useReactFlow<WorkflowNode, Edge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const isValidConnection: IsValidConnection<Edge> = useCallback(
    (connection) => {
      if (
        !connection.source ||
        !connection.target ||
        !connection.sourceHandle ||
        !connection.targetHandle ||
        connection.source === connection.target
      ) {
        return false;
      }

      const sourceNode = getNode(connection.source);
      const targetNode = getNode(connection.target);

      const output = sourceNode?.data.io?.outputs.find(
        (port) => port.name === connection.sourceHandle,
      );

      const input = targetNode?.data.io?.inputs.find(
        (port) => port.name === connection.targetHandle,
      );

      if (!output || !input) return false;

      return (
        output.type === "Any" ||
        input.type === "Any" ||
        output.type === input.type
      );
    },
    [getNode],
  );

  useEffect(() => {
    setEdges((currentEdges) => {
      const validEdges = currentEdges.filter((edge) => isValidConnection(edge));
      return validEdges.length === currentEdges.length
        ? currentEdges
        : validEdges;
    });
  }, [nodes, isValidConnection, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: {
              stroke: "#64748b",
              strokeWidth: 2,
            },
          },
          currentEdges,
        ),
      );
    },
    [setEdges],
  );
  
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
        deleteKeyCode={["Backspace", "Delete"]}
        edgesFocusable
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
          style: {
            stroke: "#64748b",
            strokeWidth: 2,
          },
        }}
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

      <NodeWidget onAddNode={onAddNode} />
    </main>
  );
}
