import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";

import { DataNode } from "@/components/nodes/data-node";
import { ObjectDetectionNode } from "@/components/nodes/object-detection-node";
import { OutputNode } from "@/components/nodes/output-node";

import "@xyflow/react/dist/style.css";

const nodeTypes = {
  data: DataNode,
  objectDetection: ObjectDetectionNode,
  workflowOutput: OutputNode,
};

const initialNodes: Node[] = [
  {
    id: "data-1",
    type: "data",
    position: { x: 100, y: 150 },
    data: {
      status: "ready",
      directory: "robotics-dataset/",
      fileCount: 1240,
    },
  },
  {
    id: "detection-1",
    type: "objectDetection",
    position: { x: 440, y: 150 },
    data: {
      status: "idle",
      model: "yolo26x.pt",
      confidence: 0.25,
      device: "Auto",
    },
  },
  {
    id: "output-1",
    type: "workflowOutput",
    position: { x: 800, y: 150 },
    data: {
      status: "idle",
      format: "json",
      destination: "Workflow result",
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: "data-detection",
    source: "data-1",
    sourceHandle: "data-output",
    target: "detection-1",
    targetHandle: "frames-input",
    animated: true,
  },
  {
    id: "detection-output",
    source: "detection-1",
    sourceHandle: "detections-output",
    target: "output-1",
    targetHandle: "result-input",
    animated: true,
  },
];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = (connection: Connection) => {
    setEdges((currentEdges) => addEdge(connection, currentEdges));
  };

  return (
    <main className="relative h-dvh w-full bg-background text-foreground">
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
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border)"
        />
        <Controls />
        <MiniMap nodeColor="#3b82f6" maskColor="rgba(0, 0, 0, 0.65)" />
      </ReactFlow>
    </main>
  );
}
