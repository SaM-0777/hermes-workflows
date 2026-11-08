import { SandboxedFrame } from "@hermes/plugin-sdk";
import { useEffect, useRef } from "react";
import {
  handleWorkflowRequest,
  isWorkflowMessage,
  sendResponse,
} from "../lib/workflow-protocol";
import { isRecord } from "../lib/workflow-validation";
import type { WorkflowFiles } from "../lib/workflow-storage";

const STUDIO_URL = "http://localhost:5173";

interface WorkflowStudioContext {
  files: WorkflowFiles;
}

export interface WorkflowStudioPageProps {
  ctx: WorkflowStudioContext;
}

export function WorkflowStudioPage({ ctx }: WorkflowStudioPageProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const workflowId = new URLSearchParams(window.location.search).get("id");
  const studioUrl = workflowId
    ? `${STUDIO_URL}/?workflowId=${encodeURIComponent(workflowId)}`
    : STUDIO_URL;

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      const message: unknown = event.data;
      if (!isRecord(message) || !isWorkflowMessage(message)) return;

      try {
        const result = await handleWorkflowRequest(ctx.files, message);
        sendResponse(frameWindow, message.requestId, `${message.type}_RESULT`, {
          ok: true,
          ...result,
        });
      } catch (error) {
        sendResponse(frameWindow, message.requestId, `${message.type}_RESULT`, {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown workflow error",
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [ctx]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--ui-border)",
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
          Workflow Studio
        </h1>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <SandboxedFrame
          ref={frameRef}
          src={studioUrl}
          title="Workflow Studio"
          style={{ display: "block", width: "100%", height: "100%", border: 0 }}
        />
      </div>
    </div>
  );
}
