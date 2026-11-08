// desktop/plugin.ts
import {
  ROUTES_AREA,
  SIDEBAR_NAV_AREA
} from "@hermes/plugin-sdk";
import { jsx as jsx12 } from "react/jsx-runtime";

// desktop/workflows/ui/workflow-library.tsx
import { Button as Button4, host } from "@hermes/plugin-sdk";
import { useEffect as useEffect2, useState } from "react";

// desktop/workflows/ui/components/panel-empty.tsx
import { Codicon } from "@hermes/plugin-sdk";
import { jsx, jsxs } from "react/jsx-runtime";
function PanelEmpty({
  action,
  description,
  icon = "inbox",
  title
}) {
  return /* @__PURE__ */ jsx("div", {
    className: "grid flex-1 place-items-center px-6 py-10 text-center",
    children: /* @__PURE__ */ jsxs("div", {
      className: "flex flex-col items-center gap-2",
      children: [
        /* @__PURE__ */ jsx(Codicon, {
          className: "text-muted-foreground/50",
          name: icon,
          size: "1.25rem"
        }),
        title ? /* @__PURE__ */ jsx("p", {
          className: "text-sm font-medium text-foreground/90",
          children: title
        }) : null,
        description ? /* @__PURE__ */ jsx("p", {
          className: "max-w-sm text-xs leading-relaxed text-muted-foreground/70",
          children: description
        }) : null,
        action ? /* @__PURE__ */ jsx("div", {
          className: "mt-2",
          children: action
        }) : null
      ]
    })
  });
}

// desktop/workflows/ui/components/page-loader.tsx
import { useEffect, useRef } from "react";

// desktop/workflows/lib/catalog.ts
var CARD_ACCENTS = [
  "[--catalog-accent:var(--ui-blue)]",
  "[--catalog-accent:var(--ui-orange)]",
  "[--catalog-accent:var(--ui-purple)]",
  "[--catalog-accent:var(--ui-green)]",
  "[--catalog-accent:var(--ui-red)]",
  "[--catalog-accent:var(--ui-cyan)]",
  "[--catalog-accent:var(--ui-yellow)]"
];
var CURVE = {
  durationMs: 2200,
  particleCount: 92,
  pulseDurationMs: 2000,
  strokeWidth: 4.2,
  trailSpan: 0.31,
  point(progress, detailScale) {
    const t = progress * Math.PI * 2;
    const mix = 1 + detailScale * 0.16;
    const x = 17 * Math.cos(t) + 7.5 * Math.cos(3 * t + 0.6 * mix) + 3.2 * Math.sin(5 * t - 0.4);
    const y = 15 * Math.sin(t) + 8.2 * Math.sin(2 * t + 0.25) - 4.2 * Math.cos(4 * t - 0.5 * mix);
    return { x: 50 + x, y: 50 + y };
  }
};

