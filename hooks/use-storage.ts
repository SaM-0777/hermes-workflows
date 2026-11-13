import { useCallback, useEffect, useState } from "react";
import { hostRest } from "@/lib/host";
import type { NodeData } from "@/lib/node";

export interface SavedNode {
  id: string;
  data: NodeData;
  createdAt: string;
  updatedAt: string;
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

/** Node library, straight from the plugin backend (ctx.rest). */
export function useStorage(): UseStorageReturn {
  const [nodes, setNodes] = useState<SavedNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await hostRest<SavedNode[]>("/node-library", {
        method: "GET",
      });

      if (!Array.isArray(response)) {
        throw new Error("Invalid node library response");
      }

      setNodes(response);
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
    const node = await hostRest<SavedNode>("/node-library/nodes", {
      method: "POST",
      body: { data },
    });

    if (!node) {
      throw new Error("The backend did not return the saved node");
    }

    setNodes((current) => [...current, node]);

    return node;
  }, []);

  const updateNode = useCallback(async (id: string, data: NodeData) => {
    const node = await hostRest<SavedNode>(`/node-library/nodes/${id}`, {
      method: "PUT",
      body: { data },
    });

    if (!node) {
      throw new Error("The backend did not return the updated node");
    }

    setNodes((current) =>
      current.map((entry) => (entry.id === id ? node : entry)),
    );
  }, []);

  const deleteNode = useCallback(async (id: string) => {
    await hostRest<string>(`/node-library/nodes/${id}`, { method: "DELETE" });

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
