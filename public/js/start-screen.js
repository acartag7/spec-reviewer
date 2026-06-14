export function bindStartScreen(elements, handlers) {
  elements.startPathForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handlers.openPath(elements.startPathInput.value.trim());
  });
  elements.fileInput.addEventListener("change", async () => {
    const file = elements.fileInput.files?.[0];
    if (file != null) await handlers.openFile(file);
    elements.fileInput.value = "";
  });
  elements.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
  elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("dragging"));
  elements.dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file != null) await handlers.openFile(file);
  });
}

export function renderRecentReviews(container, reviews, onOpen) {
  container.textContent = "";
  if (reviews.length === 0) {
    const empty = document.createElement("div");
    empty.className = "meta";
    empty.textContent = "No saved reviews yet.";
    container.append(empty);
    return;
  }
  for (const review of reviews) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-item";
    button.addEventListener("click", () => onOpen(review.documentPath));
    const title = document.createElement("span");
    title.className = "recent-title";
    title.textContent = review.title;
    const meta = document.createElement("span");
    meta.className = "recent-meta";
    meta.textContent = `${stateLabel(review.sourceState)} · ${review.openAnnotations} open / ${review.annotations} total · ${shortDate(review.updatedAt)}`;
    button.append(title, meta);
    container.append(button);
  }
}

function stateLabel(state) {
  if (state === "changed") return "changed";
  if (state === "missing") return "missing";
  if (state === "unreviewed") return "new";
  return "current";
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
