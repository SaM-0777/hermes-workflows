import { Download, Eye, File, ExternalLink } from "lucide-react";
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

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const IMAGE_QUERY = /[?&](format|f)=image%2f(png|jpe?g|gif|webp)/i;
const MAX_IMAGES = 8;

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

function isImageUrl(url: string): boolean {
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("blob:")) return true;
  if (IMAGE_EXTENSION.test(url)) return true;
  if (IMAGE_QUERY.test(url)) return true;
  return false;
}

interface ImageReference {
  url: string;
  label: string;
}

function readString(value: object, key: string): string | undefined {
  if (!(key in value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function describeReference(value: object): string {
  const parts = [
    readString(value, "role"),
    readString(value, "observation_date") ?? readString(value, "date"),
    readString(value, "name") ?? readString(value, "layer"),
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ");
}

function collectImageReferences(
  value: unknown,
  depth = 0,
  collected: ImageReference[] = [],
): ImageReference[] {
  if (collected.length >= MAX_IMAGES || depth > 6 || value === null) {
    return collected;
  }

  if (typeof value === "string") {
    if (isImageUrl(value)) collected.push({ url: value, label: "" });
    return collected;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageReferences(item, depth + 1, collected);
      if (collected.length >= MAX_IMAGES) break;
    }
    return collected;
  }

  if (typeof value === "object") {
    const url = getUrl(value);
    const contentType = readString(value, "content_type") ?? readString(value, "contentType");
    const looksLikeImage =
      typeof url === "string" &&
      (isImageUrl(url) ||
        (typeof contentType === "string" && contentType.startsWith("image/")));

    if (looksLikeImage && typeof url === "string") {
      collected.push({ url, label: describeReference(value) });
      return collected;
    }

    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectImageReferences(nested, depth + 1, collected);
      if (collected.length >= MAX_IMAGES) break;
    }
  }

  return collected;
}

function ImageGallery({
  references,
  emptyLabel,
}: {
  references: ImageReference[];
  emptyLabel: string;
}) {
  if (references.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {references.map((reference, index) => (
        <figure key={`${reference.url}-${index}`} className="space-y-1">
          <a
            href={reference.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-md border border-border bg-muted/40"
            title={reference.url}
          >
            <img
              src={reference.url}
              alt={reference.label || "Image preview"}
              loading="lazy"
              className="max-h-56 w-full object-contain"
            />
          </a>
          <figcaption className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span className="truncate">{reference.label || "image"}</span>
            <ExternalLink className="size-3 shrink-0" />
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function ValueContent({ type, value }: { type: string; value: unknown }) {
  const normalizedType = type.toLowerCase();

  if (normalizedType === "string" || normalizedType === "text") {
    if (typeof value === "string" && isImageUrl(value)) {
      return (
        <div className="space-y-2">
          <ImageGallery references={[{ url: value, label: "" }]} emptyLabel="" />
          <p className="wrap-break-word text-xs text-muted-foreground">{value}</p>
        </div>
      );
    }
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

  const references = collectImageReferences(value);

  if (references.length > 0) {
    return (
      <div className="space-y-3">
        <ImageGallery
          references={references}
          emptyLabel="No image references found"
        />
        <details className="rounded-md bg-muted/60 p-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Raw value
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto text-xs leading-relaxed">
            {formatted}
          </pre>
        </details>
      </div>
    );
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
        className="w-96 max-w-[calc(100vw-32px)] p-3"
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
