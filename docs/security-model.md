# Security Model

Spec Reviewer is a local-first Markdown/spec review tool. It is designed to be run by one user on their own machine, not exposed as a network service.

## Trust Boundary

- The trusted user is the local OS user who starts Spec Reviewer.
- The server binds to loopback by default: `127.0.0.1:3217`.
- Allowed bind hosts are `127.0.0.1`, `localhost`, and `::1`.
- Non-loopback bind hosts are rejected during startup.
- There is no login system. Do not put Spec Reviewer behind a public hostname and treat it as multi-user software.

## Loopback Request Gate

Every HTTP request is checked before routing:

- `Host` must be loopback and must match the bound port.
- `Origin`, when present, must be `http:` loopback and must match the bound port.
- Missing `Origin` is allowed for normal same-origin and non-browser local requests.
- Failed checks return `403 Forbidden` with security headers.

This blocks common DNS rebinding and remote-host access patterns. It does not block a process already running as the same local user from connecting to loopback.

## HTTP Headers And CSP

The server sends a restrictive CSP and baseline browser hardening headers:

- `default-src 'self'`
- `base-uri 'none'`
- `connect-src 'self'`
- `img-src 'self' data:`
- `object-src 'none'`
- `script-src 'self'`
- `style-src 'self' 'unsafe-inline'`
- `frame-ancestors 'none'`
- `form-action 'none'`
- `cross-origin-opener-policy: same-origin`
- `referrer-policy: no-referrer`
- `x-content-type-options: nosniff`

Inline style is currently allowed because UI dependencies can emit inline layout styles. Script execution is limited to same-origin application code.

## Markdown Rendering

Spec Reviewer must never inject raw spec HTML into the main application DOM.

The default Markdown path is:

1. Parse Markdown with `marked`.
2. Sanitize generated HTML with DOMPurify using the HTML profile.
3. Add source-line provenance attributes after sanitization.
4. Render the sanitized result in the React app.

User-authored raw Markdown HTML is treated as untrusted input.

## Artifact Preview

Fenced or detected HTML/SVG artifacts are handled separately from normal Markdown:

- HTML and SVG artifact source is sanitized with DOMPurify.
- The preview is click-to-render, not automatic.
- The preview renders inside an iframe using `srcdoc`.
- The iframe default is `sandbox=""`.
- The iframe does not use `allow-same-origin`.
- The iframe does not allow scripts by default.

If scripts are ever added for artifact previews, they must not be combined with `allow-same-origin`. The unsafe pairing is `allow-scripts allow-same-origin`.

## Local File Access

Spec Reviewer can read files the local user asks it to review. That is the main local risk.

- A path passed on the command line is opened by the local server.
- Dropped documents are copied into the Spec Reviewer storage directory.
- Review data and copied documents are local files, not encrypted secrets.
- File permissions are inherited from the local OS user and filesystem.

Do not review sensitive files from a directory where other local users or processes can read the resulting storage directory.

## Storage

Default storage root:

- `~/.spec-reviewer`

Default subdirectories:

- `~/.spec-reviewer/reviews` for review JSON
- `~/.spec-reviewer/documents` for dropped documents

The storage root can be changed with `--storage-dir` or `SPEC_REVIEWER_STORAGE_DIR`.

## Known Limits

- Local loopback access is the boundary. This is not a hardened remote service.
- A malicious same-user local process can attempt to call the API.
- Browser extensions, local malware, or compromised application code are out of scope.
- Review JSON is not encrypted at rest by Spec Reviewer.
- Sanitization reduces HTML/SVG risk but is not a promise that hostile content is meaningful, safe to trust, or safe to export elsewhere.
- CSP protects the Spec Reviewer app page. It is not a substitute for keeping raw artifact HTML out of the main DOM.
- The tool tracks anchor drift, but stale anchors can still need human review.
