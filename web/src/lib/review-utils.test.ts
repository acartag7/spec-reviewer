import { expect, test } from "vitest"
import type { Annotation } from "@/api/types"
import { createAnnotation, formFromAnnotation } from "@/lib/review-utils"

test("editing an annotation preserves its lifecycle and agent action", () => {
  const annotation: Annotation = {
    id: "resolved-note",
    lineStart: 4,
    lineEnd: 4,
    section: "Spec",
    selectedText: "unverified legacy quote",
    kind: "issue",
    severity: "major",
    status: "resolved",
    note: "Keep the rationale",
    agentAction: "Retain this exact action",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    anchor: { state: "ok", lineStart: 4, lineEnd: 4, sourceText: "verified source" },
  }
  const form = formFromAnnotation(annotation)
  const rebuilt = createAnnotation(form, {
    lineStart: 1,
    lineEnd: 1,
    selectedText: "wrong selection",
  })
  expect(rebuilt.status).toBe("resolved")
  expect(rebuilt.agentAction).toBe("Retain this exact action")
  expect(rebuilt.lineStart).toBe(4)
  expect(form.selectedText).toBe("verified source")
  expect(rebuilt.selectedText).toBeNull()
})
