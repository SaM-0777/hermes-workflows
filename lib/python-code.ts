import type { NodeData } from "./node";

export const pythonTypes: Record<string, string> = {
  Text: "str",
  Dataset: "str",
  JSON: "dict",
  Images: "list",
  Videos: "list",
  Audios: "list",
  Files: "list",
};

/** Media types declare their loader alongside the port, e.g. `"media": "image"`. */
export const mediaKinds: Partial<Record<string, string>> = {
  Images: "image",
  Videos: "video",
  Audios: "audio",
};

export type MediaKind = "image" | "video" | "audio";

function toPythonString(value: string): string {
  return JSON.stringify(value);
}

function toPythonValue(value: unknown): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "None";
  }
  if (typeof value === "string") return toPythonString(value);

  if (Array.isArray(value)) {
    return `[${value.map(toPythonValue).join(", ")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.entries(value)
      .map(([key, item]) => `${toPythonString(key)}: ${toPythonValue(item)}`)
      .join(", ")}}`;
  }

  return "None";
}

/** File-valued parameters store a JSON array of path references. */
function fileRefsOf(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // A hand-typed single path is still a usable reference.
  }
  return value.trim() ? [value.trim()] : [];
}

function getDefaultValue(type: string, value: string): string {
  if (!value.trim()) return "None";

  switch (type) {
    case "Text":
    case "Dataset":
      return toPythonString(value);

    case "JSON":
      try {
        return toPythonValue(JSON.parse(value));
      } catch {
        return "None";
      }

    case "Images":
    case "Videos":
    case "Audios":
    case "Files":
      return toPythonValue(fileRefsOf(value));

    default:
      return "None";
  }
}

/**
 * The shared half of the generated loader: value parsing plus the path-backed
 * file wrapper every media class builds on.
 */
const MEDIA_BASE = `import json
from pathlib import Path
from typing import Any


def _media_paths(value: Any) -> list[str]:
    """A stored media value -> its absolute paths, in order, deduplicated.

    Accepts what the studio actually hands over: a JSON array string, a list of
    paths, a single path, or a parameter entry such as {"default": [...]}.
    """
    if isinstance(value, dict):
        value = value.get("default", value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            value = json.loads(text)
        except ValueError:
            value = text
    if value is None:
        return []
    if isinstance(value, (str, Path)):
        value = [value]

    paths: list[str] = []
    for item in value:
        if isinstance(item, dict):
            item = item.get("path") or item.get("default")
        if not item:
            continue
        path = Path(str(item)).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        text = str(path)
        if text not in paths:
            paths.append(text)
    return paths


class MediaFile:
    """One file on disk, addressed by absolute path."""

    kind = "file"

    def __init__(self, path: Any) -> None:
        resolved = Path(path).expanduser()
        self.path = (
            resolved if resolved.is_absolute() else (Path.cwd() / resolved).resolve()
        )

    @property
    def name(self) -> str:
        return self.path.name

    @property
    def suffix(self) -> str:
        return self.path.suffix.lower()

    @property
    def exists(self) -> bool:
        return self.path.is_file()

    @property
    def size(self) -> int:
        return self.path.stat().st_size

    def open(self, mode: str = "rb"):
        return self.path.open(mode)

    def read_bytes(self) -> bytes:
        return self.path.read_bytes()

    def _require(self) -> Path:
        if not self.exists:
            raise FileNotFoundError(f"Missing {self.kind} file: {self.path}")
        return self.path

    def __fspath__(self) -> str:
        return str(self.path)

    def __repr__(self) -> str:
        return f"{type(self).__name__}({str(self.path)!r})"
`;

const MEDIA_KINDS: Record<
  MediaKind,
  { noun: string; doc: string; file: string; collection: string; load: string }
> = {
  image: {
    noun: "image",
    doc: "An image on disk; `load()` returns the decoded Pillow image.",
    file: "ImageFile",
    collection: "ImageFiles",
    load: `    def load(self) -> Any:
        try:
            from PIL import Image
        except ImportError as error:
            raise ImportError("ImageFile.load() needs Pillow: pip install pillow") from error

        with Image.open(self._require()) as handle:
            return handle.convert("RGB").copy()`,
  },
  video: {
    noun: "video",
    doc: "A video on disk; `load()` returns the moviepy clip.",
    file: "VideoFile",
    collection: "VideoFiles",
    load: `    def load(self) -> Any:
        try:
            from moviepy import VideoFileClip
        except ImportError as error:
            raise ImportError("VideoFile.load() needs moviepy: pip install moviepy") from error

        return VideoFileClip(str(self._require()))`,
  },
  audio: {
    noun: "audio",
    doc: "An audio file on disk; `load()` returns (samples, sample_rate).",
    file: "AudioFile",
    collection: "AudioFiles",
    load: `    def load(self) -> Any:
        path = self._require()
        try:
            import soundfile
        except ImportError:
            try:
                from moviepy import AudioFileClip
            except ImportError as error:
                raise ImportError(
                    "AudioFile.load() needs soundfile or moviepy: pip install soundfile"
                ) from error
            return AudioFileClip(str(path))
        return soundfile.read(str(path), always_2d=False)`,
  },
};

