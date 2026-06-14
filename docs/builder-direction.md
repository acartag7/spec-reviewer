# Builder Direction

This is the direction for the next build phase. The tool should become a slim,
good-looking spec review UI while keeping line-anchored feedback reliable enough
to hand back to an agent.

## Product Shape

- Default to a rendered Markdown reading view.
- Keep a raw source toggle for exact line inspection and anchor verification.
- Add annotations from rendered text selection or block clicks.
- Show note markers and highlights in the reading view, not only in the side
  panel.
- Treat embedded artifacts as first-class review objects with preview/source
  toggles.

## Architectural Decision

Rendered Markdown must preserve source-line provenance. Every rendered block
should carry source start/end line metadata, for example:

```html
<section data-source-line="72" data-source-end-line="84">...</section>
```

Annotation anchoring should resolve from the rendered DOM back to source line
ranges. The stored review contract remains source-line based so export, drift
tracking, and future Ductum embedding do not depend on a specific UI renderer.

## Security Rules

Spec content is untrusted input from disk.

- Do not put raw spec HTML into `innerHTML`.
- Sanitize rendered Markdown before insertion.
- Render HTML/SVG artifacts in sandboxed `iframe srcdoc`.
- Default artifact frames to `sandbox=""`.
- Scripts are opt-in per artifact with `allow-scripts`.
- Never combine `allow-scripts` with `allow-same-origin`.
- Default artifacts to click-to-render.
- Keep Host/Origin checks and CSP on the local server.

## Dependency Policy

The current app has zero runtime npm dependencies. Rendered Markdown and safe
sanitization are the likely exception, but they should not be added casually.

Preferred path:

- Vendor audited, pinned browser builds under `public/js/vendor/`.
- Store their source URL, version, publish date, and integrity hash in docs.
- Load them locally.
- Keep `pnpm` runtime dependency count at zero.

Do not write a custom HTML sanitizer.

## Drift Tracking

Whole-file digest tracking is not enough. The review model should grow toward:

- source text snapshot per annotation at creation;
- re-resolving anchors on open;
- per-note state: `ok`, `moved`, or `not-found`;
- persistent stale banner, not a short toast;
- explicit manual re-sync, no silent relocation;
- export warnings or omissions for drifted notes.

Until that exists, stale reviews must stay marked stale when saved.

## Build Sequence

1. Server hardening: Host/Origin allowlist, CSP, no raw artifact rendering.
2. Rendered Markdown with source-line metadata and raw/source toggle.
3. Per-annotation drift tracking and export cleanup.
4. Sandboxed artifact previews for HTML/SVG and later Mermaid.
5. UI pass: typography, inline note UX, focus states, contrast, dark mode.
6. Agent skill and API polish.
7. Open-source polish: license, README screenshot, vendored-lib notes.
