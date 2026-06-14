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

Saving a changed review does not clear the changed state. A later explicit anchor
re-sync flow should be responsible for clearing stale state.

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

## Local Server Security

Requests must use loopback Host and Origin values matching the bound port. The
server sends a restrictive CSP, no-store cache headers, `nosniff`, no-referrer,
and same-origin opener policy.
