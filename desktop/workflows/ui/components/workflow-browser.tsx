import { memo } from "react";
import { CategoryFilter } from "./category-filter";
import { CatalogCard } from "./catalog-card";
import { SearchHeader } from "./search-header";
import type { WorkflowSummary } from "../../lib/workflow-validation";

export interface WorkflowBrowserProps {
  workflows: WorkflowSummary[];
  onOpen: (id: string) => void;
}

export const WorkflowBrowser = memo(function WorkflowBrowser({
  workflows,
  onOpen,
}: WorkflowBrowserProps) {
  return (
    <div className="@container/catalog flex h-full min-h-0 min-w-0">
      <style>{`
        @keyframes workflow-catalog-card-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `}</style>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SearchHeader
            loading={false}
            scope="saved"
            value=""
            placeholder={'Try "workflow-"'}
            onChange={() => undefined}
            onKeyDown={() => undefined}
          />
          <CategoryFilter disabled={false} sizing="equal" value="Category" />
          <div className="min-h-0 flex-1">
            <div className="flex h-full min-h-0 flex-col">
              <div className="capabilities-scroll">
                <div className="catalog-filtered-results pt-(--capabilities-gap-lead) pb-2">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] auto-rows-[minmax(16rem,auto)] gap-3">
                    {workflows.map((workflow, index) => (
                      <CatalogCard
                        key={workflow.id}
                        onOpen={onOpen}
                        entry={workflow}
                        accentIndex={index}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
