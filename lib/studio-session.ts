/**
 * Per-mount studio session.
 *
 * The studio runs inside a sandboxed, opaque-origin frame, so it cannot read the
 * host route, localStorage, or anything else that survives a reload. Everything
 * the host hands down arrives over the `workflow-studio:v1` handshake and is
 * kept here, in memory, for the lifetime of the frame.
 *
 * `token` is minted by the host on every mount and must ride on every request:
 * the host drops anything that does not carry it, so a stale frame (or another
 * script that somehow reached the same window) cannot drive node execution.
 */

type StudioSession = {
  /** Workflow the host is editing, from the INIT payload. */
  workflowId: string | null;
  /** Handshake token minted by the host for this mount. */
  token: string | null;
};

export const studioSession: StudioSession = {
  workflowId: null,
  token: null,
};

let initialise: (() => void) | null = null;
let failSession: ((error: Error) => void) | null = null;

/**
 * Resolves once the host has answered READY with INIT.
 *
 * Nothing may talk to the host before that: the token arrives with INIT, and
 * the host drops requests that do not carry it. Waiting here also keeps the
 * mount-time node-library fetch from racing the handshake.
 */
const sessionReady = new Promise<void>((resolve, reject) => {
  initialise = resolve;
  failSession = reject;
});
// Nobody may await it (a pane opened without a workflow never gets INIT);
// swallowing here keeps that case out of the unhandled-rejection log.
void sessionReady.catch(() => {});

export function awaitStudioSession(timeoutMs = 10_000): Promise<void> {
  const timer = setTimeout(() => {
    failSession?.(
      new Error("Hermes did not initialise the Workflow Studio frame."),
    );
  }, timeoutMs);

  return sessionReady.finally(() => clearTimeout(timer));
}

export function setStudioSession(next: {
  workflowId: string;
  token?: string | null;
}): void {
  studioSession.workflowId = next.workflowId;
  if (typeof next.token === "string" && next.token) {
    studioSession.token = next.token;
  }
  initialise?.();
  initialise = null;
}

export function getWorkflowId(): string | null {
  return studioSession.workflowId;
}

/** Envelope fields every guest→host message carries. */
export function sessionFields(): { token: string } {
  return { token: studioSession.token ?? "" };
}
