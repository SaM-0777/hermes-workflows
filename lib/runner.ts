export const workflowRunners = ["local", "docker"] as const;

export type WorkflowRunner = (typeof workflowRunners)[number];

export const DEFAULT_WORKFLOW_RUNNER: WorkflowRunner = "local";

export const runnerLabels: Record<WorkflowRunner, string> = {
  local: "Local",
  docker: "Docker",
};

export function isWorkflowRunner(value: unknown): value is WorkflowRunner {
  return (
    typeof value === "string" &&
    (workflowRunners as readonly string[]).includes(value)
  );
}

export function normalizeWorkflowRunner(value: unknown): WorkflowRunner {
  return isWorkflowRunner(value) ? value : DEFAULT_WORKFLOW_RUNNER;
}
