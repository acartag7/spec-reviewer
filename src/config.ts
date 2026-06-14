import { homedir } from "node:os";
import { resolve } from "node:path";

export interface AppConfig {
  command: "review" | "sessions" | "open";
  host: string;
  port: number;
  storageDir: string;
  defaultDocumentPath: string | null;
  sessionId: string | null;
  waitForReview: boolean;
  jsonOutput: boolean;
  openBrowser: boolean;
  source: { maxFileLines: number };
}

export function loadConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const args = [...argv];
  if (args[0] === "--") args.shift();
  const defaults = {
    host: env.SPEC_REVIEWER_HOST ?? "127.0.0.1",
    port: parsePort(env.SPEC_REVIEWER_PORT) ?? 3217,
    storageDir: expandHome(env.SPEC_REVIEWER_STORAGE_DIR ?? "~/.spec-reviewer"),
  };
  let host = defaults.host;
  let port = defaults.port;
  let storageDir = defaults.storageDir;
  let defaultDocumentPath: string | null = null;
  let command: AppConfig["command"] = "review";
  let waitForReview = false;
  let jsonOutput = false;
  let openBrowser = true;
  let sessionId: string | null = null;

  const first = args[0];
  if (first === "review") {
    args.shift();
  } else if (first === "open") {
    command = "open";
    args.shift();
  } else if (first === "sessions" || first === "list") {
    command = "sessions";
    args.shift();
  }

  while (args.length > 0) {
    const arg = args.shift();
    if (arg == null) break;
    if (arg === "--host") host = requireValue(args, "--host");
    else if (arg === "--port") port = requirePort(requireValue(args, "--port"));
    else if (arg === "--storage-dir") storageDir = expandHome(requireValue(args, "--storage-dir"));
    else if (arg === "--wait") waitForReview = true;
    else if (arg === "--json") jsonOutput = true;
    else if (arg === "--open") openBrowser = true;
    else if (arg === "--no-open") openBrowser = false;
    else if (arg === "--help" || arg === "-h") printHelpAndExit();
    else if (arg.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
    else if (command === "open" && sessionId == null) sessionId = arg;
    else if (defaultDocumentPath == null) defaultDocumentPath = expandHome(arg);
    else throw new Error(`Unexpected argument: ${arg}`);
  }

  assertLoopbackHost(host);
  if (command === "sessions" && defaultDocumentPath != null) {
    throw new Error("sessions does not accept a document path");
  }
  if (command === "open" && sessionId == null) {
    throw new Error("open requires a session id");
  }
  if (command === "open" && defaultDocumentPath != null) {
    throw new Error("open accepts only one session id");
  }
  if (waitForReview && defaultDocumentPath == null) {
    throw new Error("--wait requires a Markdown path");
  }
  return {
    command,
    host,
    port,
    storageDir: resolve(storageDir),
    defaultDocumentPath: defaultDocumentPath == null ? null : resolve(defaultDocumentPath),
    sessionId,
    waitForReview,
    jsonOutput,
    openBrowser,
    source: { maxFileLines: 250 },
  };
}

export function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return resolve(homedir(), input.slice(2));
  return input;
}

function requireValue(args: string[], flag: string): string {
  const value = args.shift();
  if (value == null || value.trim() === "") throw new Error(`${flag} requires a value`);
  return value;
}

function requirePort(value: string): number {
  const port = parsePort(value);
  if (port == null) throw new Error(`Invalid port: ${value}`);
  return port;
}

function parsePort(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : null;
}

function printHelpAndExit(): never {
  console.log([
    "Usage:",
    "  spec-reviewer review [flags] <file.md>",
    "  spec-reviewer [flags] <file.md>",
    "  spec-reviewer sessions [--json]",
    "  spec-reviewer open [flags] <session-id>",
    "",
    "Flags:",
    "  --host <host>             Loopback host to bind",
    "  --port <port>             Port to bind",
    "  --storage-dir <path>      Local review state directory",
    "  --wait                    Block until Finish review or Cancel",
    "  --json                    Print machine-readable output",
    "  --no-open                 Print URL without opening the browser",
  ].join("\n"));
  process.exit(0);
}

function assertLoopbackHost(host: string): void {
  const normalized = host.trim().toLowerCase();
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") return;
  throw new Error("Spec Reviewer only binds to loopback hosts");
}
