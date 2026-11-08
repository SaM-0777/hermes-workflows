
import {
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  SandboxedFrame,
} from "@hermes/plugin-sdk";

import { jsx, jsxs } from "react/jsx-runtime";

const STUDIO_URL = __STUDIO_URL__;

function WorkflowPage() {
  return jsxs("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
    },
    children: [
      jsx("div", {
        style: {
          padding: "16px 20px",
          borderBottom: "1px solid var(--ui-border)",
          flexShrink: 0,
        },
        children: jsx("h1", {
          style: {
            margin: 0,
            fontSize: "18px",
            fontWeight: 600,
          },
          children: "Workflow Studio",
        }),
      }),
      jsx("div", {
        style: {
          flex: 1,
          minHeight: 0,
          position: "relative",
        },
        children: jsx(SandboxedFrame, {
          src: STUDIO_URL,
          title: "Workflow Studio",
          style: {
            display: "block",
            width: "100%",
            height: "100%",
            border: 0,
          },
        }),
      }),
    ],
  });
}

export default {
  id: "workflow",
  name: "Workflow Studio",

  register(ctx) {
    ctx.registerMany([
      {
        id: "workflows-page",
        area: ROUTES_AREA,
        data: { path: "/workflows" },
        render: () => jsx(WorkflowPage, {}),
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
