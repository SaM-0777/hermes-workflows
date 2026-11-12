import { sessionFields } from "@/lib/studio-session";
import { randomId } from "@/lib/random-id";

export function navigateTo(path: string): void {
  window.parent.postMessage(
    {
      protocol: "workflow-studio:v1",
      requestId: randomId(),
      type: "NAVIGATE",
      payload: { path },
      ...sessionFields(),
    },
    "*",
  );
}
