# Claude UI Review Prompt

Review this project as a UI/UX reviewer for a small open-source local developer
tool.

Project: Spec Reviewer, a zero-dependency local browser UI for reviewing
Markdown specs, adding line-anchored annotations, and exporting feedback that can
be pasted back to an AI agent.

Audience:

- developers and agent operators reviewing long Markdown specs;
- people who want a simple local tool, not a hosted product;
- eventual open-source users on GitHub.

Current intended flow:

1. Start screen: drag/drop a Markdown file, choose one, paste a path, or reopen
   a recent review.
2. Review screen: read line-numbered Markdown, select lines/text, write feedback,
   tag severity/kind, add notes.
3. Export: copy agent-ready Markdown feedback.

Constraints:

- No runtime npm dependencies unless absolutely necessary.
- Keep files under 250 lines.
- Keep the current DDD-lite project structure.
- Do not edit files. Produce review findings and improvement suggestions only.
- Focus mostly on `public/index.html`, `public/styles.css`, and
  `public/js/*.js`.
- Consider open-source readiness only where it affects user trust and first-run
  clarity.

Please return:

1. Top UI/UX findings, ordered by severity.
2. Specific improvement suggestions with concrete UI copy or interaction changes.
3. Accessibility and keyboard usability gaps.
4. Open-source polish suggestions for the first GitHub release.
5. A short "minimum before publishing" checklist.
