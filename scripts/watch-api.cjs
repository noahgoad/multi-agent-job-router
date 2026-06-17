// Node-based watchdog for the Pharos API. Restarts the API
// whenever it crashes (with a 3s backoff). Spawned as a detached
// child from `start-detached.cjs` so it survives the calling
// shell exiting.
//
// Equivalent in behaviour to scripts/watch-api.bat, but doesn't
// depend on Windows process-group quirks.
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = "D:\\pharos-future-ideas\\04-multi-agent-job-router";
const API = path.join(ROOT, "apps", "api", "dist", "src", "main.js");
const LOG = path.join(ROOT, "apps", "api", "watch.log");

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
function log(line) {
  const out = `[${ts()}] ${line}\n`;
  fs.appendFileSync(LOG, out);
  process.stdout.write(out);
}

let crashCount = 0;
function loop() {
  log(
    `watch-api: starting ${API} | PHAROS_ROUTER_DEMO=${
      process.env.PHAROS_ROUTER_DEMO ?? "(unset)"
    } ` +
      `PHAROS_ROUTER_DATA_DIR=${
        process.env.PHAROS_ROUTER_DATA_DIR ?? "(unset)"
      }`
  );
  const child = spawn(process.execPath, [API], {
    cwd: path.join(ROOT, "apps", "api"),
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  // Tee both the API's stdout and stderr into watch.log so we can
  // see internal logs (e.g. `[FileStorage] saving N jobs to ...`)
  // without having to attach a separate console to the child.
  child.stdout.on("data", (d) => {
    fs.appendFileSync(LOG, d);
    process.stdout.write(d);
  });
  child.stderr.on("data", (d) => {
    fs.appendFileSync(LOG, d);
    process.stderr.write(d);
  });
  child.on("exit", (code) => {
    crashCount += 1;
    log(
      `watch-api: API exited with code ${code} (crash #${crashCount}), restarting in 3s...`
    );
    if (crashCount > 10) {
      log("watch-api: too many crashes, giving up");
      process.exit(1);
    }
    setTimeout(loop, 3000);
  });
}
loop();
