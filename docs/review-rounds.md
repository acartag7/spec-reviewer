# Review rounds and Changes view

Status: accepted by owner on 2026-08-02; adversarial closure findings incorporated

## Problem

Spec Reviewer stores one mutable review record. It can say that a file changed,
but it cannot show the reviewer what changed or reconstruct completed review
runs. The current "previous version" wording is therefore guesswork, and a
reviewer has to leave the app and run a separate diff.

This change makes completed review runs durable and uses the latest completed
run as the baseline for a GitHub-style Changes view.

## User outcome

After an agent edits a spec and opens Spec Reviewer again, the reviewer gets a
Changes tab with:

- removed lines in red with a `-` marker;
- added lines in green with a `+` marker;
- old and new line numbers;
- added and removed line totals;
- three lines of unchanged context around each changed block;
- an explicit collapsed-gap row between distant blocks.

Color is not the only signal. Markers, line numbers, labels, and totals must make
the diff understandable in monochrome and to assistive technology.

When the current source is unchanged, the tab says so. When no trustworthy
baseline exists, it says that changes are unavailable. It must never invent a
baseline from the current file.

## What creates a review round

A round is recorded only when a waiting review session successfully finishes.
Adding or editing a note, opening a document, refreshing the browser, and
canceling a session do not create rounds.

Finish records the exact source and review state that the human submitted. The
next waiting session compares its live source with the latest completed round.
Finishing an unchanged source is still a distinct run and is recorded.

Existing review records have no historical source snapshot. Their first
post-upgrade finish creates the first round. Until then, the Changes tab shows
"No completed review baseline is available." This limitation is not recoverable
retroactively from existing records.

## Durable model

Each completed round is one immutable file under the configured storage root:

```text
<storageDir>/rounds/<review-path-key>/<completed-epoch-ms>-<random-id>.json
```

The final round filename is the completion commit. Temporary files are never
treated as rounds. The timestamp prefix is a 13-digit UTC epoch value and the
random suffix is 32 lowercase hexadecimal characters. Sorting allowlisted final
filenames selects the latest completed round without reading every source
snapshot. If the newest final file is unavailable or corrupt, the server does
not fall back to an older baseline and pretend it is current.

Round schema version 1 contains:

```json
{
  "schemaVersion": 1,
  "id": "completed-epoch-ms-random-id",
  "documentPath": "/canonical/spec.md",
  "documentDigest": "sha256",
  "reviewDigest": "sha256 of the source against which notes were saved",
  "sourceText": "exact UTF-8 decoding used by the Source view",
  "revision": 4,
  "summary": "review summary",
  "annotations": [],
  "activeMs": 1234,
  "completedAt": "2026-08-02T12:00:00.000Z"
}
```

`activeMs` is the cumulative active-review time stored on the active review at
completion. It is not a per-round duration and must not be summed across rounds.
`documentDigest` hashes that decoded string, not the original filesystem bytes.
`reviewDigest` preserves the active review's saved digest. They differ when the
source changed after notes were saved, so Finish export can retain the stale-
source warning and truthfully name both digests. Transient anchor-resolution
response fields are not stored. The annotation snapshot uses the same server-
owned fields and parser as the active review.

The waiting session creates one stable random suffix and candidate completion
timestamp before its first terminal callback. A failed callback retry reuses
them. Under the Finish lock, the store advances the timestamp prefix above the
latest persisted prefix when the wall clock moved backward or produced a tie.
Retries find that committed round by the stable suffix and return its stored ID
and completion time. They do not rebuild or compare a potentially edited live
payload under the same attempt identity.

## Commit protocol

Finish uses the existing canonical-path operation lock.

1. Read and validate the current source and active review.
2. Apply and durably save the terminal active-time delta to the active review.
   The waiter retains the claimed delta until the service confirms this save. A
   retry before confirmation receives the same delta; a retry after confirmation
   receives no delta, so the value is neither lost nor doubled. A
   commit-indeterminate metric save is reloaded and compared with the exact
   expected total before it is confirmed.
3. Re-read the active review, then build and fully validate the round payload
   from that state and the source captured in step 1. The source digest and the
   review's saved digest remain distinct. Finish does not increment the content
   revision, but a changed metric advances `updatedAt`.
