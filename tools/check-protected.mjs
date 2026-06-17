import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const manifestPath = join(projectRoot, "docs", "plan-preservation-manifest.md");

const text = readFileSync(manifestPath, "utf8");
const lines = text.split(/\r?\n/);
const entries = [];
const hashRe = /`([0-9a-fA-F]{64})`/;
const pathRe = /`([^`]*\.md)`/;
for (const line of lines) {
  const hashMatch = line.match(hashRe);
  const pathMatch = line.match(pathRe);
  if (!hashMatch || !pathMatch) continue;
  entries.push({
    path: pathMatch[1].replace(/\\/g, "/"),
    hash: hashMatch[1].toLowerCase(),
  });
}
if (entries.length === 0) {
  console.error("manifest is empty or malformed");
  process.exit(1);
}

let ok = true;
for (const { path: relPath, hash } of entries) {
  const abs = join(projectRoot, relPath);
  let actual;
  try {
    actual = createHash("sha256").update(readFileSync(abs)).digest("hex");
  } catch {
    console.error(`missing:${relPath}`);
    ok = false;
    continue;
  }
  if (actual !== hash) {
    console.error(`mismatch:${relPath}:expected=${hash}:actual=${actual}`);
    ok = false;
  } else {
    console.log(`ok:${relPath}`);
  }
}

if (!ok) {
  console.error("protected file hash check failed");
  process.exit(1);
}
console.log("protected file hash check passed");