#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = resolve(root, "build/server.js");
if (!existsSync(server)) {
  console.error("Spec Reviewer is missing build/server.js. Run pnpm run build before packaging.");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ["--no-warnings", server, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal != null) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
