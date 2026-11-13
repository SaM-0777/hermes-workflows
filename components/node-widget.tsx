import { useCallback, useMemo, useRef, type DragEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "./ui/card";
import { useState } from "react";
import {
  Blocks,
  ChevronRight,
  Grip,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { NodeEditor } from "./node-editor";
import type { NodeData } from "@/lib/node";
import { useStorage, type SavedNode } from "@/hooks/use-storage";

export type WidgetMode = "expanded" | "compact" | "minimized";

export type WidgetPosition = {
  x: number;
  y: number;
};

export type WidgetSize = {
  width: number;
  height: number;
};

export type NodeWidgetTab = "my-nodes" | "built-in";

export interface NodeWidgetProps {
  onAddNode: (data: NodeData) => void;
}

export function NodeWidget({ onAddNode }: NodeWidgetProps) {
  const { nodes, saveNode, updateNode, deleteNode } = useStorage();
  const [mode, setMode] = useState<WidgetMode>("expanded");
  const [position, setPosition] = useState<WidgetPosition>({ x: 16, y: 16 });
  const [pinned, setPinned] = useState<boolean>(false);
  const [view, setView] = useState<"library" | "create">("library");
  const [activeTab, setActiveTab] = useState<NodeWidgetTab>("my-nodes");
  const [selectedNode, setSelectedNode] = useState<SavedNode | null>(null);
  const [search, setSearch] = useState("");
  const [size] = useState<WidgetSize>({
    width: 350,
    height: 690,
  });
  const cardRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
  } | null>(null);

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) =>
      node.data.general.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [nodes, search]);

  const handleSaveNode = async (data: NodeData) => {
    if (selectedNode) {
      await handleUpdateNode(selectedNode.id, data);
      setSelectedNode(null);
    } else {
      await saveNode(data);
    }
    setView("library");
  };
  const handleUpdateNode = async (id: string, data: NodeData) => {
    await updateNode(id, data);
    setView("library");
  };
  const handleDeleteNode = async (id: string) => {
    await deleteNode(id);
  };

  const updatePosition = useCallback((next: WidgetPosition) => {
    setPosition(next);
  }, []);
  const changeMode = useCallback((nextMode: WidgetMode) => {
    if (nextMode === "compact") setView("library");
    setMode(nextMode);
  }, []);

  function startDragging(event: PointerEvent<HTMLDivElement>) {
    if (pinned || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: position.x,
      y: position.y,
    });
  }
  function moveDragging(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart || dragStart.pointerId !== event.pointerId) {
      return;
    }
    const width =
      mode === "minimized" ? 52 : mode === "compact" ? 270 : size.width;
    const height =
      mode === "minimized" ? 52 : mode === "compact" ? 110 : size.height;
    const nextX = dragStart.x + event.clientX - dragStart.pointerX;
    const nextY = dragStart.y + event.clientY - dragStart.pointerY;
    // Clamp to the canvas, not the window: the widget is absolute inside it.
    // `currentTarget` is the header, whose offsetParent is the (positioned) card —
    // measure the canvas from the card itself, whose offsetParent is the canvas.
    const canvas = (cardRef.current?.offsetParent as HTMLElement | null)
      ?? document.body;
    updatePosition({
      x: Math.max(0, Math.min(canvas.clientWidth - width, nextX)),
      y: Math.max(0, Math.min(canvas.clientHeight - height, nextY)),
    });
  }
  function stopDragging() {
    setDragStart(null);
  }
  function handleNodeDragStart(
    event: DragEvent<HTMLDivElement>,
    node: NodeData,
  ) {
    event.dataTransfer.setData(
      "application/workflow-node",
      JSON.stringify(node),
    );

    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <Card
      ref={cardRef}
      className={cn(
        "absolute z-50 flex flex-col gap-0 overflow-hidden",
        "rounded-sm border-border bg-card py-0",
        "shadow-2xl shadow-black/25",
        "transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
      )}
      style={{
        left: position.x,
        top: position.y,
        width:
          view === "create"
            ? "min(980px, calc(100% - 48px))"
            : mode === "compact"
              ? 270
              : size.width,
        height: mode === "compact" ? "auto" : size.height,
      }}
    >
      <CardHeader
        onPointerDown={startDragging}
        onPointerMove={moveDragging}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        className={cn(
          "flex h-12 shrink-0 touch-none items-center justify-between",
          "border-b border-border px-3",
          pinned ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Grip className="size-4 shrink-0 text-muted-foreground/60" />
          <span className="truncate text-sm font-semibold select-none">
            Node Library
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Tooltip>
            <TooltipTrigger onClick={() => setPinned((value) => !value)}>
              {pinned ? (
                <Pin className="size-3.5" />
              ) : (
                <PinOff className="size-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {pinned ? "Unpin widget" : "Pin widget"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              onClick={() =>
                changeMode(mode === "expanded" ? "compact" : "expanded")
              }
            >
              {mode === "expanded" ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {mode === "expanded" ? "Compact view" : "Expanded view"}
            </TooltipContent>
          </Tooltip>
          {/*<Tooltip>
            <TooltipTrigger onClick={() => changeMode("minimized")}>
              <Minus className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Minimize</TooltipContent>
          </Tooltip>*/}
          {/*<Tooltip>
            <TooltipTrigger>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7"
                onClick={onClose}
              >
                <X className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>*/}
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 overflow-hidden p-0">
        <div
          className={cn(
            "flex h-full min-h-0 flex-col overflow-hidden transition-[width] duration-300 ease-in-out space-y-3",
            view === "create" ? "w-87 shrink-0" : "w-full",
          )}
        >
          {mode === "compact" ? (
            <div className="flex items-center gap-2 p-3">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  setMode("expanded");
                  setView("create");
                }}
              >
                <Plus className="size-3.5" />
                Create
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => changeMode("expanded")}
              >
                <Blocks className="size-3.5" />
                Browse nodes
              </Button>
            </div>
          ) : (
            <>
              <div className="shrink-0 px-3 pt-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search components..."
                    className="h-9 pl-8 pr-8 text-xs"
                  />

                  {search && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                      onClick={() => setSearch("")}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as NodeWidgetTab)}
                className="shrink-0 px-3"
              >
                <TabsList className="grid h-8 w-full grid-cols-2">
                  <TabsTrigger value="my-nodes" className="text-xs">
                    My Nodes
                  </TabsTrigger>
                  <TabsTrigger disabled value="built-in" className="text-xs">
                    Built-in
                  </TabsTrigger>
                </TabsList>
                <TabsContent value={"my-nodes"}></TabsContent>
              </Tabs>

              <div className="shrink-0 px-3">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-auto w-full justify-start gap-3",
                    "border-dashed border-primary/40 bg-primary/4",
                    "py-3 text-left hover:border-primary/70",
                    "hover:bg-primary/8",
                  )}
                  onClick={() => {
                    setMode("expanded");
                    setView("create");
                  }}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Plus className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-start">
                    <span className="text-xs font-semibold">
                      Create new component
                    </span>
                    <span className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                      Define a custom Python node
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Button>
              </div>

              <div className="flex shrink-0 items-center justify-between px-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {activeTab === "my-nodes"
                    ? "Your components"
                    : activeTab === "built-in"
                      ? "Built-in components"
                      : "Recently used"}
                </span>

                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-[10px] font-normal"
                >
                  {filteredNodes.length}
                </Badge>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
                {filteredNodes.length > 0 ? (
                  filteredNodes.map((node, index) => (
                    <NodeListRow
                      key={index}
                      node={node.data}
                      handleNodeDragStart={handleNodeDragStart}
                      onAddNode={() => onAddNode(node.data)}
                      onEditNode={() => {
                        setSelectedNode(node);
                        setView("create");
                      }}
                      onDeleteNode={() => {
                        handleDeleteNode(node.id);
                        setView("library");
                      }}
                    />
                  ))
                ) : (
                  <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center">
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                      <SearchX className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs font-medium">No components found</p>
                    <p className="max-w-52 text-[11px] text-muted-foreground">
                      {search
                        ? "Try another search term."
                        : "Create your first component to get started."}
                    </p>
                  </div>
                )}
              </div>

              <div className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 justify-start gap-2 rounded-none"
                  onClick={() => {
                    onAddNode({
                      general: {
                        name: "custom_node",
                        description: "",
                      },
                    });
                  }}
                >
                  <Plus className="size-4" />
                  New component
                </Button>
              </div>
            </>
          )}
        </div>

        {view === "create" && (
          <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden border-l">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Create component</h3>
                <p className="text-xs text-muted-foreground">
                  Configure your custom component.
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView("library")}
              >
                Cancel
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <NodeEditor
                data={selectedNode?.data}
                onSave={handleSaveNode}
                onCancel={() => {
                  setSelectedNode(null);
                  setView("library");
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface NodeListRowProps {
  node: NodeData;
  handleNodeDragStart: (
    event: DragEvent<HTMLDivElement>,
    node: NodeData,
  ) => void;
  onAddNode: (node: NodeData) => void;
  onEditNode: () => void;
  onDeleteNode: () => void;
}

function NodeListRow({
  node,
  handleNodeDragStart,
  onAddNode,
  onEditNode,
  onDeleteNode,
}: NodeListRowProps) {
  return (
    <Card
      draggable
      onDragStart={(event) => handleNodeDragStart(event, node)}
      className={cn(
        "group relative cursor-grab gap-0 overflow-visible",
        "border-border/70 bg-card py-0 shadow-none",
        "transition-colors hover:border-primary/40",
        "hover:bg-accent/30 active:cursor-grabbing",
      )}
    >
      <CardContent className="p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{node.general.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {node.general.description}
            </p>
          </div>

          <Tooltip>
            <TooltipTrigger
              onClick={(event) => {
                event.stopPropagation();
                onAddNode(node);
              }}
              type="button"
              className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Plus className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Add to canvas</TooltipContent>
          </Tooltip>

          <DropdownMenu
          //onOpenChange={(open) => {
          //  setActiveMenu(open ? node.id : null);
          //}}
          >
            <DropdownMenuTrigger className="size-7 shrink-0 text-muted-foreground">
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEditNode}>
                <Pencil />
                Edit component
              </DropdownMenuItem>
              {/*<DropdownMenuItem onClick={() => onDuplicateNode(node)}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />*/}
              <DropdownMenuItem variant="destructive" onClick={onDeleteNode}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
