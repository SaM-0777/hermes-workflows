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
import type { ProviderOption, WorkflowProvider } from "@/lib/runner";

interface RuntimeOptionsDialogProps {
  open: boolean;
  provider: WorkflowProvider | undefined;
  value: Record<string, unknown>;
  onOpenChange: (open: boolean) => void;
  onChange: (value: Record<string, unknown>) => void;
}

/** One control per descriptor option — nothing here is provider-specific. */
function OptionField({
  option,
  value,
  onChange,
}: {
  option: ProviderOption;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const asText = value === undefined || value === null ? "" : String(value);

  if (option.type === "select") {
    return (
      <select
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
        value={asText}
        onChange={(event) => onChange(event.target.value)}
      >
        {(option.choices ?? []).map((choice) => (
          <option key={choice} value={choice}>
            {choice === "" ? "None" : choice}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      type={option.type === "number" ? "number" : "text"}
      min={option.min}
      max={option.max}
      step={option.step}
      value={asText}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(option.type === "number" && raw !== "" ? Number(raw) : raw);
      }}
    />
  );
}

export function RuntimeOptionsDialog({
  open,
  provider,
  value,
  onOpenChange,
  onChange,
}: RuntimeOptionsDialogProps) {
  const options = provider?.options ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider?.label ?? "Runtime"} options</DialogTitle>
          <DialogDescription>
            Saved with this workflow. The backend fills anything left empty from
            the provider&apos;s defaults.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[75vh] overflow-y-auto">
          {options.map((option) => (
            <div key={option.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {option.label}
              </label>
              <OptionField
                option={option}
                value={value[option.key]}
                onChange={(next) => onChange({ ...value, [option.key]: next })}
              />
              {option.help ? (
                <p className="text-xs text-muted-foreground">{option.help}</p>
              ) : null}
            </div>
          ))}
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This runtime takes no options.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RuntimeOptionsDialog;
