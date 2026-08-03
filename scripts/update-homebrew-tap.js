import { mkdtempSync, readFileSync, rmSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

function main() {
  const options = parseArgs(process.argv.slice(2));
  const temp = mkdtempSync(join(tmpdir(), "spec-reviewer-tap-"));
  try {
  const tapDir = join(temp, "tap");
  run("git", ["clone", "--branch", options.branch, "--single-branch", tapUrl(options.tap), tapDir], root);
  configureGit(tapDir);
  const destination = join(tapDir, "Formula", basename(options.formula));
  const incomingVersion = formulaVersion(options.formula);
  if (existsSync(destination) && isTapFormulaVersionOlder(formulaVersion(destination), incomingVersion)) {
    if (options.skipOlder) {
      console.log(`Homebrew tap already has a newer formula than ${incomingVersion}; skipping update.`);
      return;
    }
    assertTapFormulaVersionCanAdvance(formulaVersion(destination), incomingVersion);
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(options.formula, destination);
  run("git", ["add", "Formula"], tapDir);
  const status = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: tapDir });
  if (status.status === 0) {
    console.log("Homebrew tap already up to date.");
  } else {
    run("git", ["commit", "-m", `spec-reviewer ${incomingVersion}`], tapDir);
    run("git", ["push", "origin", `HEAD:${options.branch}`], tapDir);
    console.log(`Updated ${options.tap} ${options.branch}`);
  }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function parseArgs(args) {
  const result = {
    formula: resolve(root, "artifacts", "homebrew", "spec-reviewer.rb"),
    tap: "acartag7/homebrew-tap",
    branch: "main",
    skipOlder: false,
  };
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--") continue;
    else if (arg === "--formula") result.formula = resolve(requireValue(args, "--formula"));
    else if (arg === "--tap") result.tap = requireValue(args, "--tap");
    else if (arg === "--branch") result.branch = requireValue(args, "--branch");
    else if (arg === "--skip-older") result.skipOlder = true;
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
  if (match?.[1] == null) throw new Error(`Formula has no version: ${path}`);
  return match[1];
}

export function assertTapFormulaVersionCanAdvance(existing, incoming) {
  if (isTapFormulaVersionOlder(existing, incoming)) {
    throw new Error(`Refusing to replace Homebrew formula ${existing} with older version ${incoming}`);
  }
}

export function isTapFormulaVersionOlder(existing, incoming) {
  return compareReleaseVersions(incoming, existing) < 0;
}

export function compareReleaseVersions(left, right) {
  const a = parseReleaseVersion(left);
  const b = parseReleaseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (a.prerelease == null || b.prerelease == null) {
    if (a.prerelease == null && b.prerelease == null) return 0;
    return a.prerelease == null ? 1 : -1;
  }
  const limit = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < limit; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart == null) return -1;
    if (rightPart == null) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/.test(leftPart);
    const rightNumber = /^\d+$/.test(rightPart);
    if (leftNumber && rightNumber) return Number(leftPart) > Number(rightPart) ? 1 : -1;
    if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function parseReleaseVersion(version) {
  const match = version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
  if (match == null) throw new Error(`Invalid Homebrew formula version: ${version}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? null,
  };
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
