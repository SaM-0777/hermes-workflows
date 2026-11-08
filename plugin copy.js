
import {
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  SandboxedFrame,
  host,
  Button,
  Codicon,
} from "@hermes/plugin-sdk";

import { memo, useEffect, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

const STUDIO_URL = "http://localhost:5173";
const PROTOCOL = "workflow-studio:v1";
const FILE_PREFIX = "workflow-";

function formatRelativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

async function readWorkflows(files) {
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
    (a, b) =>
      new Date(b.updatedAt).getTime() -
      new Date(a.updatedAt).getTime(),
  );
}

const CARD_ACCENTS = [
  '[--catalog-accent:var(--ui-blue)]',
  '[--catalog-accent:var(--ui-orange)]',
  '[--catalog-accent:var(--ui-purple)]',
  '[--catalog-accent:var(--ui-green)]',
  '[--catalog-accent:var(--ui-red)]',
  '[--catalog-accent:var(--ui-cyan)]',
  '[--catalog-accent:var(--ui-yellow)]'
]

const CURVE = {
  durationMs: 2200,
  particleCount: 92,
  pulseDurationMs: 2000,
  strokeWidth: 4.2,
  trailSpan: 0.31,
  point(progress, detailScale) {
    const t = progress * Math.PI * 2
    const mix = 1 + detailScale * 0.16
    const x = 17 * Math.cos(t) + 7.5 * Math.cos(3 * t + 0.6 * mix) + 3.2 * Math.sin(5 * t - 0.4)
    const y = 15 * Math.sin(t) + 8.2 * Math.sin(2 * t + 0.25) - 4.2 * Math.cos(4 * t - 0.5 * mix)

    return { x: 50 + x, y: 50 + y }
  }
}

function TextTab({ active, label, meta, onClick }) {
  return jsxs(Button, {
    onClick,
    type: "button",
    className: `group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-tertiary) transition-colors hover:bg-transparent hover:text-foreground focus-visible:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50', ${active && "text-foreground"}`,
    children: [
      jsxs("span", {
        className: `underline-offset-4 decoration-current/25 ${active ? "underline" : "group-hover/text-tab:underline"}`,
        children: label
      }),
      // TextTabMeta
      meta && jsxs("span", {
        className: "text-[0.72em] font-normal text-(--ui-text-tertiary)",
        children: meta,
      }),
    ]
  })
}

function PanelEmpty({ action, description, icon = 'inbox', title }) {
  return (
    jsxs("div", {
      className: "grid flex-1 place-items-center px-6 py-10 text-center",
      children: [
        jsxs("div", {
          className: "flex flex-col items-center gap-2",
          children: [
            jsx(Codicon, {
              className: "text-muted-foreground/50",
              name: icon,
              size: "1.25rem",
            }),
            title ? (jsx("p", {
              className: "text-sm font-medium text-foreground/90",
              children: title,
            })) : null,
            description ? (jsx("p", {
              className: "max-w-sm text-xs leading-relaxed text-muted-foreground/70",
              children: description,
            })) : null,
            action ? (jsx("div", {
              className: "mt-2",
              children: action,
            })) : null,
          ]
        })
      ]
    })
  )
}

