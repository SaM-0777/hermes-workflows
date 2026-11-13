// Standalone preview harness (`bun run dev` / `bun run build`).
//
// The studio ships as native plugin UI: `desktop/plugin.ts` renders App directly
// and this file is only the browser entry that keeps the Vite build — which is
// what compiles the stylesheet we inject into the app — working on its own.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./index.css";
import App from "./App.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { setActiveWorkflowId, setHostRest } from "@/lib/host";

// Dev-only: point the preview at a standalone copy of the plugin router
// (`?api=http://127.0.0.1:8799/api/plugins/hermes-workflow&workflowId=…`), so the
// studio can be worked on without the desktop shell. Never part of plugin.js.
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  const api = params.get("api");

  if (api) {
    setHostRest(async (path, options = {}) => {
      const response = await fetch(`${api}${path}`, {
        method: options.method ?? "GET",
        headers: options.body ? { "content-type": "application/json" } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      return response.json();
    });
  }

  setActiveWorkflowId(params.get("workflowId"));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
