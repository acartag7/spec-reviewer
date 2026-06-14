const shared = [
  "When you finish drafting or updating a Markdown plan/spec, hand it to the",
  "human through Spec Reviewer before treating the spec as accepted.",
  "",
  "## Workflow",
  "",
  "1. Save the Markdown spec to disk.",
  "2. Run:",
  "",
  "   ```bash",
  "   spec-reviewer review path/to/spec.md --wait --json",
  "   ```",
  "",
  "3. Wait for the human to click Finish Review or Cancel.",
  "4. If the command exits non-zero or returns `status: \"canceled\"`, stop and",
  "   report that the review was canceled.",
  "5. If it returns `status: \"finished\"`, read the `markdown` field and apply",
  "   every requested change.",
  "6. Run the relevant project checks for the changed spec or plan.",
  "7. Report what changed and how it was verified.",
  "",
  "## Reopen Drift Check",
  "",
  "When the human wants to inspect whether feedback still lines up after your",
  "edits, list saved reviews and reopen the matching one:",
  "",
  "```bash",
  "spec-reviewer sessions --json",
  "spec-reviewer open <session-id>",
  "```",
  "",
  "Do not infer that a note was addressed just because source text moved or",
  "disappeared. Treat moved or missing anchors as human-confirmation prompts.",
  "",
  "## Rules",
  "",
  "- Do not edit the reviewed spec automatically from inside Spec Reviewer.",
  "- Do not mark review feedback complete until you have applied it and run",
  "  appropriate verification.",
  "- Preserve the original spec path; dropped files may be copied into",
  "  `~/.spec-reviewer/documents` by the browser.",
  "- Prefer the Homebrew-installed `spec-reviewer` binary.",
].join("\n");

const codexFrontmatter = [
  "---",
  "name: spec-reviewer",
  "description: Use after drafting or updating Markdown specs or plans when human review feedback should be collected through the local Spec Reviewer app.",
  "---",
  "",
].join("\n");

const claudeFrontmatter = [
  "---",
  "name: spec-reviewer",
  "description: Use after drafting or updating Markdown specs or plans when human review feedback should be collected through the local Spec Reviewer app.",
  "---",
  "",
].join("\n");

export type SkillTarget = "codex" | "claude";

export function skillTemplate(target: SkillTarget): string {
  const title = target === "codex" ? "# Spec Reviewer For Codex" : "# Spec Reviewer For Claude Code";
  const frontmatter = target === "codex" ? codexFrontmatter : claudeFrontmatter;
  return `${frontmatter}${title}\n\n${shared}\n`;
}
