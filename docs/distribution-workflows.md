# Distribution And Agent Workflows

This document reflects the accepted v1 direction after review: ship Spec
Reviewer as a Homebrew-first, bundled-binary local tool, keep the agent handoff
minimal, and avoid relying on a user's Node/npm setup.

## Accepted Direction

- Public install should be Homebrew.
- The Homebrew formula should install a released bundled binary.
- The binary should be built with Bun so users do not need Node, pnpm, npm, or
  Bun installed at runtime.
- `--wait --json` is useful because it lets an agent block until the human
  clicks Finish Review or Cancel.
- v1 should stay small. No standalone `export` or `verify` command is needed.
- Rechecking feedback after an agent edit should happen by reopening the same
  saved review/session and showing source drift.
- Notarization is deferred. Keep the binary layout compatible with future code
  signing and notarization.

## Public Install Shape

Target public install:

```bash
brew tap acartag7/tap
brew install spec-reviewer
spec-reviewer review path/to/spec.md
```

The formula should install the release artifact directly. It should not ask
users to install Node or depend on their local package manager state.

Release artifact target:

- one `spec-reviewer` executable per platform
- license, README, and release metadata
- no local stores, `.env` files, design scratch, build caches, or dev-only
  directories

The npm package name should be checked and reserved before publishing anything
there. npm is not the public UX. If npm is used, it should be a secondary
package/reservation channel or developer fallback, not the install story.

## Current Implemented Slice

The current branch implements the first distribution slice:

```bash
pnpm run build:binary
./build/spec-reviewer review path/to/spec.md
./build/spec-reviewer review path/to/spec.md --wait --json
./build/spec-reviewer sessions
./build/spec-reviewer open <session-id>
```

Implemented behavior:

- `build:binary` builds the server, frontend, and Bun-compiled executable.
- The binary embeds the built frontend and serves the same local API.
- `review <path>` and the compatibility form `<path>` both open a review.
- `--wait --json` keeps the CLI running until the browser sends Finish or
  Cancel.
- Finish exits zero and prints JSON to stdout.
- Cancel exits non-zero.
- `sessions` lists saved reviews.
- `open <session-id>` reopens an existing saved review using the current
  path-keyed review ID.
- The browser shows Finish Review and Cancel only for wait sessions.
- `binary:smoke` tests help output, server startup, embedded assets, document
  loading, `--wait --json`, Finish Review, and `sessions --json`.

Current wait JSON shape:

```json
{
  "status": "finished",
  "path": "/absolute/path/to/spec.md",
  "markdown": "# Agent Review Feedback\n..."
}
```

That is enough for the v1 agent loop. Richer fields such as source digest,
session ID, and structured annotations can be added later without changing the
core handoff.

## Minimal CLI Surface

Keep the command surface small:

```bash
spec-reviewer review <path>
spec-reviewer <path>
spec-reviewer review <path> --wait --json
spec-reviewer sessions
spec-reviewer open <session-id>
```

Useful flags:

- `--wait`: block until Finish Review or Cancel.
- `--json`: print machine-readable output for agents.
- `--open` / `--no-open`: control browser opening.
- `--port <port>`: bind a specific local port.
- `--storage-dir <path>`: use isolated local state.

Do not add standalone `export` or `verify` commands for v1. The existing
feedback export remains an internal API/UI feature used by Copy Feedback and
Finish Review.

## Human Workflow

Normal review:

```bash
spec-reviewer review path/to/spec.md
```

The app opens in the browser with rendered Markdown, source view, annotations,
copy feedback, recent reviews, and source drift warnings.

Past reviews:

```bash
spec-reviewer sessions
spec-reviewer open <session-id>
```

The current session ID is the existing stable path-key used by the file-backed
review store. A generated session-ID state model can come later if it earns its
complexity.

## Agent Workflow

After writing a plan or spec, an agent runs:

```bash
spec-reviewer review path/to/spec.md --wait --json
```

Flow:

1. The CLI starts the local server and opens the browser.
2. The human adds notes.
3. The human clicks Finish Review or Cancel.
4. Finish prints `{ status, path, markdown }` JSON to stdout and exits zero.
5. Cancel exits non-zero.
6. The agent applies the Markdown feedback after the command returns.

This is the reason `--wait` exists: it gives the agent a clean synchronization
point with the human.

## Reopen And Drift

There is no separate verification command in v1.

After the agent edits the spec, reopen the saved review:

```bash
spec-reviewer open <session-id>
```

Spec Reviewer should re-read the live file, compare the current digest to the
saved review digest, resolve stored anchors, and show whether notes are current,
moved, or not found.

Moved or missing text is not proof that feedback was applied. It is only a
candidate for human review.

## Local State

Current state stays file-backed under `~/.spec-reviewer`:

```text
~/.spec-reviewer/
  reviews/
    <path-key>.json
  documents/
    <digest>-<uploaded-name>.md
```

`reviews/<path-key>.json` stores the document path, digest, summary,
annotations, timestamps, and anchor snapshots. Dropped files are copied into
`documents/` because browsers do not expose the original absolute path.

Do not introduce a larger generation model for v1. The useful behavior is:
store the reviewed digest and anchor text, then show drift when the live file
changes.

## Release Follow-Ups

The next release work is:

1. Build platform release artifacts.
2. Add GitHub release packaging.
3. Add the Homebrew tap/formula that installs the binary artifact.
4. Test Homebrew install from the release artifact.
5. Add `spec-reviewer skill install --target codex|claude` after the binary
   release path is settled.
6. Optionally reserve/publish npm only as a fallback channel.
7. Revisit code signing and notarization after real Homebrew testing.

Skill installer target, when added:

- bundle skill templates in the release artifact
- support `--dry-run`
- print the destination before writing
- never overwrite without backup
- teach agents to run `spec-reviewer review <path> --wait --json`

## Release Checks

Required checks for the current slice:

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build:binary
pnpm run binary:smoke
```

Manual/browser checks:

- open the compiled binary-served app
- add an annotation
- verify feedback export updates
- click Finish Review in a `--wait --json` session
- verify the waiting CLI prints JSON and exits zero

Security checks:

- loopback bind by default
- Host and Origin validation
- CSP present and not weakened
- no raw Markdown HTML injection into the main DOM
- artifact iframe sandbox stays strict
- local storage remains user-controlled

## Acceptance Criteria

- A user can install with Homebrew and run `spec-reviewer review spec.md`.
- The installed command runs without relying on the user's Node version.
- `spec-reviewer <path>` remains compatible with `review <path>`.
- An agent can run `spec-reviewer review spec.md --wait --json` and receive
  human feedback on stdout.
- Cancel exits non-zero for agents.
- A user can list and reopen saved reviews.
- Reopening a changed file shows drift without auto-closing feedback.
- Release checks cover pnpm validation, Bun binary smoke, browser smoke,
  Homebrew formula install, and security review.
