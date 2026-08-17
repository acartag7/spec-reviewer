# Contracts

The tool is local-first. It does not mutate reviewed files. Review state lives in
the storage directory, keyed by a canonical textual document path. Canonical here
means expanding a leading `~/` and applying absolute path resolution. It does not
use `realpath`, case folding, or inode identity, so symlink aliases and differently
cased paths remain different review records. Every server path uses this same
textual normalization before locking, storage lookup, or wait-session comparison.

## Document Open

```text
GET /api/document?path=/absolute/or/relative/spec.md
```

Response:

```json
{
  "document": {
    "path": "/absolute/spec.md",
    "title": "Spec title",
    "digest": "sha256...",
    "lines": [{ "number": 1, "text": "# Spec", "kind": "heading" }],
    "sections": [{ "line": 1, "level": 1, "title": "Spec" }]
  },
  "review": {
    "documentPath": "/absolute/spec.md",
    "documentDigest": "sha256...",
    "revision": 0,
    "summary": "",
    "annotations": []
  },
  "stale": false,
  "sourceState": "current",
  "comparison": { "state": "unavailable", "reason": "no-baseline" }
}
```

`sourceState` values:

- `unreviewed`: no saved notes exist for the current digest.
- `current`: the saved review digest matches the current file digest.
- `changed`: the file changed since notes were saved.
- `missing`: recent-review list only; the saved source path no longer exists.

When `sourceState` is `changed`, line anchors may be stale and should be
manually rechecked before sending feedback to an agent.

`sourceState` describes only whole-file digest equality. Per-annotation
`anchorState` remains authoritative even when `sourceState` is `current`.

Saving a changed review does not clear the changed state. A later explicit anchor
re-sync flow should be responsible for clearing stale state.

`comparison.state` is `diff`, `unchanged`, `too-large`, or `unavailable`.
Completed waiting sessions provide the baseline. A `diff` response contains
bounded unified rows with old/new line numbers, added/removed totals, and gap
counts; it never sends duplicate raw source snapshots to the browser. An invalid
latest round degrades only comparison to `baseline-unavailable` and never falls
back to older evidence. A pre-upgrade review reports `no-baseline`, and immutable
uploaded paths report `immutable-upload`.

## Save Review

```text
POST /api/review
```

Request:

```json
{
  "path": "/absolute/spec.md",
  "baseRevision": 0,
  "summary": "Overall feedback",
  "annotations": [
    {
      "lineStart": 12,
      "lineEnd": 14,
      "kind": "issue",
      "severity": "major",
      "note": "What is wrong",
      "agentAction": "What the agent should change"
    }
  ]
}
```

`kind` values: `issue`, `question`, `suggestion`, `decision`, `note`.

`severity` values: `blocker`, `major`, `minor`, `note`.

`anchorState` values: `ok`, `moved`, `ambiguous`, `not-found`.

The server stores the original `anchorText` for each note. Open/export responses
resolve that text against the current document and expose transient `anchor` and
`anchorState` response fields.

Review saves preserve omitted fields and reject stale content writes:

- `path` is a required non-blank string and uses the textual normalization
  defined above.
- Omitting `summary` or `annotations` preserves the stored value. Supplying a
  string summary or an annotation array replaces that value; an empty string or
  empty array intentionally clears it. Other types are rejected.
- A request that supplies `summary` or `annotations` must include integer
  `baseRevision`. It must equal the stored `revision`, or `0` for an unsaved
  review. A mismatch returns `409 review_conflict` without writing. A successful
  content save increments `revision`. This prevents stale tabs in one server
  process from replacing newer feedback.
- `activeMsDelta` accumulates independently, does not increment `revision`, and
  never erases content. A request containing only this delta does not need a
  revision precondition.
- The document snapshot is read after the per-path operation lock is acquired.
  The complete request is validated against that snapshot before a storage write.
  A validation rejection returns `400 invalid_review` and leaves review content
  unchanged. A valid `activeMsDelta` remains independent and may still be stored.
  Storage, I/O, and commit-indeterminate failures do not promise whether that
  delta committed; the next validated load is the source of truth. If persisting
  that delta fails while content is rejected, the fixed error reports both the
  original rejection and the unconfirmed metric write.
  An external editor can still change the source after the snapshot; the next
  open detects that through the digest and anchor states.

