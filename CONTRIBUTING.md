# Contributing

Spec Reviewer is intentionally small. Keep changes narrow, verified, and local
first.

## Setup

```bash
pnpm install
pnpm run build
pnpm run check
```

Use Node.js 24 or newer and pnpm 10.32.0 or newer.

## Development

```bash
pnpm run dev
```

The API runs on `127.0.0.1:3217`. Vite runs on `127.0.0.1:5173` and proxies
`/api` to the API server.

## Rules

- Use `pnpm`.
- Keep dependencies pinned exactly.
- Respect the 15-day `minimumReleaseAge` install policy.
- Keep app source files at or below 250 lines.
- Do not commit `dist/`, `node_modules/`, `.design/`, `.codex/`, or local pnpm
  stores.
- Run `pnpm run check` and `pnpm run build` before opening a PR.
- Browser-test changed UI flows against the real local API.

## Security

Treat Markdown files and embedded artifacts as untrusted local input. Sanitize
rendered Markdown, keep artifact previews sandboxed, and do not relax the local
server Host/Origin checks without a clear reason.

See [docs/security-model.md](docs/security-model.md).
