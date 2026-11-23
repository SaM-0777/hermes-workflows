/**
 * The studio's style scope.
 *
 * Every custom property in the studio stylesheet is declared on
 * `.hermes-workflow-studio`, so this element is what puts the studio's palette
 * in reach of its components, and its lifecycle is what keeps the sheet on
 * screen only while a studio surface is.
 *
 * `ctx.register` / `ctx.onDispose` are plugin-lifetime, so the stylesheet cannot
 * be mounted from `register()`. The SDK's own mount-scoped primitive
 * (`<Contribute>`, apps/desktop/src/contrib/react/contribute.tsx) states the
 * contract this follows: "React's lifecycle IS the visibility contract" — an
 * effect registers on mount and its return value disposes on unmount, with no
 * route sniffing.
 *
 * The same element doubles as the portal container handed to every overlay
 * primitive (see lib/studio-portal.tsx), so dialogs, menus, selects and tooltips
 * stay inside the scope instead of mounting into `document.body`.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { installStudioStyles } from "@/desktop/studio-styles";
import { StudioPortalProvider } from "../providers/studio-portal-provider";

export function StudioScope({ children }: { children: ReactNode }) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const releaseStyles = installStudioStyles();
    setContainer(scopeRef.current);
    return releaseStyles;
  }, []);

  return (
    <div ref={scopeRef} className="hermes-workflow-studio">
      <StudioPortalProvider container={container}>
        {children}
      </StudioPortalProvider>
    </div>
  );
}
