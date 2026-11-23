import { ChevronDown } from "lucide-react";

import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  normalizeWorkflowRunner,
  runnerLabels,
  workflowRunners,
  type WorkflowProvider,
  type WorkflowRunner,
} from "@/lib/runner";

interface RuntimeSelectorProps {
  value: WorkflowRunner;
  onChange: (value: WorkflowRunner) => void;
  /** Descriptors from the backend; the built-in list is used until they load. */
  providers?: WorkflowProvider[];
  disabled?: boolean;
  className?: string;
}

export function RuntimeSelector({
  value,
  onChange,
  providers,
  disabled = false,
  className,
}: RuntimeSelectorProps) {
  const items =
    providers && providers.length
      ? providers.map((provider) => ({
          id: provider.id,
          label: provider.label || runnerLabels[provider.id] || provider.id,
          description: provider.description,
          needsSetup:
            Boolean(provider.needsSetup) && provider.status
              ? !provider.status.ready
              : false,
        }))
      : workflowRunners.map((id) => ({
          id,
          label: runnerLabels[id] ?? id,
          description: "",
          needsSetup: false,
        }));

  const ids = items.map((item) => item.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="default"
            className={className}
            disabled={disabled}
            aria-label="Select node runtime"
            title={`Node runtime: ${runnerLabels[value] ?? value}`}
          />
        }
      >
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" positionMethod="fixed">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(normalizeWorkflowRunner(next, ids))}
        >
          <DropdownMenuLabel>Node runtime</DropdownMenuLabel>
          {items.map((item) => (
            <DropdownMenuRadioItem
              key={item.id}
              value={item.id}
              className="py-1.5 pr-8"
            >
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {item.label}
                  {item.needsSetup ? (
                    <span
                      className="size-1.5 rounded-full bg-amber-500"
                      title="Needs setup"
                    />
                  ) : null}
                </span>
                {item.description ? (
                  <span className="text-xs leading-snug text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default RuntimeSelector;
