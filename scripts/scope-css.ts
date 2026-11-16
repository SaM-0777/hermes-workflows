import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

/**
 * Scopes the compiled studio stylesheet to the studio's own subtree.
 *
 * The sheet is inlined into the app's document, so every rule it ships competes
 * with the app's own: the plugin's utilities carry the same class names but were
 * compiled against the studio's variables (`.bg-card{background-color:var(--card)}`
 * vs the app's `var(--color-card)`). Injected later, inside the same
 * `@layer utilities`, they win — and `--card`, `--popover`, `--primary`,
 * `--muted-foreground`, `--border`… exist only on the studio's scope element, so
 * every app surface and every portalled overlay (dialogs, menus, tooltips all
 * mount into `document.body`) resolved them to nothing and painted transparent.
 *
 * This pass rewrites the final artifact so nothing can match outside
 * `.hermes-workflow-studio`: `:root`/`:host` move onto the scope element, `html`
 * and `body` are dropped, and every other selector is prefixed. `assertScoped`
 * fails the build if a document-level selector survives.
 *
 * The cost, accepted deliberately: an overlay the studio opens portals to
 * `document.body`, i.e. outside the scope, so it renders with the APP's own
 * rules — native Hermes styling rather than the studio's neutral palette.
 */

export const STUDIO_SCOPE = ".hermes-workflow-studio";

/** Document-level rules: the app owns the document, so these are dropped. */
const DROPPED_SELECTORS = new Set(["html", "body"]);

/** Root-level declarations: they belong on the scope element. */
const ROOT_SELECTORS = new Set([":root", ":host"]);

export function scopeSelector(selector: string): string | null {
  const text = selector.trim();
  if (!text) return null;
  if (DROPPED_SELECTORS.has(text)) return null;
  if (ROOT_SELECTORS.has(text)) return STUDIO_SCOPE;

  // Already inside the scope — authored that way in src/index.css, or a second pass.
  if (text === STUDIO_SCOPE) return STUDIO_SCOPE;
  if (text.startsWith(`${STUDIO_SCOPE} `) || text.startsWith(`${STUDIO_SCOPE}:`)) {
    return text;
  }
  if (text.startsWith(`.dark ${STUDIO_SCOPE}`)) return text;

  return `${STUDIO_SCOPE} ${text}`;
}

function selectorsOf(rule: postcss.Rule): string[] {
  try {
    const out: string[] = [];
    selectorParser().astSync(rule.selector).each((node) => {
      out.push(node.toString().trim());
    });
    return out;
  } catch {
    // Unparseable selector: hand it back whole so the assertion can reject it.
    return [rule.selector.trim()];
  }
}

function isKeyframeStep(rule: postcss.Rule): boolean {
  const parent = rule.parent;
  return Boolean(
    parent && parent.type === "atrule" && /keyframes$/i.test((parent as postcss.AtRule).name),
  );
}

export function scopeStudioCss(css: string): string {
  const root = postcss.parse(css);

  root.walkRules((rule) => {
    // `@keyframes` steps are not selectors against the document.
    if (isKeyframeStep(rule)) return;

    const kept: string[] = [];
    for (const selector of selectorsOf(rule)) {
      const mapped = scopeSelector(selector);
      if (mapped !== null && !kept.includes(mapped)) kept.push(mapped);
    }

    if (kept.length === 0) rule.remove();
    else rule.selector = kept.join(", ");
  });

  return root.toString();
}

/** Throws when any rule can still match outside the studio scope element. */
export function assertScoped(css: string): void {
  const root = postcss.parse(css);
  const offenders: string[] = [];

  root.walkRules((rule) => {
    if (isKeyframeStep(rule)) return;
    for (const selector of selectorsOf(rule)) {
      const scoped =
        selector === STUDIO_SCOPE ||
        selector.startsWith(`${STUDIO_SCOPE} `) ||
        selector.startsWith(`${STUDIO_SCOPE}:`) ||
        selector.startsWith(`.dark ${STUDIO_SCOPE}`);
      if (!scoped) offenders.push(selector);
    }
  });

  if (offenders.length > 0) {
    const sample = offenders.slice(0, 8).join(" | ");
    throw new Error(
      `The studio stylesheet is not scoped to ${STUDIO_SCOPE}: ${offenders.length} selector(s) escape it (${sample}). ` +
        "Extend scripts/scope-css.ts instead of shipping a document-level rule.",
    );
  }
}