function PageLoader({ label = "Loading", role = "status", strokeScale = 1, pathSteps = 240, }) {
  const pathRef = useRef(null)
  const particleRefs = useRef([])

  const norm = (progress) => ((progress % 1) + 1) % 1
  function detailScaleFor(time, phaseOffset) {
    const p = ((time + phaseOffset * CURVE.pulseDurationMs) % CURVE.pulseDurationMs) / CURVE.pulseDurationMs
    return 0.52 + ((Math.sin(p * (Math.PI * 2) + 0.55) + 1) / 2) * 0.48
  }
  function buildPath(detailScale, steps) {
    return Array.from({ length: steps + 1 }, (_, i) => {
      const { x, y } = CURVE.point(i / steps, detailScale)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    }).join(' ')
  }
  function particleFor(index, progress, detailScale, strokeScale) {
    const tail = index / (CURVE.particleCount - 1)
    const { x, y } = CURVE.point(norm(progress - tail * CURVE.trailSpan), detailScale)
    const fade = (1 - tail) ** 0.56
    return { x, y, opacity: 0.04 + fade * 0.96, radius: (0.9 + fade * 2.7) * strokeScale }
  }

  useEffect(() => {
    let frame = 0
    const startedAt = performance.now()
    const phaseOffset = Math.random()
    particleRefs.current.length = CURVE.particleCount

    const render = (now) => {
      const time = now - startedAt
      const progress = ((time + phaseOffset * CURVE.durationMs) % CURVE.durationMs) / CURVE.durationMs
      const detailScale = detailScaleFor(time, phaseOffset)

      pathRef.current?.setAttribute('d', buildPath(detailScale, pathSteps))

      particleRefs.current.forEach((node, index) => {
        if (!node) {
          return
        }

        const p = particleFor(index, progress, detailScale, strokeScale)
        node.setAttribute('cx', p.x.toFixed(2))
        node.setAttribute('cy', p.y.toFixed(2))
        node.setAttribute('r', p.radius.toFixed(2))
        node.setAttribute('opacity', p.opacity.toFixed(3))
      })

      frame = window.requestAnimationFrame(render)
    }

    render(performance.now())

    return () => window.cancelAnimationFrame(frame)
  }, [pathSteps, strokeScale])

  return (
    jsxs("div", {
      className: "grid h-full place-items-center",
      children: [
        // Loader
        jsxs("div", {
          className: "inline-grid size-10 place-items-center text-primary",
          children: [
            jsxs("svg", {
              className: "size-full overflow-visible",
              children: [
                jsxs("path", {
                  opacity: "0.1",
                  ref: pathRef,
                  stroke: "currentColor",
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  strokeWidth: CURVE.strokeWidth * strokeScale,
                }),
                Array.from({ length: CURVE.particleCount }, (_, index) => (
                  jsx("circle", {
                    fill: "currentColor",
                    key: index,
                    ref: node => {
                      particleRefs.current[index] = node
                    }
                  })
                ))
              ]
            })
          ]
        })
      ]
    })
  )
}

function SearchField({ loading = false, scope, value, placeholder, onChange, onKeyDown }) {
  const clear = () => onChange('')
  return (
    jsxs("div", {
      className: `flex h-10 w-full min-w-0 items-center gap-3 rounded-2xl border border-(--ui-stroke-tertiary) bg-(--dt-card) px-4 transition-[border-color] hover:border-(--ui-stroke-secondary) has-[>input:focus]:border-ring`,
      children: [
        jsx(Codicon, {
          name: "search",
          className: "pointer-events-none shrink-0 text-muted-foreground/70 size-3! m-0 p-0"
        }),
        jsx("span", {
          className: `inline-flex w-fit shrink-0 items-center gap-1 rounded-[3px] font-medium leading-none whitespace-nowrap [&_svg]:pointer-events-none px-1 py-1 text-[0.6rem] bg-muted text-muted-foreground`,
          children: scope,
        }),
        jsx("input", {
          className: 'h-7 min-w-0 max-w-full flex-1 bg-transparent text-foreground [field-sizing:content] placeholder:text-muted-foreground focus:outline-hidden w-full text-sm leading-5 [field-sizing:initial]',
          onChange: event => onChange(event.target.value),
          onKeyDown,
          placeholder,
          type: "text",
          value,
        }),
        loading ? (
          jsx(Codicon, {
            name: "loading",
            size: "1rem",
            className: "pointer-events-none size-3.5 shrink-0 animate-spin text-muted-foreground/70",
          })
        ) : value ? (
          jsx(Button, {
            className: "shrink-0 text-muted-foreground/85 hover:bg-accent/60 hover:text-foreground",
            size: "icon-xs",
            variant: "ghost",
            onClick: clear,
            children: [
              jsx(Codicon, {
                name: "close",
                size: "0.875rem",
              })
            ]
          })
        ) : null
      ],
    })
  )
}

function SearchHeader({ loading = false, scope, value, placeholder, onChange, onKeyDown }) {
  return jsxs("header", {
    className: "catalog-search-header shrink-0",
    children: jsx(SearchField, {
      loading,
      scope,
      value,
      placeholder,
      onChange,
      onKeyDown,
    })
  })
}

