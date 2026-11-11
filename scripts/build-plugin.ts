import { mkdir, writeFile } from "fs/promises";
import path from "path";

const root = process.cwd();
const outputDir = path.join(root, "");
const outputPath = path.join(outputDir, "plugin.js");
const standaloneOutputPath = path.join(root, "plugin.js");

process.env.NODE_ENV = "production";

async function main() {
  await mkdir(outputDir, { recursive: true });

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
  await writeFile(standaloneOutputPath, bundle, "utf8");

  console.log(`Workflow plugin generated: ${outputPath}`);
  console.log(`Standalone plugin synchronized: ${standaloneOutputPath}`);
  console.log(`Plugin size: ${(output.size / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
