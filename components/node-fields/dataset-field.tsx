import { FolderOpen, Link2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export interface DatasetFieldProps {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}

type DatasetKind = "url" | "path" | "unknown" | "empty";

function classify(value: string): DatasetKind {
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  if (/^https?:\/\/\S+$/i.test(trimmed)) return "url";
  if (trimmed.startsWith("/") || trimmed.startsWith("~/")) return "path";
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith(".\\")) return "path";
  return "unknown";
}

const KIND_LABEL: Record<Exclude<DatasetKind, "empty">, string> = {
  url: "URL",
  path: "Local",
  unknown: "Check",
};

/**
 * A dataset is addressed either by a local directory or by a URL; both are
 * strings, so this is one input with a hint about what was typed.
 */
export function DatasetField({ value, onChange, invalid }: DatasetFieldProps) {
  const kind = classify(value);
  const Icon = kind === "url" ? Link2 : FolderOpen;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Icon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />

        <Input
          value={value}
          placeholder="/data/mnist  or  https://example.com/dataset.csv"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || kind === "unknown" || undefined}
          className="pr-16 pl-8 font-mono text-xs"
          onChange={(event) => onChange(event.target.value)}
        />

        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {kind !== "empty" && (
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                kind === "unknown"
                  ? "border-destructive/40 text-destructive"
                  : "border-border text-muted-foreground",
              )}
            >
              {KIND_LABEL[kind]}
            </span>
          )}

          {value && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={() => onChange("")}
            >
              <X className="size-3.5" />
              <span className="sr-only">Clear dataset</span>
            </Button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {kind === "unknown"
          ? "Use an absolute path (/data/…, ~/data/…, C:\\data\\…) or an http(s) URL."
          : "A local directory or a dataset URL. Passed to the node as a string."}
      </p>
    </div>
  );
}

export default DatasetField;
