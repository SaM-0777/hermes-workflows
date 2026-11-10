import { useCallback, useEffect, useState } from "react";
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
  Panel,
} from "@xyflow/react";
import { Code2, Play, Save, Square, Trash2 } from "lucide-react";
import type { NodeData, WorkflowNode } from "@/lib/node";
import { NodeWidget } from "./node-widget";
import { BaseNode } from "./base-node";
import { Button } from "./ui/button";
import DeleteWorkflow from "./delete-flow";
import { buildFlowGraph } from "@/lib/flow-graph";

const nodeTypes = {
  base: ({ id, data, selected }: NodeProps<WorkflowNode>) => (
    <BaseNode id={id} data={data} icon={Code2} selected={selected} />
  ),
};

export default function FlowCanvas() {
  const { screenToFlowPosition, getNode } = useReactFlow<WorkflowNode, Edge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
    const workflowId = new URLSearchParams(window.location.search).get(
      "workflowId",
    );
    if (!workflowId) return;

    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      cleanup();
      console.error("Workflow loading timed out");
    }, 30_000);

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const response = event.data;

      if (
        response?.protocol !== "workflow-studio:v1" ||
        response?.requestId !== requestId ||
        response?.type !== "WORKFLOW_LOAD_RESULT"
      ) {
        return;
      }

      cleanup();

      if (!response.ok || !response.workflow) {
        console.error(response.error || "Could not load workflow");
        return;
      }

      setNodes(response.workflow.nodes);
      setEdges(response.workflow.edges);
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    };

    window.addEventListener("message", handleMessage);
    window.parent.postMessage(
      {
        protocol: "workflow-studio:v1",
        requestId,
        type: "WORKFLOW_LOAD",
        payload: { id: workflowId },
      },
      "*",
    );

    return cleanup;
  }, [setNodes, setEdges]);

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

  const handleRun = async () => {
    setIsRunning(true);
    try {
      const graph = await buildFlowGraph(nodes, edges);
      const result = await graph.invoke({
        results: {},
      });
      console.log("Workflow result:", result);
    } catch (error) {
      console.log(error);
    } finally {
      setIsRunning(false);
    }
  };
  const handleStop = () => {
    setIsRunning(false);
  };
  const handleSave = async () => {
    if (isSaving) return;

    const workflowId = new URLSearchParams(window.location.search).get(
      "workflowId",
    );
    if (!workflowId) {
      console.error("Workflow ID is missing");
      return;
    }

    setIsSaving(true);

    const requestId = crypto.randomUUID();

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error("Save request timed out"));
        }, 30_000);
        const handleMessage = (event: MessageEvent) => {
          if (event.source !== window.parent) return;
          const response = event.data;
          if (
            response?.protocol !== "workflow-studio:v1" ||
            response?.requestId !== requestId ||
            response?.type !== "WORKFLOW_SAVE_RESULT"
          ) {
            return;
          }

          cleanup();

          if (!response.ok) {
            reject(new Error(response.error || "Could not save workflow"));
            return;
          }

          resolve();
        };

        const cleanup = () => {
          window.clearTimeout(timeout);
          window.removeEventListener("message", handleMessage);
        };

        window.addEventListener("message", handleMessage);
        window.parent.postMessage(
          {
            protocol: "workflow-studio:v1",
            requestId,
            type: "WORKFLOW_SAVE",
            payload: {
              id: workflowId,
              nodes,
              edges,
            },
          },
          "*",
        );
      });
    } catch (error) {
      console.error("Workflow save failed:", error);
    } finally {
      setIsSaving(false);
    }
  };
  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };

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

        <Panel position="top-right" className="flex items-center gap-2">
          {isRunning ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStop}
              className="gap-2 shadow-sm"
            >
              <Square className="size-3.5 fill-current" />
              Stop workflow
            </Button>
          ) : (
            <Button size="sm" disabled={isRunning} onClick={handleRun} className="gap-2 shadow-sm">
              <Play className="size-3.5 fill-current" />
              Run workflow
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={handleSave}
            className="gap-2 bg-background shadow-sm"
          >
            <Save className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="gap-2 bg-background text-destructive shadow-sm hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </Panel>
      </ReactFlow>

      <NodeWidget onAddNode={onAddNode} />

      <DeleteWorkflow
        open={deleteDialogOpen}
        setOpenChange={setDeleteDialogOpen}
      />
    </main>
  );
}
