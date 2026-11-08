import type { CSSProperties } from "react";
import { CARD_ACCENTS } from "../../lib/catalog";
import { RowButton } from "./row-button";
import type { WorkflowSummary } from "../../lib/workflow-validation";

export interface CatalogCardProps {
  entry: WorkflowSummary;
  onOpen: (id: string) => void;
  accentIndex: number;
  style?: CSSProperties | null;
}

export function CatalogCard({
  entry,
  onOpen,
  accentIndex,
  style,
}: CatalogCardProps) {
  return (
    <article
      className={`group relative isolate min-w-0 overflow-hidden rounded-lg bg-(--ui-stroke-tertiary) p-[1.5px] transition-[box-shadow,opacity] duration-150 ${CARD_ACCENTS[accentIndex % CARD_ACCENTS.length]}`}
      data-catalog-card=""
      data-catalog-variant="default"
      data-entry-id={entry.id}
      style={style ?? undefined}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg_290deg,#2563eb_325deg,#60a5fa_345deg,transparent_360deg)] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:animate-none"
      />
      <div className="relative z-10 flex min-h-64 min-w-0 w-full flex-col gap-2 overflow-hidden rounded-[calc(0.5rem-1.5px)] p-3 [background:radial-gradient(140%_100%_at_0%_0%,color-mix(in_srgb,var(--catalog-accent)_11%,transparent),transparent_70%),var(--ui-chat-bubble-background)]">
        <RowButton
          className="min-w-0 text-left text-xl font-semibold leading-snug"
          onClick={() => onOpen(entry.id)}
        >
          {entry.name}
        </RowButton>
      </div>
    </article>
  );
}
