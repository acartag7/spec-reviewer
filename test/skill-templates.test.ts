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
    assert.match(template, /If no matching session is listed, because the review has only a checkpoint\s+or falls outside the recent-session limit, reopen the known source path\s+directly/);
    assert.match(template, /Non-Markdown files such as `\.yaml` open in source view/);
  });
}
