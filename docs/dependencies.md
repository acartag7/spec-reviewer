# Dependencies

Spec Reviewer uses exact package pins in `package.json`. Use `pnpm` for install and verification.

Package manager and runtime floor:

- `packageManager`: `pnpm@10.32.0`
- `node`: `>=24`
- `pnpm`: `>=10.32.0`
- `bun`: `>=1.3.6` for release binary builds

## Freshness Notes

The orchestration prompt for the OSS-ready branch says the dependency pins below were verified at least 15 days old on 2026-06-13, except where noted.

No exact publish dates were included in this handoff. Treat the 2026-06-13 verification note as the recorded freshness evidence unless a later release audit updates this file.

## Bundled Web Build Dependencies

The published Homebrew binary has no runtime package dependencies. The npm
package ships the compiled server and bundled web assets, so its install path
also does not need these packages at runtime. They remain development inputs for
rebuilding the application.

| Package | Pin | Freshness note |
| --- | --- | --- |
| `@fontsource-variable/geist` | `5.2.8` | Verified >=15 days old on 2026-06-13 |
| `@fontsource-variable/jetbrains-mono` | `5.2.5` | Verified >=15 days old on 2026-06-13 |
| `@tailwindcss/vite` | `4.2.2` | Verified >=15 days old on 2026-06-13 |
| `@tanstack/react-query` | `5.96.2` | Verified >=15 days old on 2026-06-13 |
| `class-variance-authority` | `0.7.1` | Verified >=15 days old on 2026-06-13 |
| `clsx` | `2.1.1` | Verified >=15 days old on 2026-06-13 |
| `dompurify` | `3.4.11` | Published 2026-06-17; security patch adopted 2026-07-10 after the 15-day buffer |
| `lucide-react` | `1.7.0` | Verified >=15 days old on 2026-06-13 |
| `marked` | `18.0.4` | Verified >=15 days old on 2026-06-13 |
| `radix-ui` | `1.4.3` | Verified >=15 days old on 2026-06-13 |
| `react` | `19.2.4` | Verified >=15 days old on 2026-06-13 |
| `react-dom` | `19.2.4` | Verified >=15 days old on 2026-06-13 |
| `react-router-dom` | `7.15.0` | Verified >=15 days old on 2026-06-13 |
| `tailwind-merge` | `3.5.0` | Verified >=15 days old on 2026-06-13 |
| `tailwindcss` | `4.2.2` | Verified >=15 days old on 2026-06-13 |
| `tw-animate-css` | `1.4.0` | Verified >=15 days old on 2026-06-13 |

## Development Dependencies

| Package | Pin | Freshness note |
| --- | --- | --- |
| `@testing-library/jest-dom` | `6.9.1` | Verified >=15 days old on 2026-06-13 |
| `@testing-library/react` | `16.3.2` | Verified >=15 days old on 2026-06-13 |
| `@types/node` | `25.9.1` | Published 2026-05-19; added for project-local server compilation |
| `@types/react` | `19.2.14` | Verified >=15 days old on 2026-06-13 |
| `@types/react-dom` | `19.2.3` | Verified >=15 days old on 2026-06-13 |
| `@vitejs/plugin-react` | `6.0.1` | Verified >=15 days old on 2026-06-13 |
| `concurrently` | `9.2.1` | Verified >=15 days old on 2026-06-13 |
| `jsdom` | `29.1.1` | Published 2026-04-30; security refresh adopted 2026-07-10 |
| `typescript` | `6.0.3` | Published 2026-04-16; added for project-local builds |
| `vite` | `8.0.5` | Verified >=15 days old on 2026-06-13 |
| `vitest` | `3.2.6` | Published 2026-06-01; security refresh adopted 2026-07-10 |

The lockfile pins security overrides for `shell-quote@1.8.4` (published
2026-05-22), `undici@7.28.0` (published 2026-06-15), and the Vitest toolchain's
`vite@7.3.5` (published 2026-06-01). The unused `shadcn` CLI dependency was
removed; the generated UI components remain repo-owned source.

`vite@8.0.16` patches Windows development-server advisories but was published
2026-07-09. It was not adopted in the 2026-07-10 audit because it had not cleared
the project's 15-day release-age buffer. The compiled application does not ship
the Vite development server.

## Browser Assets

There are no shipped vendored browser assets.

## GitHub Actions

Workflow actions are pinned to full commit SHAs. The selected commits map to
`actions/checkout@v4.2.2`, `actions/setup-node@v4.4.0`,
`pnpm/action-setup@v4.1.0`, and `oven-sh/setup-bun@v2.0.2`; all predate the
2026-07-10 audit by more than 15 days.

The `.design` directory is gitignored, unshipped reference material. It is not part of the published package surface.
