import { Button, Codicon, host } from "@hermes/plugin-sdk";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import StudioApp from "../../../src/App";
import { setActiveWorkflowId, setHostRest } from "../../../lib/host";
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

interface WorkflowStudioContext {
  rest: WorkflowRest;
}

export interface WorkflowStudioPageProps {
  ctx: WorkflowStudioContext;
}

export function WorkflowStudioPage({ ctx }: WorkflowStudioPageProps) {
  const workflowRef = useRef<WorkflowDocument | null>(null);
  const hashQuery = window.location.hash.includes("?")
    ? window.location.hash.slice(window.location.hash.indexOf("?"))
    : "";
  const workflowId =
    new URLSearchParams(hashQuery).get("workflowId") ??
    new URLSearchParams(window.location.search).get("workflowId");

  const name = workflowId ? `workflow-${workflowId}` : "Workflow Studio";
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null);
  const [nameDraft, setNameDraft] = useState(name);
  const [loading, setLoading] = useState(false);
  const [runNonce, setRunNonce] = useState(0);
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved">(
    "saved",
  );

  // Installed during render, not in an effect: the studio's own effects run
  // before this page's effects, so a first fetch would otherwise find no host.
  setHostRest(ctx.rest);
  setActiveWorkflowId(workflowId ?? null);

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

    setLoading(true);

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

  // The agent can ask this pane to run the workflow it is editing.
  useEffect(
    () =>
      host.onEvent(
        "plugin.hermes-workflow.workflow.run",
        (event: { payload?: unknown }) => {
          const payload = event.payload;
          if (!isRecord(payload)) return;
          if (typeof payload.workflow_id !== "string") return;
          setRunNonce((current) => current + 1);
        },
      ),
    [],
  );

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
        {workflowId ? (
          <StudioApp runNonce={runNonce} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-(--ui-text-tertiary)">
            Open a workflow from the Workflows library.
          </div>
        )}
      </div>
    </div>
  );
}
