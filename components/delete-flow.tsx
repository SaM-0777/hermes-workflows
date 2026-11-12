import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { navigateTo } from "@/lib/navigation";
import { getWorkflowId, sessionFields } from "@/lib/studio-session";
import { randomId } from "@/lib/random-id";

export interface DeleteWorkflowProps {
  open: boolean;
  setOpenChange: (o: boolean) => void;
}

export default function DeleteWorkflow({
  open,
  setOpenChange,
}: DeleteWorkflowProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    // The studio runs in an opaque-origin frame with no query string, so the
    // workflow id comes from the host's INIT handshake, not the URL.
    const workflowId = getWorkflowId();

    if (!workflowId) {
      setDeleteError("Workflow ID is missing.");
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    const requestId = randomId();

    try {
      const result = await new Promise<{ ok: boolean; error?: string }>(
        (resolve, reject) => {
          const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error("Delete request timed out."));
          }, 30_000);

          const cleanup = () => {
            window.clearTimeout(timeout);
            window.removeEventListener("message", handleMessage);
          };

          const handleMessage = (event: MessageEvent) => {
            if (event.source !== window.parent) return;
            const response = event.data;
            if (
              response?.protocol !== "workflow-studio:v1" ||
              response?.requestId !== requestId ||
              response?.type !== "WORKFLOW_DELETE_RESULT"
            ) {
              return;
            }

            cleanup();
            resolve(response);
          };

          window.addEventListener("message", handleMessage);
          window.parent.postMessage(
            {
              protocol: "workflow-studio:v1",
              requestId,
              type: "WORKFLOW_DELETE",
              payload: { id: workflowId },
              ...sessionFields(),
            },
            "*",
          );
        },
      );

      if (!result.ok) {
        throw new Error(result.error || "Could not delete workflow.");
      }

      // navigate back to the library.
      navigateTo("/workflows");
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete workflow.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this workflow, including all its nodes
            and connections. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && (
          <p className="text-sm text-destructive">{deleteError}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault();
              void confirmDelete();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : "Delete workflow"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
