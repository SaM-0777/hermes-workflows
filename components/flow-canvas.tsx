import { useCallback, useEffect, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Position,
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
import { Code2, Play, Save, SlidersHorizontal, Square, Trash2 } from "lucide-react";
import type { NodeData, WorkflowNode, WorkflowRuntimeState } from "@/lib/node";
import {
  CONTROL_EDGE_KIND,
  CONTROL_IN_HANDLE,
  CONTROL_OUT_HANDLE,
  edgeStyleFor,
  isControlHandlePair,
  touchesControlHandle,
  type WorkflowEdge,
} from "@/lib/control-flow";
import { NodeWidget } from "./node-widget";
import { BaseNode } from "./base-node";
import { EdgeNameDialog } from "./edge-name-dialog";
import { Button } from "./ui/button";
import DeleteWorkflow from "./delete-flow";
import { RuntimeSelector } from "./runtime-selector";
import { buildFlowGraph, WORKFLOW_RECURSION_LIMIT } from "@/lib/flow-graph";
import { getWorkflowId } from "@/lib/host";
import { saveWorkflow, loadWorkflow } from "@/lib/workflow";
import {
  closeWorkflowSession,
  DEFAULT_WORKFLOW_RUNNER,
  loadProviders,
  normalizeWorkflowRunner,
  openWorkflowSession,
  providerById,
  providerUsesSession,
  runnerLabels,
  type WorkflowProvider,
  type WorkflowRunner,
} from "@/lib/runner";
import { RuntimeOptionsDialog } from "./runtime-options-dialog";
import { RuntimeSetupDialog } from "./runtime-setup-dialog";
import {
  useNodeRuntimeState,
  WorkflowRuntimeProvider,
} from "@/providers/workflow-provider";
import { toast } from "sonner";
import { WorkflowApprovalDialog } from "./approval-dialog";
import { normalizeEdges } from "@/lib/edge";

function WorkflowBaseNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const runtime = useNodeRuntimeState(id);
  // Control-flow handles exist on every node regardless of its ports, so a node
  // with no outputs can still order what runs after it: flow (out) -> then (in).
  return (
    <BaseNode
      id={id}
      data={data}
      icon={Code2}
      selected={selected}
      status={runtime?.status ?? "idle"}
      runtimeInputs={runtime?.inputs}
      runtimeOutput={runtime?.output}
      handles={[
        {
          id: CONTROL_IN_HANDLE,
          type: "target",
          position: Position.Left,
          style: { top: 18 },
          className: "size-2.5! rounded-sm! bg-slate-500! hover:bg-slate-300!",
          title: "Control in — this node runs after the upstream node",
        },
        {
          id: CONTROL_OUT_HANDLE,
          type: "source",
          position: Position.Right,
          style: { top: 18 },
          className: "size-2.5! rounded-sm! bg-slate-500! hover:bg-slate-300!",
          title: "Control out — run the next node after this one finishes",
        },
      ]}
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
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runner, setRunner] = useState<WorkflowRunner>(DEFAULT_WORKFLOW_RUNNER);
  const [providers, setProviders] = useState<WorkflowProvider[]>([]);
  const [runnerOptions, setRunnerOptions] = useState<Record<string, unknown>>({});
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [runtimeState, setRuntimeState] = useState<WorkflowRuntimeState>({});
  const [pendingApproval, setPendingApproval] = useState<boolean>(false);
  const [renamingEdge, setRenamingEdge] = useState<WorkflowEdge | null>(null);
  // Session opened for a workflow-scoped runtime, kept in a ref so Stop can close
  // it without re-running the callback chain.
  const activeSession = useRef<string | null>(null);

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

      // Control edges are flow -> then and nothing else: they carry no value, so
      // no port lookup applies, and a data port may never borrow these handles.
      const controlSource = touchesControlHandle(connection.sourceHandle);
      const controlTarget = touchesControlHandle(connection.targetHandle);
      if (controlSource || controlTarget) {
        return isControlHandlePair(
          connection.sourceHandle,
          connection.targetHandle,
        );
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
      const control = isControlHandlePair(
        connection.sourceHandle,
        connection.targetHandle,
      );

      setEdges((currentEdges) =>
        addEdge<WorkflowEdge>(
          {
            ...connection,
            kind: control ? CONTROL_EDGE_KIND : "data",
            animated: false,
            style: edgeStyleFor(control ? CONTROL_EDGE_KIND : "data"),
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

  // Provider descriptors come from the backend, so a new runtime needs no UI edit.
  useEffect(() => {
    let active = true;
    void loadProviders()
      .then((list) => {
        if (active) setProviders(list);
      })
      .catch((error) => {
        console.error("Could not load runtimes:", error);
      });
    return () => {
      active = false;
    };
  }, []);

  // The page hands the workflow id down; load it from the backend.
  useEffect(() => {
    const id = getWorkflowId();
    if (!id) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkflowId(id);
    let active = true;

    void loadWorkflow(id)
      .then((workflow) => {
        if (!active) return;
        setNodes(workflow.nodes as WorkflowNode[]);
        setEdges(normalizeEdges(workflow.edges as WorkflowEdge[]));
        setRunner(normalizeWorkflowRunner(workflow.runner));
        setRunnerOptions(workflow.runnerOptions ?? {});
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

      // A workflow-scoped runtime keeps one sandbox for the whole run: the
      // session is opened before the graph starts, every node joins it, and
      // closing it in the finally is what terminates the sandbox.
      const provider = providerById(providers, runner);
      let sessionId: string | null = null;

      try {
        if (providerUsesSession(provider)) {
          const session = await openWorkflowSession({
            workflow_id: workflowId,
            runner,
            runner_options: runnerOptions,
          });
          sessionId = session.session_id;
          activeSession.current = sessionId;
        }

        const graph = await buildFlowGraph(
          nodes,
          edges,
          (nodeId, state) => {
            setRuntimeState((current) => ({
              ...current,
              [nodeId]: state,
            }));
          },
          undefined,
          runner,
          runnerOptions,
          sessionId,
        );
        await graph.invoke(
          { results: {} },
          { recursionLimit: WORKFLOW_RECURSION_LIMIT },
        );
      } catch (error) {
        console.error("Workflow failed:", error);
        toast.error(
          error instanceof Error ? error.message : "Workflow execution failed",
        );
      } finally {
        if (sessionId) {
          activeSession.current = null;
          try {
            await closeWorkflowSession(sessionId);
          } catch (error) {
            console.error("Could not close the workflow session:", error);
          }
        }
        setIsRunning(false);
      }
    },
    [isRunning, runner, runnerOptions, providers, workflowId],
  );

  // A run requested from outside the canvas (host event or the toolbar button or TUI).
  useEffect(() => {
    if (!runNonce) return;

    const id = getWorkflowId();
    if (!id || isRunning) return;

    void loadWorkflow(id)
      .then((workflow) => {
        setNodes(workflow.nodes as WorkflowNode[]);
        setEdges(normalizeEdges(workflow.edges as WorkflowEdge[]));
        // An agent-requested run honours the runtime saved with the workflow, and
        // its options too: state loaded before the last save would otherwise open
        // the session with stale settings (an old GPU, an old OS package list).
        setRunner(normalizeWorkflowRunner(workflow.runner));
        setRunnerOptions(workflow.runnerOptions ?? {});
        setPendingApproval(true);
      })
      .catch((error) => {
        console.error("Workflow execution request failed:", error);
        toast.error(
          error instanceof Error ? error.message : "Workflow execution failed",
        );
      });
  }, [runNonce, isRunning, setNodes, setEdges]);

  const selectedProvider = providerById(providers, runner);
  const providerNeedsSetup =
    Boolean(selectedProvider?.needsSetup) &&
    selectedProvider?.status?.ready === false;

  const handleRun = () => {
    // A remote runtime that isn't configured sends the user to the setup steps
    // instead of failing a run.
    if (providerNeedsSetup) {
      setSetupOpen(true);
      return;
    }
    setPendingApproval(true);
  };

  const handleRunnerChange = (next: WorkflowRunner) => {
    setRunner(next);
    const provider = providerById(providers, next);
    if (provider?.needsSetup && provider.status && !provider.status.ready) {
      setSetupOpen(true);
    }
  };
  const handleStop = () => {
    setIsRunning(false);
    // Stopping ends the run, so a workflow-scoped sandbox must go with it. The
    // run's own finally is a second chance at this; closing twice is harmless.
    const sessionId = activeSession.current;
    if (sessionId) {
      activeSession.current = null;
      void closeWorkflowSession(sessionId).catch((error) => {
        console.error("Could not close the workflow session:", error);
      });
    }
  };
  const handleSave = async () => {
    if (isSaving) return;

    if (!workflowId) {
      toast.error("Workflow ID is missing.");
      return;
    }

    setIsSaving(true);

    try {
      await saveWorkflow({ id: workflowId, nodes, edges, runner, runnerOptions });
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
          onEdgeDoubleClick={(_, edge) => setRenamingEdge(edge as WorkflowEdge)}
          deleteKeyCode={["Backspace", "Delete"]}
          edgesFocusable
          elementsSelectable
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: false,
            style: edgeStyleFor("data"),
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
              <div className="flex items-center">
                <Button
                  size="sm"
                  disabled={isRunning}
                  onClick={handleRun}
                  className="gap-2 shadow-sm m-0"
                  title={`Node runtime: ${runnerLabels[runner]}`}
                >
                  <Play className="size-3.5 fill-current" />
                  Run workflow
                </Button>
                <RuntimeSelector
                  value={runner}
                  onChange={handleRunnerChange}
                  providers={providers}
                  disabled={isRunning}
                  className="shadow-sm bg-white m-0"
                />
                {selectedProvider?.options?.length ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isRunning}
                    onClick={() => setOptionsOpen(true)}
                    className="shadow-sm m-0"
                    aria-label="Runtime options"
                    title="Runtime options"
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            )}
            <Button
              size="sm"
              disabled={isSaving}
              onClick={handleSave}
              className="gap-2 "
            >
              <Save className="size-3.5" />
            </Button>
            <Button size="sm" onClick={handleDelete} className="gap-2 ">
              <Trash2 className="size-3.5 stroke-destructive" />
            </Button>
          </Panel>
        </ReactFlow>

        <NodeWidget onAddNode={onAddNode} />

        <EdgeNameDialog
          key={renamingEdge?.id ?? "no-edge"}
          open={renamingEdge !== null}
          initial={renamingEdge?.label ?? ""}
          kind={renamingEdge?.kind === CONTROL_EDGE_KIND ? "control" : "data"}
          onOpenChange={(open) => {
            if (!open) setRenamingEdge(null);
          }}
          onSubmit={(name) => {
            if (!renamingEdge) return;
            const targetId = renamingEdge.id;
            setEdges((current) =>
              current.map((edge) =>
                edge.id === targetId
                  ? { ...edge, label: name || undefined }
                  : edge,
              ),
            );
            setRenamingEdge(null);
          }}
        />

        <RuntimeOptionsDialog
          open={optionsOpen}
          provider={selectedProvider}
          value={runnerOptions}
          onOpenChange={setOptionsOpen}
          onChange={setRunnerOptions}
        />

        <RuntimeSetupDialog
          open={setupOpen}
          provider={selectedProvider}
          onOpenChange={setSetupOpen}
          onRechecked={(list) => setProviders(list)}
        />

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
