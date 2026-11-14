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

export interface PythonMethods {
  run?: string;
  build_output?: string;
}

/** The class's own methods start at an indented `def`; module-level helpers don't. */
const INDENTED_DEF = /^[ \t]+(?:async[ \t]+)?def[ \t]+/m;

function splitAtFirstMethod(code: string): { head: string; body: string } {
  const match = INDENTED_DEF.exec(code);
  if (!match) return { head: code, body: "" };
  return { head: code.slice(0, match.index), body: code.slice(match.index) };
}

/**
 * Refresh the class metadata (name, description, io, parameters) from the form
 * while keeping whatever the node's methods already do.
 *
 * Regenerating the whole file on a Config-tab edit used to replace `run` and
 * `build_output` with the stubs whenever the method bodies had not been
 * extracted into `PythonMethods` — editing one default silently deleted the
 * node's logic. The body after the first indented `def` is preserved verbatim.
 */
export function syncExecutionMetadata(source: string, data: NodeData): string {
  const generated = generatePythonCode(data);
  const { body } = splitAtFirstMethod(source);
  if (!body.trim()) return generated;

  return splitAtFirstMethod(generated).head + body;
}

export function generatePythonCode(
  nodeData: NodeData,
  methods: PythonMethods = {},
): string {
  const { general, io, config } = nodeData;
  const imports = "from typing import Any";

  const inputLines =
    io?.inputs.map(
      (port) =>
        `        {"name": ${toPythonString(port.name)}, "type": ${pythonTypes[port.type] ?? "Any"}},`,
    ) || [];
  const outputLines =
    io?.outputs.map(
      (port) =>
        `        {"name": ${toPythonString(port.name)}, "type": ${pythonTypes[port.type] ?? "Any"}},`,
    ) || [];
  const parameterLines =
    config?.parameters.map(
      (parameter) =>
        `        ${toPythonString(parameter.name)}: {\n            "type": ${pythonTypes[parameter.type] ?? "Any"},\n            "default": ${getDefaultValue(parameter.type, parameter.defaultValue)},\n        },`,
    ) || [];

  const runMethod =
    methods.run ??
    `def run(self, inputs, parameters, context):
        pass`;

  const buildOutputMethod =
    methods.build_output ??
    `def build_output(self, inputs, parameters, context):
        return self.run(inputs, parameters, context)`;

  return `${imports}


class Execution:
    name: str = ${toPythonString(general.name)}
    description: str = ${toPythonString(general.description)}
    category: str = ${toPythonString(general?.category ?? "")}

    inputs: list[dict] = [
${inputLines.join("\n")}
    ]

    outputs: list[dict] = [
${outputLines.join("\n")}
    ]

    parameters: dict = {
${parameterLines.join("\n")}
    }

    ${runMethod}

    ${buildOutputMethod}
`;
}