// desktop/workflows/ui/components/page-loader.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function PageLoader({
  label = "Loading",
  role = "status",
  strokeScale = 1,
  pathSteps = 240
}) {
  const pathRef = useRef(null);
  const particleRefs = useRef([]);
  const norm = (progress) => (progress % 1 + 1) % 1;
  function detailScaleFor(time, phaseOffset) {
    const p = (time + phaseOffset * CURVE.pulseDurationMs) % CURVE.pulseDurationMs / CURVE.pulseDurationMs;
    return 0.52 + (Math.sin(p * (Math.PI * 2) + 0.55) + 1) / 2 * 0.48;
  }
  function buildPath(detailScale, steps) {
    return Array.from({ length: steps + 1 }, (_, i) => {
      const { x, y } = CURVE.point(i / steps, detailScale);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
  }
  function particleFor(index, progress, detailScale, scale) {
    const tail = index / (CURVE.particleCount - 1);
    const { x, y } = CURVE.point(norm(progress - tail * CURVE.trailSpan), detailScale);
    const fade = (1 - tail) ** 0.56;
    return {
      x,
      y,
      opacity: 0.04 + fade * 0.96,
      radius: (0.9 + fade * 2.7) * scale
    };
  }
  useEffect(() => {
    let frame = 0;
    const startedAt = performance.now();
    const phaseOffset = Math.random();
    particleRefs.current.length = CURVE.particleCount;
    const render = (now) => {
      const time = now - startedAt;
      const progress = (time + phaseOffset * CURVE.durationMs) % CURVE.durationMs / CURVE.durationMs;
      const detailScale = detailScaleFor(time, phaseOffset);
      pathRef.current?.setAttribute("d", buildPath(detailScale, pathSteps));
      particleRefs.current.forEach((node, index) => {
        if (!node)
          return;
        const particle = particleFor(index, progress, detailScale, strokeScale);
        node.setAttribute("cx", particle.x.toFixed(2));
        node.setAttribute("cy", particle.y.toFixed(2));
        node.setAttribute("r", particle.radius.toFixed(2));
        node.setAttribute("opacity", particle.opacity.toFixed(3));
      });
      frame = window.requestAnimationFrame(render);
    };
    render(performance.now());
    return () => window.cancelAnimationFrame(frame);
  }, [pathSteps, strokeScale]);
  return /* @__PURE__ */ jsx2("div", {
    className: "grid h-full place-items-center",
    children: /* @__PURE__ */ jsx2("div", {
      className: "inline-grid size-10 place-items-center text-primary",
      children: /* @__PURE__ */ jsxs2("svg", {
        className: "size-full overflow-visible",
        children: [
          /* @__PURE__ */ jsx2("path", {
            opacity: "0.1",
            ref: pathRef,
            stroke: "currentColor",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: CURVE.strokeWidth * strokeScale
          }),
          Array.from({ length: CURVE.particleCount }, (_, index) => /* @__PURE__ */ jsx2("circle", {
            fill: "currentColor",
            ref: (node) => {
              particleRefs.current[index] = node;
            }
          }, index))
        ]
      })
    })
  });
}

// desktop/workflows/ui/components/text-tab.tsx
import { Button } from "@hermes/plugin-sdk";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function TextTab({ active, label, meta, onClick }) {
  return /* @__PURE__ */ jsxs3(Button, {
    onClick,
    type: "button",
    className: `group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 text-(length:--conversation-caption-font-size) font-medium text-(--ui-text-tertiary) transition-colors hover:bg-transparent hover:text-foreground focus-visible:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50', ${active ? "text-foreground" : ""}`,
    children: [
      /* @__PURE__ */ jsx3("span", {
        className: `underline-offset-4 decoration-current/25 ${active ? "underline" : "group-hover/text-tab:underline"}`,
        children: label
      }),
      meta ? /* @__PURE__ */ jsx3("span", {
        className: "text-[0.72em] font-normal text-(--ui-text-tertiary)",
        children: meta
      }) : null
    ]
  });
}

// desktop/workflows/ui/components/workflow-browser.tsx
import { memo } from "react";

// desktop/workflows/ui/components/category-filter.tsx
import { Button as Button2, Codicon as Codicon2 } from "@hermes/plugin-sdk";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function CategoryFilter({
  disabled = false,
  sizing = "equal",
  value
}) {
  const options = [
    { id: 1, label: "Category", icon: /* @__PURE__ */ jsx4(Codicon2, {
      name: "layout",
      className: "size-1.5!"
    }) },
    { id: 2, label: "Source", icon: /* @__PURE__ */ jsx4(Codicon2, {
      name: "database",
      className: "size-1.5!"
    }) }
  ];
  return /* @__PURE__ */ jsx4("div", {
    className: "catalog-filter-bar",
    children: /* @__PURE__ */ jsxs4("div", {
      className: "catalog-filter-row",
      children: [
        /* @__PURE__ */ jsx4("div", {
          className: `${disabled ? "opacity-50" : ""} ${sizing === "equal" ? "auto-cols-fr" : "auto-cols-max"} inline-grid w-fit grid-flow-col gap-0.5 rounded-[5px] bg-(--ui-bg-tertiary) p-0.5`,
          children: options.map(({ id, label, icon }) => {
            const active = value === label;
            return /* @__PURE__ */ jsxs4("button", {
              className: `flex items-center justify-center gap-2 rounded-[3px] px-2.5 py-0.5 text-[0.6875rem] font-medium transition-colors hover:transition-none disabled:cursor-default ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`,
              onClick: () => {
                return;
              },
              type: "button",
              children: [
                icon,
                label
              ]
            }, id);
          })
        }),
        /* @__PURE__ */ jsx4("div", {
          className: "catalog-filter-chips",
          children: /* @__PURE__ */ jsx4(Button2, {
            size: "xs",
            variant: "default",
            onClick: () => {
              return;
            },
            children: "All"
          })
        })
      ]
    })
  });
}

// desktop/workflows/ui/components/row-button.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function RowButton({
  className,
  type = "button",
  ...props
}) {
  return /* @__PURE__ */ jsx5("button", {
    ...props,
    className,
    "data-slot": "row-button",
    type
  });
}

