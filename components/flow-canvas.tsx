import { useCallback, useState } from "react";
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
} from "@xyflow/react";
import { Code2 } from "lucide-react";
import NodeWidget, { type NodeItem } from "./node-widget";

export default function FlowCanvas() {
  const { addNodes, screenToFlowPosition, getNodes } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [savedNodes, setSavedNodes] = useState<NodeItem[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);
  const [nodeEditorOpen, setNodeEditorOpen] = useState(false);

  const onConnect = (connection: Connection) => {
    setEdges((currentEdges) => addEdge(connection, currentEdges));
  };

  const onCreateNode = useCallback(() => {
    const newNode: NodeItem = {
      id: crypto.randomUUID(),
      name: "CustomComponent",
      displayName: "Custom Component",
      description: "Use as a template to create your own component.",
      icon: Code2,
      parameters: {},
      category: "Custom",
      inputs: 0,
      outputs: 0,
      source: "custom",
      updatedAt: Date.now(),
    };

    setSelectedNode(newNode);
    setNodeEditorOpen(true);
  }, []);
  const onAddNode = useCallback(
    (node: NodeItem) => {
      const id = crypto.randomUUID();
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      addNodes({
        id,
        type: "custom",
        position,
        data: {
          blueprintId: node.id,
          blueprint: structuredClone(node),
          label: node.displayName,
          parameters: structuredClone(node.parameters ?? {}),
        },
      });
    },
    [addNodes, screenToFlowPosition],
  );
  const onEditNode = useCallback((node: NodeItem) => {
    setSelectedNode(structuredClone(node));
    setNodeEditorOpen(true);
  }, []);
  //const onSaveNode = useCallback((updatedNode: NodeItem) => {
  //  setSavedNodes((current) =>
  //    current.map((node) => (node.id === updatedNode.id ? updatedNode : node)),
  //  );
  //  setSelectedNode(null);
  //  setNodeEditorOpen(false);
  //}, []);
  const onDuplicateNode = useCallback((node: NodeItem) => {
    const duplicate: NodeItem = {
      ...structuredClone(node),
      id: crypto.randomUUID(),
      name: `${node.name}_copy`,
      displayName: `${node.displayName} Copy`,
    };

    setSavedNodes((current) => [...current, duplicate]);
  }, []);
  const onDeleteNode = useCallback((node: NodeItem) => {
    const confirmed = window.confirm(
      `Delete "${node.displayName}" from your saved components? Existing workflow instances will remain unchanged.`,
    );
    if (!confirmed) return;
    setSavedNodes((current) => current.filter((item) => item.id !== node.id));
  }, []);

  return (
    <main className="relative w-full h-full text-foreground">
      <ReactFlow
        nodes={nodes}
        edges={edges}
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

      <NodeWidget
        onAddNode={onAddNode}
        onEditNode={onEditNode}
        onCreateNode={onCreateNode}
        onDeleteNode={onDeleteNode}
        onDuplicateNode={onDuplicateNode}
      />
    </main>
  );
}