/** One loader pair per media type the node actually declares. */
function mediaClasses(kinds: MediaKind[]): string {
  return kinds
    .map((kind) => {
      const { noun, doc, file, collection, load } = MEDIA_KINDS[kind];
      return `

class ${file}(MediaFile):
    """${doc}"""

    kind = "${kind}"

${load}


class ${collection}:
    """Absolute ${noun} paths in, real ${noun}s out.

    \`files\` holds the path references, \`load()\` the decoded ${noun}s — both in
    the order the paths were stored in.
    """

    kind = "${kind}"

    def __init__(self, value: Any = None) -> None:
        self.files = [${file}(path) for path in _media_paths(value)]

    def load(self) -> list[Any]:
        return [item.load() for item in self.files]

    def missing(self) -> list[str]:
        return [str(item.path) for item in self.files if not item.exists]

    def __iter__(self):
        return iter(self.files)

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, index: int) -> ${file}:
        return self.files[index]
`;
    })
    .join("");
}

/** Every media type used by an input, an output or a parameter, in type order. */
function usedMediaKinds(nodeData: NodeData): MediaKind[] {
  const used = new Set<MediaKind>();
  const ports = [...(nodeData.io?.inputs ?? []), ...(nodeData.io?.outputs ?? [])];
  const parameters = nodeData.config?.parameters ?? [];

  for (const entry of [...ports, ...parameters]) {
    const kind = mediaKinds[entry.type];
    if (kind === "image" || kind === "video" || kind === "audio") used.add(kind);
  }

  return (["image", "video", "audio"] as MediaKind[]).filter((kind) =>
    used.has(kind),
  );
}

/**
 * The `run` stub handed to a node that has no body yet.
 *
 * When the node declares media, the stub builds the loaders inside `Execution`
 * so the classes above it are wired up instead of sitting unused: refs are
 * cheap (no disk read), and `.load()` does the decoding when the author wants it.
 */
function defaultRunMethod(
  inputs: { name: string; type: string }[],
  parameters: { name: string; type: string }[],
): string {
  const collectionFor = (type: string) => {
    const kind = mediaKinds[type];
    return kind === "image"
      ? "ImageFiles"
      : kind === "video"
        ? "VideoFiles"
        : kind === "audio"
          ? "AudioFiles"
          : null;
  };

  const inputRefs = inputs
    .map((port) => ({ name: port.name, loader: collectionFor(port.type) }))
    .filter((entry): entry is { name: string; loader: string } => !!entry.loader);
  const parameterRefs = parameters
    .map((parameter) => ({
      name: parameter.name,
      loader: collectionFor(parameter.type),
    }))
    .filter((entry): entry is { name: string; loader: string } => !!entry.loader);

  if (!inputRefs.length && !parameterRefs.length) {
    return `def run(self, inputs, parameters, context):
        pass`;
  }

  const lines = [`def run(self, inputs, parameters, context):`];
  lines.push(
    "        # Media arrives as absolute paths; .load() reads the real files off disk.",
  );
  if (inputRefs.length) {
    lines.push("        input_media = {");
    for (const ref of inputRefs) {
      lines.push(
        `            ${toPythonString(ref.name)}: ${ref.loader}(inputs.get(${toPythonString(ref.name)})),`,
      );
    }
    lines.push("        }");
  }
  if (parameterRefs.length) {
    lines.push("        parameter_media = {");
    for (const ref of parameterRefs) {
      lines.push(
        `            ${toPythonString(ref.name)}: ${ref.loader}(parameters.get(${toPythonString(ref.name)})),`,
      );
    }
    lines.push("        }");
  }
  lines.push("        pass");
  return lines.join("\n");
}

export interface PythonMethods {
  run?: string;
  build_output?: string;
}

/**
 * The methods to preserve are the ones inside `class Execution` — the media
 * loader classes above it also have indented `def`s, so splitting at "the first
 * indented def" would cut inside `MediaFile` and drop the Execution header.
 */
const EXECUTION_CLASS = /^class[ \t]+Execution[ \t]*:/m;
const INDENTED_DEF = /^[ \t]+(?:async[ \t]+)?def[ \t]+/m;

