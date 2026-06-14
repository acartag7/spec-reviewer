# Claude UI Review

Generated with Claude Opus 4.8 from `docs/claude-ui-review-prompt.md`.

Claude reviewed:

- `public/index.html`
- `public/styles.css`
- `public/js/app.js`
- `public/js/document-view.js`
- `public/js/review-panel.js`
- `public/js/start-screen.js`

Claude did not edit files.

## Top findings

### 1. High: Section visibility toggling is likely broken

`app.js` switches screens with the `hidden` attribute, but `.start-screen` and
`.workspace` both set explicit `display: grid` in CSS. Claude flagged that author
`display` rules can override the browser `[hidden]` display behavior.

Suggested fix: add `[hidden] { display: none !important; }` or toggle a custom
hidden class instead.

### 2. High: Keyboard operability gaps

- Lines are focusable but only handle mouse clicks.
- The file picker is hidden with `hidden`, which removes it from the tab order.
- No custom `:focus-visible` styling exists for the custom controls.

Suggested fix: make line rows keyboard-operable, make the file input visually
hidden instead of `hidden`, and add visible focus states.

### 3. Medium: Segmented controls are not accessible choices

Severity and Kind use buttons backed by hidden inputs, but the selected state is
visual only. Screen readers cannot tell which option is active.

Suggested fix: use `role="radiogroup"` / `role="radio"` with `aria-checked`, or
use `aria-pressed` consistently.

### 4. Medium: Secondary text likely fails WCAG AA contrast

Small text uses low-opacity `--dim` and `--faint` tokens. Claude estimated the
contrast as too low for 11px text.

Suggested fix: darken secondary text tokens or increase the font sizes.

### 5. Medium: Delete has no confirmation or undo

Deleting a note immediately removes it and persists the change.

Suggested fix: add confirmation or an undo toast.

### 6. Medium: No semantic headings

The page uses visual headings as `<div>` elements, but no real `<h1>` / heading
structure.

Suggested fix: convert major page and panel titles to semantic headings.

### 7. Medium: Full re-render on every interaction

The whole document line list is rebuilt after clicks, selections, note changes,
and saves. This can get slow for very long specs.

Suggested fix: update selected/note classes incrementally or add virtualization
later.

### 8. Low: `cleanSelection` can strip real leading numbers

The single-line selection cleanup strips leading digits. Since line numbers are
already non-selectable, this can corrupt valid selected text.

Suggested fix: remove the digit-stripping cleanup.

### 9. Low: Editing does not bring the form into view

Clicking Edit fills the form, but does not scroll/focus it or show a clear
editing state.

Suggested fix: focus the feedback textarea and show an "Editing note" state.

### 10. Low: Errors disappear too quickly

All errors use a short-lived toast. Real failures can vanish before the user
understands what happened.

Suggested fix: use sticky error banners or dismissible error toasts.

### 11. Low: Miscellaneous UI polish

- Hidden status toast can still intercept clicks unless `pointer-events: none`.
- Start copy uses literal backticks around `.md`.
- `dragleave` can flicker while moving over child elements.
- Note cards do not show the quoted selected text context.

## Concrete suggestions

- Add `[hidden] { display: none !important; }`.
- Add a global `:focus-visible` outline.
- Make document lines keyboard-operable or avoid adding every line to the tab
  order.
- Convert Severity/Kind groups to accessible radio groups.
- Confirm or undo note deletion.
- Focus the form when editing a note.
- Show truncated selected text inside note cards.
- Add a Back / Start affordance after opening a document.
- Replace ephemeral error toasts with persistent errors.
- Remove `cleanSelection` digit stripping.

## Open-source polish

- Add a screenshot or short GIF to the README.
- Add a license.
- Document the local-file-read trust boundary.
- Add `meta name="description"`, `theme-color`, and a favicon.
- Consider dark mode through the existing CSS variables.
- Document keyboard shortcuts once they exist.

## Minimum before publishing

- [ ] Confirm and fix the `hidden` / `display: grid` screen-switch issue.
- [ ] Make line selection and file choosing keyboard-operable.
- [ ] Add visible focus states.
- [ ] Fix secondary text contrast.
- [ ] Add semantic headings.
- [ ] Add confirm/undo for delete.
- [ ] Make errors persistent.
- [ ] Make Severity/Kind accessible.
- [ ] Remove literal backticks from the start copy.
- [ ] Add README polish, license, and security/trust-boundary notes.
- [ ] Sanity-check large document performance.

## Positive notes

Claude called out several good existing choices:

- no raw `innerHTML` injection in the reviewed files;
- `textContent` is used for dynamic rendering;
- paths are encoded in the client URL;
- there is a clipboard fallback path;
- there is a responsive breakpoint;
- the overall structure is solid enough for a small open-source tool.
