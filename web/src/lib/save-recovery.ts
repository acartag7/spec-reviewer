import { api } from "@/api/client"
import type { OpenDocumentResult, Review } from "@/api/types"

export async function recoverFailedSave(
  path: string | null,
  confirmed: Review | null,
  restore: (review: Review | null) => void,
  applyReload: (result: OpenDocumentResult) => void,
): Promise<boolean> {
  restore(confirmed)
  if (path == null) return false
  try {
    applyReload(await api.openDocument(path))
    return true
  } catch {
    return false
  }
}
