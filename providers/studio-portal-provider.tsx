/**
 * The container the studio's overlays portal into.
 *
 * Base UI resolves a portal's element as `containerProp ?? parentPortalNode ??
 * document.body` (floating-ui-react/components/FloatingPortal.mjs) — it has no
 * provider or config for a default, so an overlay opened by the studio lands in
 * `document.body`, outside `.hermes-workflow-studio`, where only the host app's
 * rules apply. That is what made dialogs, menus and tooltips render with the
 * app's styling (or none at all, for classes the app never generates).
 *
 * `StudioScope` provides its own element here, and the overlay primitives pass
 * it to their `Portal`, so an overlay stays inside the studio's scope and
 * resolves the studio's own tokens — with no change to any class name and no
 * effect on the host's overlays.
 *
 * Null until the scope element has mounted; Base UI treats that as "no
 * container given" and falls back to `document.body` for that first render,
 * which only matters for an overlay opened before the page exists.
 */
import { createContext, useContext, type ReactNode } from "react";

export const StudioPortalContext = createContext<HTMLElement | null>(null);

export function useStudioPortalContainer(): HTMLElement | null {
  return useContext(StudioPortalContext);
}

export function StudioPortalProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <StudioPortalContext.Provider value={container}>
      {children}
    </StudioPortalContext.Provider>
  );
}
