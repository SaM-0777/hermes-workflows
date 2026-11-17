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
import { Input } from "./ui/input";

/** Edge names are display text on the canvas; keep them short. */
export const EDGE_NAME_MAX_LENGTH = 80;

export interface EdgeNameDialogProps {
  open: boolean;
  /** Current name, or "" for an unnamed edge. */
  initial: string;
  /** Control edges read as "then"; data edges as a payload name. */
  kind: "control" | "data";
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}

export function EdgeNameDialog({
  open,
  initial,
  kind,
  onOpenChange,
  onSubmit,
}: EdgeNameDialogProps) {
  // Seeded once per mount. The canvas remounts this dialog per edge (key), so
  // opening a different edge starts from that edge's name without an effect.
  const [draft, setDraft] = useState(initial);

  const submit = () => {
    onSubmit(draft.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Name this connection</DialogTitle>
          <DialogDescription>
            {kind === "control"
              ? "A control connection runs the next node after this one finishes. The name is shown on the canvas."
              : "The name is shown on the canvas, so the graph reads without opening each edge."}
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={draft}
          maxLength={EDGE_NAME_MAX_LENGTH}
          placeholder={kind === "control" ? "e.g. then" : "e.g. research packet"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save name</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
