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
import type { NodeData, WorkflowNode, WorkflowRuntimeState } from "@/lib/node";
import { NodeWidget } from "./node-widget";
import { BaseNode } from "./base-node";
import { Button } from "./ui/button";
import DeleteWorkflow from "./delete-flow";
import { buildFlowGraph } from "@/lib/flow-graph";
import { getWorkflowId } from "@/lib/host";
import { saveWorkflow, loadWorkflow } from "@/lib/workflow";
import {
  useNodeRuntimeState,
  WorkflowRuntimeProvider,
} from "@/providers/workflow-provider";
import { toast } from "sonner";
import { WorkflowApprovalDialog } from "./approval-dialog";

function WorkflowBaseNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const runtime = useNodeRuntimeState(id);
  return (
    <BaseNode
      id={id}
      data={data}
      icon={Code2}
      selected={selected}
      status={runtime?.status ?? "idle"}
      runtimeInputs={runtime?.inputs}
      runtimeOutput={runtime?.output}
    />
  );
}

const nodeTypes = {
  base: WorkflowBaseNode,
};

export default function FlowCanvas({ runNonce = 0 }: { runNonce?: number }) {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const { screenToFlowPosition, getNode } = useReactFlow<WorkflowNode, Edge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [runtimeState, setRuntimeState] = useState<WorkflowRuntimeState>({});
  const [pendingApproval, setPendingApproval] = useState<boolean>(false);

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

      // Types must match exactly; the old `Any` wildcard no longer exists.
      return output.type === input.type;
    },
    [getNode],
  );

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

  // The page hands the workflow id down; load it once, straight from the backend.
  useEffect(() => {
    const id = getWorkflowId();
    if (!id) return;

    setWorkflowId(id);
    let active = true;

    void loadWorkflow(id)
      .then((workflow) => {
        if (!active) return;
        setNodes(workflow.nodes as WorkflowNode[]);
        setEdges(workflow.edges);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load workflow:", error);
        toast.error(
          error instanceof Error ? error.message : "Could not load workflow",
        );
      });

    return () => {
      active = false;
    };
  }, [setNodes, setEdges]);

  const executeRun = useCallback(
    async (nodes: WorkflowNode[], edges: Edge[]) => {
      if (isRunning) return;
      const connectedNodeIds = new Set<string>();
      for (const edge of edges) {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
      }
      const initialRuntimeState: WorkflowRuntimeState = {};
      for (const node of nodes) {
        initialRuntimeState[node.id] = {
          status: connectedNodeIds.has(node.id) ? "ready" : "idle",
        };
      }
      setRuntimeState(initialRuntimeState);
      setIsRunning(true);
      try {
        const graph = await buildFlowGraph(nodes, edges, (nodeId, state) => {
          setRuntimeState((current) => ({
            ...current,
            [nodeId]: state,
          }));
        });
        await graph.invoke({ results: {} });
      } catch (error) {
        console.error("Workflow failed:", error);
        toast.error(
          error instanceof Error ? error.message : "Workflow execution failed",
        );
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning],
  );

  // A run requested from outside the canvas (host event or the toolbar button).
  useEffect(() => {
    if (!runNonce) return;

    const id = getWorkflowId();
    if (!id || isRunning) return;

    void loadWorkflow(id)
      .then((workflow) => {
        setNodes(workflow.nodes as WorkflowNode[]);
        setEdges(workflow.edges);
        setPendingApproval(true);
      })
      .catch((error) => {
        console.error("Workflow execution request failed:", error);
        toast.error(
          error instanceof Error ? error.message : "Workflow execution failed",
        );
      });
  }, [runNonce, isRunning, setNodes, setEdges]);

  const handleRun = () => {
    setPendingApproval(true);
  };
  const handleStop = () => {
    setIsRunning(false);
  };
  const handleSave = async () => {
    if (isSaving) return;

    if (!workflowId) {
      toast.error("Workflow ID is missing.");
      return;
    }

    setIsSaving(true);

    try {
      await saveWorkflow({ id: workflowId, nodes, edges });
      toast.success("Workflow saved successfully");
    } catch (error) {
      const err = error as Error;
      toast.error(
        `Failed to save workflow. ${err?.message || "Unknown error occurred"}`,
      );
    } finally {
      setIsSaving(false);
    }
  };
  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };

  return (
    <main className="relative w-full h-full text-foreground">
      <WorkflowRuntimeProvider value={runtimeState}>
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
              <Button
                size="sm"
                disabled={isRunning}
                onClick={handleRun}
                className="gap-2 shadow-sm"
              >
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

        <WorkflowApprovalDialog
          open={pendingApproval}
          onOpenChange={setPendingApproval}
          onApprove={() => executeRun(nodes, edges)}
        />
      </WorkflowRuntimeProvider>
    </main>
  );
}