function CategoryFilter({ disabled = false, sizing = 'equal', value }) {
  const options = [
    {
      id: 1,
      label: "Category",
      icon: jsx(Codicon, {
        name: "layout",
        className: "size-1.5!",
      })
    },
    {
      id: 2,
      label: "Source",
      icon: jsx(Codicon, {
        name: "database",
        className: "size-1.5!",
      })
    }
  ]

  return (
    jsxs("div", {
      className: "catalog-filter-bar",
      children: [
        jsxs("div", {
          className: "catalog-filter-row",
          children: [
            // SegmentedControl
            jsx("div", {
              className: `${disabled && "opacity-50"} ${sizing === 'equal' ? 'auto-cols-fr' : 'auto-cols-max'} inline-grid w-fit grid-flow-col gap-0.5 rounded-[5px] bg-(--ui-bg-tertiary) p-0.5`,
              children: options.map(({ id, label, icon }) => {
                const active = value === label
                return (
                  jsx("button", {
                    className: `flex items-center justify-center gap-2 rounded-[3px] px-2.5 py-0.5 text-[0.6875rem] font-medium transition-colors hover:transition-none disabled:cursor-default ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`,
                    //disabled: true,
                    key: id,
                    onClick: () => { },
                    type: "button",
                    children: [
                      icon,
                      label,
                    ]
                  })
                )
              }),
            }),
            //
            jsx("div", {
              className: "catalog-filter-chips",
              children: [
                jsx(Button, {
                  size: "xs",
                  variant: "default",
                  children: "All",
                  onClick: () => { },
                }),
              ]
            })
          ],
        })
      ],
    })
  )
}

function RowButton({ className, type = "button", ...props }) {
  return jsx("button", {
    ...props,
    className,
    "data-slot": "row-button",
    type,
  });
}

function CatalogCard({ entry, onOpen, accentIndex, style }) {
  return (
    jsx("article", {
      className: `group relative isolate min-w-0 overflow-hidden rounded-lg p-[1.5px]
      bg-(--ui-stroke-tertiary)
      transition-[box-shadow,opacity] duration-150
      ${CARD_ACCENTS[accentIndex % CARD_ACCENTS.length]}`,

      "data-catalog-card": "",
      "data-catalog-variant": "default",
      "data-entry-id": entry.id,
      style,

      children: [
        jsx("div", {
          "aria-hidden": true,
          className: `pointer-events-none absolute left-1/2 top-1/2
          aspect-square w-[200%]
          -translate-x-1/2 -translate-y-1/2
          animate-[spin_4s_linear_infinite]
          bg-[conic-gradient(from_0deg,transparent_0deg_290deg,#2563eb_325deg,#60a5fa_345deg,transparent_360deg)]
          opacity-0 transition-opacity duration-300
          group-hover:opacity-100 group-focus-within:opacity-100
          motion-reduce:animate-none`,
        }),

        jsx("div", {
          className: `relative z-10 flex min-h-[16rem] min-w-0 w-full flex-col
          gap-2 overflow-hidden rounded-[calc(0.5rem-1.5px)] p-3
          [background:radial-gradient(140%_100%_at_0%_0%,color-mix(in_srgb,var(--catalog-accent)_11%,transparent),transparent_70%),var(--ui-chat-bubble-background)]`,

          children: jsx(RowButton, {
            className: "min-w-0 text-left text-xl font-semibold leading-snug",
            onClick: () => onOpen(entry.id),
            children: entry.name,
          }),
        }),
      ],
    })
  )
}