// desktop/workflows/ui/components/catalog-card.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function CatalogCard({
  entry,
  onOpen,
  accentIndex,
  style
}) {
  return /* @__PURE__ */ jsxs5("article", {
    className: `group relative isolate min-w-0 overflow-hidden rounded-lg bg-(--ui-stroke-tertiary) p-[1.5px] transition-[box-shadow,opacity] duration-150 ${CARD_ACCENTS[accentIndex % CARD_ACCENTS.length]}`,
    "data-catalog-card": "",
    "data-catalog-variant": "default",
    "data-entry-id": entry.id,
    style: style ?? undefined,
    children: [
      /* @__PURE__ */ jsx6("div", {
        "aria-hidden": true,
        className: "pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg_290deg,#2563eb_325deg,#60a5fa_345deg,transparent_360deg)] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:animate-none"
      }),
      /* @__PURE__ */ jsx6("div", {
        className: "relative z-10 flex min-h-64 min-w-0 w-full flex-col gap-2 overflow-hidden rounded-[calc(0.5rem-1.5px)] p-3 [background:radial-gradient(140%_100%_at_0%_0%,color-mix(in_srgb,var(--catalog-accent)_11%,transparent),transparent_70%),var(--ui-chat-bubble-background)]",
        children: /* @__PURE__ */ jsx6(RowButton, {
          className: "min-w-0 text-left text-xl font-semibold leading-snug",
          onClick: () => onOpen(entry.id),
          children: entry.name
        })
      })
    ]
  });
}

