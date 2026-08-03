import assert from "node:assert/strict";
import { test } from "node:test";
import { skillTemplate } from "../src/cli/skill-templates.ts";

for (const target of ["codex", "claude"] as const) {
  test(`${target} skill explains durable checkpoints`, () => {
    const template = skillTemplate(target);

    assert.match(template, /Handoff & copy/);
    assert.match(template, /immutable handoff checkpoint/);
    assert.match(template, /finish checkpoint/);
    assert.match(template, /Dropped uploads remain immutable/);
    assert.match(template, /moved, ambiguous, or missing\s+anchors/);
    assert.match(template, /For a saved review, list sessions and reopen the matching one/);
    assert.match(template, /For a checkpoint-only review that is not listed in sessions, reopen the\s+known source path directly/);
  });
}
