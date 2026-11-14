import type { PythonMethods } from "@/lib/python-code";
import { hostRest } from "@/lib/host";
import { dataTypes, type NodeData } from "@/lib/node";

/**
 * Python helpers for the node editor.
 *
 * These used to run Pyodide in the browser. That meant a CDN download, a WASM
 * interpreter and dynamic imports inside the plugin bundle — which the Desktop
 * plugin surface refuses (catalog rule 8). The work is plain AST inspection, so
 * it lives in the plugin backend instead: nothing is executed on either side.
 */

export interface PythonDiagnostic {
  message: string;
  line: number;
  column: number;
}

export interface PythonValidationResult {
  valid: boolean;
  diagnostics: PythonDiagnostic[];
}

export async function validatePython(
  source: string,
): Promise<PythonValidationResult> {
  try {
    return await hostRest<PythonValidationResult>("/validate", {
      method: "POST",
      body: { source },
    });
  } catch (error) {
    return {
      valid: false,
      diagnostics: [
        {
          message:
            error instanceof Error
              ? error.message
              : "Unable to reach the workflow backend.",
          line: 1,
          column: 0,
        },
      ],
    };
  }
}

// Python annotation -> studio type. `str` covers both Text and Dataset (a dataset
// is a path or URL), `list` covers the file collections, `dict` is JSON. Legacy
// numeric/bool annotations from older nodes land on JSON, which accepts scalars.
const pythonToUiType: Record<string, (typeof dataTypes)[number]> = {
  str: "Text",
  dict: "JSON",
  list: "Files",
  Any: "JSON",
  float: "JSON",
  int: "JSON",
  bool: "JSON",
  Image: "Images",
  Audio: "Audios",
  Video: "Videos",
  File: "Files",
};

function toFormDefaultValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

type ExecutionMetadata = {
  name?: unknown;
  description?: unknown;
  category?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  parameters?: unknown;
};

export async function extractPythonDefinition(
  source: string,
): Promise<NodeData> {
  const metadata = await hostRest<ExecutionMetadata>("/node-metadata", {
    method: "POST",
    body: { source },
  });

  function parsePorts(value: unknown) {
    if (!Array.isArray(value)) {
      throw new Error("Inputs and outputs must be Python lists.");
    }

    return value.map((port: Record<string, unknown>) => {
      if (
        typeof port !== "object" ||
        port === null ||
        typeof port.name !== "string" ||
        typeof port.type !== "string"
      ) {
        throw new Error("Each input and output must define a name and type.");
      }

      const type = pythonToUiType[port.type];
      if (!type) {
        throw new Error(`Unsupported Python type: ${port.type}`);
      }

      return {
        name: port.name,
        type,
      };
    });
  }

  const parameters = metadata.parameters ?? {};

  if (
    typeof parameters !== "object" ||
    parameters === null ||
    Array.isArray(parameters)
  ) {
    throw new Error("Parameters must be a Python dictionary.");
  }

  const parsedParameters = Object.entries(parameters).map(
    ([name, parameter]) => {
      const value = parameter as Record<string, unknown>;
      if (typeof value.type !== "string") {
        throw new Error(`Parameter "${name}" is missing its type.`);
      }
      const type = pythonToUiType[value.type];
      if (!type) {
        throw new Error(
          `Unsupported Python type "${value.type}" for parameter "${name}".`,
        );
      }
      return {
        name,
        type,
        defaultValue: toFormDefaultValue(value.default),
      };
    },
  );

  return {
    general: {
      name: typeof metadata.name === "string" ? metadata.name : "",
      description:
        typeof metadata.description === "string" ? metadata.description : "",
      category: typeof metadata.category === "string" ? metadata.category : "",
    },
    io: {
      inputs: parsePorts(metadata.inputs ?? []),
      outputs: parsePorts(metadata.outputs ?? []),
    },
    config: {
      parameters: parsedParameters,
    },
  };
}

export async function extractPythonMethods(
  source: string,
): Promise<PythonMethods> {
  return hostRest<PythonMethods>("/node-methods", {
    method: "POST",
    body: { source },
  });
}