// desktop/workflows/ui/components/search-field.tsx
import { Button as Button3, Codicon as Codicon3 } from "@hermes/plugin-sdk";
import { jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
function SearchField({
  loading = false,
  scope,
  value,
  placeholder,
  onChange,
  onKeyDown
}) {
  return /* @__PURE__ */ jsxs6("div", {
    className: "flex h-10 w-full min-w-0 items-center gap-3 rounded-2xl border border-(--ui-stroke-tertiary) bg-(--dt-card) px-4 transition-[border-color] hover:border-(--ui-stroke-secondary) has-[>input:focus]:border-ring",
    children: [
      /* @__PURE__ */ jsx7(Codicon3, {
        name: "search",
        className: "pointer-events-none m-0 size-3! shrink-0 p-0 text-muted-foreground/70"
      }),
      /* @__PURE__ */ jsx7("span", {
        className: "inline-flex w-fit shrink-0 items-center gap-1 rounded-[3px] bg-muted px-1 py-1 text-[0.6rem] font-medium leading-none whitespace-nowrap text-muted-foreground [&_svg]:pointer-events-none",
        children: scope
      }),
      /* @__PURE__ */ jsx7("input", {
        className: "h-7 w-full min-w-0 max-w-full flex-1 bg-transparent text-sm leading-5 text-foreground field-sizing-content placeholder:text-muted-foreground focus:outline-hidden",
        onChange: (event) => onChange(event.target.value),
        onKeyDown,
        placeholder,
        type: "text",
        value
      }),
      loading ? /* @__PURE__ */ jsx7(Codicon3, {
        name: "loading",
        size: "1rem",
        className: "pointer-events-none size-3.5 shrink-0 animate-spin text-muted-foreground/70"
      }) : value ? /* @__PURE__ */ jsx7(Button3, {
        className: "shrink-0 text-muted-foreground/85 hover:bg-accent/60 hover:text-foreground",
        size: "icon-xs",
        variant: "ghost",
        onClick: () => onChange(""),
        children: /* @__PURE__ */ jsx7(Codicon3, {
          name: "close",
          size: "0.875rem"
        })
      }) : null
    ]
  });
}

// desktop/workflows/ui/components/search-header.tsx
import { jsx as jsx8 } from "react/jsx-runtime";
function SearchHeader(props) {
  return /* @__PURE__ */ jsx8("header", {
    className: "catalog-search-header shrink-0",
    children: /* @__PURE__ */ jsx8(SearchField, {
      ...props
    })
  });
}

// desktop/workflows/ui/components/workflow-browser.tsx
import { jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
var WorkflowBrowser = memo(function WorkflowBrowser2({
  workflows,
  onOpen
}) {
  return /* @__PURE__ */ jsx9("div", {
    className: "@container/catalog flex h-full min-h-0 min-w-0",
    children: /* @__PURE__ */ jsx9("div", {
      className: "flex min-h-0 min-w-0 flex-1 flex-col",
      children: /* @__PURE__ */ jsxs7("div", {
        className: "flex min-h-0 min-w-0 flex-1 flex-col",
        children: [
          /* @__PURE__ */ jsx9(SearchHeader, {
            loading: false,
            scope: "saved",
            value: "",
            placeholder: 'Try "workflow-"',
            onChange: () => {
              return;
            },
            onKeyDown: () => {
              return;
            }
          }),
          /* @__PURE__ */ jsx9(CategoryFilter, {
            disabled: false,
            sizing: "equal",
            value: "Category"
          }),
          /* @__PURE__ */ jsx9("div", {
            className: "min-h-0 flex-1",
            children: /* @__PURE__ */ jsx9("div", {
              className: "flex h-full min-h-0 flex-col",
              children: /* @__PURE__ */ jsx9("div", {
                className: "capabilities-scroll",
                children: /* @__PURE__ */ jsx9("div", {
                  className: "catalog-filtered-results pt-(--capabilities-gap-lead) pb-2",
                  children: /* @__PURE__ */ jsx9("div", {
                    className: "grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] auto-rows-[minmax(16rem,auto)] gap-3",
                    children: workflows.map((workflow, index) => /* @__PURE__ */ jsx9(CatalogCard, {
                      onOpen,
                      entry: workflow,
                      accentIndex: index,
                      style: null
                    }, workflow.id))
                  })
                })
              })
            })
          })
        ]
      })
    })
  });
});

// desktop/workflows/lib/workflow-validation.ts
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isValidId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}
function isWorkflowDocument(value) {
  return isRecord(value) && typeof value.id === "string" && Array.isArray(value.nodes) && Array.isArray(value.edges);
}
function isValidWorkflowDocument(value, expectedId) {
  return isWorkflowDocument(value) && isValidId(value.id) && (expectedId === undefined || value.id === expectedId);
}

// desktop/workflows/lib/workflow-storage.ts
var FILE_PREFIX = "workflow-";
function resultMessage(result, fallback) {
  return result.message || result.error || fallback;
}
function workflowPath(id) {
  return `${FILE_PREFIX}${id}.json`;
}
async function readWorkflows(files) {
  const listing = await files.list("data");
  if (!listing.ok) {
    throw new Error(resultMessage(listing, "Unable to list workflows"));
  }
  const workflows = [];
  for (const entry of listing.entries) {
    if (entry.isDirectory || !entry.name.startsWith(FILE_PREFIX) || !entry.name.endsWith(".json")) {
      continue;
    }
    const result = await files.readText("data", entry.name);
    if (!result.ok)
      continue;
    try {
      const workflow = JSON.parse(result.text);
      if (isWorkflowDocument(workflow)) {
        workflows.push({
          id: workflow.id,
          name: workflow.name || "Untitled workflow",
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt
        });
      }
    } catch {}
  }
  return workflows.sort((a, b) => new Date(b.updatedAt ?? "").getTime() - new Date(a.updatedAt ?? "").getTime());
}
async function createWorkflow(files, name = "Untitled workflow") {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const workflow = {
    id,
    name: name.trim() ? name.trim().slice(0, 120) : "Untitled workflow",
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: []
  };
  const result = await files.writeText("data", workflowPath(id), JSON.stringify(workflow, null, 2), { exclusive: true });
  if (!result.ok) {
    throw new Error(resultMessage(result, "Could not create workflow"));
  }
  return workflow;
}
async function saveWorkflow(files, input) {
  if (!isValidId(input.id)) {
    throw new Error("Invalid workflow data");
  }
  const path = workflowPath(input.id);
  const existing = await files.readText("data", path);
  if (!existing.ok)
    throw new Error("Workflow not found");
  let previous;
  try {
    previous = JSON.parse(existing.text);
  } catch {
    throw new Error("Existing workflow file is invalid");
  }
  if (!isWorkflowDocument(previous)) {
    throw new Error("Existing workflow file is invalid");
  }
  const now = new Date().toISOString();
  const workflow = {
    id: input.id,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 120) : previous.name || "Untitled workflow",
    createdAt: previous.createdAt || now,
    updatedAt: now,
    nodes: input.nodes,
    edges: input.edges
  };
  const result = await files.writeText("data", path, JSON.stringify(workflow, null, 2));
  if (!result.ok) {
    throw new Error(resultMessage(result, "Could not save workflow"));
  }
  return workflow;
}
async function loadWorkflow(files, id) {
  if (!isValidId(id))
    throw new Error("Invalid workflow ID");
  const result = await files.readText("data", workflowPath(id));
  if (!result.ok) {
    throw new Error(resultMessage(result, "Could not load workflow"));
  }
  let workflow;
  try {
    workflow = JSON.parse(result.text);
  } catch {
    throw new Error("Workflow file contains invalid JSON");
  }
  if (!isValidWorkflowDocument(workflow, id)) {
    throw new Error("Invalid workflow file structure");
  }
  return workflow;
}
async function deleteWorkflow(files, id) {
  if (!isValidId(id))
    throw new Error("Invalid workflow ID");
  const result = await files.trash("data", workflowPath(id));
  if (!result.ok) {
    throw new Error(resultMessage(result, "Could not delete workflow"));
  }
  return id;
}

