import { spawnSync } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const root = process.cwd();

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

async function main() {
  console.log("\nBuilding Workflow Studio...\n");
  run("bun", ["run", "build"]);

  const htmlPath = path.join(root, "dist", "index.html");
  const html = await readFile(htmlPath, "utf8");

  if (!html.trim()) {
    throw new Error("dist/index.html is empty.");
  }
  const editorUrl = `data:text/html;base64,${Buffer.from(html, "utf8").toString("base64")}`;

  const templatePath = path.join(root, "plugin.template.js");
  const template = await readFile(templatePath, "utf8");
  if (!template.includes("__STUDIO_URL__")) {
    throw new Error(
      "Missing __STUDIO_URL__ placeholder in plugin.template.js.",
    );
  }

  const productionPlugin = template.replace(
    "__STUDIO_URL__",
    JSON.stringify(editorUrl),
  );

  const outputDir = path.join(root, "desktop");
  const outputPath = path.join(outputDir, "plugin.js");

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, productionPlugin, "utf8");

  console.log("\nProduction plugin generated:");
  console.log("desktop/plugin.js");
  console.log(
    `Embedded HTML size: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`,
  );
  console.log(
    `Plugin size: ${(Buffer.byteLength(productionPlugin) / 1024).toFixed(1)} KB`,
  );
}

main().catch((error) => {
  console.error("\nPlugin build failed:", error);
  process.exitCode = 1;
});
