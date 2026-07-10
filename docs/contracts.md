# Contracts

The tool is local-first. It does not mutate reviewed files. Review state lives in
the storage directory, keyed by the absolute document path.

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
    "summary": "",
    "annotations": []
  },
  "stale": false,
  "sourceState": "current"
}
```

`sourceState` values:

- `unreviewed`: no saved notes exist for the current digest.
- `current`: saved notes match the current file digest.
- `changed`: the file changed since notes were saved.
- `missing`: recent-review list only; the saved source path no longer exists.

When `sourceState` is `changed`, line anchors may be stale and should be
manually rechecked before sending feedback to an agent.

Saving a changed review does not clear the changed state. The reviewer must
resolve or re-anchor every drifting open note, then explicitly confirm the live
file as the new review baseline.

## Save Review

```text
POST /api/review
```

Request:

```json
{
  "path": "/absolute/spec.md",
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

`anchorState` values: `ok`, `moved`, `not-found`.

The server stores the original `anchorText` for each note. Open/export responses
resolve that text against the current document and expose transient `anchor` and
`anchorState` response fields.

Wrongly typed or missing `annotations` are rejected. When `summary` is omitted,
the saved summary is preserved; `null` and other non-string summary values are
rejected. A partial payload must not replace a stored review with an empty one.

Open annotations must include at least one non-blank source line so every note
can be rechecked before advancing the review baseline.

## Confirm Current Version

```text
POST /api/review/baseline
```

Request:

```json
{ "path": "/absolute/spec.md" }
```

This updates the saved review digest to the current file only when every open
annotation has a current (`ok`) anchor. Moved or missing open notes must first be
resolved, deleted, or re-anchored. This is the explicit boundary between review
rounds; it never infers resolution from a source edit.

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

If an annotation anchor moved, export marks the saved range and current range. If
the saved source text is not found, export marks the annotation as not found. The
note remains an open action item until the human resolves it. In both drift cases,
export omits the old selected-text quote.

In a waiting session, Finish and Cancel accept only the document path that
created the session. A different path is rejected.

## Local Server Security

Requests must use loopback Host and Origin values matching the bound port. The
server sends a restrictive CSP, no-store cache headers, `nosniff`, no-referrer,
and same-origin opener policy.