An explicit annotation array contains at most 200 items. Every item must be an
object with a non-blank note, allowed enum values, and positive integer lines
where `lineEnd >= lineStart`. A new or changed range must exist in the current
document, span at most 500 lines, derive at most 64 KiB of UTF-8 anchor text, and
contain at least one non-blank source line. The total span across an explicit
array is at most 20,000 lines. These limits bound server-owned anchor storage and
request-time range work in addition to the existing 3 MiB request and 2 MiB
document limits. Anchor drift lookup builds one document text index and uses
bounded substring searches instead of rebuilding every candidate line range.
An existing legacy review above the annotation-count limit may submit only a
strict deletion containing stored IDs at unchanged ranges until it is back within
the current limit. A review above the total-span limit may make that same
progressive deletion, or change ranges if the resulting total is within the
current limit.

An item whose `(id, lineStart, lineEnd)` exactly matches a stored annotation must
remain valid after the document shrinks. It keeps its server-owned anchor,
selected text, and creation time while `note`, `kind`, `severity`, `status`, and
`agentAction` remain editable. This includes legacy annotations with no anchor,
which stay editable and export with a manual-check warning. Duplicate non-blank
IDs are rejected, and IDs are bounded to 128 UTF-8 bytes.

The server owns anchor text, selected text, section names, and timestamps. It
derives selected text from the verified source anchor instead of accepting the
client's quote as evidence. Request fields outside the accepted annotation input
set (`id`, lines, kind, severity, status, note, and `agentAction`) are ignored.
The bundled UI sends only that accepted annotation input set.
Summary, note, and agent-action strings are each bounded to 64 KiB UTF-8.
An unchanged oversized legacy value may survive a repair save, but changing that
value requires bringing it within the current limit.

The UI may show a content save optimistically, but a failed save restores or
reloads the server-confirmed review. A failed add or edit preserves the reviewer's
form contents so the feedback can be corrected and retried.
Open and resolved annotations are shown separately. Reviewers can resolve or
reopen a note directly, and editing preserves both its status and agent action.

Saving against a changed document does not silently advance the saved digest,
resolve feedback, or create a completed review round.

## Export

```text
GET /api/export?path=/absolute/spec.md
```

Response:

```json
{
  "markdown": "# Agent Review Feedback\n..."
}
```

The export is meant to be pasted directly into an agent task. It includes the
document path, digest, overall summary, and open annotations grouped by severity.
If the current file digest differs from the saved review digest, export includes
a warning and the current digest.

If an annotation anchor has one exact occurrence elsewhere, export marks the
saved range and current range. If the exact text is gone, relocation may still
use whitespace-normalized, heading-retitle, or unique surviving-fragment matches
and mark the note `moved`. If two matches are equally plausible, export marks it
ambiguous and never silently selects the first occurrence. `ok` and quoted
evidence still require an exact CRLF-normalized match because Markdown
indentation is semantic.
Verified selected source is emitted as a fenced block without stripping numbers,
blank lines, or relative indentation. Export and the read-only form field use
the transient verified current anchor source, never a legacy client quote. If
the saved source text is not found, export marks the annotation as not found. An
open annotation is always exported until the human explicitly resolves or deletes
it; missing source text is not proof that the requested change was made. In drift
or legacy no-anchor cases, export omits the unverified selected-text quote.

The JSON completion field `carriedOver` remains for compatibility in this change
but is always `0` because no unresolved annotation is suppressed. User-facing
copy does not present that compatibility field as meaningful review information.

## Waiting Session Completion

`POST /api/session/finish` and `POST /api/session/cancel` are bound to the
canonical document path that created the waiting session. A different path is
rejected with `400 session_path_mismatch` before active-time persistence, export,
or session completion. The UI always sends the configured waiting-session path,
not whichever document is currently visible.