4. Acquire an exclusive per-document Finish lock, re-check the 100-round limit,
   advance the proposed epoch above the latest persisted epoch when necessary,
   and create the immutable round. The writer creates and syncs a private
   same-directory temporary file, then hard-links it to the final allowlisted
   name without overwrite, syncs the directory, and removes the temporary file.
   It never uses the active review's overwrite-capable rename primitive.
5. Return the export from the committed round and complete the waiting session.

The hard link in step 4 is the atomic visibility point. A failure before it can
leave only an ignored hidden temporary file. A failure after it is
commit-indeterminate; the next validated lookup by the stable session identity
is the source of truth. A valid existing round for that identity is an
idempotent committed result. An invalid or identity-mismatched collision fails
closed as corruption.

## Bounds and filesystem rules

- The existing source limit remains 2 MiB.
- One serialized round file is at most 32 MiB. This accommodates the existing
  16 MiB active-review ceiling plus worst-case JSON escaping of a 2 MiB source.
- One document path may have at most 100 completed rounds.
- Reaching a limit fails Finish with a typed fixed error and leaves the waiting
  session open. No old evidence is silently evicted.
- The storage-root leaf, `rounds`, and path-key children are checked one
  component at a time as real directories, never symlinks. Read paths do not
  change their modes. Before a round write, existing real components are
  tightened to `0700` and missing components are created as `0700`; existing
  ancestors above the configured root remain an operator precondition.
- Temporary files, Finish locks, and final round files are private `0600`,
  exclusive, no-follow writes. A stale Finish lock fails closed with a fixed
  local recovery message; it is never broken automatically.
- The immutable destination is hard-linked without overwrite and the directory
  is synced. A hidden temporary file or lock is never counted or read as a round.
- Round IDs and filenames are server-generated and allowlisted.
- Exactly the lexicographically latest allowlisted final filename is read on
  document open. That read validates schema version, canonical path binding,
  ID/filename binding, size, annotation shape, timestamp binding, and
  digest/content agreement.
- An invalid latest baseline degrades only the comparison to a fixed
  `baseline-unavailable` state. The document, notes, export, and a later Finish
  remain usable. The server never falls back to an older round or emits a fake
  diff. A malformed active review or a write-path collision still fails closed.
  Raw parser messages, unrelated paths, and review contents never enter an HTTP
  error.

Round deletion, pruning, archive export, and storage recovery UI are separate
work. This version never deletes review evidence automatically. At 100 rounds it
fails closed and requires deliberate local operator cleanup while Spec Reviewer
is stopped before another Finish can succeed. A follow-up retention feature may
offer explicit export and count/age-based pruning, but must preserve the newest
round and must never silently delete unexported evidence. A stale Finish lock
also requires deliberate local recovery. Cancel remains available and does not
create a round.

## API contract

`GET /api/document` keeps its current fields and adds:

```json
{
  "comparison": {
    "state": "diff",
    "roundId": "completed-epoch-ms-random-id",
    "completedAt": "...",
    "beforeDigest": "...",
    "afterDigest": "...",
    "added": 2,
    "removed": 1,
    "rows": [
      { "kind": "remove", "oldLine": 8, "newLine": null, "text": "old" },
      { "kind": "add", "oldLine": null, "newLine": 8, "text": "new" },
      { "kind": "gap", "hiddenOld": 12, "hiddenNew": 12 }
    ]
  }
}
```

`comparison.state` is one of:

- `diff`: bounded server-generated rows and exact added/removed totals;
- `unchanged`: zero line-content changes and no rows;
- `too-large`: a valid baseline exists, but the bounded diff refused the work;
- `unavailable`: no trustworthy comparison, with an allowlisted reason of
  `no-baseline`, `baseline-unavailable`, or `immutable-upload`.

`roundId`, completion time, and digests are present for `diff`, `unchanged`, and
`too-large`. Unavailable responses expose only the fixed reason. Raw before/after
source is not sent twice in the API; the application layer computes the diff
from the trusted snapshots. The response remains subject to no-store headers
and the loopback request gate.

Finish keeps its existing response shape. Recording the round is part of Finish,
not a second client request. Node and Bun entrypoints call the same application
method with the same stable round identity and contain no round or diff logic of
their own.

