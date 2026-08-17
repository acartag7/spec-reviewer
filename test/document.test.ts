import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdownDocument, parseReviewDocument, parseSourceDocument, sectionForLine } from "../src/domain/document.ts";

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
  assert.equal(document.format, "markdown");
  assert.equal(document.lines.length, 8);
  assert.deepEqual(document.sections.map((section) => section.title), ["Main", "Details"]);
  assert.equal(document.lines[4]?.kind, "list");
  assert.equal(document.lines[6]?.kind, "code");
  assert.equal(sectionForLine(document, 5), "Details");
});

test("parseSourceDocument does not treat YAML comments as Markdown headings", () => {
  const document = parseSourceDocument("/tmp/plan.yaml", [
    "# service config",
    "name: demo",
    "",
    "items:",
    "  - one",
  ].join("\n"));

  assert.equal(document.title, "plan.yaml");
  assert.equal(document.format, "source");
  assert.deepEqual(document.sections, []);
  assert.equal(document.lines[0]?.kind, "normal");
  assert.equal(document.lines[0]?.text, "# service config");
  assert.equal(document.lines[2]?.kind, "blank");
  assert.equal(sectionForLine(document, 5), null);
});

test("parseReviewDocument dispatches Markdown and source files by extension", () => {
  const markdown = parseReviewDocument("/tmp/spec.md", "# Title\n");
  const yaml = parseReviewDocument("/tmp/spec.yaml", "# Title\n");
  assert.equal(markdown.format, "markdown");
  assert.equal(markdown.lines[0]?.kind, "heading");
  assert.equal(yaml.format, "source");
  assert.equal(yaml.lines[0]?.kind, "normal");
});
