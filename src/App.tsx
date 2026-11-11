import { ReactFlowProvider } from "@xyflow/react";
import { Toaster } from "sonner";
import FlowCanvas from "@/components/flow-canvas";
import "@xyflow/react/dist/style.css";

export default function App() {
  return (
    <ReactFlowProvider>
      <main className="relative h-dvh w-full bg-background">
        <FlowCanvas />
      </main>
      <Toaster position="top-center" richColors closeButton />
    </ReactFlowProvider>
  );
}
