import { useState } from "react";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { loadProviders, type WorkflowProvider } from "@/lib/runner";

interface RuntimeSetupDialogProps {
  open: boolean;
  provider: WorkflowProvider | undefined;
  onOpenChange: (open: boolean) => void;
  /** Called with the refreshed provider list after a successful recheck. */
  onRechecked?: (providers: WorkflowProvider[]) => void;
}

/**
 * Shown when a workflow selects a remote runtime the machine is not ready for.
 * The steps come from the backend's readiness probe, so a new provider gets this
 * dialog without any new UI.
 */
export function RuntimeSetupDialog({
  open,
  provider,
  onOpenChange,
  onRechecked,
}: RuntimeSetupDialogProps) {
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  const status = provider?.status;
  const missing = status?.missing ?? [];
  const hints = status?.hints ?? [];

  const recheck = async () => {
    setChecking(true);
    try {
      const providers = await loadProviders();
      onRechecked?.(providers);
      setChecked(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up the {provider?.label ?? "remote"} runtime</DialogTitle>
          <DialogDescription>
            {provider?.label ?? "This runtime"} runs node code outside this
            machine. Hermes installs the declared SDK when the plugin is enabled;
            you provide the credentials. Follow the steps below, then recheck.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {missing.length ? (
            <p className="text-sm">
              Missing: <span className="font-medium">{missing.join(", ")}</span>
            </p>
          ) : (
            <p className="text-sm text-emerald-600">
              This machine looks ready. Recheck to refresh the status.
            </p>
          )}

          {hints.map((hint) => (
            <pre
              key={hint}
              className="overflow-x-auto rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap"
            >
              {hint}
            </pre>
          ))}

          {status?.sdk ? (
            <p className="text-xs text-muted-foreground">
              SDK:{" "}
              {status.sdk.importable
                ? `modal ${status.sdk.version} (managed interpreter)`
                : "not importable yet"}
            </p>
          ) : null}
          {status?.cli?.path ? (
            <p className="text-xs text-muted-foreground">
              External CLI (fallback): {status.cli.path}
            </p>
          ) : null}
          {status?.credentials?.present ? (
            <p className="text-xs text-muted-foreground">
              Credentials: {status.credentials.source}
            </p>
          ) : null}
          {checked && !status?.ready ? (
            <p className="text-xs text-amber-600">
              Still not ready. Follow the steps above, then recheck.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button size="sm" disabled={checking} onClick={() => void recheck()}>
            {checking ? "Checking…" : "Recheck"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RuntimeSetupDialog;
