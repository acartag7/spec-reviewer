import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { json } from "./http-test-utils.ts";

const serverEntry = fileURLToPath(new URL("../src/server.ts", import.meta.url));
const yamlBody = ["# service config", "name: demo", "port: 8080", ""].join("\n");

test("CLI review --wait --json finishes a YAML source review", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-cli-yaml-"));
  const docPath = join(dir, "plan.yaml");
  await writeFile(docPath, yamlBody, "utf8");
  const port = await freePort();
  const child = spawn(process.execPath, [
    "--no-warnings",
    serverEntry,
    "review",
    "--wait",
    "--json",
    "--no-open",
    "--port",
    String(port),
    "--storage-dir",
    join(dir, "store"),
    docPath,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => {
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGTERM");
  });

  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk as Buffer));
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(base);

  const opened = await json(`${base}/api/document?path=${encodeURIComponent(docPath)}`);
  assert.equal(opened.document.format, "source");
  assert.equal(opened.document.lines[0]?.kind, "normal");

  await json(`${base}/api/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: docPath,
      baseRevision: 0,
      annotations: [{ lineStart: 2, lineEnd: 2, kind: "issue", severity: "major", note: "Rename demo" }],
    }),
  });
  const finished = await json(`${base}/api/session/finish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: docPath }),
  });
  assert.equal(finished.status, "finished");

  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode));
  });
  assert.equal(code, 0);
  const completion = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(completion.status, "finished");
  assert.match(completion.markdown, /Rename demo/);
  assert.match(completion.markdown, /name: demo/);
});

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address == null || typeof address === "string") {
        server.close();
        reject(new Error("Server did not expose a TCP port"));
        return;
      }
      const port = address.port;
      server.close((error) => error == null ? resolve(port) : reject(error));
    });
    server.on("error", reject);
  });
}

async function waitForHealth(base: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // The CLI process is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`CLI server at ${base} did not become healthy`);
}
