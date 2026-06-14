import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { skillTemplate, type SkillTarget } from "./skill-templates.ts";

type SkillAction = "install" | "print";
type SkillScope = "user" | "project";

interface SkillOptions {
  action: SkillAction;
  target: SkillTarget;
  scope: SkillScope;
  dryRun: boolean;
  projectDir: string;
}

export async function runSkillCommand(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<number> {
  try {
    const options = parseSkillOptions(args, cwd);
    const content = skillTemplate(options.target);
    if (options.action === "print") {
      process.stdout.write(content);
      return 0;
    }
    const destination = skillDestination(options, env);
    process.stdout.write(`Installing ${options.target} skill to ${destination}\n`);
    if (options.dryRun) {
      process.stdout.write("Dry run: no files written.\n");
      return 0;
    }
    await installSkill(destination, content);
    process.stdout.write("Skill installed.\n");
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function parseSkillOptions(args: string[], cwd: string): SkillOptions {
  const values = [...args];
  const action = readAction(values.shift());
  let target: SkillTarget | null = null;
  let scope: SkillScope = "user";
  let scopeSet = false;
  let dryRun = false;
  let projectDir = findProjectRoot(cwd);
  let projectDirSet = false;
  while (values.length > 0) {
    const arg = values.shift();
    if (arg == null) break;
    if (arg === "--target") target = readTarget(requireValue(values, "--target"));
    else if (arg === "--scope") {
      scope = readScope(requireValue(values, "--scope"));
      scopeSet = true;
    } else if (arg === "--project-dir") {
      projectDir = resolvePath(requireValue(values, "--project-dir"), cwd);
      projectDirSet = true;
      if (!scopeSet) scope = "project";
    } else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--help" || arg === "-h") printSkillHelpAndExit();
    else throw new Error(`Unknown skill flag: ${arg}`);
  }
  if (scope === "user" && projectDirSet) {
    throw new Error("--project-dir can only be used with --scope project");
  }
  if (target == null) throw new Error("skill command requires --target codex|claude");
  return { action, target, scope, dryRun, projectDir };
}

function readAction(value: string | undefined): SkillAction {
  if (value === "install" || value === "print") return value;
  if (value === "--help" || value === "-h") printSkillHelpAndExit();
  throw new Error("Usage: spec-reviewer skill install|print --target codex|claude");
}

function readTarget(value: string): SkillTarget {
  if (value === "codex" || value === "claude") return value;
  throw new Error("--target must be codex or claude");
}

function readScope(value: string): SkillScope {
  if (value === "user" || value === "project") return value;
  throw new Error("--scope must be user or project");
}

function requireValue(args: string[], flag: string): string {
  const value = args.shift();
  if (value == null || value.trim() === "") throw new Error(`${flag} requires a value`);
  return value;
}

function skillDestination(options: SkillOptions, env: NodeJS.ProcessEnv): string {
  const agentDir = options.target === "codex" ? ".codex" : ".claude";
  if (options.scope === "project") {
    return join(options.projectDir, agentDir, "skills", "spec-reviewer", "SKILL.md");
  }
  const home = agentHome(options.target, env);
  return join(home, "skills", "spec-reviewer", "SKILL.md");
}

function agentHome(target: SkillTarget, env: NodeJS.ProcessEnv): string {
  const configured = target === "codex" ? env.CODEX_HOME : env.CLAUDE_HOME;
  const fallback = target === "codex" ? join(homedir(), ".codex") : join(homedir(), ".claude");
  return resolvePath(configured == null || configured.trim() === "" ? fallback : configured);
}

async function installSkill(destination: string, content: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  if (existsSync(destination)) {
    const existing = await readFile(destination, "utf8");
    if (existing === content) return;
    const backup = backupPath(destination);
    await copyFile(destination, backup);
    process.stdout.write(`Backed up existing skill to ${backup}\n`);
  }
  await writeFile(destination, content, { encoding: "utf8", mode: 0o600 });
}

function backupPath(destination: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\./g, "");
  let backup = `${destination}.bak-${stamp}`;
  for (let attempt = 2; existsSync(backup); attempt += 1) backup = `${destination}.bak-${stamp}-${attempt}`;
  return backup;
}

function findProjectRoot(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() !== "" ? result.stdout.trim() : cwd;
}

function resolvePath(path: string, cwd = process.cwd()): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(cwd, path);
}

function printSkillHelpAndExit(): never {
  console.log([
    "Usage:",
    "  spec-reviewer skill install --target codex|claude [--scope user|project] [--dry-run]",
    "  spec-reviewer skill print --target codex|claude",
    "",
    "Flags:",
    "  --target <agent>      codex or claude",
    "  --scope <scope>       user or project, default user",
    "  --project-dir <path>  project scope destination, default current repo",
    "  --dry-run             print destination without writing",
  ].join("\n"));
  process.exit(0);
}
