import { Button, host } from "@hermes/plugin-sdk";
import { useCallback, useEffect, useState } from "react";
import { PanelEmpty } from "./components/panel-empty";
import { PageLoader } from "./components/page-loader";
import { TextTab } from "./components/text-tab";
import { WorkflowBrowser } from "./components/workflow-browser";
import { readWorkflows, WorkflowLibraryContext } from "../lib/workflow-storage";
import type { WorkflowDocument } from "../lib/workflow-validation";

export interface WorkflowLibraryPageProps {
  ctx: WorkflowLibraryContext;
}

export function WorkflowLibraryPage({ ctx }: WorkflowLibraryPageProps) {
  const [workflows, setWorkflows] = useState<WorkflowDocument[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  const refreshWorkflows = useCallback(async () => {
    setPending(true);
    setError("");

    try {
      setWorkflows(await readWorkflows(ctx.files));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }, [ctx.files]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshWorkflows();
  }, [refreshWorkflows]);

  function openWorkflow(id: string) {
    host.navigate(`/workflow-studio?workflowId=${encodeURIComponent(id)}`);
  }

  const loader = pending ? (
    <PageLoader />
  ) : error ? (
    <PanelEmpty
      icon="error"
      title="Failed to load workflows"
      description={error}
      action={
        <Button size="sm" onClick={() => void refreshWorkflows()}>
          Refresh
        </Button>
      }
    />
  ) : null;

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)">
      <div className="shrink-0">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-6 pb-2 pt-[calc(var(--titlebar-height)+1.5rem)]">
          <div className="col-start-1 row-start-1 flex min-w-0 items-center justify-start">
            <div className="hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex">
              <TextTab
                active
                label="Saved"
                meta={workflows.length}
                onClick={() => undefined}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-(--ui-chat-surface-background)">
        <div className="flex h-full flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            {loader ?? (
              <WorkflowBrowser
                ctx={ctx}
                workflows={workflows}
                onOpen={openWorkflow}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
