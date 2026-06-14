# Distribution And Agent Workflows

This spec defines the v1 distribution and workflow shape for Spec Reviewer:
Homebrew-first install, a bundled binary runtime, minimal local state, and one
clean handoff path between agents and humans.

## Direction
- Homebrew is the public install path.
- v1 should lead with a bundled Bun-compiled binary/runtime.
- Public UX should not rely on the user's Node, npm, or npx setup.
- npm can exist as a reserved/published package channel, not the primary story.
- Agent workflows should block until the human finishes or cancels review.
- Local state should stay simple, local, and inspectable under
  `~/.spec-reviewer`.

## Non-Goals
- No hosted service, login, accounts, remote sync, or automatic spec edits.
- No standalone `export` or `verify` command requirement for v1.
- No notarization requirement for v1.

The binary should still be shaped so code signing and notarization can be added
later without changing the install model.

## Public Install
The public install path should be:

```bash
brew tap acartag7/tap
brew install spec-reviewer
spec-reviewer review path/to/spec.md
```

The Homebrew formula should install a released binary artifact. It should not
ask users to install Node or depend on their local package manager state.

The released artifact should include:

- Bun-compiled `spec-reviewer` binary
- compiled server/runtime code
- built frontend assets
- bundled skill templates
- license, README, and release metadata

The binary layout should be code-signing/notarization-ready later: stable binary
name, deterministic release archive, no normal runtime writes outside
`~/.spec-reviewer`, and no install-time scripts for normal use.

## npm Positioning
The npm package name `spec-reviewer` appears available or reservable and should
be reserved if practical.

npm should not be documented as the primary install path. Do not recommend
global npm installation or npx as public UX.

Developer or agent fallback docs may mention `pnpm dlx spec-reviewer review
path/to/spec.md --wait --json` or `bunx spec-reviewer review path/to/spec.md
--wait --json`. Those are fallbacks only. The public story remains Homebrew
plus the bundled binary.

## CLI Surface
Primary commands:

```bash
spec-reviewer review <path>
spec-reviewer review <path> --wait --json
spec-reviewer sessions
spec-reviewer open <session-id>
spec-reviewer skill install --target codex|claude
spec-reviewer skill print --target codex|claude
```

Compatibility command:

```bash
spec-reviewer <path>
```

This should behave like `spec-reviewer review <path>`.

Useful flags:

- `--wait`: block until the human clicks Finish Review or Cancel.
- `--json`: print machine-readable output for agents.
- `--open` / `--no-open`: control browser opening.
- `--storage-dir <path>`: override state location for tests or isolated runs.

Keep the command set intentionally small. `export` and `verify` should not be
v1 commands.

## Human Workflow
Start a review:

```bash
spec-reviewer review path/to/spec.md
```

The CLI should resolve the source path, create or reuse a session, snapshot the
source text and digest, start the loopback server, and open the browser unless
`--no-open` is passed.

The UI should support rendered Markdown, source view, annotations, Finish
Review, Cancel, copy feedback, and recent sessions.

Past sessions:

```bash
spec-reviewer sessions
spec-reviewer open <session-id>
```

Export is a result of Finish Review, not a separate v1 command. When the human
finishes, the UI should produce the final feedback payload, `--wait --json`
should print it to stdout, copy feedback should remain available for manual
workflows, and the session should record the finished status and final feedback.

## Agent Workflow
After writing or updating a spec, an agent should run:

```bash
spec-reviewer review path/to/spec.md --wait --json
```

The command should create or reuse a session, open the review UI, block until
Finish Review or Cancel, exit zero with feedback JSON when finished, and exit
non-zero when canceled.

The JSON result should include session ID, source path, source digest reviewed
by the human, status (`finished` or `canceled`), feedback text, and structured
annotations when available. The agent applies feedback only after this command
returns.

## Reopen And Drift
Verification is reopening the same session after the source file changes, not a
separate v1 command:

```bash
spec-reviewer open <session-id>
```

When reopened, Spec Reviewer should re-read the source path, compute the current
digest, compare it with the stored snapshot digest, show whether the document
changed, re-resolve annotation anchors where possible, and present moved,
missing, or changed anchors as candidates.

Do not infer that feedback was applied just because text moved or disappeared.
The UI can show candidates, but a human must confirm whether a note is applied,
still open, or intentionally resolved.

## Local State
Keep state under `~/.spec-reviewer`:

```text
~/.spec-reviewer/
  index.json
  sessions/
    <session-id>.json
```

`index.json` should contain only lightweight lookup data: version, session ID,
source path, title, status, and updated timestamp.

Each session should contain durable review data: version, session ID, source
path, source digest, snapshot text, status, created and updated timestamps,
annotations, and final feedback.

Annotation records should include stable ID, selected or anchor text, source
range when available, note text, status, and timestamps. Useful statuses are
`open`, `candidate`, `applied`, `resolved`, and `reopened`.

Avoid an elaborate generation model for v1. A session needs source path,
digest, snapshot text, annotations, and final feedback. Reopening can compare
the current file to that stored snapshot.

## Skill Installer
Skill commands:

```bash
spec-reviewer skill install --target codex|claude
spec-reviewer skill print --target codex|claude
```

Installer rules: bundle templates in the release artifact, print the
destination before writing, avoid overwriting existing files without a backup,
support `--dry-run`, and teach agents to use
`spec-reviewer review <path> --wait --json`.

## Release Hardening
Required checks before release:

- `pnpm install --frozen-lockfile`
- `pnpm run check`
- `pnpm run build`
- Bun binary build succeeds
- Bun binary smoke runs `spec-reviewer --help`
- Bun binary smoke starts `spec-reviewer review <fixture> --no-open`
- browser smoke against the built app
- Homebrew formula install test from the release artifact
- package artifact content audit

Security checks: loopback bind by default, non-loopback hosts rejected unless
explicitly allowed for tests, Host and Origin validation, CSP present and not
weakened, no raw Markdown HTML injection into the main DOM, sandboxed artifact
iframes without `allow-same-origin`, local user-controlled storage, and
unguessable-enough session IDs for local URLs.

Supply-chain checks: exact dependency pins, new external pins following the
repo dependency policy, no surprising install-time scripts, and release
artifacts excluding local stores, secrets, `.env` files, and development-only
directories.

## Acceptance Criteria
- A user can install with Homebrew and run `spec-reviewer review spec.md`.
- The installed command runs without the user's Node version mattering.
- `spec-reviewer <path>` remains compatible with `review <path>`.
- An agent can run `spec-reviewer review spec.md --wait --json` and receive
  human feedback on stdout.
- A canceled review exits non-zero for agents.
- A user can list and reopen prior sessions.
- Reopening a changed file shows drift or candidate resolution without
  auto-closing feedback.
- Release checks cover pnpm validation, Bun binary smoke, browser smoke,
  Homebrew formula install, and security review.
