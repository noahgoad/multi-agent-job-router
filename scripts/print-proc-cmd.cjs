// Print environment of a running Windows process.
const { execSync } = require("child_process");
const pid = process.argv[2];
const out = execSync(
  `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`,
  { encoding: "utf-8" }
);
console.log(out);
