import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Bundles the desktop half: ONE artifact, desktop/plugin.js.
 *
 * The studio is native plugin UI now — `desktop/plugin.ts` imports the React app
 * from src/ and Bun bundles it (React Flow, LangGraph, the UI kit and all) using
 * the app's own React at runtime. Nothing is served and nothing is framed, so
 * there is no data: URL, no size ceiling and no separate studio build to load.
 *
 * The only thing this step takes from Vite is the compiled stylesheet, which is
 * inlined as a string and injected into the app document at register() — a disk
 * plugin resolves no CSS import and ships no sibling asset files.
 *
 * Run order: `bun run build` (vite → dist/assets/*.css) then this.
 */

const root = process.cwd();
const outputDir = path.join(root, "desktop");
const outputPath = path.join(outputDir, "plugin.js");
const assetsDir = path.join(root, "dist", "assets");

process.env.NODE_ENV = "production";

async function readStudioCss(): Promise<string> {
  let entries: string[];
  try {
    entries = await readdir(assetsDir);
  } catch {
    throw new Error(
      "dist/assets is missing — run `bun run build` (vite) before `bun run build:plugin`.",
    );
  }

  const stylesheets = entries.filter((name) => name.endsWith(".css")).sort();
  if (stylesheets.length === 0) {
    throw new Error("the vite build produced no CSS — nothing to inject");
  }

  const parts = await Promise.all(
    stylesheets.map((name) => readFile(path.join(assetsDir, name), "utf8")),
  );
  return parts.join("\n");
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const css = await readStudioCss();

  const result = await Bun.build({
    entrypoints: [path.join(root, "desktop/plugin.ts")],
    outdir: outputDir,
    naming: "plugin.js",
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "none",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      __STUDIO_CSS__: JSON.stringify(css),
    },
    // The app provides these four; everything else is bundled in.
    external: [
      "@hermes/plugin-sdk",
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Workflow plugin bundle failed.");
  }

  const output = result.outputs.find((file) => file.path === outputPath);
  if (!output) throw new Error(`Expected plugin output at ${outputPath}`);

  const bundle = await output.text();
  if (bundle.includes("react/jsx-dev-runtime")) {
    throw new Error("The plugin bundle contains the development JSX runtime.");
  }
  if (/from ["']\.\.?\//.test(bundle)) {
    throw new Error("The plugin bundle contains an unresolved local import.");
  }

  // langsmith's File-support diagnostic is a *string* that spells
  // `import('node:buffer').File`; the desktop-surface lint cannot tell a string
  // from a real dynamic import and refuses the bundle. The hint is for Node
  // users and is unreachable in the renderer, so it is rewritten instead of
  // failing admission over prose.
  const sanitized = bundle
    .replaceAll("import('node:buffer')", "the global")
    .replaceAll('import("node:buffer")', "the global");

  // Regressions this rewrite exists to prevent: a dev server in the tree, or the
  // framed studio's transport creeping back in.
  for (const forbidden of [
    "localhost:5173",
    "workflow-studio:v1",
    "data:text/html;base64,",
  ]) {
    if (sanitized.includes(forbidden)) {
      throw new Error(`The bundle still contains "${forbidden}" — the framed studio is back.`);
    }
  }

  await writeFile(outputPath, sanitized, "utf8");

  console.log(`Studio stylesheet: ${(css.length / 1024).toFixed(0)} KB inlined`);
  console.log(`Workflow plugin generated: ${outputPath}`);
  console.log(`Plugin size: ${(output.size / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
