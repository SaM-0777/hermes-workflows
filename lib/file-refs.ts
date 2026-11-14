/**
 * Media references as the studio stores them.
 *
 * A media parameter or port holds a JSON array of absolute paths, e.g.
 * `["/Users/me/Pictures/a.png", "/Users/me/Pictures/b.png"]`. The node's Python
 * receives exactly that array and turns it into real files with the loader
 * classes `lib/python-code.ts` generates (`ImageFiles`, `VideoFiles`,
 * `AudioFiles`). Nothing is copied and nothing is uploaded: the paths are the
 * user's own files, straight from the OS.
 *
 * The renderer gets those paths from Hermes Desktop's preload bridge —
 * `selectPaths()` for the native picker, `getPathForFile()` for a dropped File.
 */
import type { HermesDesktopFileBridge } from "@/lib/desktop";

const EMPTY: string[] = [];

/** Extensions the native dialog should offer for an `accept` value. */
const ACCEPT_EXTENSIONS: Record<string, string[]> = {
  "image/*": ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "avif"],
  "video/*": ["mp4", "mov", "m4v", "webm", "avi", "mkv", "mpeg", "mpg"],
  "audio/*": ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "aiff", "aif"],
};

function bridge(): HermesDesktopFileBridge | undefined {
  return typeof window === "undefined" ? undefined : window.hermesDesktop;
}

/** Read the stored value back as paths. Anything unparseable is one raw path. */
export function parseFileRefs(value: string | undefined | null): string[] {
  const text = (value ?? "").trim();
  if (!text) return EMPTY;

  if (text.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item.length > 0);
      }
    } catch {
      // Fall through: a hand-edited value is still one path.
    }
  }

  return [text];
}

/** The inverse: paths back to the stored string, dropping blanks and repeats. */
export function serializeFileRefs(refs: string[]): string {
  const unique = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
  return unique.length ? JSON.stringify(unique) : "";
}

/** Append to (or, for a single-value field, replace) what is already stored. */
export function mergeFileRefs(
  current: string[],
  added: string[],
  multiple: boolean,
): string {
  return serializeFileRefs(multiple ? [...current, ...added] : added.slice(-1));
}

/** Last segment of a path, for display. */
export function fileNameOf(ref: string): string {
  const normalized = ref.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || ref;
}

/** Does this file satisfy an `accept` list (`image/*`, `.png`, `video/*`…)? */
export function matchesAccept(file: File, accept?: string): boolean {
  const rules = (accept ?? "")
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (!rules.length) return true;

  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  return rules.some((rule) => {
    if (rule === "*" || rule === "*/*") return true;
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) {
      const family = rule.slice(0, rule.indexOf("/"));
      return type.startsWith(`${family}/`);
    }
    return type === rule;
  });
}

/** Native-dialog filters for an `accept` value, or undefined for any file. */
export function filtersForAccept(
  accept?: string,
  noun = "file",
): { name: string; extensions: string[] }[] | undefined {
  const rules = (accept ?? "")
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (!rules.length) return undefined;

  const extensions = rules.flatMap((rule) => {
    if (ACCEPT_EXTENSIONS[rule]) return ACCEPT_EXTENSIONS[rule];
    if (rule.startsWith(".")) return [rule.slice(1)];
    return [];
  });

  const unique = [...new Set(extensions)].filter(Boolean);
  if (!unique.length) return undefined;

  return [
    { name: noun.charAt(0).toUpperCase() + noun.slice(1), extensions: unique },
  ];
}

/**
 * Open the OS file picker and return the absolute paths the user chose.
 * Cancelling resolves to `[]`.
 */
export async function pickMediaPaths({
  accept,
  noun,
  multiple = true,
}: {
  accept?: string;
  noun: string;
  multiple?: boolean;
}): Promise<string[]> {
  const desktop = bridge();
  if (!desktop?.selectPaths) {
    throw new Error(
      "Reading file paths needs Hermes Desktop — open the studio in the app to attach media.",
    );
  }

  const picked = await desktop.selectPaths({
    title: multiple ? `Choose ${noun}s` : `Choose a ${noun}`,
    multiple,
    filters: filtersForAccept(accept, noun),
  });

  return picked.filter((path) => typeof path === "string" && path.length > 0);
}

/** Absolute path of a dropped file, or "" when the app cannot supply one. */
export function pathForDroppedFile(file: File): string {
  const desktop = bridge();
  if (!desktop?.getPathForFile) return "";
  try {
    return desktop.getPathForFile(file) || "";
  } catch {
    return "";
  }
}
