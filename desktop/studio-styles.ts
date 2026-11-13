/**
 * The studio's stylesheet, injected into the app document.
 *
 * The desktop loader resolves only `@hermes/plugin-sdk` and `react`, so a plugin
 * cannot `import "./index.css"` — there is no CSS pipeline for disk plugins. The
 * build compiles the studio's Tailwind + React Flow CSS and inlines it here; we
 * mount it once and remove it on dispose so a plugin reload cannot stack copies.
 */

declare const __STUDIO_CSS__: string;

const STYLE_ATTRIBUTE = "data-hermes-workflow-studio";

export function installStudioStyles(): () => void {
  if (!__STUDIO_CSS__) return () => {};

  const existing = document.head.querySelector(`style[${STYLE_ATTRIBUTE}]`);
  if (existing) return () => {};

  const style = document.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = __STUDIO_CSS__;
  document.head.appendChild(style);

  return () => style.remove();
}
