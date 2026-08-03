import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("release packaging rejects a version that differs from package.json", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
  const requestedVersion = `${pkg.version}-mismatch`;
  const result = spawnSync(process.execPath, ["scripts/package-release.js", "--version", requestedVersion], {
    cwd: root,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(`Release version ${requestedVersion} must match package\\.json version ${pkg.version}`));
});
