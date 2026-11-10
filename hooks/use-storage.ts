import { useCallback, useEffect, useState } from "react";
import type { NodeData } from "@/lib/node";

const REQUEST_TIMEOUT = 30_000;
const PROTOCOL = "workflow-studio:v1";

export interface SavedNode {
  id: string;
  data: NodeData;
  createdAt: string;
  updatedAt: string;
}

type RequestType =
  | "NODE_LIBRARY_LIST"
  | "NODE_LIBRARY_SAVE"
  | "NODE_LIBRARY_UPDATE"
  | "NODE_LIBRARY_DELETE";

interface HostResponse<T> {
  protocol: typeof PROTOCOL;
  requestId: string;
  type: `${RequestType}_RESULT`;
  ok: boolean;
  error?: string;
  nodes?: SavedNode[];
  node?: SavedNode;
  id?: string;
}

function requestHost<T>(
  type: RequestType,
  payload: Record<string, unknown> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(timeout);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const response = event.data as HostResponse<T>;
      if (
        !response ||
        response.protocol !== PROTOCOL ||
        response.requestId !== requestId ||
        response.type !== `${type}_RESULT`
      ) {
        return;
      }

      cleanup();
      if (!response.ok) {
        reject(new Error(response.error || "Host request failed"));
        return;
      }

      resolve(response as T);
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Request timed out: ${type}`));
    }, REQUEST_TIMEOUT);

    window.addEventListener("message", handleMessage);
    window.parent.postMessage(
      {
        protocol: PROTOCOL,
        requestId,
        type,
        payload,
      },
      "*",
    );
  });
}

export interface UseStorageReturn {
  nodes: SavedNode[];
  isLoading: boolean;
  error: string | null;
  saveNode: (data: NodeData) => Promise<SavedNode>;
  updateNode: (id: string, data: NodeData) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useStorage(): UseStorageReturn {
  const [nodes, setNodes] = useState<SavedNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await requestHost<{ nodes: SavedNode[] }>(
        "NODE_LIBRARY_LIST",
      );

      if (!Array.isArray(response.nodes)) {
        throw new Error("Invalid node library response");
      }

      setNodes(response.nodes);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load node library.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveNode = useCallback(async (data: NodeData) => {
    const response = await requestHost<{ node: SavedNode }>(
      "NODE_LIBRARY_SAVE",
      { data },
    );

    if (!response.node) {
      throw new Error("Host did not return the saved node");
    }

    setNodes((current) => [...current, response.node!]);

    return response.node;
  }, []);

  const updateNode = useCallback(async (id: string, data: NodeData) => {
    const response = await requestHost<{ node: SavedNode }>(
      "NODE_LIBRARY_UPDATE",
      { id, data },
    );

    if (!response.node) {
      throw new Error("Host did not return the updated node");
    }

    setNodes((current) =>
      current.map((node) => (node.id === id ? response.node! : node)),
    );
  }, []);

  const deleteNode = useCallback(async (id: string) => {
    await requestHost<{ id: string }>("NODE_LIBRARY_DELETE", { id });

    setNodes((current) => current.filter((node) => node.id !== id));
  }, []);

  return {
    nodes,
    isLoading,
    error,
    saveNode,
    updateNode,
    deleteNode,
    refresh,
  };
}
