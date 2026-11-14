import { useId } from "react";
import {
  Braces,
  Database,
  File,
  FileAudio,
  FileImage,
  FileVideo,
  Type,
  Upload,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { dataTypes } from "@/lib/node";
import { Label } from "../ui/label";

export type PortValueType = (typeof dataTypes)[number];

interface PortValueFieldProps {
  type: PortValueType;
  value?: unknown;
  onChange?: (value: unknown) => void;
  disabled?: boolean;
}

const typeIcons = {
  Text: Type,
  Dataset: Database,
  Images: FileImage,
  Videos: FileVideo,
  Audios: FileAudio,
  Files: File,
  JSON: Braces,
};

const fieldClass = cn(
  "h-9 rounded-lg border-border/70 bg-background/60",
  "text-xs shadow-none placeholder:text-muted-foreground/50",
  "focus-visible:border-primary/60 focus-visible:ring-2",
  "focus-visible:ring-primary/10",
);

function isFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function FileField({ type, value, onChange }: PortValueFieldProps) {
  const id = useId();
  const Icon = typeIcons[type];
  const accept: Partial<Record<PortValueType, string>> = {
    Images: "image/*",
    Audios: "audio/*",
    Videos: "video/*",
  };
  const acceptedTypes = accept[type];
  const file = isFile(value) ? value : null;
  const noun = type.slice(0, -1).toLowerCase();

  return (
    <Label
      htmlFor={id}
      className={cn(
        "group flex min-h-14 cursor-pointer items-center gap-3",
        "rounded-lg border border-dashed border-border/80",
        "bg-background/40 px-3 py-2",
        "transition-colors hover:border-primary/50 hover:bg-primary/3",
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary">
        <Icon className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">
          {file?.name ?? `Choose ${noun}`}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {file
            ? `${(file.size / 1024).toFixed(1)} KB`
            : "Click to browse files"}
        </p>
      </div>

      <Upload className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />

      <Input
        id={id}
        type="file"
        accept={acceptedTypes}
        className="sr-only"
        onChange={(event) => onChange?.(event.target.files?.[0] ?? null)}
      />
    </Label>
  );
}

export function PortValueField({
  type,
  value,
  onChange,
  disabled,
}: PortValueFieldProps) {
  switch (type) {
    case "Text":
      return (
        <Input
          className={fieldClass}
          placeholder="Enter text..."
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value)}
        />
      );

    case "Dataset":
      return (
        <Input
          className={cn(fieldClass, "font-mono")}
          placeholder="/data/mnist or https://example.com/dataset.csv"
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value)}
        />
      );

    case "JSON":
      return (
        <Textarea
          className="min-h-20 resize-y rounded-lg border-border/70 bg-background/60 font-mono text-xs shadow-none"
          placeholder={'{\n  "key": "value"\n}'}
          value={
            typeof value === "string"
              ? value
              : value == null
                ? ""
                : JSON.stringify(value, null, 2)
          }
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value)}
        />
      );

    case "Images":
    case "Videos":
    case "Audios":
    case "Files":
      return (
        <FileField
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );

    default:
      return (
        <Textarea
          className="min-h-16 resize-y rounded-lg border-border/70 bg-background/60 text-xs shadow-none"
          placeholder="Enter a value..."
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value)}
        />
      );
  }
}
