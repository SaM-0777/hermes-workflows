import type { ConfigFormValues } from "@/components/node-editor/config";
import type { GeneralFormValues } from "@/components/node-editor/general";
import type { IoFormValues } from "@/components/node-editor/io";

export interface NodeDefinition {
  general: GeneralFormValues;
  io: IoFormValues;
  config: ConfigFormValues;
}

export const pythonTypes: Record<string, string> = {
  Any: "Any",
  String: "str",
  Number: "float",
  Boolean: "bool",
  Object: "dict",
  Array: "list",
  Image: "Image",
  Audio: "Audio",
  Video: "Video",
  File: "File",
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

function getDefaultValue(type: string, value: string): string {
  if (!value.trim()) return "None";

  switch (type) {
    case "String":
      return toPythonString(value);

    case "Number": {
      const number = Number(value);
      return Number.isFinite(number) ? String(number) : "None";
    }

    case "Boolean":
      return value === "true" ? "True" : value === "false" ? "False" : "None";

    case "Object":
    case "Array":
    case "Any":
      try {
        return toPythonValue(JSON.parse(value));
      } catch {
        return "None";
      }

    default:
      return "None";
  }
}

export interface PythonMethods {
  run?: string;
  build_output?: string;
}

export function generatePythonCode(
  definition: NodeDefinition,
  methods: PythonMethods = {},
): string {
  const { general, io, config } = definition;
  const imports = "from typing import Any";

  const inputLines = io.inputs.map(
    (port) =>
      `        {"name": ${toPythonString(port.name)}, "type": ${pythonTypes[port.type] ?? "Any"}},`,
  );
  const outputLines = io.outputs.map(
    (port) =>
      `        {"name": ${toPythonString(port.name)}, "type": ${pythonTypes[port.type] ?? "Any"}},`,
  );
  const parameterLines = config.parameters.map(
    (parameter) =>
      `        ${toPythonString(parameter.name)}: {\n            "type": ${pythonTypes[parameter.type] ?? "Any"},\n            "default": ${getDefaultValue(parameter.type, parameter.defaultValue)},\n        },`,
  );

  const runMethod =
    methods.run ??
    `    def run(self, inputs, parameters, context):
        pass`;

  const buildOutputMethod =
    methods.build_output ??
    `    def build_output(self, inputs, parameters, context):
        return self.run(inputs, parameters, context)`;

  return `${imports}


class Execution:
    name: str = ${toPythonString(general.name)}
    description: str = ${toPythonString(general.description)}
    category: str = ${toPythonString(general.category)}

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