The first path-valid terminal request claims the session synchronously before any
await and creates one stable round identity and completion time. A concurrent
Finish, Cancel, or repeat request shares that first attempt's result. The waiter
retains the first terminal active-time delta until the service confirms its
durable metrics write. A retry before confirmation receives the same delta; a
retry after confirmation receives no delta. This prevents both loss before a
round write and duplication after one.

A failed attempt releases the terminal claim but retains that stable identity.
A later Cancel can end a session whose source document disappeared. Cancel does
not need to read or export the source file; if stored review state exists it adds
the delta there, otherwise it returns the session delta without materializing an
invalid review. The UI renders the returned terminal status even when another
tab claimed the opposite action first.

Finish first persists terminal metrics, then commits one immutable round. A
valid existing file for the stable identity proves an earlier attempt committed
and is returned without rebuilding edited live state. Cancel never creates a
round. Finishing an unchanged source still records a distinct round.

## Review Storage Integrity

Review JSON and copied upload documents use the same atomic replacement primitive.
A save serializes and validates content before filesystem changes, verifies that
the target subdirectory is a real directory, enforces `0700` on it, writes the
complete content to an exclusively created no-follow `0600` temporary file,
syncs it, atomically renames it over the destination, then syncs the directory.
Temporary names end in `.tmp`, never `.json`.

A failure before rename preserves the prior destination. If both the primary
operation and cleanup fail, the fixed error identifies both reason codes without
including file contents. A directory-sync failure after rename returns
`500 storage_commit_indeterminate`: the new file may already be visible, and the
next validated load is the source of truth. This persistence failure is distinct
from a request-validation rejection.

Recent-review listing skips only a file that disappears during the list/read
race. One validated parser is used by document load, session-ID load, and recent
listing. Malformed JSON, an invalid stored shape, or a filename/path-key mismatch
fails the whole operation with `500 review_store_corrupt`, the allowlisted review
filename, and no raw parser message or review contents. `sessions` exits non-zero.

Read compatibility is broader than new-write validation because prior releases
accepted larger client fields, arbitrary string timestamps, long IDs, and more
than 200 annotations. Structurally valid legacy records remain loadable and can
be progressively reduced and repaired in the UI. Compatibility is still
hard-bounded to a 16 MiB review
file, 5,000 annotations, and 8 MiB per stored text field. New API requests remain
subject to the smaller limits in Save Review.

The in-process lock plus revision precondition protects concurrent tabs served by
one process. Running multiple Spec Reviewer processes against the same storage
directory is unsupported and can still cause last-write-wins replacement; atomic
rename prevents torn files, not cross-process lost updates. Same-user filesystem
replacement races after directory verification are also out of scope.

## Immutable Review Rounds

Successful waiting-session finishes and feedback handoffs are stored under
`rounds/<path-key>/<epoch-ms>-<random-id>.json`. The storage-root leaf, `rounds`,
and path-key directory must each be real directories, never symlinks. Reads do
not alter their modes. Before a round write, existing real components are
tightened to `0700` and missing components are created as `0700`. Existing
ancestors above the configured root are an operator precondition. A per-document
exclusive round lock serializes cross-process publication. Handoffs stop at 99
rounds to reserve the 100th for terminal Finish; Finish stops at 100. Stale locks
fail closed and require local operator cleanup.

Round content is validated before filesystem changes and capped at 32 MiB. The
writer syncs an exclusive `0600` temporary file, hard-links it to the final name
without overwrite, syncs the directory, and removes the temporary file. The hard
link is the completion commit. A final round is immutable; an existing malformed
or identity-mismatched collision fails closed. Hidden temporary and lock files
are never read as evidence.

The latest allowlisted filename is the only baseline read on open. Its schema,
path, filename, timestamp, digest/content binding, annotations, size, and private
file mode are validated. Read failure disables only the comparison. New Finish
and handoff writes still fail closed on unsafe storage or corrupt collisions.

This integrity contract does not add review outcome taxonomy, automatic port
selection, installed-version reporting, pruning, or history recovery UI.

## Local Server Security

Requests must use loopback Host and Origin values matching the bound port. The
server sends a restrictive CSP, no-store cache headers, `nosniff`, no-referrer,
and same-origin opener policy.
