# Dependencies

Spec Reviewer uses exact package pins in `package.json`. Use `pnpm` for install and verification.

Package manager and runtime floor:

- `packageManager`: `pnpm@10.32.0`
- `node`: `>=24`
- `pnpm`: `>=10.32.0`

## Freshness Notes

The orchestration prompt for the OSS-ready branch says the dependency pins below were verified at least 15 days old on 2026-06-13, except where noted.

No exact publish dates were included in this handoff. Treat the 2026-06-13 verification note as the recorded freshness evidence unless a later release audit updates this file.

## Runtime Dependencies

| Package | Pin | Freshness note |
| --- | --- | --- |
| `@fontsource-variable/geist` | `5.2.8` | Verified >=15 days old on 2026-06-13 |
| `@fontsource-variable/jetbrains-mono` | `5.2.5` | Verified >=15 days old on 2026-06-13 |
| `@tailwindcss/vite` | `4.2.2` | Verified >=15 days old on 2026-06-13 |
| `@tanstack/react-query` | `5.96.2` | Verified >=15 days old on 2026-06-13 |
| `class-variance-authority` | `0.7.1` | Verified >=15 days old on 2026-06-13 |
| `clsx` | `2.1.1` | Verified >=15 days old on 2026-06-13 |
| `dompurify` | `3.4.7` | Verified >=15 days old on 2026-06-13 |
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
| `@types/react` | `19.2.14` | Verified >=15 days old on 2026-06-13 |
| `@types/react-dom` | `19.2.3` | Verified >=15 days old on 2026-06-13 |
| `@vitejs/plugin-react` | `6.0.1` | Verified >=15 days old on 2026-06-13 |
| `concurrently` | `9.2.1` | Verified >=15 days old on 2026-06-13 |
| `jsdom` | `29.0.1` | Verified >=15 days old on 2026-06-13 |
| `shadcn` | `4.1.2` | Verified >=15 days old on 2026-06-13 |
| `vite` | `8.0.5` | Verified >=15 days old on 2026-06-13 |
| `vitest` | `3.2.4` | Pinned because `3.2.6` failed the minimum-release-age install gate |

## Browser Assets

There are no shipped vendored browser assets.

The `.design` directory is gitignored, unshipped reference material. It is not part of the published package surface.
