import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Bundles the desktop half.
 *
 * Every build artifact lives under dist/: the studio is a Vite single-file build
 * (`bun run build` → dist/index.html) and this script only reads it, inlining it
 * into desktop/plugin.js as a `data:` URL — the one src form SandboxedFrame
 * accepts for a plugin with no route of its own (http(s): or data:).
 *
 * Chromium refuses a URL of 2 MiB or more (url::kMaxURLChars), and a `data:`
 * src IS the URL, so the inlined build has to stay under that. That limit is
 * why the client bundle no longer carries LangGraph — see lib/flow-graph.ts.
 */

const root = process.cwd();
const outputDir = path.join(root, "desktop");
const outputPath = path.join(outputDir, "plugin.js");
const studioBuildPath = path.join(root, "dist", "index.html");

/** Chromium's url::kMaxURLChars: at or above this a navigation is refused. */
const URL_CAP = 2_097_152;

process.env.NODE_ENV = "production";

async function readStudioHtml(): Promise<string> {
  try {
    return await readFile(studioBuildPath, "utf8");
  } catch {
    throw new Error(
      "dist/index.html is missing — run `bun run build` (vite) before `bun run build:plugin`.",
    );
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const html = await readStudioHtml();

  const devServer = process.env.STUDIO_DEV_URL?.trim();
  const src =
    devServer && devServer.length > 0
      ? devServer
      : "data:text/html;base64," +
        Buffer.from(html, "utf8").toString("base64");

  if (src.length >= URL_CAP) {
    throw new Error(
      `Studio src is ${src.length} chars; Chromium refuses URLs of ${URL_CAP} or more. ` +
        `The build is ${(html.length / 1024).toFixed(0)} KB of HTML — trim the studio bundle ` +
        `(see lib/flow-graph.ts) or the frame renders blank.`,
    );
  }

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
      __STUDIO_SRC__: JSON.stringify(src),
    },
    external: ["@hermes/plugin-sdk", "react", "react/jsx-runtime"],
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
  if (bundle.includes("localhost:5173")) {
    throw new Error(
      "A dev-server URL leaked into the bundle: rebuild without STUDIO_DEV_URL.",
    );
  }
  if (!devServer && !bundle.includes("data:text/html;base64,")) {
    throw new Error("The studio payload is missing from the bundle.");
  }

  await writeFile(outputPath, bundle, "utf8");

  console.log(
    `Studio source: dist/index.html (${(html.length / 1024).toFixed(0)} KB)`,
  );
  console.log(
    `Studio src: ${
      devServer ? devServer : `${src.length.toLocaleString()} chars of data URL`
    } (${((src.length / URL_CAP) * 100).toFixed(0)}% of ${URL_CAP.toLocaleString()})`,
  );
  console.log(`Workflow plugin generated: ${outputPath}`);
  console.log(`Plugin size: ${(output.size / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
