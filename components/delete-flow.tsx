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
import { getWorkflowId, hostRest } from "@/lib/host";

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
    const workflowId = getWorkflowId();

    if (!workflowId) {
      setDeleteError("Workflow ID is missing.");
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await hostRest<string>(`/workflows/${workflowId}`, { method: "DELETE" });

      // Back to the library.
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
