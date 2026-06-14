import { mkdtempSync, readFileSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const options = parseArgs(process.argv.slice(2));
const temp = mkdtempSync(join(tmpdir(), "spec-reviewer-tap-"));

try {
  const tapDir = join(temp, "tap");
  run("git", ["clone", "--branch", options.branch, "--single-branch", tapUrl(options.tap), tapDir], root);
  configureGit(tapDir);
  const destination = join(tapDir, "Formula", basename(options.formula));
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(options.formula, destination);
  run("git", ["add", "Formula"], tapDir);
  const status = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: tapDir });
  if (status.status === 0) {
    console.log("Homebrew tap already up to date.");
  } else {
    run("git", ["commit", "-m", `spec-reviewer ${formulaVersion(options.formula)}`], tapDir);
    run("git", ["push", "origin", `HEAD:${options.branch}`], tapDir);
    console.log(`Updated ${options.tap} ${options.branch}`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

function parseArgs(args) {
  const result = {
    formula: resolve(root, "artifacts", "homebrew", "spec-reviewer.rb"),
    tap: "acartag7/homebrew-tap",
    branch: "main",
  };
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--") continue;
    else if (arg === "--formula") result.formula = resolve(requireValue(args, "--formula"));
    else if (arg === "--tap") result.tap = requireValue(args, "--tap");
    else if (arg === "--branch") result.branch = requireValue(args, "--branch");
    else throw new Error(`Unknown tap update flag: ${arg}`);
  }
  return result;
}

function tapUrl(tap) {
  const token = process.env.HOMEBREW_TAP_TOKEN ?? process.env.GH_TOKEN;
  if (token == null || token.trim() === "") return `https://github.com/${tap}.git`;
  return `https://x-access-token:${token}@github.com/${tap}.git`;
}

function formulaVersion(path) {
  const match = readFileSync(path, "utf8").match(/^\s*version "([^"]+)"/m);
  return match?.[1] ?? "release";
}

function requireValue(args, flag) {
  const value = args.shift();
  if (value == null || value.trim() === "") throw new Error(`${flag} requires a value`);
  return value;
}

function configureGit(cwd) {
  const name = process.env.GIT_AUTHOR_NAME ?? "github-actions[bot]";
  const email = process.env.GIT_AUTHOR_EMAIL ?? "41898282+github-actions[bot]@users.noreply.github.com";
  run("git", ["config", "user.name", name], cwd);
  run("git", ["config", "user.email", email], cwd);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}
