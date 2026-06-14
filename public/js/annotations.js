export function createAnnotation(selection, form) {
  const now = new Date().toISOString();
  return {
    id: form.id || `ann_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
    lineStart: Number(form.lineStart || selection.lineStart || 1),
    lineEnd: Number(form.lineEnd || selection.lineEnd || form.lineStart || 1),
    section: null,
    selectedText: form.selectedText.trim() || selection.selectedText || null,
    kind: form.kind,
    severity: form.severity,
    status: "open",
    note: form.note.trim(),
    agentAction: form.agentAction?.trim?.() ?? "",
    createdAt: form.createdAt || now,
    updatedAt: now,
  };
}

export function upsertAnnotation(review, annotation) {
  const existing = review.annotations.findIndex((item) => item.id === annotation.id);
  if (existing >= 0) review.annotations.splice(existing, 1, annotation);
  else review.annotations.push(annotation);
}

export function removeAnnotation(review, id) {
  review.annotations = review.annotations.filter((item) => item.id !== id);
}

export function overlappingOpenAnnotations(annotations, line) {
  return annotations.filter((item) => {
    return item.status === "open" && item.lineStart <= line && item.lineEnd >= line;
  });
}

export function sortAnnotations(annotations) {
  return [...annotations].sort((a, b) => {
    const status = Number(a.status === "resolved") - Number(b.status === "resolved");
    if (status !== 0) return status;
    return a.lineStart - b.lineStart;
  });
}
