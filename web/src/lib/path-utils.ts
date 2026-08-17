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

export async function readDroppedReviewFile(file: File): Promise<{ name: string; bytes: string }> {
  if (!isReviewableFile(file.name)) throw new Error("Drop a Markdown or supported text file")
  const bytes = new Uint8Array(await file.arrayBuffer())
  decodeDroppedBytes(bytes)
  return { name: file.name, bytes: encodeBase64(bytes) }
}

function decodeDroppedBytes(bytes: Uint8Array): void {
  if (bytes.includes(0)) throw new Error("Binary files cannot be reviewed")
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error("Binary files cannot be reviewed")
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}
