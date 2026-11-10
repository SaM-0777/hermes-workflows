import { useState, type ReactNode } from "react";
import { Edit, Trash2, type LucideIcon } from "lucide-react";
import { cva } from "class-variance-authority";
import { useReactFlow, Handle, type NodeHandle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { NodeData } from "@/lib/node";
import { NodeEditor } from "./node-editor";

export type NodeStatus = "idle" | "ready" | "running" | "success" | "error";
export interface BaseNodeProps {
  id: string;
  data: NodeData;
  icon: LucideIcon;
  status?: NodeStatus;
  selected?: boolean;
  children?: ReactNode;
  handles?: NodeHandle[];
  className?: string;
}

const nodeStatusVariants = cva(
  "inline-flex h-5 items-center rounded-md border-0 px-2 text-[10px] font-medium",
  {
    variants: {
      status: {
        idle: "bg-muted text-muted-foreground",
        ready: "bg-blue-500/10 text-blue-400",
        running: "bg-amber-500/10 text-amber-400",
        success: "bg-emerald-500/10 text-emerald-400",
        error: "bg-red-500/10 text-red-400",
      },
    },
    defaultVariants: {
      status: "idle",
    },
  },
);
const statusLabels: Record<NodeStatus, string> = {
  idle: "Idle",
  ready: "Ready",
  running: "Running",
  success: "Success",
  error: "Failed",
};

export function BaseNode({
  id,
  data,
  icon: Icon,
  selected = false,
  children,
  handles = [],
  className = "",
}: BaseNodeProps) {
  const [status] = useState<NodeStatus>("idle");
  const [openEditor, setOpenEditor] = useState<boolean>(false);
  const { updateNodeData, deleteElements } = useReactFlow();

  function handleClose() {
    setOpenEditor(false);
  }
  function handleSave(updatedData: NodeData) {
    updateNodeData(id, updatedData);
  }
  function handleDelete() {
    void deleteElements({
      nodes: [{ id }],
    });
  }

  return (
    <div className="relative flex w-max items-start gap-4">
      <div className="relative min-w-80 max-w-100 shrink-0">
        {handles.map((handle) => (
          <Handle
            key={handle.id}
            id={handle.id}
            type={handle.type}
            position={
              handle.position ?? (handle.type === "target" ? "left" : "right")
            }
            className="size-3 border-2 border-background bg-muted-foreground transition-colors hover:bg-blue-500"
          />
        ))}

        <Card
          className={cn(
            "gap-0 overflow-visible rounded-xl border bg-card py-0 shadow-lg shadow-black/10 transition-[border-color,box-shadow]",
            selected
              ? "border-blue-500 shadow-blue-500/10"
              : "border-border hover:border-muted-foreground/40",
            className,
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between gap-3 px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/70">
                <Icon className="size-4 text-foreground/80" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium leading-none">
                  {data.general.name}
                </p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {data.general.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/*<Button
                type="button"
                variant="ghost"
                size="icon"
                className="nodrag nopan size-7 shrink-0 text-muted-foreground"
                aria-label="Node actions"
              >
                <span className="text-lg leading-none">
                  <Play />
                </span>
              </Button>*/}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="nodrag nopan size-7 shrink-0 text-muted-foreground"
                aria-label="Node actions"
                onClick={() => {
                  handleDelete();
                }}
              >
                <span className="text-lg leading-none">
                  <Trash2 />
                </span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="nodrag nopan size-7 shrink-0 text-muted-foreground"
                aria-label="Node actions"
                onClick={() => {
                  setOpenEditor(true);
                }}
              >
                <span className="text-lg leading-none">
                  <Edit />
                </span>
              </Button>

              {/*<Button
                type="button"
                variant="ghost"
                size="icon"
                className="nodrag nopan size-7 shrink-0 text-muted-foreground"
                aria-label="Node actions"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenEditor((value) => !value);
                }}
              >
                <span className="text-lg leading-none">
                  <Ellipsis />
                </span>
              </Button>*/}
              {/*<NodeDropdown
                onEdit={() => {
                  setOpenEditor(true);
                }}
                onDelete={() => {
                  handleDelete();
                }}
              />*/}
            </div>
          </CardHeader>

          {data.io?.inputs?.length || data.io?.outputs?.length ? (
            <div className="divide-y divide-border/70">
              {/* Inputs */}
              {!!data.io?.inputs?.length && (
                <CardContent className="px-0 py-3">
                  <div className="mb-2.5 flex items-center justify-between px-4">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Inputs
                    </span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {data.io.inputs.length}
                    </span>
                  </div>

                  <div className="space-y-1 px-2">
                    {data.io.inputs.map((input) => (
                      <div
                        key={input.name}
                        className="group relative flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 transition-colors hover:border-border hover:bg-muted/40"
                      >
                        <Handle
                          type="target"
                          position={Position.Left}
                          id={input.name}
                          className="size-2.5! -left-1.25! border-2! border-background! bg-sky-500!"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {input.name}
                          </p>
                        </div>

                        <span className="shrink-0 rounded-md border border-border/70 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                          {input.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}

              {/* Parameters */}
              {!!data.config?.parameters?.length && (
                <CardContent className="border-t border-border/70 px-0 py-3">
                  <div className="mb-2.5 flex items-center justify-between px-4">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Parameters
                    </span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {data.config.parameters.length}
                    </span>
                  </div>

                  <div className="space-y-1 px-2">
                    {data.config.parameters.map((parameter) => (
                      <div
                        key={parameter.name}
                        className="flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 hover:border-border hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {parameter.name}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            Default: {parameter.defaultValue || "Not set"}
                          </p>
                        </div>

                        <span className="shrink-0 rounded-md border border-border/70 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                          {parameter.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}

              {/* Outputs */}
              {!!data.io?.outputs?.length && (
                <CardContent className="bg-muted/15 px-0 py-3">
                  <div className="mb-2.5 flex items-center justify-between px-4">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Outputs
                    </span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {data.io.outputs.length}
                    </span>
                  </div>

                  <div className="space-y-1 px-2">
                    {data.io.outputs.map((output) => (
                      <div
                        key={output.name}
                        className="group relative flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 transition-colors hover:border-border hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1 text-right">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {output.name}
                          </p>
                        </div>

                        <span className="shrink-0 rounded-md border border-border/70 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                          {output.type}
                        </span>

                        <Handle
                          type="source"
                          position={Position.Right}
                          id={output.name}
                          className="size-2.5! -right-1.25! border-2! border-background! bg-emerald-500!"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </div>
          ) : null}

          <Separator />

          {children && (
            <CardContent className="px-3.5 py-3">{children}</CardContent>
          )}

          <Separator />

          <CardFooter className="flex min-h-10 items-center justify-between gap-2 px-3.5 py-2">
            <>
              <Badge
                variant="secondary"
                className={nodeStatusVariants({ status })}
              >
                {statusLabels[status]}
              </Badge>
            </>
          </CardFooter>
        </Card>
      </div>
      {openEditor && (
        <div
          className={cn(
            "nowheel nodrag nopan w-140 max-w-[calc(100vw-24px)] shrink-0",
            "h-[min(760px,calc(100vh-48px))] overflow-y-auto overscroll-contain",
            "rounded-md border bg-card shadow-xl",
          )}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <NodeEditor
            closeButton
            data={data}
            onSave={handleSave}
            onCancel={handleClose}
          />
        </div>
      )}
    </div>
  );
}
