import { ReactFlowProvider } from "@xyflow/react";
import FlowCanvas from "@/components/flow-canvas";

export default function App() {
  return (
    <ReactFlowProvider>
      <main className="relative h-dvh w-full bg-background">
        <FlowCanvas />
      </main>
    </ReactFlowProvider>
  );
}
