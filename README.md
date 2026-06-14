# Spec Reviewer

Standalone local UI for reviewing Markdown specs and exporting agent-ready
feedback.

## Scope

- Open any local `.md` or `.markdown` file.
- Drop a Markdown file into the start screen, or paste a local file path.
- Add line or selection anchored annotations.
- Save review state under `~/.spec-reviewer/reviews`.
- Store dropped Markdown files under `~/.spec-reviewer/documents`.
- Reopen previous reviews from the recent reviews list.
- Track whether saved notes match the current file digest.
- Export Markdown instructions that can be pasted back to an agent.
- Run as a local-only Node server with a React/Vite frontend.

The next phase is a rendered Markdown reviewer with source-line anchoring,
sandboxed artifact previews, and stronger per-annotation drift tracking. See
`docs/builder-direction.md`.

## Supply Chain Policy

- Use `pnpm` only.
- Keep dependencies pinned exactly and add new ones only for a real blocker.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 21600` for future installs,
  which means dependency versions must be at least 15 days old.
- Do not add postinstall-dependent packages without a specific reason.

## Run

```bash
pnpm install
pnpm run dev
```

Open the dev app:

```text
http://127.0.0.1:5173
```

The root screen lets you drag/drop a Markdown file, choose one with the file
picker, paste a path, or reopen a recent saved review. Browsers do not expose the
original absolute path for drag/drop files, so dropped files are copied into the
storage directory and reviewed from there.

## File State

Every saved review stores the document digest it was created against. When a file
is reopened, the UI shows whether the saved notes are:

- `current`: notes match the current file digest;
- `changed`: the file changed and line anchors should be rechecked;
- `missing`: a recent review points at a path that no longer exists;
- `unreviewed`: no saved notes exist yet.

Personal Codex agents can use the installed `$spec-reviewer` skill to open this
tool for a file and export saved feedback after review.

Useful flags:

```bash
pnpm run build
pnpm start -- --port 3220 path/to/spec.md
pnpm start -- --storage-dir ~/.spec-reviewer path/to/spec.md
```

The production server serves the built app and API from `127.0.0.1:3217` by
default. The server only binds to loopback hosts because the API can read local
Markdown files by path. It also rejects non-loopback Host/Origin headers and
sends a CSP.

## Verify

```bash
pnpm run check
```

The code follows a DDD-lite layout:

- `src/domain`: document and review shapes.
- `src/application`: use cases and export formatting.
- `src/infrastructure`: filesystem adapters.
- `src/interfaces`: local HTTP and static UI.

Files stay at or below 250 lines so review and agent edits stay manageable.
