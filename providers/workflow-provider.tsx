import { createContext, useContext } from "react";
import type { WorkflowRuntimeState } from "@/lib/node";

const WorkflowRuntimeContext = createContext<WorkflowRuntimeState>({});

export function WorkflowRuntimeProvider({
  value,
  children,
}: {
  value: WorkflowRuntimeState;
  children: React.ReactNode;
}) {
  return (
    <WorkflowRuntimeContext.Provider value={value}>
      {children}
    </WorkflowRuntimeContext.Provider>
  );
}

export function useNodeRuntimeState(nodeId: string) {
  const runtimeState = useContext(WorkflowRuntimeContext);
  return runtimeState[nodeId];
}
