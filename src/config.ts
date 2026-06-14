import { homedir } from "node:os";
import { resolve } from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  storageDir: string;
  defaultDocumentPath: string | null;
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

  while (args.length > 0) {
    const arg = args.shift();
    if (arg == null) break;
    if (arg === "--host") host = requireValue(args, "--host");
    else if (arg === "--port") port = requirePort(requireValue(args, "--port"));
    else if (arg === "--storage-dir") storageDir = expandHome(requireValue(args, "--storage-dir"));
    else if (arg === "--help" || arg === "-h") printHelpAndExit();
    else if (arg.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
    else if (defaultDocumentPath == null) defaultDocumentPath = expandHome(arg);
    else throw new Error(`Unexpected argument: ${arg}`);
  }

  assertLoopbackHost(host);
  return {
    host,
    port,
    storageDir: resolve(storageDir),
    defaultDocumentPath: defaultDocumentPath == null ? null : resolve(defaultDocumentPath),
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
  console.log(`Usage: spec-reviewer [--host 127.0.0.1] [--port 3217] [--storage-dir ~/.spec-reviewer] [file.md]`);
  process.exit(0);
}

function assertLoopbackHost(host: string): void {
  const normalized = host.trim().toLowerCase();
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") return;
  throw new Error("Spec Reviewer only binds to loopback hosts");
}
