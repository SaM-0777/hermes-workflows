import {
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  SandboxedFrame,
  host,
  Button,
  Codicon,
} from "@hermes/plugin-sdk";
import { useState } from "react";

export function WorkflowLibraryPage({ ctx }: { ctx: any }) {
  const [workflows, setWorkflows] = useState<>([]);
  const [pending, setPending] = useState<boolean>(true);
  const [createPening, setCreatePenging] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function refreshWorkflows() {
    setPending(true);
    setError("");

    try {
      const result = await readWorkflows(ctx.files);
      setWorkflows(result);
    } catch (error) {
      const err = error as Error
      setError(err?.message || "Unable to load workflows");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      
    </div>
  )
}