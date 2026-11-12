import { loadPyodide, version, type PyodideInterface } from "pyodide";
import type { PythonMethods } from "@/lib/python-code";
import { dataTypes, type NodeData } from "@/lib/node";

export interface PythonDiagnostic {
  message: string;
  line: number;
  column: number;
}

export interface PythonValidationResult {
  valid: boolean;
  diagnostics: PythonDiagnostic[];
}

let pyodidePromise: Promise<PyodideInterface> | undefined;
async function getPyodide(): Promise<PyodideInterface> {
  if (!pyodidePromise) {
    pyodidePromise = loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${version}/full/`,
    });
  }

  return pyodidePromise;
}

export async function validatePython(
  source: string,
): Promise<PythonValidationResult> {
  try {
    const pyodide = await getPyodide();
    const result = await pyodide.runPythonAsync(`
import ast
import json

source = ${JSON.stringify(source)}
try:
    ast.parse(source)
    result = {
        "valid": True,
        "diagnostics": []
    }
except SyntaxError as error:
    result = {
        "valid": False,
        "diagnostics": [{
            "message": error.msg,
            "line": error.lineno or 1,
            "column": max((error.offset or 1) - 1, 0)
        }]
    }
json.dumps(result)
`);
    return JSON.parse(result as string) as PythonValidationResult;
  } catch (error) {
    return {
      valid: false,
      diagnostics: [
        {
          message:
            error instanceof Error
              ? error.message
              : "Unable to initialize Python validator.",
          line: 1,
          column: 0,
        },
      ],
    };
  }
}

const pythonToUiType: Record<string, (typeof dataTypes)[number]> = {
  Any: "Any",
  str: "String",
  float: "Number",
  int: "Number",
  bool: "Boolean",
  dict: "Object",
  list: "Array",
  Image: "Image",
  Audio: "Audio",
  Video: "Video",
  File: "File",
};

function toFormDefaultValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export async function extractPythonDefinition(
  source: string,
): Promise<NodeData> {
  const pyodide = await getPyodide();

  // Pass source through Pyodide's globals instead of interpolating it
  // into Python code.
  pyodide.globals.set("workflow_source", source);

  try {
    const result = await pyodide.runPythonAsync(`
import ast
import json

tree = ast.parse(workflow_source)
execution_class = next(
    (
        node for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "Execution"
    ),
    None
)

if execution_class is None:
    raise ValueError("Could not find class Execution.")

metadata = {}

for statement in execution_class.body:
    if not isinstance(statement, ast.AnnAssign):
        continue

    if not isinstance(statement.target, ast.Name):
        continue

    name = statement.target.id

    if name not in ("name", "description", "category", "inputs", "outputs", "parameters"):
        continue

    try:
      def read_value(node):
        if isinstance(node, ast.Constant):
            return node.value

        if isinstance(node, ast.Name):
            allowed_types = {
                "Any", "str", "float", "int", "bool",
                "dict", "list", "Image", "Audio", "Video", "File"
            }

            if node.id in allowed_types:
                return node.id

            raise ValueError(f"Unsupported identifier: {node.id}")

        if isinstance(node, ast.List):
            return [read_value(item) for item in node.elts]

        if isinstance(node, ast.Tuple):
            return tuple(read_value(item) for item in node.elts)

        if isinstance(node, ast.Dict):
            return {
                read_value(key): read_value(value)
                for key, value in zip(node.keys, node.values)
            }

        raise ValueError("Metadata must contain literal values.")

      metadata[name] = read_value(statement.value)
    except (ValueError, TypeError):
        raise ValueError(f"Execution.{name} must contain a literal value.")

json.dumps(metadata)
`);

    const metadata = JSON.parse(result as string);

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
        name: metadata.name ?? "",
        description: metadata.description ?? "",
        category: metadata.category ?? "",
      },
      io: {
        inputs: parsePorts(metadata.inputs ?? []),
        outputs: parsePorts(metadata.outputs ?? []),
      },
      config: {
        parameters: parsedParameters,
      },
    };
  } finally {
    pyodide.globals.delete("workflow_source");
  }
}

export async function extractPythonMethods(
  source: string,
): Promise<PythonMethods> {
  const pyodide = await getPyodide();

  pyodide.globals.set("workflow_source", source);

  try {
    const result = await pyodide.runPythonAsync(`
import ast
import json

tree = ast.parse(workflow_source)
lines = workflow_source.splitlines()

execution_class = next(
    (
        node for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "Execution"
    ),
    None
)

if execution_class is None:
    raise ValueError("Could not find class Execution.")

methods = {}

for node in execution_class.body:
    if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        continue
    if node.name not in ("run", "build_output"):
        continue
    start_line = min(
        [node.lineno] + [decorator.lineno for decorator in node.decorator_list]
    )
    end_line = node.end_lineno
    methods[node.name] = "\\n".join(lines[start_line - 1:end_line])

json.dumps(methods)
`);

    return JSON.parse(result as string) as PythonMethods;
  } finally {
    pyodide.globals.delete("workflow_source");
  }
}
