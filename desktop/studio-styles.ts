/**
 * The studio's stylesheet, injected into the app document while a studio
 * surface is mounted.
 *
 * The desktop loader resolves only `@hermes/plugin-sdk` and `react`, so a plugin
 * cannot `import "./index.css"` — there is no CSS pipeline for disk plugins. The
 * build compiles the studio's Tailwind + React Flow CSS and inlines it here.
 *
 * Injection is reference-counted, because the library page and a studio tab can
 * both be mounted: the sheet must survive until the LAST one unmounts. A guard
 * that returns a no-op disposer for the second mount would let the first
 * unmount strip the styles off the page still on screen. An existing copy (left
 * by a hot-reloaded plugin) is adopted rather than duplicated.
 *
 * The `typeof` guard matters for the Vite preview harness, which renders the
 * same component without the bundle's `__STUDIO_CSS__` define and loads this CSS
 * through its own import instead.
 */

declare const __STUDIO_CSS__: string;

const STUDIO_CSS = typeof __STUDIO_CSS__ === "string" ? __STUDIO_CSS__ : "";

const STYLE_ATTRIBUTE = "data-hermes-workflow-studio";

let references = 0;
let mounted: HTMLStyleElement | null = null;

export function installStudioStyles(): () => void {
  if (!STUDIO_CSS) return () => {};

  if (references === 0) {
    const existing = document.head.querySelector<HTMLStyleElement>(
      `style[${STYLE_ATTRIBUTE}]`,
    );

    if (existing) {
      mounted = existing;
    } else {
      const style = document.createElement("style");
      style.setAttribute(STYLE_ATTRIBUTE, "");
      style.textContent = STUDIO_CSS;
      document.head.appendChild(style);
      mounted = style;
    }
  }

  references += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    references -= 1;
    if (references > 0) return;
    references = 0;
    mounted?.remove();
    mounted = null;
  };
}
