/**
 * The `defaultValue` of a media/file parameter is a JSON array of string
 * references, so one format covers a single file and any number of them:
 *
 *     ["/Users/sam/data/cat.png"]
 *     ["/Users/sam/data/a.csv", "/Users/sam/data/b.csv"]
 *
 * In the Desktop renderer a picked file normally carries its absolute path.
 * When it does not (a plain browser tab), the file *name* is stored instead, so
 * the parameter still round-trips — the node code simply gets a name, not a path.
 */

export function parseFileRefs(value: string): string[] {
  if (!value.trim()) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    if (typeof parsed === "string") return parsed ? [parsed] : [];
  } catch {
    // Not JSON: a hand-typed single path or name is still a valid reference.
  }

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function serializeFileRefs(refs: string[]): string {
  return refs.length ? JSON.stringify(refs) : "";
}

export function fileRefFor(file: File): string {
  const path = (file as File & { path?: string }).path;
  return path && path.trim() ? path : file.name;
}

export function fileNameOf(ref: string): string {
  const parts = ref.split(/[\\/]/);
  return parts[parts.length - 1] || ref;
}