## Diff behavior

Use the maintained `diff` package at exactly `8.0.4` in production dependencies,
published 2026-03-23 according to the official npm registry metadata. It clears
the repository's 15-day release-age rule. If that package cannot meet this
contract, implementation stops for re-scoping; no hand-written diff replaces it.

The application layer computes the unified line diff so Node and Bun share the
same behavior. Combined input is limited to 20,000 canonical display lines, the
library timeout is 1,000 ms, and maximum edit length is 20,000. Exceeding any
bound returns `too-large`; it never runs an unbounded browser task.

One shared source splitter treats LF and CRLF as line terminators, preserves
whether each snapshot ended in a newline, and supplies both document parsing and
diff generation. A line-ending-style-only edit has no line-content changes. A
missing final newline emits a neutral `No newline at end of file` marker after
the affected added or removed row. The marker itself does not change totals;
the standard remove/add rows representing the changed line do.

The browser receives structured rows from the loopback API and still treats row
text as untrusted display text. Rows render through React text nodes only. They
never use raw HTML or `dangerouslySetInnerHTML`. Each row uses left-to-right
isolation. Ordinary printable Unicode, including accented text, CJK, and emoji
with joiners, remains readable. C0/C1 controls other than tab and line feed,
bidi controls, line and paragraph separators, and explicitly enumerated
invisible formatting characters render as visible `[U+XXXX]` labels. The
enumerated set includes soft hyphen, Mongolian vowel separator, zero-width
space, word/invisible-operator controls, byte-order mark, and Unicode tag
characters, so hidden formatting cannot reorder or conceal apparent evidence.

The view is a unified diff, not a side-by-side layout. It collapses unchanged
regions outside three context lines. Gap rows state both hidden old-line and
new-line counts and do not expand in this version. A file opens on Changes by
default only when `comparison.state` is `diff`; Rendered and Source remain one
click away. Selecting or clicking a current-side added or context row populates
the main annotation form with that exact current-source line range and text.
Removed-only rows remain read-only because their old line numbers no longer
identify an anchor in the current document; reviewers select an adjacent current
row or switch to Rendered or Source when they need to annotate the replacement.
Clear removes the browser selection and resets both the selected range and form.
Rendered marks the smallest provenance-backed element overlapping current added
or replacement lines with a padded green edge. Changed list items also get a
plain textual `Changed` label rather than a full green panel. Top-level list-item
anchors cover their nested source range, so a nested-list edit marks the smallest
outer item with trustworthy provenance; raw nested HTML cannot shift that map.
Code lines are marked individually and get the same textual label. A paragraph
or heading with no finer safe provenance is marked as one block with that label.
Document-authored HTML provenance and change attributes are removed before the
app assigns its own anchors, and resolved ranges must stay ordered within the
current document. Removed text remains exclusive to Changes because it has no
current rendered element.

Rendered, Source, and Changes use the existing Radix tabs primitive with tab,
tabpanel, arrow-key, Home, and End behavior. A changed row's accessible name
includes Added or Removed, its available old/new line number, and its marker.
The Changes tab name includes the totals, so color is never the only signal.
Content-addressed browser uploads are immutable paths and report
`immutable-upload`; they do not default to Changes or store redundant round
history that the application will never use.

## Acceptance gates

1. Finish version A, edit the file to version B, reopen it, and see exact red and
   green line changes from A to B.
2. Added and removed totals and old/new line numbers are correct for insert,
   delete, replace, first-line, last-line, blank-line, CRLF, and final-newline
   cases. `"a\n"` to `"a"` shows one removed row, one added row, then the neutral
   no-newline marker; the marker itself does not increment either total.
3. Distant edits produce separate hunks with an explicit collapsed gap.
   Its accessible name states the exact hidden old/new line counts.
4. An unchanged file and an LF-to-CRLF-only edit show zero line-content changes
   without invoking unbounded diff work.
5. A legacy review with no round shows no fake diff.
6. Finish/cancel concurrency records at most one finished round and never records
   a canceled round. Cancel-first creates no allowlisted final round;
   cancel-during-finish shares the already in-flight terminal outcome.
