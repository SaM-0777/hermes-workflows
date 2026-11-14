import { useRef, useState, type DragEvent } from "react";
import { FileUp, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
  fileRefFor,
  fileNameOf,
  parseFileRefs,
  serializeFileRefs,
} from "./file-refs";

export interface MediaFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** `image/*`, `video/*`, `audio/*`, or undefined for any file. */
  accept?: string;
  multiple?: boolean;
  /** Noun used in the empty state, e.g. "image". */
  noun: string;
  invalid?: boolean;
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/**
 * File picker for the media and file parameter types. References are stored as a
 * JSON array of absolute paths (see file-refs.ts), which is what the node's
 * Python receives.
 */
export function MediaField({
  value,
  onChange,
  accept,
  multiple = false,
  noun,
  invalid,
}: MediaFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const refs = parseFileRefs(value);

  function add(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).map(fileRefFor);
    // Single-value fields replace; multi-value fields append without duplicates.
    onChange(serializeFileRefs(multiple ? [...new Set([...refs, ...picked])] : [picked[picked.length - 1]]));
  }

  function remove(index: number) {
    onChange(serializeFileRefs(refs.filter((_, i) => i !== index)));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded-lg border border-dashed px-3 py-4 text-center transition-colors",
          dragging ? "border-ring bg-accent/40" : "border-border",
          invalid && "border-destructive",
        )}
      >
        <FileUp className="mx-auto mb-1.5 size-4 text-muted-foreground" />

        <p className="text-xs text-muted-foreground">
          Drop {multiple ? `${noun}s` : `${article(noun)} ${noun}`} here, or
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 gap-1.5"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          Choose {multiple ? "files" : "file"}
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(event) => {
            add(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {refs.length > 0 && (
        <ul className="space-y-1">
          {refs.map((ref, index) => (
            <li
              key={`${ref}-${index}`}
              className="flex items-center gap-2 rounded-sm border bg-card px-2 py-1"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={ref}>
                {fileNameOf(ref)}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive"
                onClick={() => remove(index)}
              >
                <X className="size-3.5" />
                <span className="sr-only">Remove {fileNameOf(ref)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MediaField;
