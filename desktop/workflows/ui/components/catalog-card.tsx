import { formatRelativeTime } from "../../lib/format-relative-time";
import { CARD_ACCENTS } from "../../lib/catalog";
import { RowButton } from "./row-button";
import type { WorkflowSummary } from "../../lib/workflow-validation";

export interface CatalogCardProps {
  entry: WorkflowSummary;
  onOpen: (id: string) => void;
  accentIndex: number;
}

export function CatalogCard({
  entry,
  onOpen,
  accentIndex,
}: CatalogCardProps) {
  return (
    <article
      className={`group relative isolate min-w-0 overflow-hidden rounded-lg bg-(--ui-stroke-tertiary) p-[1.5px] transition-[box-shadow,opacity] duration-150 ${CARD_ACCENTS[accentIndex % CARD_ACCENTS.length]}`}
      data-catalog-card=""
      data-catalog-variant="default"
      data-entry-id={entry.id}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 animate-[workflow-catalog-card-spin_3.5s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg_290deg,color-mix(in_srgb,var(--catalog-accent)_72%,transparent)_325deg,var(--catalog-accent)_345deg,transparent_360deg)] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:animate-none"
      />
      <div className="relative z-10 flex min-h-64 min-w-0 w-full flex-col gap-2 overflow-hidden rounded-[calc(0.5rem-1.5px)] p-3 [background:radial-gradient(140%_100%_at_0%_0%,color-mix(in_srgb,var(--catalog-accent)_11%,transparent),transparent_70%),var(--ui-chat-bubble-background)]">
        <RowButton
          className="min-w-0 text-left text-xl font-semibold leading-snug"
          onClick={() => onOpen(entry.id)}
        >
          {entry.name}
        </RowButton>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-(--ui-text-tertiary)">
          <span>{entry.nodes.length} {entry.nodes.length === 1 ? "node" : "nodes"}</span>
          <span aria-hidden className="text-(--ui-text-quaternary)">•</span>
          <span>{entry.edges.length} {entry.edges.length === 1 ? "edge" : "edges"}</span>
          <span aria-hidden className="text-(--ui-text-quaternary)">•</span>
          <span>Saved {formatRelativeTime(entry.updatedAt)}</span>
        </div>
      </div>
    </article>
  );
}
