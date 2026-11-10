import { Download, Eye, File } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NodeValueProps {
  type: string;
  value: unknown;
  available: boolean;
}

function getUrl(value: unknown): string | undefined {
  if (typeof value === "string") return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "url" in value &&
    typeof value.url === "string"
  ) {
    return value.url;
  }

  return undefined;
}

function ValueContent({ type, value }: { type: string; value: unknown }) {
  const normalizedType = type.toLowerCase();

  if (normalizedType === "string" || normalizedType === "text") {
    return (
      <p className="max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word text-sm">
        {String(value)}
      </p>
    );
  }
  if (normalizedType === "number") {
    return (
      <p className="text-lg font-semibold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : String(value)}
      </p>
    );
  }
  if (normalizedType === "boolean") {
    return <p className="text-sm font-medium">{value ? "True" : "False"}</p>;
  }
  if (normalizedType === "image") {
    const url = getUrl(value);
    return url ? (
      <img
        src={url}
        alt="Value preview"
        className="max-h-64 max-w-full rounded-md object-contain"
      />
    ) : (
      <p className="text-sm text-muted-foreground">Invalid image value</p>
    );
  }

  if (normalizedType === "video") {
    const url = getUrl(value);
    return url ? (
      <video src={url} controls className="max-h-64 w-full rounded-md" />
    ) : (
      <p className="text-sm text-muted-foreground">Invalid video value</p>
    );
  }

  if (normalizedType === "audio") {
    const url = getUrl(value);
    return url ? (
      <audio src={url} controls className="w-full" />
    ) : (
      <p className="text-sm text-muted-foreground">Invalid audio value</p>
    );
  }

  if (normalizedType === "file") {
    const url = getUrl(value);

    const name =
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof value.name === "string"
        ? value.name
        : "Download file";

    return url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <File className="size-4 shrink-0" />
        <span className="truncate">{name}</span>
        <Download className="size-4 shrink-0" />
      </a>
    ) : (
      <p className="text-sm text-muted-foreground">Invalid file value</p>
    );
  }

  let formatted: string;
  try {
    formatted = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    formatted = String(value);
  }

  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
      {formatted}
    </pre>
  );
}

export function NodeValue({ type, value, available }: NodeValueProps) {
  if (!available) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <span
            className="nodrag nopan inline-flex cursor-not-allowed"
            tabIndex={0}
          >
            <Eye className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent>No value available yet</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover>
      <PopoverTrigger>
        <Eye className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="center"
        className="w-80 max-w-[calc(100vw-32px)] p-3"
        //onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">Value Preview</span>
          <span className="text-[10px] text-muted-foreground">{type}</span>
        </div>
        <div className="min-w-0">
          <ValueContent type={type} value={value} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
