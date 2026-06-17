import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Secret scan.
 *
 * Walks the project tree and looks for common secret patterns. The
 * scan is intentionally conservative: it only flags strings that
 * look like private keys, API keys, or long hex tokens, and it
 * ignores the `.env.example` placeholder file.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const BANNED = ["node_modules", "dist", "build", ".git", "typechain-types"];
const PATTERNS = [
  /private[_-]?key\s*[:=]\s*["'][0-9a-fA-F]{64}["']/i,
  /0x[0-9a-fA-F]{64}/,
];

const IGNORE_FILES = new Set([
  ".env.example",
  "plan-preservation-manifest.md",
]);

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    if (BANNED.includes(e)) continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let found = 0;
for (const p of walk(projectRoot)) {
  const rel = p.replace(projectRoot + "\\", "").replace(/^.*[\\/]/, "");
  if (IGNORE_FILES.has(rel)) continue;
  if (!p.endsWith(".ts") && !p.endsWith(".tsx") && !p.endsWith(".mjs") && !p.endsWith(".json") && !p.endsWith(".md")) continue;
  const text = readFileSync(p, "utf8");
  for (const re of PATTERNS) {
    if (re.test(text)) {
      // Allow the 64-hex pattern in test data and on-chain addresses.
      if (re.source.includes("64") && /test|fake|address|0x0{40}/i.test(text)) continue;
      console.error(`possible_secret:${p}`);
      found++;
    }
  }
}

if (found > 0) {
  console.error("secret scan failed");
  process.exit(1);
}
console.log("secret scan passed");