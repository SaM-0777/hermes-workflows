import { useMemo } from "react";
import { Braces } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export interface JsonFieldProps {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}

function parse(value: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

/** Structured JSON input: validates as you type, formats on demand. */
export function JsonField({ value, onChange, invalid }: JsonFieldProps) {
  const result = useMemo(
    () => (value.trim() ? parse(value) : null),
    [value],
  );
  const isObjectInput = result?.ok && typeof result.value === "object";

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Textarea
          value={value}
          rows={4}
          spellCheck={false}
          placeholder={'{\n  "key": "value"\n}'}
          aria-invalid={invalid || (result && !result.ok) || undefined}
          className="min-h-24 resize-y font-mono text-xs leading-5"
          onChange={(event) => onChange(event.target.value)}
        />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1.5 top-1.5 h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
          disabled={!result?.ok || !isObjectInput}
          onClick={() => {
            if (!result?.ok) return;
            onChange(JSON.stringify(result.value, null, 2));
          }}
        >
          <Braces className="size-3" />
          Format
        </Button>
      </div>

      {result && !result.ok ? (
        <p className={cn("text-[11px] text-destructive")}>{result.error}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {result?.ok ? "Valid JSON." : "An object or array. Passed to the node as a JSON string."}
        </p>
      )}
    </div>
  );
}

export default JsonField;