const WorkflowBrowser = memo(({ workflows, onOpen }) => {
  return (
    jsxs("div", {
      className: "@container/catalog flex h-full min-h-0 min-w-0",
      children: [
        jsxs("div", {
          className: "flex min-h-0 min-w-0 flex-1 flex-col",
          children: [
            jsxs("div", {
              className: "flex min-h-0 min-w-0 flex-1 flex-col",
              children: [
                jsx(SearchHeader, {
                  loading: false,
                  scope: "saved",
                  value: "",
                  placeholder: `Try "workflow-"`,
                  onChange: () => { },
                  onKeyDown: () => { },
                }),

                jsx(CategoryFilter, {
                  disabled: false,
                  sizing: 'equal',
                  value: "Category",
                }),

                jsxs("div", {
                  className: "min-h-0 flex-1",
                  children: [
                    jsxs("div", {
                      className: "flex h-full min-h-0 flex-col",
                      children: [
                        jsxs("div", {
                          className: "capabilities-scroll",
                          children: [
                            jsxs("div", {
                              className: "catalog-filtered-results pt-(--capabilities-gap-lead) pb-2",
                              children: [
                                jsxs("div", {
                                  // Cards
                                  className: "grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] auto-rows-[minmax(16rem,auto)] gap-3",
                                  children: workflows?.length ? (workflows.map((workflow, index) => {
                                    return (
                                      jsx(CatalogCard, {
                                        onOpen,
                                        entry: workflow,
                                        accentIndex: index,
                                        style: null,
                                      })
                                    )
                                  })) : []
                                })
                              ]
                            })
                          ],
                        })
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    })
  )
})

function WorkflowLibraryPage({ ctx }) {
  const [workflows, setWorkflows] = useState([]);
  const [pending, setPending] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function refreshWorkflows() {
    setPending(true);
    setError("");

    try {
      const result = await readWorkflows(ctx.files);
      setWorkflows(result);
    } catch (err) {
      setError(err.message || "Unable to load workflows");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    void refreshWorkflows();
  }, []);

  const loader = pending ? jsx(PageLoader, {}) : error ? jsx(PanelEmpty, { icon: "error", title: "Failed to load workflows", description: error, action: jsx(Button, { size: "sm", children: "Refresh", onClick: () => void refreshWorkflows() }) }) : null

  async function createWorkflow() {
    if (creating) return;

    setCreating(true);
    setError("");

    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const workflow = {
        id,
        name: "Untitled workflow",
        createdAt: now,
        updatedAt: now,
        nodes: [],
        edges: [],
      };

      const result = await ctx.files.writeText(
        "data",
        `${FILE_PREFIX}${id}.json`,
        JSON.stringify(workflow, null, 2),
        { exclusive: true },
      );

      if (!result.ok) {
        throw new Error(result.message || "Could not create workflow");
      }

      host.navigate(`/workflow-editor?id=${encodeURIComponent(id)}`);
    } catch (err) {
      setError(err.message || "Could not create workflow");
      setCreating(false);
    }
  }

  function openWorkflow(id) {
    host.navigate(`/workflow-editor?id=${encodeURIComponent(id)}`);
  }

  // PageSearchShell
  return jsxs("section", {
    className: "flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)",
    children: [
      jsxs("div", {
        className: "shrink-0",
        children: [
          jsxs("div", {
            className: "grid items-center gap-3 px-3 pb-2 pt-[calc(var(--titlebar-height)+0.5rem)] grid-cols-[minmax(0,1fr)_auto_auto] px-6 pt-[calc(var(--titlebar-height)+1.5rem)]",
            children: [
              // Tabs
              jsxs("div", {
                className: "flex min-w-0 items-center col-start-1 row-start-1 justify-start",
                // ShellTabs
                children: [
                  // ResponsiveTabs
                  jsxs("div", {
                    className: "hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex",
                    children: jsxs(TextTab, {
                      active: true,
                      label: "Saved",
                      meta: workflows.length,
                      onClick: () => { },
                    })
                  })
                ]
              }),
              // searchTrailingAction
            ],
          }),
        ],
      }),

      jsxs("div", {
        className: "min-h-0 flex-1 overflow-hidden bg-(--ui-chat-surface-background)",
        children: [
          jsxs("div", {
            className: "flex h-full flex-col",
            children: [
              jsxs("div", {
                className: "flex min-h-0 flex-1 flex-col",
                children: [
                  // loader
                  loader,
                  //
                  jsx(WorkflowBrowser, {
                    workflows,
                    onOpen: openWorkflow,
                  })
                ],
              })
            ],
          })
        ],
      }),
    ],
  });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isValidId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}
function workflowPath(id) {
  return `${FILE_PREFIX}${id}.json`;
}
function sendResponse(target, requestId, type, payload = {}) {
  target?.postMessage(
    {
      protocol: PROTOCOL,
      requestId,
      type,
      ...payload,
    },
    "*",
  );
}

async function handleWorkflowRequest(files, message) {
  const { type, payload = {} } = message;

  if (!isRecord(payload)) {
    throw new Error("Invalid request payload");
  }

  if (!files) {
    throw new Error("Hermes file storage is unavailable");
  }

  if (type === "WORKFLOW_LIST") {
    const result = await files.list("data");

    if (!result.ok) {
      throw new Error(result.message || "Could not list workflows");
    }

    const entries = [];

    for (const entry of result.entries) {
      if (
        entry.isDirectory ||
        !entry.name.startsWith(FILE_PREFIX) ||
        !entry.name.endsWith(".json")
      ) {
        continue;
      }

      const file = await files.readText("data", entry.name);

      if (!file.ok) continue;

      try {
        const workflow = JSON.parse(file.text);

        if (
          isRecord(workflow) &&
          isValidId(workflow.id) &&
          Array.isArray(workflow.nodes) &&
          Array.isArray(workflow.edges)
        ) {
          entries.push({
            id: workflow.id,
            name: typeof workflow.name === "string"
              ? workflow.name
              : "Untitled workflow",
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt,
          });
        }
      } catch {
        // Ignore malformed workflow files.
      }
    }

    entries.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() -
        new Date(a.updatedAt).getTime(),
    );

    return { workflows: entries };
  }

  if (type === "WORKFLOW_CREATE") {
    const name =
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim().slice(0, 120)
        : "Untitled workflow";

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const workflow = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      nodes: [],
      edges: [],
    };

    const result = await files.writeText(
      "data",
      workflowPath(id),
      JSON.stringify(workflow, null, 2),
      { exclusive: true },
    );

    if (!result.ok) {
      throw new Error(result.message || "Could not create workflow");
    }

    return { workflow };
  }

  if (type === "WORKFLOW_SAVE") {
    const { id, nodes, edges, name } = payload;

    if (
      !isValidId(id) ||
      !Array.isArray(nodes) ||
      !Array.isArray(edges)
    ) {
      throw new Error("Invalid workflow data");
    }

    const path = workflowPath(id);
    const existing = await files.readText("data", path);

    if (!existing.ok) {
      throw new Error("Workflow not found");
    }

    let previous;

    try {
      previous = JSON.parse(existing.text);
    } catch {
      throw new Error("Existing workflow file is invalid");
    }

    const now = new Date().toISOString();

    const workflow = {
      id,
      name:
        typeof name === "string" && name.trim()
          ? name.trim().slice(0, 120)
          : previous.name || "Untitled workflow",
      createdAt: previous.createdAt || now,
      updatedAt: now,
      nodes,
      edges,
    };

    const result = await files.writeText(
      "data",
      path,
      JSON.stringify(workflow, null, 2),
    );

    if (!result.ok) {
      throw new Error(result.message || "Could not save workflow");
    }

    return { workflow };
  }

  if (type === "WORKFLOW_LOAD") {
    const { id } = payload;

    if (!isValidId(id)) {
      throw new Error("Invalid workflow ID");
    }

    const result = await files.readText(
      "data",
      workflowPath(id),
    );

    if (!result.ok) {
      throw new Error(result.message || "Could not load workflow");
    }

    let workflow;

    try {
      workflow = JSON.parse(result.text);
    } catch {
      throw new Error("Workflow file contains invalid JSON");
    }

    if (
      !isRecord(workflow) ||
      workflow.id !== id ||
      !Array.isArray(workflow.nodes) ||
      !Array.isArray(workflow.edges)
    ) {
      throw new Error("Invalid workflow file structure");
    }

    return { workflow };
  }

  if (type === "WORKFLOW_DELETE") {
    const { id } = payload;

    if (!isValidId(id)) {
      throw new Error("Invalid workflow ID");
    }

    const result = await files.trash(
      "data",
      workflowPath(id),
    );

    if (!result.ok) {
      throw new Error(result.message || "Could not delete workflow");
    }

    return { id };
  }

  throw new Error("Unsupported workflow operation");
}

function WorkflowStudioPage({ ctx }) {
  const frameRef = useRef(null);
  const workflowId = new URLSearchParams(window.location.search).get("id");
  const studioUrl = workflowId
    ? `${STUDIO_URL}/?workflowId=${encodeURIComponent(workflowId)}`
    : STUDIO_URL;

  useEffect(() => {
    const handleMessage = async (event) => {
      const frameWindow = frameRef.current?.contentWindow;

      // Only accept messages from this editor iframe.
      if (!frameWindow || event.source !== frameWindow) return;

      const message = event.data;

      if (
        !isRecord(message) ||
        message.protocol !== PROTOCOL ||
        typeof message.requestId !== "string" ||
        typeof message.type !== "string"
      ) {
        return;
      }

      try {
        const result = await handleWorkflowRequest(
          ctx.files,
          message,
        );

        sendResponse(
          frameWindow,
          message.requestId,
          `${message.type}_RESULT`,
          { ok: true, ...result },
        );
      } catch (error) {
        sendResponse(
          frameWindow,
          message.requestId,
          `${message.type}_RESULT`,
          {
            ok: false,
            error: error instanceof Error
              ? error.message
              : "Unknown workflow error",
          },
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [ctx]);

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
          ref: frameRef,
          src: studioUrl,
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
        render: () => jsx(WorkflowLibraryPage, { ctx }),
      },
      {
        id: "workflow-editor-page",
        area: ROUTES_AREA,
        data: { path: "/workflow-editor" },
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
