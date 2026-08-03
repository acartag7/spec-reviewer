import { useRef, useState, type RefObject } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { OpenDocumentResult, Review, ReviewDocument } from "@/api/types"

interface UseReviewHandoffOptions {
  document: ReviewDocument | null
  review: Review | null
  hasUnsavedWork: boolean
  operationInFlightRef: RefObject<boolean>
  terminalInFlight: () => boolean
  applyOpenResult: (result: OpenDocumentResult, shouldResetDraft?: boolean) => void
  showStatus: (message: string) => void
}

export function useReviewHandoff(options: UseReviewHandoffOptions) {
  const queryClient = useQueryClient()
  const retryRef = useRef<{ path: string; revision: number; digest: string; idempotencyKey: string } | null>(null)
  const [inFlight, setInFlight] = useState(false)
  const mutation = useMutation({ mutationFn: api.handoffReview })

  async function handoffAndCopy() {
    const { document, review } = options
    if (document == null || review == null) return options.showStatus("Open a document first")
    if (options.operationInFlightRef.current || options.terminalInFlight()) {
      return options.showStatus("Wait for the pending operation")
    }
    if (options.hasUnsavedWork) return options.showStatus("Save or clear your draft before copying feedback")
    const idempotencyKey = retryKey(retryRef.current, document, review)
    retryRef.current = { path: document.path, revision: review.revision, digest: document.digest, idempotencyKey }
    options.operationInFlightRef.current = true
    setInFlight(true)
    try {
      const result = await mutation.mutateAsync({
        path: document.path,
        baseRevision: review.revision,
        documentDigest: document.digest,
        idempotencyKey,
      })
      queryClient.setQueryData(["export", document.path], result)
      void queryClient.invalidateQueries({ queryKey: ["reviews"] })
      let copied = true
      try {
        await copyText(result.markdown)
      } catch {
        copied = false
      }
      let reloaded = true
      try {
        options.applyOpenResult(await api.openDocument(document.path), false)
      } catch {
        reloaded = false
      }
      if (result.checkpoint == null) {
        options.showStatus(copied
          ? "Feedback copied; uploaded documents do not have a comparison baseline"
          : "Feedback ready in the handoff panel; uploaded documents do not have a comparison baseline")
      } else if (copied && reloaded) options.showStatus("Feedback checkpointed and copied")
      else if (copied) options.showStatus("Feedback checkpointed and copied; reload to see its baseline")
      else if (reloaded) options.showStatus("Feedback checkpointed; copy it from the handoff panel")
      else options.showStatus("Feedback checkpointed; copy it from the handoff panel, then reload")
      retryRef.current = null
    } catch (error) {
      options.showStatus(error instanceof Error ? error.message : String(error))
    } finally {
      options.operationInFlightRef.current = false
      setInFlight(false)
    }
  }

  return { handoffAndCopy, pending: inFlight || mutation.isPending }
}

function retryKey(
  previous: { path: string; revision: number; digest: string; idempotencyKey: string } | null,
  document: ReviewDocument,
  review: Review,
): string {
  if (previous?.path === document.path && previous.revision === review.revision && previous.digest === document.digest) {
    return previous.idempotencyKey
  }
  return crypto.randomUUID().replaceAll("-", "")
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText != null) return navigator.clipboard.writeText(value)
  const element = document.createElement("textarea")
  element.value = value
  element.setAttribute("readonly", "")
  element.style.position = "fixed"
  element.style.opacity = "0"
  document.body.append(element)
  element.select()
  const copied = document.execCommand?.("copy") ?? false
  element.remove()
  if (!copied) throw new Error("Clipboard unavailable")
}
