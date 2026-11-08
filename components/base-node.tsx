import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cva } from "class-variance-authority";
import { Handle, Position, type NodeHandle } from "@xyflow/react";
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

export type NodeStatus = "idle" | "ready" | "running" | "success" | "error";
export interface BaseNodeProps {
  title: string;
  category: string;
  icon: LucideIcon;
  status?: NodeStatus;
  selected?: boolean;
  children?: ReactNode;
  handles?: NodeHandle[];
  actions?: ReactNode;
  footer?: ReactNode;
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
const positionMap = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

export function BaseNode({
  title,
  category,
  icon: Icon,
  status = "idle",
  selected = false,
  children,
  handles = [],
  actions,
  footer,
  className = "",
}: BaseNodeProps) {
  return (
    <div className="relative min-w-60 max-w-70">
      {handles.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type={handle.type}
          position={
            positionMap[
              handle.position ?? (handle.type === "target" ? "left" : "right")
            ]
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
                {title}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {category}
              </p>
            </div>
          </div>

          {actions ?? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="nodrag nopan size-7 shrink-0 text-muted-foreground"
              aria-label="Node actions"
            >
              <span className="text-lg leading-none">···</span>
            </Button>
          )}
        </CardHeader>
        <Separator />
        {children && (
          <CardContent className="px-3.5 py-3">{children}</CardContent>
        )}
        <Separator />

        <CardFooter className="flex min-h-10 items-center justify-between gap-2 px-3.5 py-2">
          {footer ?? (
            <>
              <Badge
                variant="secondary"
                className={nodeStatusVariants({ status })}
              >
                {statusLabels[status]}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {handles.filter((handle) => handle.type === "target").length}{" "}
                inputs
                {" · "}
                {
                  handles.filter((handle) => handle.type === "source").length
                }{" "}
                outputs
              </span>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
