import { Button } from "@hermes/plugin-sdk";
import type { ReactNode } from "react";

export interface TextTabProps {
  active: boolean;
  label: ReactNode;
  meta?: ReactNode;
  onClick: () => void;
}

export function TextTab({ active, label, meta, onClick }: TextTabProps) {
  return (
    <Button
      onClick={onClick}
      type="button"
      className={`group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 text-(length:--conversation-caption-font-size) font-medium text-(--ui-text-tertiary) transition-colors hover:bg-transparent hover:text-foreground focus-visible:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50', ${active ? "text-foreground" : ""}`}
    >
      <span
        className={`underline-offset-4 decoration-current/25 ${active ? "underline" : "group-hover/text-tab:underline"}`}
      >
        {label}
      </span>
      {meta ? (
        <span className="text-[0.72em] font-normal text-(--ui-text-tertiary)">
          {meta}
        </span>
      ) : null}
    </Button>
  );
}
