export function fileName(path: string): string {
  const parts = path.split("/")
  return parts.at(-1) || path
}

export function shortDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown"
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function sourceStateLabel(state: string): string {
  if (state === "changed") return "changed"
  if (state === "missing") return "missing"
  if (state === "unreviewed") return "new"
  return "current"
}

// Keep in sync with src/domain/document-format.ts
const reviewableSuffixes = [".md", ".markdown", ".yaml", ".yml", ".json", ".toml", ".txt"]

export const reviewableFileAccept = reviewableSuffixes.join(",")

export function isReviewableFile(name: string): boolean {
  const lower = name.toLowerCase()
  return reviewableSuffixes.some((suffix) => lower.endsWith(suffix))
}

export function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith(".md") || lower.endsWith(".markdown")
}
