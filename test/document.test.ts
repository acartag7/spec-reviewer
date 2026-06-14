import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdownDocument, sectionForLine } from "../src/domain/document.ts";

test("parseMarkdownDocument extracts headings and line kinds", () => {
  const document = parseMarkdownDocument("/tmp/spec.md", [
    "# Main",
    "",
    "Intro",
    "## Details",
    "- item",
    "```",
    "code",
    "```",
  ].join("\n"));

  assert.equal(document.title, "Main");
  assert.equal(document.lines.length, 8);
  assert.deepEqual(document.sections.map((section) => section.title), ["Main", "Details"]);
  assert.equal(document.lines[4]?.kind, "list");
  assert.equal(document.lines[6]?.kind, "code");
  assert.equal(sectionForLine(document, 5), "Details");
});
