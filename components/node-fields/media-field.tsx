import { useMemo, useRef, useState, type DragEvent } from "react";
import { FileUp, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fileNameOf,
  matchesAccept,
  mergeFileRefs,
  parseFileRefs,
  pathForDroppedFile,
  pickMediaPaths,
  serializeFileRefs,
} from "@/lib/file-refs";
import { Button } from "../ui/button";

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

/**
 * File picker for the media and file parameter types.
 *
 * The stored value is a JSON array of absolute paths (see `lib/file-refs.ts`),
 * which is exactly what the node's Python receives and what its generated
 * `ImageFiles` / `VideoFiles` / `AudioFiles` loader turns back into real files.
 * The files stay where the user keeps them — attached by path, nothing copied.
 */
export function MediaField({
  value,
  onChange,
  accept,
  multiple = true,
  noun,
  invalid,
}: MediaFieldProps) {
  // dragenter/dragleave fire for every child element; the depth keeps the
  // highlight on until the pointer really leaves the zone.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refs = useMemo(() => parseFileRefs(value), [value]);

  function commit(paths: string[]) {
    if (paths.length) onChange(mergeFileRefs(refs, paths, multiple));
  }

  async function pick() {
    setError(null);
    setPicking(true);
    try {
      commit(await pickMediaPaths({ accept, noun, multiple }));
    } catch (pickError) {
      setError(
        pickError instanceof Error
          ? pickError.message
          : "Could not open the file picker.",
      );
    } finally {
      setPicking(false);
    }
  }

  function addDropped(files: File[]) {
    if (!files.length) return;

    const accepted = accept
      ? files.filter((file) => matchesAccept(file, accept))
      : files;

    const paths: string[] = [];
    const unresolved: string[] = [];
    for (const file of accepted) {
      const path = pathForDroppedFile(file);
      if (path) paths.push(path);
      else unresolved.push(file.name);
    }

    const skipped = files.length - accepted.length;
    if (skipped > 0) {
      setError(
        `Skipped ${skipped} file${skipped === 1 ? "" : "s"} — this field accepts ${accept}.`,
      );
    } else if (unresolved.length) {
      setError(
        `No path for ${unresolved.join(", ")} — drop files from Finder into the app window.`,
      );
    } else {
      setError(null);
    }

    commit(paths);
  }

  function remove(index: number) {
    onChange(
      serializeFileRefs(refs.filter((_, position) => position !== index)),
    );
    setError(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addDropped(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="space-y-2">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          // Without preventDefault the browser navigates to the dropped file.
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "rounded-lg border border-dashed px-3 py-4 text-center transition-colors",
          dragging ? "border-ring bg-accent/40" : "border-border",
          !dragging && invalid && "border-destructive",
        )}
      >
        <FileUp className="mx-auto mb-1.5 size-4 text-muted-foreground" />

        <p className="text-xs text-muted-foreground">
          Drop {multiple ? `${noun}s` : `a ${noun}`} here, or
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 gap-1.5"
          aria-busy={picking}
          disabled={picking}
          onClick={() => void pick()}
        >
          {picking ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          Choose {multiple ? "files" : "file"}
        </Button>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Absolute paths are stored — the files stay where they are.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {refs.length > 0 && (
        <ul className="space-y-1">
          {refs.map((ref, index) => (
            <li
              key={ref}
              className="flex items-center gap-2 rounded-sm border bg-card px-2 py-1"
            >
              <span
                className="min-w-0 flex-1 truncate font-mono text-[11px]"
                title={ref}
              >
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
