require("@nomicfoundation/hardhat-toolbox");

// Register `tsx` for the lifetime of the Hardhat process so that mocha
// can resolve the `.js` import specifiers used in the contracts test
// files (e.g. `import { ... } from "../src/atlantic.js"`) to the
// matching `.ts` source files. The contracts package keeps
// `"type": "module"`, so Hardhat invokes mocha through its ESM
// loader (`mocha.loadFilesAsync`), which means the in-process
// `mocha.nodeArgs` array is **not** forwarded to the loading thread.
// Setting `NODE_OPTIONS=--import tsx` and `require("tsx")` here
// (before any other module is loaded) is the only reliable way to
// make the in-process ESM loader use tsx's `.js` -> `.ts` resolution
// and to make the CommonJS `hardhat` module expose its named exports
// (`ethers`, `network`, ...) to ESM consumers via the CJS interop
// helper.
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--import", "tsx"]
  .filter(Boolean)
  .join(" ");
require("tsx");

// Load the project-root `.env` (gitignored) so that
// `process.env.PHAROS_RPC_URL`, `process.env.ROUTER_DEPLOYER_PRIVATE_KEY`
// and friends are populated for the deployer script. Hardhat itself
// does not auto-load `.env`, so we parse it inline here to avoid
// pulling in a new devDependency. The parser only sets variables
// that are not already defined in the ambient environment, so
// CI/host overrides win.
const fs = require("node:fs");
const path = require("node:path");
const envPath = path.resolve(__dirname, "..", "..", ".env");
if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, valueRaw] = m;
    let value = valueRaw;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 688689,
    },
    atlantic: {
      url: process.env.PHAROS_RPC_URL || "https://atlantic.dplabs-internal.com",
      chainId: 688689,
      accounts: process.env.ROUTER_DEPLOYER_PRIVATE_KEY
        ? [process.env.ROUTER_DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
  mocha: {
    timeout: 60000,
  },
};
