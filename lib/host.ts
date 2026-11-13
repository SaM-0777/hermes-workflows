/**
 * The studio's link to the Hermes host.
 *
 * The studio renders natively inside the app now, so it talks to its own backend
 * through `ctx.rest` (the plugin's `/api/plugins/hermes-workflow` namespace)
 * directly — no frame, no postMessage, no handshake. `register()` installs these
 * once per plugin load; the pages and the studio components read them from here.
 */

export type HostRestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
};

export type HostRest = <T = unknown>(
  path: string,
  options?: HostRestOptions,
) => Promise<T>;

let rest: HostRest | null = null;
let activeWorkflowId: string | null = null;

export function setHostRest(next: HostRest | null): void {
  rest = next;
}

/** Call the plugin's own backend through the ctx.rest installed at register(). */
export function hostRest<T = unknown>(
  path: string,
  options?: HostRestOptions,
): Promise<T> {
  if (!rest) {
    throw new Error("The Workflow Studio is not mounted in Hermes Desktop.");
  }
  return rest<T>(path, options);
}

/** Workflow the studio page is editing; set by the page before it renders. */
export function setActiveWorkflowId(id: string | null): void {
  activeWorkflowId = id;
}

export function getWorkflowId(): string | null {
  return activeWorkflowId;
}
