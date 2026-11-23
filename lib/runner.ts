import { hostRest } from "@/lib/host";

export const workflowRunners = ["local", "docker", "modal"] as const;

export type WorkflowRunner = string;

export const DEFAULT_WORKFLOW_RUNNER: WorkflowRunner = "local";

export const runnerLabels: Record<WorkflowRunner, string> = {
  local: "Local",
  docker: "Docker",
  modal: "Modal",
};

export type ProviderOption = {
  key: string;
  label: string;
  type: "number" | "text" | "select";
  choices?: string[];
  min?: number;
  max?: number;
  step?: number;
  help?: string;
};

export type ProviderStatus = {
  ready: boolean;
  missing: string[];
  hints: string[];
  searched?: string;
  sdk?: { importable: boolean; version: string; interpreter: string };
  cli?: { path: string; version?: string };
  credentials?: { present: boolean; source: string };
};

export type WorkflowProvider = {
  id: WorkflowRunner;
  label: string;
  description: string;
  kind: "builtin" | "remote" | string;
  needsSetup: boolean;
  defaults: Record<string, unknown>;
  options: ProviderOption[];
  status?: ProviderStatus;
};

export const FALLBACK_PROVIDERS: WorkflowProvider[] = [
  {
    id: "local",
    label: "Local",
    kind: "builtin",
    description: "Hermes' Python kernel",
    needsSetup: false,
    defaults: { timeoutSeconds: 300 },
    options: [
      {
        key: "timeoutSeconds",
        label: "Node timeout (s)",
        type: "number",
        min: 30,
        max: 86400,
      },
    ],
  },
  {
    id: "docker",
    label: "Docker",
    kind: "builtin",
    description: "Docker hermes-workflow container",
    needsSetup: false,
    defaults: { timeoutSeconds: 300 },
    options: [
      {
        key: "timeoutSeconds",
        label: "Node timeout (s)",
        type: "number",
        min: 30,
        max: 86400,
      },
    ],
  },
  {
    id: "modal",
    label: "Modal",
    kind: "remote",
    description: "Cloud sandboxes on Modal",
    needsSetup: true,
    defaults: { timeoutSeconds: 300, gpu: "", cpu: 1, memory: 2048, imageSource: "registry", aptPackages: "libgl1 libglib2.0-0 libxcb1", venvDir: "/data/venv" },
    options: [
      {
        key: "gpu",
        label: "GPU",
        type: "select",
        choices: ["", "T4", "L4", "A10G", "A100", "H100"],
        help: "Empty runs on CPU. GPU sandboxes run under Modal's gvisor runtime.",
      },
      {
        key: "timeoutSeconds",
        label: "Node timeout (s)",
        type: "number",
        min: 30,
        max: 86400,
      },
      {
        key: "cpu",
        label: "CPU cores",
        type: "number",
        min: 0.125,
        max: 32,
        step: 0.125,
      },
      {
        key: "memory",
        label: "Memory (MB)",
        type: "number",
        min: 128,
        max: 262144,
      },
      { key: "image", label: "Image", type: "text" },
      {
        key: "imageSource",
        label: "Image source",
        type: "select",
        choices: ["registry", "name"],
        help: "registry = container image reference; name = image previously published with Image.publish().",
      },
      { key: "aptPackages", label: "OS packages (apt)", type: "text" },
      { key: "pipPackages", label: "Python packages (baked)", type: "text" },
      { key: "pipIndexUrl", label: "Pip index URL", type: "text" },
      { key: "torchIndexUrl", label: "Torch index URL", type: "text" },
      { key: "venvDir", label: "Volume venv", type: "text" },
    ],
  },
];

export function isWorkflowRunner(
  value: unknown,
  ids: readonly string[] = workflowRunners,
): value is WorkflowRunner {
  return typeof value === "string" && ids.includes(value);
}

export function normalizeWorkflowRunner(
  value: unknown,
  ids: readonly string[] = workflowRunners,
): WorkflowRunner {
  return isWorkflowRunner(value, ids) ? value : DEFAULT_WORKFLOW_RUNNER;
}

export function providerById(
  providers: WorkflowProvider[],
  id: WorkflowRunner,
): WorkflowProvider | undefined {
  return providers.find((provider) => provider.id === id);
}

/** Descriptor defaults with the workflow's own overrides applied. */
export function resolveOptions(
  provider: WorkflowProvider | undefined,
  overrides: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = { ...(provider?.defaults ?? {}) };
  const allowed = new Set(
    (provider?.options ?? []).map((option) => option.key),
  );
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (
      allowed.has(key) &&
      value !== "" &&
      value !== undefined &&
      value !== null
    ) {
      resolved[key] = value;
    }
  }
  return resolved;
}

export async function loadProviders(): Promise<WorkflowProvider[]> {
  const payload = await hostRest<{ providers?: WorkflowProvider[] }>(
    "/runtime/providers",
    { method: "GET" },
  );
  const providers = payload?.providers ?? [];
  return providers.length ? providers : FALLBACK_PROVIDERS;
}
