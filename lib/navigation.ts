export function navigateTo(path: string): void {
  window.parent.postMessage(
    {
      protocol: "workflow-studio:v1",
      requestId: crypto.randomUUID(),
      type: "NAVIGATE",
      payload: { path },
    },
    "*",
  );
}
