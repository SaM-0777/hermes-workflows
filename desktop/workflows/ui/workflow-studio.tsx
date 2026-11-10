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
  type WorkflowFiles,
} from "../lib/workflow-storage";

const STUDIO_URL = "http://localhost:5173";

interface WorkflowStudioContext {
  files: WorkflowFiles;
}

export interface WorkflowStudioPageProps {
  ctx: WorkflowStudioContext;
}

interface WorkflowActionsProps {
  onDelete: () => void;
  disabled: boolean;
}

function WorkflowActions({ onDelete, disabled }: WorkflowActionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-label="Workspace actions"
        className="inline-flex size-7 items-center justify-center rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-tertiary) text-foreground/80 shadow-sm transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Codicon name="ellipsis" size="0.875rem" />
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-44 rounded-md bg-popover p-1 text-popover-foreground shadow-md"
          role="menu"
        >
          <button
            className="flex w-full items-center gap-2 rounded-[3px] px-2.5 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10 focus-visible:bg-(--ui-control-active-background) focus-visible:outline-hidden"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            role="menuitem"
            type="button"
          >
            <Codicon name="trash" size="0.875rem" />
            Delete workspace
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface DeleteWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteWorkflowDialog({
  open,
  onClose,
  onConfirm,
}: DeleteWorkflowDialogProps) {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-100 grid place-items-center bg-black/50 p-4"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-lg border border-(--ui-border) bg-popover p-4 text-popover-foreground shadow-xl">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Delete workflow?</h2>
          <p className="text-xs leading-relaxed text-(--ui-text-secondary)">
            This workflow will be moved to trash.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-[3px] px-2.5 py-1.5 text-xs font-medium text-(--ui-text-secondary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-[3px] bg-destructive px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-destructive/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:pointer-events-none disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm().catch(() => setBusy(false));
            }}
            type="button"
          >
            {busy ? "Deleting..." : "Delete workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkflowStudioPage({ ctx }: WorkflowStudioPageProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const workflowRef = useRef<WorkflowDocument | null>(null);
  const hashQuery = window.location.hash.includes("?")
    ? window.location.hash.slice(window.location.hash.indexOf("?"))
    : "";
  const workflowId =
    new URLSearchParams(hashQuery).get("workflowId") ??
    new URLSearchParams(window.location.search).get("workflowId");
  const studioUrl = workflowId
    ? `${STUDIO_URL}/?workflowId=${encodeURIComponent(workflowId)}`
    : STUDIO_URL;
  const name = workflowId ? `workflow-${workflowId}` : "Workflow Studio";
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null);
  const [nameDraft, setNameDraft] = useState(name);
  const [loading, setLoading] = useState(false);
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved">(
    "saved",
  );
  const [deleteOpen, setDeleteOpen] = useState(false);

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

    void loadWorkflow(ctx.files, workflowId)
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
  }, [ctx.files, name, workflowId]);

  const saveName = useCallback(
    async (name: string) => {
      const current = workflowRef.current;
      if (!current || !workflowId) return;

      setNameStatus("saving");
      try {
        const saved = await saveWorkflow(ctx.files, {
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
    [ctx.files, workflowId],
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
    const handleMessage = async (event: MessageEvent) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      const message: unknown = event.data;
      if (!isRecord(message) || !isWorkflowMessage(message)) return;

      try {
        if (message.type === "NAVIGATE") {
          const path = message.payload?.path;
          if (typeof path === "string" && path.startsWith("/")) {
            host.navigate(path);
          }
          return;
        }

        const result = await handleWorkflowRequest(ctx.files, message);
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
  }, [ctx]);

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
          src={studioUrl}
          title="Workflow Studio"
          className="block size-full border-0"
        />
      </div>
    </div>
  );
}
