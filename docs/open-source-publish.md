# Open Source Publish Notes

This project is ready to become a small personal GitHub repo after a few explicit
decisions.

## Decisions Needed

- Repository name: likely `spec-reviewer`.
- Visibility: public.
- License: choose one before publishing. MIT is the usual low-friction default,
  but this is an owner decision.
- Package goal: GitHub-only tool for now, or later npm package.

## Current Security Posture

- Zero runtime npm dependencies.
- `pnpm` only, exact pins, and 15-day `minimumReleaseAge` for future installs.
- Local-only HTTP bind. Non-loopback hosts are rejected.
- Markdown reads only for path-loaded documents.
- Dropped files are copied to `~/.spec-reviewer/documents`.
- Review JSON is stored in `~/.spec-reviewer/reviews`.

## Before Publishing

- Add the selected `LICENSE`.
- Add repository URL and license metadata to `package.json`.
- Add a screenshot or short GIF to the README.
- Add a "Data storage" section to the README.
- Add a "Security model" section to the README.
- Initialize git, commit, create the GitHub repo, and push.

## Suggested First GitHub Description

Local Markdown spec reviewer for agent feedback: drag/drop a spec, annotate
lines, and export agent-ready review notes. Zero runtime npm dependencies.
