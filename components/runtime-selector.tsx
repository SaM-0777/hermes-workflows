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
  type WorkflowRunner,
} from "@/lib/runner";

interface RuntimeSelectorProps {
  value: WorkflowRunner;
  onChange: (value: WorkflowRunner) => void;
  disabled?: boolean;
  className?: string;
}

export function RuntimeSelector({
  value,
  onChange,
  disabled = false,
  className,
}: RuntimeSelectorProps) {
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
            title={`Node runtime: ${runnerLabels[value]}`}
          />
        }
      >
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" positionMethod="fixed">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(normalizeWorkflowRunner(next))}
        >
          <DropdownMenuLabel>Node runtime</DropdownMenuLabel>
          {workflowRunners.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              className="py-1.5 pr-8"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {runnerLabels[option]}
                </span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default RuntimeSelector;
