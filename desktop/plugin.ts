import { ROUTES_AREA, SIDEBAR_NAV_AREA } from "@hermes/plugin-sdk";
import { jsx } from "react/jsx-runtime";
import { setHostRest } from "../lib/host";
import { installStudioStyles } from "./studio-styles";
import { WorkflowLibraryPage } from "./workflows/ui/workflow-library";
import { WorkflowStudioPage } from "./workflows/ui/workflow-studio";

interface PluginContext {
  rest: <T = unknown>(
    path: string,
    options?: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: Record<string, unknown>;
    },
  ) => Promise<T>;
  registerMany: (contributions: unknown[]) => () => void;
  onDispose: (fn: () => void) => void;
}

export default {
  id: "hermes-workflow",
  name: "Workflow Studio",

  register(ctx: PluginContext) {
    // The studio renders in the app's own React tree, so it calls the plugin's
    // backend through this ctx instead of a frame message channel.
    setHostRest(ctx.rest);
    ctx.onDispose(() => setHostRest(null));
    ctx.onDispose(installStudioStyles());

    ctx.registerMany([
      {
        id: "workflows-page",
        area: ROUTES_AREA,
        data: { path: "/workflows" },
        render: () => jsx(WorkflowLibraryPage, { ctx }),
      },
      {
        id: "workflow-studio-page",
        area: ROUTES_AREA,
        data: { path: "/workflow-studio" },
        render: () => jsx(WorkflowStudioPage, { ctx }),
      },
      {
        id: "workflows-sidebar",
        area: SIDEBAR_NAV_AREA,
        data: {
          path: "/workflows",
          label: "Workflows",
          codicon: "project",
        },
      },
    ]);
  },
};
