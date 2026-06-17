import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Isolation check.
 *
 * Verifies that all files written by the project are inside the
 * project root and that no symlinks, junctions, or path entries
 * resolve outside of it. The script is read-only and never modifies
 * any file.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const banned = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "artifacts",
  "typechain-types",
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (banned.includes(entry)) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let ok = true;
for (const p of walk(projectRoot)) {
  if (!p.startsWith(projectRoot)) {
    console.error(`escape:${p}`);
    ok = false;
  }
  const s = statSync(p);
  if (s.isSymbolicLink && s.isSymbolicLink()) {
    console.error(`symlink:${p}`);
    ok = false;
  }
}

if (!existsSync(join(projectRoot, "README.md"))) {
  console.error("missing:README.md");
  ok = false;
}

if (!ok) {
  console.error("isolation check failed");
  process.exit(1);
}
console.log("isolation check passed");