// desktop/workflows/ui/workflow-library.tsx
import { jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
function WorkflowLibraryPage({ ctx }) {
  const [workflows, setWorkflows] = useState([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  async function refreshWorkflows() {
    setPending(true);
    setError("");
    try {
      setWorkflows(await readWorkflows(ctx.files));
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : String(error2));
    } finally {
      setPending(false);
    }
  }
  useEffect2(() => {
    refreshWorkflows();
  }, []);
  function openWorkflow(id) {
    host.navigate(`/workflow-editor?id=${encodeURIComponent(id)}`);
  }
  const loader = pending ? /* @__PURE__ */ jsx10(PageLoader, {}) : error ? /* @__PURE__ */ jsx10(PanelEmpty, {
    icon: "error",
    title: "Failed to load workflows",
    description: error,
    action: /* @__PURE__ */ jsx10(Button4, {
      size: "sm",
      onClick: () => void refreshWorkflows(),
      children: "Refresh"
    })
  }) : null;
  return /* @__PURE__ */ jsxs8("section", {
    className: "flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)",
    children: [
      /* @__PURE__ */ jsx10("div", {
        className: "shrink-0",
        children: /* @__PURE__ */ jsx10("div", {
          className: "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-6 pb-2 pt-[calc(var(--titlebar-height)+1.5rem)]",
          children: /* @__PURE__ */ jsx10("div", {
            className: "col-start-1 row-start-1 flex min-w-0 items-center justify-start",
            children: /* @__PURE__ */ jsx10("div", {
              className: "hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex",
              children: /* @__PURE__ */ jsx10(TextTab, {
                active: true,
                label: "Saved",
                meta: workflows.length,
                onClick: () => {
                  return;
                }
              })
            })
          })
        })
      }),
      /* @__PURE__ */ jsx10("div", {
        className: "min-h-0 flex-1 overflow-hidden bg-(--ui-chat-surface-background)",
        children: /* @__PURE__ */ jsx10("div", {
          className: "flex h-full flex-col",
          children: /* @__PURE__ */ jsxs8("div", {
            className: "flex min-h-0 flex-1 flex-col",
            children: [
              loader,
              /* @__PURE__ */ jsx10(WorkflowBrowser, {
                workflows,
                onOpen: openWorkflow
              })
            ]
          })
        })
      })
    ]
  });
}

// desktop/workflows/ui/workflow-studio.tsx
import { SandboxedFrame } from "@hermes/plugin-sdk";
import { useEffect as useEffect3, useRef as useRef2 } from "react";

// desktop/workflows/lib/workflow-protocol.ts
var PROTOCOL = "workflow-studio:v1";
function isWorkflowMessage(value) {
  return isRecord(value) && value.protocol === PROTOCOL && typeof value.requestId === "string" && typeof value.type === "string";
}
function sendResponse(target, requestId, type, payload = {}) {
  target?.postMessage({
    protocol: PROTOCOL,
    requestId,
    type,
    ...payload
  }, "*");
}
function assertPayload(message) {
  const payload = message.payload ?? {};
  if (!isRecord(payload))
    throw new Error("Invalid request payload");
  return payload;
}
async function handleWorkflowRequest(files, message) {
  const payload = assertPayload(message);
  if (!files)
    throw new Error("Hermes file storage is unavailable");
  if (message.type === "WORKFLOW_LIST") {
    const workflows = await readWorkflows(files);
    return { workflows: workflows.filter((workflow) => isValidId(workflow.id)) };
  }
  if (message.type === "WORKFLOW_CREATE") {
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 120) : "Untitled workflow";
    return { workflow: await createWorkflow(files, name) };
  }
  if (message.type === "WORKFLOW_SAVE") {
    const { id, nodes, edges, name } = payload;
    if (!isValidId(id) || !Array.isArray(nodes) || !Array.isArray(edges)) {
      throw new Error("Invalid workflow data");
    }
    return {
      workflow: await saveWorkflow(files, {
        id,
        nodes,
        edges,
        name
      })
    };
  }
  if (message.type === "WORKFLOW_LOAD") {
    const { id } = payload;
    if (!isValidId(id))
      throw new Error("Invalid workflow ID");
    return { workflow: await loadWorkflow(files, id) };
  }
  if (message.type === "WORKFLOW_DELETE") {
    const { id } = payload;
    if (!isValidId(id))
      throw new Error("Invalid workflow ID");
    return { id: await deleteWorkflow(files, id) };
  }
  throw new Error("Unsupported workflow operation");
}

// desktop/workflows/ui/workflow-studio.tsx
import { jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
var STUDIO_URL = "http://localhost:5173";
function WorkflowStudioPage({ ctx }) {
  const frameRef = useRef2(null);
  const workflowId = new URLSearchParams(window.location.search).get("id");
  const studioUrl = workflowId ? `${STUDIO_URL}/?workflowId=${encodeURIComponent(workflowId)}` : STUDIO_URL;
  useEffect3(() => {
    const handleMessage = async (event) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow)
        return;
      const message = event.data;
      if (!isRecord(message) || !isWorkflowMessage(message))
        return;
      try {
        const result = await handleWorkflowRequest(ctx.files, message);
        sendResponse(frameWindow, message.requestId, `${message.type}_RESULT`, {
          ok: true,
          ...result
        });
      } catch (error) {
        sendResponse(frameWindow, message.requestId, `${message.type}_RESULT`, {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown workflow error"
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [ctx]);
  return /* @__PURE__ */ jsxs9("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      minHeight: 0,
      overflow: "hidden"
    },
    children: [
      /* @__PURE__ */ jsx11("div", {
        style: {
          padding: "16px 20px",
          borderBottom: "1px solid var(--ui-border)",
          flexShrink: 0
        },
        children: /* @__PURE__ */ jsx11("h1", {
          style: { margin: 0, fontSize: "18px", fontWeight: 600 },
          children: "Workflow Studio"
        })
      }),
      /* @__PURE__ */ jsx11("div", {
        style: { flex: 1, minHeight: 0, position: "relative" },
        children: /* @__PURE__ */ jsx11(SandboxedFrame, {
          ref: frameRef,
          src: studioUrl,
          title: "Workflow Studio",
          style: { display: "block", width: "100%", height: "100%", border: 0 }
        })
      })
    ]
  });
}

// desktop/plugin.ts
var plugin_default = {
  id: "workflow",
  name: "Workflow Studio",
  register(ctx) {
    ctx.registerMany([
      {
        id: "workflows-page",
        area: ROUTES_AREA,
        data: { path: "/workflows" },
        render: () => jsx12(WorkflowLibraryPage, { ctx })
      },
      {
        id: "workflow-editor-page",
        area: ROUTES_AREA,
        data: { path: "/workflow-editor" },
        render: () => jsx12(WorkflowStudioPage, { ctx })
      },
      {
        id: "workflows-sidebar",
        area: SIDEBAR_NAV_AREA,
        data: {
          path: "/workflows",
          label: "Workflows",
          codicon: "project"
        }
      }
    ]);
  }
};
export {
  plugin_default as default
};