7. A failed round prepare or active-review commit leaves the session retryable;
   the retry produces the exact expected cumulative `activeMs`, one final round,
   and no duplicated delta. Failure after final-link visibility returns the
   stored committed result even if the live review changed before retry. A
   process restart followed by a backward clock correction still commits a
   round newer than the latest persisted filename and selects it as the baseline.
8. Symlinks at the storage-root leaf, `rounds`, path-key directory, temporary/final
   file, or lock fail closed. Existing real storage components are tightened
   from a broader mode to `0700` before a round write. Traversal-shaped IDs,
   mismatched path/timestamp, unknown schema, oversized files, collisions, and
   the 101st round also fail writes with fixed typed errors.
9. A missing, truncated, malformed, oversized, or mismatched latest baseline
   returns `baseline-unavailable` while open, annotate, export, Finish, and Cancel
   remain usable. It never falls back to an older round.
10. Node and Bun entrypoint tests prove both pass the stable round identity into
    the shared application method and contain no separate round logic.
11. The built binary smoke test reuses one explicit storage directory across two
    launches, finishes version A, edits to version B, and asserts the exact
    removed/added rows and totals rather than only a non-null comparison.
12. A 20,001-line comparison and a forced library timeout return `too-large`.
13. APG keyboard navigation, associated tabpanels, textual markers, totals,
    line-number names, gap counts, visible bidi-control labels, current-side row
    selection populating the annotation form without trimming source whitespace,
    Clear resetting that selection,
    opening any annotation by switching from Changes to an anchored view before
    scrolling, and exact-item Rendered current-change markers are asserted. A
    changed list item does not color its whole list, forged HTML provenance
    cannot create a marker or source anchor, and removed-only rows do not create
    a false current-source anchor.
14. During terminal completion, the summary and every annotation-editor control
    that can mutate the local draft are disabled until the response settles,
    including the resolved-note `Mark open` control outside the form fieldset.
15. Regression tests fail when no-overwrite final-link commit, stable retry identity,
    active-time confirmation, immutable collision checking, comparison degrade,
    or red/green row classification is reverted.

## Process finding

This slice exceeded three adversarial review rounds because the initial contract
named list-item and code-line markers without defining nested-list provenance or
a non-color signal for changed code. It also omitted exact source-whitespace
preservation, note navigation from a diff-only view, and cross-process clock
rollback from the round-ordering model. Review therefore discovered behavior the
contract should have enumerated. Future Rendered provenance and durable-ordering
work must specify flat, nested, raw-HTML, code-line, whitespace, navigation,
restart, and clock-rollback behavior before implementation; review verifies
those cases rather than introducing them round by round.

The content-first UI port also exceeded three automated PR review rounds because
its terminal-pending contract named editor fields without enumerating the
resolved-note status control outside the form fieldset. Future terminal-state
changes must list every draft-mutating control inside and outside form boundaries
before implementation; review verifies that matrix rather than discovering it.

## Out of scope

- reconstructing source for pre-upgrade reviews;
- a full run-history browser or analytics dashboard;
- user-authored round names;
- round deletion, pruning, archive import/export, or recovery UI;
- word-level or character-level highlighting;
- automatically changing the status of unresolved annotations;
- loading relative local Markdown images;
- changing the existing red/green source diff into an agent-editing surface.

## Documentation updates

The implementation updates `docs/contracts.md` to replace the statement that no
immutable run history exists, `docs/security-model.md` to name and bound the
`rounds` storage surface, and `docs/dependencies.md` with the exact `diff@8.0.4`
pin and 2026-03-23 publish date.

## Why this shape

Storing only the latest baseline would make the Changes tab smaller but would not
fix the missing-run-ledger problem found in the local audit. Capturing on every
open would turn a read into history and create refresh noise. Putting all source
snapshots inside the active review JSON would make one atomic file, but repeated
2 MiB sources would quickly exceed its 16 MiB compatibility bound. A second
mutable reference file would reintroduce a cross-file commit and retry gap.

An immutable final filename as the commit preserves the eventual run-history
shape, keeps reads side-effect free, and removes the mutable reference that could
silently orphan evidence. Finish remains the one user-visible lifecycle action
that records a round.
