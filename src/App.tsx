import { ReactFlowProvider } from "@xyflow/react";
import { Toaster } from "sonner";
import FlowCanvas from "@/components/flow-canvas";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The studio surface, rendered natively inside the plugin page.
 *
 * `runNonce` bumps when the host asks this pane to run the workflow it is
 * editing (the agent's run event) — the canvas watches it instead of the old
 * postMessage handshake.
 */
export default function App({ runNonce = 0 }: { runNonce?: number }) {
  return (
    <TooltipProvider>
      <ReactFlowProvider>
        <main className="workflow-studio-app relative h-full w-full bg-background text-foreground">
          <FlowCanvas runNonce={runNonce} />
        </main>
        <Toaster position="top-center" richColors closeButton />
      </ReactFlowProvider>
    </TooltipProvider>
  );
}
