import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const options = parseArgs(process.argv.slice(2));
const version = options.version ?? pkg.version;
const tag = version.startsWith("v") ? version : `v${version}`;
const targets = options.targets.length > 0 ? options.targets : [hostTarget()];
const artifactsDir = resolve(root, options.outDir);
const releaseDir = resolve(root, "build", "release");
const repository = process.env.GITHUB_REPOSITORY ?? "acartag7/spec-reviewer";

if (options.clean) rmSync(artifactsDir, { recursive: true, force: true });
mkdirSync(artifactsDir, { recursive: true });
rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });

run("pnpm", ["run", "build"]);

const artifacts = [];
for (const target of targets) {
  artifacts.push(await buildArtifact(target));
}
writeShaSums(artifacts);
writeHomebrewFormula(artifacts);
console.log(`Wrote ${artifacts.length} release artifact${artifacts.length === 1 ? "" : "s"} to ${artifactsDir}`);

async function buildArtifact(target) {
  const binaryName = target.includes("windows") ? "spec-reviewer.exe" : "spec-reviewer";
  const targetDir = join(releaseDir, target);
  const binaryPath = join(targetDir, binaryName);
  mkdirSync(targetDir, { recursive: true });
  run("bun", ["build", "--compile", `--target=${target}`, "binary/spec-reviewer.ts", "--outfile", binaryPath]);
  const label = artifactLabel(target);
  const archiveBase = `spec-reviewer-${tag}-${label}`;
  const stageRoot = join(releaseDir, "stage", archiveBase);
  mkdirSync(stageRoot, { recursive: true });
  await copyFile(binaryPath, join(stageRoot, binaryName));
  await copyFile(join(root, "README.md"), join(stageRoot, "README.md"));
  await copyFile(join(root, "LICENSE"), join(stageRoot, "LICENSE"));
  writeFileSync(join(stageRoot, "VERSION"), `${version.replace(/^v/, "")}\n`, "utf8");
  writeFileSync(join(stageRoot, "release.json"), `${JSON.stringify({ version: version.replace(/^v/, ""), target, label }, null, 2)}\n`, "utf8");
  const archive = join(artifactsDir, `${archiveBase}.tar.gz`);
  run("tar", ["-czf", archive, "-C", join(releaseDir, "stage"), archiveBase]);
  return { target, label, archive, sha256: sha256(archive), url: releaseUrl(archive) };
}

function parseArgs(args) {
  const result = { targets: [], version: null, outDir: "artifacts", clean: true };
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--") continue;
    else if (arg === "--target") result.targets.push(requireValue(args, "--target"));
    else if (arg === "--targets") result.targets.push(...requireValue(args, "--targets").split(",").filter(Boolean));
    else if (arg === "--version") result.version = requireValue(args, "--version");
    else if (arg === "--out-dir") result.outDir = requireValue(args, "--out-dir");
    else if (arg === "--no-clean") result.clean = false;
    else throw new Error(`Unknown release packaging flag: ${arg}`);
  }
  return result;
}

function requireValue(args, flag) {
  const value = args.shift();
  if (value == null || value.trim() === "") throw new Error(`${flag} requires a value`);
  return value;
}

function hostTarget() {
  const currentPlatform = platform();
  const currentArch = arch();
  if (currentPlatform === "darwin" && currentArch === "arm64") return "bun-darwin-arm64";
  if (currentPlatform === "darwin" && currentArch === "x64") return "bun-darwin-x64";
  if (currentPlatform === "linux" && currentArch === "arm64") return "bun-linux-arm64";
  if (currentPlatform === "linux" && currentArch === "x64") return "bun-linux-x64-baseline";
  throw new Error(`No default Bun target for ${currentPlatform}/${currentArch}; pass --target`);
}

function artifactLabel(target) {
  return target.replace(/^bun-/, "").replace("-baseline", "");
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function releaseUrl(path) {
  return `https://github.com/${repository}/releases/download/${tag}/${basename(path)}`;
}

function writeShaSums(artifacts) {
  const lines = artifacts
    .map((artifact) => `${artifact.sha256}  ${basename(artifact.archive)}`)
    .sort();
  writeFileSync(join(artifactsDir, "SHA256SUMS"), `${lines.join("\n")}\n`, "utf8");
}

function writeHomebrewFormula(artifacts) {
  const byLabel = new Map(artifacts.map((item) => [item.label, item]));
  if (![...byLabel.keys()].some((key) => key.startsWith("darwin"))) return;
  const formulaDir = join(artifactsDir, "homebrew");
  mkdirSync(formulaDir, { recursive: true });
  writeFileSync(join(formulaDir, "spec-reviewer.rb"), formulaText(byLabel), "utf8");
}

function formulaText(artifacts) {
  const macArm = artifacts.get("darwin-arm64");
  const macIntel = artifacts.get("darwin-x64");
  const linuxArm = artifacts.get("linux-arm64");
  const linuxIntel = artifacts.get("linux-x64");
  return [
    "class SpecReviewer < Formula",
    "  desc \"Local-first Markdown spec reviewer for source-anchored agent feedback\"",
    "  homepage \"https://github.com/acartag7/spec-reviewer\"",
    `  version "${version.replace(/^v/, "")}"`,
    "  license \"MIT\"",
    "",
    "  on_macos do",
    macArm == null ? null : archBlock("arm", macArm),
    macIntel == null ? null : archBlock("intel", macIntel),
    "  end",
    linuxArm == null && linuxIntel == null ? null : "",
    linuxArm == null && linuxIntel == null ? null : "  on_linux do",
    linuxArm == null ? null : archBlock("arm", linuxArm),
    linuxIntel == null ? null : archBlock("intel", linuxIntel),
    linuxArm == null && linuxIntel == null ? null : "  end",
    "",
    "  def install",
    "    bin.install \"spec-reviewer\"",
    "    prefix.install \"README.md\", \"LICENSE\", \"VERSION\", \"release.json\"",
    "  end",
    "",
    "  test do",
    "    output = shell_output(\"#{bin}/spec-reviewer sessions --json --storage-dir #{testpath}/state\")",
    "    assert_match \"\\\"sessions\\\"\", output",
    "  end",
    "end",
    "",
  ].filter((line) => line != null).join("\n");
}

function archBlock(kind, artifact) {
  return [
    `    on_${kind} do`,
    `      url "${artifact.url}"`,
    `      sha256 "${artifact.sha256}"`,
    "    end",
  ].join("\n");
}
