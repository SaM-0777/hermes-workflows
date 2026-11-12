import { Button, Codicon, SandboxedFrame, host } from "@hermes/plugin-sdk";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  handleWorkflowRequest,
  isWorkflowMessage,
  sendResponse,
} from "../lib/workflow-protocol";
import {
  isRecord,
  isWorkflowDocument,
  type WorkflowDocument,
} from "../lib/workflow-validation";
import {
  loadWorkflow,
  saveWorkflow,
  type WorkflowRest,
} from "../lib/workflow-storage";

/** Injected by scripts/build-plugin.ts: the built studio, inlined as a data URL.
 *  A dev build may substitute `STUDIO_DEV_URL` at build time; production never
 *  carries a dev-server URL (the build fails if one sneaks in). */
declare const __STUDIO_SRC__: string;

interface WorkflowStudioContext {
  rest: WorkflowRest;
}

export interface WorkflowStudioPageProps {
  ctx: WorkflowStudioContext;
}

export function WorkflowStudioPage({ ctx }: WorkflowStudioPageProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const workflowRef = useRef<WorkflowDocument | null>(null);
  /** Minted per mount and handed to the frame in INIT; every request from the
   *  frame must echo it, so nothing else that reaches this window can drive
   *  node execution. */
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const hashQuery = window.location.hash.includes("?")
    ? window.location.hash.slice(window.location.hash.indexOf("?"))
    : "";
  const workflowId =
    new URLSearchParams(hashQuery).get("workflowId") ??
    new URLSearchParams(window.location.search).get("workflowId");
  //const studioUrl = workflowId
  //  ? `${STUDIO_URL}/?workflowId=${encodeURIComponent(workflowId)}`
  //  : STUDIO_URL;

  const name = workflowId ? `workflow-${workflowId}` : "Workflow Studio";
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null);
  const [nameDraft, setNameDraft] = useState(name);
  const [loading, setLoading] = useState(false);
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved">(
    "saved",
  );

  useEffect(() => {
    let active = true;

    if (!workflowId) {
      host.notify({
        kind: "warning",
        message: "Open a workflow from the Workflows library.",
      });
      return () => {
        active = false;
      };
    }

    void loadWorkflow(ctx.rest, workflowId)
      .then((loaded) => {
        if (!active) return;
        workflowRef.current = loaded;
        setWorkflow(loaded);
        setNameDraft(loaded.name || `workflow-${loaded.id}`);
        setNameStatus("saved");
      })
      .catch(() => {
        if (!active) return;
        const fallback: WorkflowDocument = {
          id: workflowId,
          name: name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          nodes: [],
          edges: [],
        };
        workflowRef.current = fallback;
        setWorkflow(fallback);
        setNameDraft(name);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ctx.rest, name, workflowId]);

  const saveName = useCallback(
    async (name: string) => {
      const current = workflowRef.current;
      if (!current || !workflowId) return;

      setNameStatus("saving");
      try {
        const saved = await saveWorkflow(ctx.rest, {
          id: current.id,
          nodes: current.nodes,
          edges: current.edges,
          name,
        });
        workflowRef.current = saved;
        setWorkflow(saved);
        setNameDraft(saved.name || name);
        setNameStatus("saved");
      } catch {
        setNameStatus("idle");
      }
    },
    [ctx.rest, workflowId],
  );

  useEffect(() => {
    const current = workflowRef.current;
    const normalized = nameDraft.trim() || name;
    if (!current || normalized === (current.name || name)) return;

    setNameStatus("saving");
    const timer = window.setTimeout(() => {
      void saveName(normalized);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [name, nameDraft, saveName, workflow]);

  useEffect(() => {
    const unsubscribe = host.onEvent(
      "plugin.hermes-workflow.workflow.run",
      (event: { payload?: unknown }) => {
        const payload = event.payload;
        if (!isRecord(payload)) return;

        const workflowId = payload.workflow_id;
        if (typeof workflowId !== "string" || !workflowId.trim()) return;

        const frameWindow = frameRef.current?.contentWindow;
        if (!frameWindow) return;

        frameWindow.postMessage(
          {
            protocol: "workflow-studio:v1",
            requestId: crypto.randomUUID(),
            type: "WORKFLOW_RUN",
            payload: { workflowId },
          },
          "*",
        );
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      const message: unknown = event.data;
      if (!isRecord(message)) return;

      try {
        if (
          message.protocol === "workflow-studio:v1" &&
          message.type === "READY"
        ) {
          if (!workflowId) return;
          frameWindow.postMessage(
            {
              protocol: "workflow-studio:v1",
              type: "INIT",
              payload: {
                workflowId,
                token: sessionTokenRef.current,
              },
            },
            "*",
          );

          return;
        }

        if (!isWorkflowMessage(message)) return;

        // Anything that did not come through this mount's handshake is dropped,
        // including a frame left over from an earlier mount.
        const token = (message as { token?: unknown }).token;
        if (token !== sessionTokenRef.current) return;

        if (message.type === "NAVIGATE") {
          const path = message.payload?.path;
          if (typeof path === "string" && path.startsWith("/")) {
            host.navigate(path);
          }
          return;
        }

        if (message.type === "RUN_NODE") {
          const payload = message.payload;
          if (
            !isRecord(payload) ||
            typeof payload.nodeId !== "string" ||
            typeof payload.code !== "string"
          ) {
            throw new Error("Invalid RUN_NODE request.");
          }

          const result = await ctx.rest("/run", {
            method: "POST",
            body: {
              node_id: payload.nodeId,
              code: payload.code,
              inputs: isRecord(payload.inputs) ? payload.inputs : {},
            },
          });

          sendResponse(frameWindow, message.requestId, "RUN_NODE_RESULT", {
            ok: true,
            result,
          });

          return;
        }

        //if (message.type === "WORKFLOW_RUN_PROGRESS") {
        //  const payload = message.payload;
        //  if (!isRecord(payload)) {
        //    throw new Error("Invalid workflow progress payload.");
        //  }
        //  host.emitEvent("workflow.run.progress", payload);
        //  return;
        //}

        //if (message.type === "WORKFLOW_RUN_RESULT") {
        //  const payload = message.payload;
        //  if (!isRecord(payload)) {
        //    throw new Error("Invalid workflow result payload.");
        //  }
        //  host.emitEvent("workflow.run.result", payload);
        //  return;
        //}

        const result = await handleWorkflowRequest(ctx.rest, message);

        if (isRecord(result.workflow) && isWorkflowDocument(result.workflow)) {
          workflowRef.current = result.workflow;
          setWorkflow(result.workflow);
        }
        sendResponse(frameWindow, message.requestId, `${message.type}_RESULT`, {
          ok: true,
          ...result,
        });
      } catch (error) {
        sendResponse(frameWindow, message.requestId, `${message.type}_RESULT`, {
          ok: false,
          error:
            error instanceof Error ? error.message : "Unknown workflow error",
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [ctx, workflowId]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="flex min-h-(--titlebar-height) shrink-0 items-center gap-2 px-3 py-2">
        <Button
          aria-label="Back to workflows"
          onClick={() => host.navigate("/workflows")}
          size="icon-xs"
          variant="ghost"
        >
          <Codicon name="chevron-left" size="0.875rem" />
        </Button>
        <input
          aria-label="Workflow name"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="h-7 min-w-0 max-w-sm rounded-[3px] border border-transparent bg-transparent px-1 text-sm font-semibold text-foreground outline-hidden placeholder:text-(--ui-text-tertiary) focus:border-(--ui-border) focus:bg-(--ui-bg-tertiary) focus:ring-1 focus:ring-ring"
          disabled={loading || !workflowId}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setNameDraft(event.target.value)
          }
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          spellCheck={false}
          value={`${nameDraft}`}
        />
        <span
          className="text-[0.6875rem] text-(--ui-text-tertiary)"
          aria-live="polite"
        >
          {nameStatus === "saving"
            ? "Saving"
            : nameStatus === "saved"
              ? "Saved"
              : ""}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <SandboxedFrame
          ref={frameRef}
          src={__STUDIO_SRC__}
          title="Workflow Studio"
          className="block size-full border-0"
        />
      </div>
    </div>
  );
}