function splitExecutionMethods(code: string): { head: string; body: string } {
  const classMatch = EXECUTION_CLASS.exec(code);
  if (!classMatch) return { head: code, body: "" };

  const fromClass = code.slice(classMatch.index);
  const methodMatch = INDENTED_DEF.exec(fromClass);
  if (!methodMatch) return { head: code, body: "" };

  const index = classMatch.index + methodMatch.index;
  return { head: code.slice(0, index), body: code.slice(index) };
}

/**
 * Methods left behind in a file whose `Execution` class was lost — the symptom
 * of the old split bug, which pasted them into whichever helper class came
 * first. They are still indented and still worth keeping, so a node that was
 * broken recovers its logic on the next form edit instead of only its skeleton.
 */
const METHOD_START = /^[ \t]+(?:async[ \t]+)?def[ \t]+(?:run|build_output)[ \t]*\(/m;

function recoverExecutionMethods(code: string): string {
  const match = METHOD_START.exec(code);
  if (!match) return "";

  const kept: string[] = [];
  for (const [index, line] of code.slice(match.index).split("\n").entries()) {
    // A line back at column 0 ends the class body.
    if (index > 0 && /^\S/.test(line)) break;
    kept.push(line);
  }

  return kept.join("\n").replace(/\s+$/, "");
}

/**
 * Refresh the class metadata (name, description, io, parameters) from the form
 * while keeping whatever the node's methods already do.
 *
 * Regenerating the whole file on a Config-tab edit used to replace `run` and
 * `build_output` with the stubs whenever the method bodies had not been
 * extracted into `PythonMethods` — editing one default silently deleted the
 * node's logic. Everything from `Execution`'s first method to the end of the
 * file is preserved verbatim; the media loaders above it are regenerated from
 * the declared types.
 */
export function syncExecutionMetadata(source: string, data: NodeData): string {
  const generated = generatePythonCode(data);
  const head = splitExecutionMethods(generated).head;

  const { body } = splitExecutionMethods(source);
  if (body.trim()) return head + body;

  const recovered = recoverExecutionMethods(source);
  if (recovered) return `${head}${recovered}\n`;

  return generated;
}

/** The `"type": …, "media": …` entries for one port or parameter. */
function describeEntries(type: string): string[] {
  const pythonType = pythonTypes[type] ?? "Any";
  const media = mediaKinds[type];
  const entries = [`"type": ${pythonType}`];
  if (media) entries.push(`"media": ${toPythonString(media)}`);
  return entries;
}

export function generatePythonCode(
  nodeData: NodeData,
  methods: PythonMethods = {},
): string {
  const { general, io, config } = nodeData;
  const kinds = usedMediaKinds(nodeData);
  const needsMedia = kinds.length > 0;

  const imports = needsMedia ? "" : "from typing import Any";
  const mediaBlock = needsMedia ? `\n${MEDIA_BASE}${mediaClasses(kinds)}` : "";

  const inputLines =
    io?.inputs.map(
      (port) =>
        `        {"name": ${toPythonString(port.name)}, ${describeEntries(
          port.type,
        ).join(", ")}},`,
    ) || [];
  const outputLines =
    io?.outputs.map(
      (port) =>
        `        {"name": ${toPythonString(port.name)}, ${describeEntries(
          port.type,
        ).join(", ")}},`,
    ) || [];
  const parameterLines =
    config?.parameters.map((parameter) => {
      const entries = [
        ...describeEntries(parameter.type),
        `"default": ${getDefaultValue(parameter.type, parameter.defaultValue)}`,
      ];
      return `        ${toPythonString(parameter.name)}: {\n${entries
        .map((entry) => `            ${entry},`)
        .join("\n")}\n        },`;
    }) || [];

  const runMethod =
    methods.run ?? defaultRunMethod(io?.inputs ?? [], config?.parameters ?? []);

  const buildOutputMethod =
    methods.build_output ??
    `def build_output(self, inputs, parameters, context):
        return self.run(inputs, parameters, context)`;

  const separator = needsMedia ? "\n\n" : "\n\n\n";

  // Empty collections render as `[]` / `{}` rather than a list with a blank body.
  const listBlock = (name: string, lines: string[]) =>
    lines.length
      ? `    ${name}: list[dict] = [\n${lines.join("\n")}\n    ]`
      : `    ${name}: list[dict] = []`;
  const dictBlock = (lines: string[]) =>
    lines.length
      ? `    parameters: dict = {\n${lines.join("\n")}\n    }`
      : `    parameters: dict = {}`;

  return `${imports}${mediaBlock}${separator}class Execution:
    name: str = ${toPythonString(general.name)}
    description: str = ${toPythonString(general.description)}
    category: str = ${toPythonString(general.category ?? "")}

${listBlock("inputs", inputLines)}

${listBlock("outputs", outputLines)}

${dictBlock(parameterLines)}

    ${runMethod}

    ${buildOutputMethod}
`;
}
