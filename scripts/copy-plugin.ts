/**
 * Copies the built bundle to where the desktop app loads it at startup.
 *
 * `cp ~/.hermes/...` in the package scripts only worked in a POSIX shell with
 * the same home layout. Resolving the target from HERMES_HOME (default
 * ~/.hermes, via os.homedir()) keeps the step identical on macOS, Linux and
 * Windows.
 */
import { copyFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "desktop", "plugin.js");
const hermesHome =
  process.env.HERMES_HOME?.trim() || path.join(os.homedir(), ".hermes");
const targetDir = path.join(hermesHome, "desktop-plugins", "hermes-workflow");
const target = path.join(targetDir, "plugin.js");

await mkdir(targetDir, { recursive: true });
await copyFile(source, target);

console.log(`Plugin copied to ${target}`);
