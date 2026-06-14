import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "node:net";

const root = resolve(new URL("..", import.meta.url).pathname);
const binary = process.env.SPEC_REVIEWER_BINARY ?? join(root, "build", "spec-reviewer");

if (!existsSync(binary)) {
  throw new Error("Missing build/spec-reviewer. Run pnpm run build:binary first.");
}

const temp = mkdtempSync(join(tmpdir(), "spec-reviewer-binary-"));

try {
  run(binary, ["--help"]);
  await smokeServer();
  await smokeWaitWorkflow();
  await smokeSessions();
  await smokeSkillInstaller();
  console.log("Binary smoke passed");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

async function smokeServer() {
  const port = await freePort();
  const doc = writeFixture("server.md");
  const child = spawn(binary, [
    "review",
    "--no-open",
    "--port",
    String(port),
    "--storage-dir",
    join(temp, "server-store"),
    doc,
  ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const output = collectOutput(child);
  try {
    const base = `http://127.0.0.1:${port}`;
    await waitForHealth(base);
    const rootHtml = await textFetch(`${base}/`);
    if (!rootHtml.includes("Spec Reviewer") && !rootHtml.includes("root")) {
      throw new Error("Root HTML did not look like the app");
    }
    for (const asset of assetPaths(rootHtml).slice(0, 3)) {
      await okFetch(new URL(asset, base).toString());
    }
    const document = await jsonFetch(`${base}/api/document?path=${encodeURIComponent(doc)}`);
    if (document.document.title !== "Smoke") throw new Error("Document API returned the wrong title");
  } finally {
    await stopChild(child, output);
  }
}

async function smokeWaitWorkflow() {
  const port = await freePort();
  const doc = writeFixture("wait.md");
  const child = spawn(binary, [
    "review",
    "--wait",
    "--json",
    "--no-open",
    "--port",
    String(port),
    "--storage-dir",
    join(temp, "wait-store"),
    doc,
  ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const output = collectOutput(child);
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(base);
  await jsonFetch(`${base}/api/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: doc,
      annotations: [{ lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Fix smoke note" }],
    }),
  });
  await jsonFetch(`${base}/api/session/finish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: doc }),
  });
  const exit = await waitForExit(child, output, 5000);
  if (exit.code !== 0) throw new Error(`Wait workflow exited ${exit.code}: ${output.stderr}`);
  const completion = JSON.parse(output.stdout.trim());
  if (completion.status !== "finished" || !completion.markdown.includes("Fix smoke note")) {
    throw new Error("Wait workflow did not print finished feedback JSON");
  }
}

async function smokeSessions() {
  const result = spawnSync(binary, ["sessions", "--json", "--storage-dir", join(temp, "wait-store")], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || "sessions command failed");
  const payload = JSON.parse(result.stdout);
  if (!Array.isArray(payload.sessions) || payload.sessions.length === 0) {
    throw new Error("sessions command did not report saved reviews");
  }
}

async function smokeSkillInstaller() {
  const printed = spawnSync(binary, ["skill", "print", "--target", "codex"], {
    cwd: root,
    encoding: "utf8",
  });
  if (printed.status !== 0) throw new Error(printed.stderr || "skill print failed");
  if (!printed.stdout.includes("spec-reviewer review path/to/spec.md --wait --json")) {
    throw new Error("skill print did not include the wait workflow");
  }
  const project = join(temp, "skill-project");
  const install = spawnSync(binary, [
    "skill",
    "install",
    "--target",
    "claude",
    "--project-dir",
    project,
  ], { cwd: root, encoding: "utf8" });
  if (install.status !== 0) throw new Error(install.stderr || "skill install failed");
  const skill = readFileSync(join(project, ".claude", "skills", "spec-reviewer", "SKILL.md"), "utf8");
  if (!skill.includes("Spec Reviewer For Claude Code")) throw new Error("project skill was not written");
  const dryRunDir = join(temp, "skill-dry-run");
  const dryRun = spawnSync(binary, [
    "skill",
    "install",
    "--target",
    "codex",
    "--scope",
    "project",
    "--project-dir",
    dryRunDir,
    "--dry-run",
  ], { cwd: root, encoding: "utf8" });
  if (dryRun.status !== 0 || existsSync(dryRunDir)) throw new Error("skill dry-run wrote files");
  const invalid = spawnSync(binary, [
    "skill",
    "install",
    "--target",
    "codex",
    "--scope",
    "user",
    "--project-dir",
    project,
  ], { cwd: root, encoding: "utf8" });
  if (invalid.status === 0) throw new Error("skill accepted --project-dir with user scope");
  const codexHome = join(temp, "codex-home");
  const userInstall = spawnSync(binary, ["skill", "install", "--target", "codex"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: codexHome },
  });
  if (userInstall.status !== 0) throw new Error(userInstall.stderr || "user skill install failed");
  const userSkillPath = join(codexHome, "skills", "spec-reviewer", "SKILL.md");
  writeFileSync(userSkillPath, "old skill\n", "utf8");
  const backupInstall = spawnSync(binary, ["skill", "install", "--target", "codex"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: codexHome },
  });
  if (backupInstall.status !== 0) throw new Error(backupInstall.stderr || "skill backup install failed");
  const backups = readdirSync(dirname(userSkillPath)).filter((name) => name.startsWith("SKILL.md.bak-"));
  if (backups.length === 0) throw new Error("skill install did not back up existing content");
}

function writeFixture(name) {
  const path = join(temp, name);
  writeFileSync(path, "# Smoke\n\nNeeds review\n", "utf8");
  return path;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status === 0) return;
  throw new Error(result.stderr || result.stdout || `${command} ${args.join(" ")} failed`);
}

async function waitForHealth(base) {
  const deadline = Date.now() + 8000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await okFetch(`${base}/api/health`);
      return;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw lastError ?? new Error("Timed out waiting for health");
}

async function okFetch(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
}

async function textFetch(url) {
  return (await okFetch(url)).text();
}

async function jsonFetch(url, init) {
  return (await okFetch(url, init)).json();
}

function assetPaths(html) {
  const matches = html.matchAll(/\b(?:href|src)="([^"]+\.(?:css|js|woff2?))"/g);
  return Array.from(matches, (match) => match[1]).filter(Boolean);
}

function collectOutput(child) {
  const output = { stdout: "", stderr: "" };
  child.stdout?.on("data", (chunk) => {
    output.stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    output.stderr += String(chunk);
  });
  return output;
}

async function stopChild(child, output) {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  try {
    await waitForExit(child, output, 3000);
  } catch {
    child.kill("SIGKILL");
    await waitForExit(child, output, 3000);
  }
}

function waitForExit(child, output, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (child.exitCode != null || child.signalCode != null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for process exit\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`));
    }, timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address == null || typeof address === "string") reject(new Error("Could not allocate a TCP port"));
        else resolve(address.port);
      });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
