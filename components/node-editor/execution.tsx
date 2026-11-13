import { useState } from "react";
import { Button } from "../ui/button";
import {
  validatePython,
  extractPythonDefinition,
  extractPythonMethods,
  type PythonDiagnostic,
} from "@/lib/python-validator";
import type { PythonMethods } from "@/lib/python-code";
import type { NodeData } from "@/lib/node";

interface ExecutionTabProps {
  value: string;
  onChange: (value: string) => void;
  onDefinitionExtracted: (definition: NodeData) => void;
  onMethodsExtracted: (methods: PythonMethods) => void;
}

export function ExecutionTab({
  value,
  onChange,
  onDefinitionExtracted,
  onMethodsExtracted,
}: ExecutionTabProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PythonDiagnostic[]>([]);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  async function handleValidate() {
    setIsValidating(true);
    setDiagnostics([]);
    setIsValid(null);

    try {
      const result = await validatePython(value);

      if (!result.valid) {
        setIsValid(false);
        setDiagnostics(result.diagnostics);
        return;
      }

      const definition = await extractPythonDefinition(value);
      const methods = await extractPythonMethods(value);

      onDefinitionExtracted(definition);
      onMethodsExtracted(methods);

      setIsValid(true);
      setDiagnostics([]);
    } catch (error) {
      setIsValid(false);
      setDiagnostics([
        {
          message:
            error instanceof Error
              ? error.message
              : "Unable to extract node definition.",
          line: 1,
          column: 0,
        },
      ]);
    } finally {
      setIsValidating(false);
    }
  }

  function handleCodeChange(code: string) {
    onChange(code);
    setIsValid(null);
    setDiagnostics([]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex shrink-0 flex-col items-start gap-0.5 border-b px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">
            Python
          </span>

          <span className="text-sm text-muted-foreground">
            Edit component code
          </span>
        </div>


      </div>

      <div className="min-h-0 flex-1">
        {/* A plain editor on purpose: Monaco loads itself from a CDN by
            injecting a <script>, which the Desktop plugin surface refuses
            (catalog rule 8). */}
        <textarea
          aria-label="Node Python source"
          className="size-full resize-none border-0 bg-[#1e1e1e] p-4 font-mono text-[13px] leading-[21px] text-[#d4d4d4] outline-none"
          onChange={(event) => handleCodeChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            event.preventDefault();
            const field = event.currentTarget;
            const { selectionStart, selectionEnd, value: current } = field;
            const next = `${current.slice(0, selectionStart)}    ${current.slice(selectionEnd)}`;
            handleCodeChange(next);
            requestAnimationFrame(() => {
              field.selectionStart = selectionStart + 4;
              field.selectionEnd = selectionStart + 4;
            });
          }}
          spellCheck={false}
          value={value}
          wrap="on"
        />
      </div>

      {diagnostics.length > 0 && (
        <div className="max-h-28 shrink-0 overflow-y-auto border-t px-4 py-2">
          {diagnostics.map((diagnostic, index) => (
            <div key={index} className="text-xs text-destructive">
              <span className="font-medium">
                Line {diagnostic.line}, Column {diagnostic.column + 1}:
              </span>{" "}
              {diagnostic.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between border-t px-4 py-3">
        <div className="text-xs">
          {isValid === true && (
            <span className="text-green-600">Python syntax is valid.</span>
          )}

          {isValid === false && (
            <span className="text-destructive">
              Please fix the errors before saving.
            </span>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          variant={"outline"}
          onClick={handleValidate}
          disabled={isValidating}
          className={"rounded-sm"}
        >
          {isValidating ? "Validating..." : "Validate Code"}
        </Button>
      </div>
    </div>
  );
}
