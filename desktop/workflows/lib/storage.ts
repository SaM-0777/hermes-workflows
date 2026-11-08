const FILE_PREFIX = "workflow-";

export async function readWorkflows(files) {
  const listing = await files.list("data");
  if (!listing.ok) {
    throw new Error(listing.message || "Unable to list workflows");
  }
  const workflows = [];
  for (const entry of listing.entries) {
    if (
      entry.isDirectory ||
      !entry.name.startsWith(FILE_PREFIX) ||
      !entry.name.endsWith(".json")
    ) {
      continue;
    }
    const result = await files.readText("data", entry.name);
    if (!result.ok) continue;
    try {
      const workflow = JSON.parse(result.text);
      if (
        workflow &&
        typeof workflow.id === "string" &&
        Array.isArray(workflow.nodes) &&
        Array.isArray(workflow.edges)
      ) {
        workflows.push({
          id: workflow.id,
          name: workflow.name || "Untitled workflow",
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        });
      }
    } catch {
      // Ignore invalid workflow files.
    }
  }

  return workflows.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
