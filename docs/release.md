# Release

Spec Reviewer releases are Homebrew-first. The release artifact is a
Bun-compiled executable, not a Node package that users install globally.

## Local Preflight

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build:binary
pnpm run binary:smoke
```

## Build Release Artifacts

Build the host artifact:

```bash
pnpm run release:artifacts
```

Build all release targets:

```bash
pnpm run release:artifacts:all -- --version 0.1.0
pnpm run homebrew:smoke
```

Artifacts are written to `artifacts/`:

```text
spec-reviewer-v0.1.0-darwin-arm64.tar.gz
spec-reviewer-v0.1.0-darwin-x64.tar.gz
spec-reviewer-v0.1.0-linux-arm64.tar.gz
spec-reviewer-v0.1.0-linux-x64.tar.gz
SHA256SUMS
homebrew/spec-reviewer.rb
```

Each tarball includes:

- `spec-reviewer`
- `README.md`
- `LICENSE`
- `VERSION`
- `release.json`

Linux x64 uses Bun's `bun-linux-x64-baseline` target for broader CPU
compatibility.

## GitHub Release

The release workflow runs on `v*` tags:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow:

1. Installs pinned Node, pnpm, and Bun tool versions.
2. Runs `pnpm run check`.
3. Builds all release artifacts.
4. Smokes the native Linux x64 artifact.
5. Creates or updates the GitHub release with tarballs, `SHA256SUMS`, and the
   generated Homebrew formula.

## Homebrew Tap

The tap repository should be:

```text
acartag7/homebrew-tap
```

Users install with:

```bash
brew tap acartag7/tap
brew install spec-reviewer
```

The generated formula is:

```text
artifacts/homebrew/spec-reviewer.rb
```

To update the tap locally after building artifacts:

```bash
HOMEBREW_TAP_TOKEN=... pnpm run tap:update
```

The release workflow also runs `tap:update` when the `HOMEBREW_TAP_TOKEN`
secret is configured. Without that secret, the workflow still publishes the
formula as a release asset and skips pushing to the tap.

## Skill Installer

The binary ships the skill templates in code.

```bash
spec-reviewer skill print --target codex
spec-reviewer skill print --target claude
spec-reviewer skill install --target codex
spec-reviewer skill install --target claude
spec-reviewer skill install --target claude --scope project
```

Installer behavior:

- user scope writes to `~/.codex/skills/spec-reviewer/SKILL.md` or
  `~/.claude/skills/spec-reviewer/SKILL.md`
- project scope writes to `.codex/skills/spec-reviewer/SKILL.md` or
  `.claude/skills/spec-reviewer/SKILL.md`
- `--dry-run` prints the destination without writing
- existing files are backed up before overwrite

## Notarization

Notarization is deferred. The release archive shape is stable enough to add
Developer ID signing and notarization later without changing the Homebrew
install model.
