import {
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
} from "@hermes/plugin-sdk";
import { jsx } from "react/jsx-runtime";
import { WorkflowLibraryPage } from "./workflows/ui/workflow-library";
import { WorkflowStudioPage } from "./workflows/ui/workflow-studio";
import type { WorkflowFiles } from "./workflows/lib/workflow-storage";

interface PluginContext {
  files: WorkflowFiles;
  registerMany: (contributions: unknown[]) => () => void;
}

export default {
  id: "workflow",
  name: "Workflow Studio",

  register(ctx: PluginContext) {
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
