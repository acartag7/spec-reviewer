import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("release workflow keeps tag input out of shell source and pins actions", () => {
  const releaseWorkflow = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
  const ciWorkflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");

  assert.match(releaseWorkflow, /RAW_TAG_NAME: \$\{\{ github\.event\.inputs\.tag \|\| github\.ref_name \}\}/);
  assert.match(releaseWorkflow, /TAG_NAME="\$RAW_TAG_NAME"/);
  assert.doesNotMatch(releaseWorkflow, /TAG_NAME="\$\{\{/);
  assert.match(releaseWorkflow, /persist-credentials: false/);

  for (const workflow of [releaseWorkflow, ciWorkflow]) {
    const actionRefs = [...workflow.matchAll(/^\s*- uses: [^\n@]+@([^\s#]+)/gm)].map((match) => match[1] ?? "");
    assert.ok(actionRefs.length > 0);
    assert.ok(actionRefs.every((ref) => /^[0-9a-f]{40}$/.test(ref)));
  }
});
