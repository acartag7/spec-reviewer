import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { api, recordActiveTime } from "@/api/client"
import type { Annotation, OpenDocumentResult, Review, ReviewComparison, ReviewDocument, ReviewSourceState, SelectionRange } from "@/api/types"
import { StartScreen } from "@/components/StartScreen"
import { SessionOutcomeScreen } from "@/components/SessionOutcomeScreen"
import { StatusToast } from "@/components/StatusToast"
import { TopBar } from "@/components/TopBar"
import { Workspace } from "@/components/Workspace"
import { createAnnotation, emptyForm, formFromAnnotation, removeAnnotation, upsertAnnotation, type AnnotationFormValue } from "@/lib/review-utils"
import { isMarkdownFile } from "@/lib/path-utils"
import { scrollToLine } from "@/lib/scroll-to-line"
import { NO_SELECTION } from "@/lib/selection-utils"
import { recoverFailedSave } from "@/lib/save-recovery"
import { routeTerminalActiveTime, sessionOutcomeFor, type SessionOutcome } from "@/lib/terminal-active-time"
import { useActiveReviewTime } from "@/lib/use-active-review-time"

const initialSelection: SelectionRange = { lineStart: 1, lineEnd: 1, selectedText: "" }
type SaveIntent = { review: Review; formOnFailure: AnnotationFormValue; selectionOnFailure: SelectionRange; clearFormOnSuccess: boolean }
export function ReviewerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const timeoutRef = useRef<number | null>(null)
  const confirmedReviewRef = useRef<Review | null>(null)
  const requestedPath = searchParams.get("path") ?? ""
  const [document, setDocument] = useState<ReviewDocument | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [selection, setSelection] = useState<SelectionRange>(NO_SELECTION)
  const [form, setForm] = useState<AnnotationFormValue>(() => emptyForm(initialSelection))
  const [sourceState, setSourceState] = useState<ReviewSourceState>("unreviewed")
  const [comparison, setComparison] = useState<ReviewComparison>({ state: "unavailable", reason: "no-baseline" })
  const [status, setStatus] = useState("")
  const [sessionOutcome, setSessionOutcome] = useState<SessionOutcome | null>(null)
  const showStatus = useCallback((message: string) => {
    setStatus(message)
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setStatus(""), 1800)
  }, [])
  const { flush: flushActiveTime } = useActiveReviewTime({
    path: document?.path ?? null,
    onAutoFlush: (delta, path) => { if (path != null) recordActiveTime(path, delta) },
  })
  const configQuery = useQuery({ queryKey: ["config"], queryFn: api.config })
  const reviewsQuery = useQuery({ queryKey: ["reviews"], queryFn: api.recentReviews })
  const documentQuery = useQuery({
    queryKey: ["document", requestedPath],
    queryFn: () => api.openDocument(requestedPath),
    enabled: requestedPath.trim() !== "",
  })
  const exportQuery = useQuery({
    queryKey: ["export", document?.path],
    queryFn: () => api.exportReview(document?.path ?? ""),
    enabled: document != null,
  })
  const applyOpenResult = useCallback((result: OpenDocumentResult) => {
    setDocument(result.document)
    setReview(result.review)
    confirmedReviewRef.current = result.review
    setSelection(NO_SELECTION)
    setForm(emptyForm(initialSelection))
    setSourceState(result.sourceState ?? (result.stale ? "changed" : "current"))
    setComparison(result.comparison ?? { state: "unavailable", reason: "no-baseline" })
  }, [])
  useEffect(() => {
    if (requestedPath === "" && configQuery.data?.defaultDocumentPath) {
      setSearchParams({ path: configQuery.data.defaultDocumentPath }, { replace: true })
    }
  }, [configQuery.data?.defaultDocumentPath, requestedPath, setSearchParams])
  useEffect(() => {
    if (documentQuery.data != null) {
      applyOpenResult(documentQuery.data)
      showStatus(documentQuery.data.stale ? "Loaded with stale annotations" : "Loaded")
    }
  }, [applyOpenResult, documentQuery.data, showStatus])
  useEffect(() => {
    if (documentQuery.error instanceof Error) showStatus(documentQuery.error.message)
    if (configQuery.error instanceof Error) showStatus(configQuery.error.message)
  }, [configQuery.error, documentQuery.error, showStatus])
  const saveMutation = useMutation({
    mutationFn: ({ review: nextReview }: SaveIntent) => {
      if (document == null) throw new Error("Open a document first")
      return api.saveReview({
        path: document.path,
        baseRevision: nextReview.revision,
        summary: nextReview.summary,
        annotations: nextReview.annotations,
        activeMsDelta: flushActiveTime(),
      })
    },
    onSuccess: (saved, intent) => {
      setReview(saved)
      confirmedReviewRef.current = saved
      if (intent.clearFormOnSuccess) setForm(emptyForm(selection))
      setSourceState((state) => (state === "changed" ? "changed" : "current"))
      void queryClient.invalidateQueries({ queryKey: ["reviews"] })
      void queryClient.invalidateQueries({ queryKey: ["export", document?.path] })
      showStatus("Saved")
    },
    onError: async (error, intent) => {
      const reloaded = await recoverFailedSave(document?.path ?? null, confirmedReviewRef.current, setReview, applyOpenResult)
      setForm(intent.formOnFailure)
      setSelection(intent.selectionOnFailure)
      if (reloaded && document != null) void queryClient.invalidateQueries({ queryKey: ["export", document.path] })
      const message = error instanceof Error ? error.message : String(error)
      showStatus(`${message}. ${reloaded ? "Reloaded the saved review" : "Unsaved change reverted; reload before saving again"}`)
    },
  })
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!isMarkdownFile(file.name)) throw new Error("Drop a .md or .markdown file")
      return api.uploadDocument({ name: file.name, content: await file.text() })
    },
    onSuccess: (result) => {
      applyOpenResult(result)
      setSearchParams({ path: result.document.path }, { replace: true })
      showStatus("Dropped file loaded")
      void queryClient.invalidateQueries({ queryKey: ["reviews"] })
    },
    onError: (error) => showStatus(error instanceof Error ? error.message : String(error)),
  })
  const finishMutation = useMutation({
    mutationFn: (activeMsDelta: number) => {
      const path = configQuery.data?.defaultDocumentPath
      if (path == null) throw new Error("No waiting review session")
      return api.finishReview(path, activeMsDelta)
    },
    onSuccess: (completion) => setSessionOutcome(sessionOutcomeFor(completion)),
    onError: (error) => showStatus(error instanceof Error ? error.message : String(error)),
  })
  const cancelMutation = useMutation({
    mutationFn: (activeMsDelta: number) => {
      const path = configQuery.data?.defaultDocumentPath
      if (path == null) throw new Error("No waiting review session")
      return api.cancelReview(path, activeMsDelta)
    },
    onSuccess: (completion) => setSessionOutcome(sessionOutcomeFor(completion)),
    onError: (error) => showStatus(error instanceof Error ? error.message : String(error)),
  })

  function openPath(path: string) {
    if (path.trim() === "") {
      showStatus("Enter a Markdown path")
      return
    }
    setSearchParams({ path: path.trim() }, { replace: true })
  }

  function selectLines(nextSelection: SelectionRange) {
    setSelection(nextSelection)
    setForm((current) => ({
      ...current,
      lineStart: nextSelection.lineStart,
      lineEnd: nextSelection.lineEnd,
      selectedText: nextSelection.selectedText,
    }))
  }

  function saveReview(nextReview: Review, clearFormOnSuccess = false) {
    setReview(nextReview)
    saveMutation.mutate({ review: nextReview, formOnFailure: form, selectionOnFailure: selection, clearFormOnSuccess })
  }

  function addOrUpdateAnnotation() {
    if (review == null) return showStatus("Open a document first")
    const annotation = createAnnotation(form, selection)
    if (!annotation.note) return showStatus("Feedback is required")
    saveReview(upsertAnnotation(review, annotation), true)
  }

  function deleteAnnotation(annotation: Annotation) {
    if (review == null) return
    saveReview(removeAnnotation(review, annotation.id))
  }

  function setAnnotationStatus(annotation: Annotation, status: Annotation["status"]) {
    if (review == null) return
    saveReview(upsertAnnotation(review, { ...annotation, status, updatedAt: new Date().toISOString() }))
  }

  async function copyExport() {
    if (document == null) return showStatus("Open a document first")
    const result = await exportQuery.refetch()
    const markdown = result.data?.markdown ?? exportQuery.data?.markdown ?? ""
    try {
      await navigator.clipboard.writeText(markdown)
      showStatus("Feedback copied")
    } catch {
      showStatus("Feedback ready below")
    }
  }

  const flushTerminalActiveTime = () => routeTerminalActiveTime(document?.path ?? null, configQuery.data?.defaultDocumentPath ?? null, flushActiveTime(), recordActiveTime)

  const canCopy = document != null
  const sessionPath = configQuery.data?.defaultDocumentPath ?? null
  const canFinish = document != null && document.path === sessionPath
  const finishing = finishMutation.isPending || cancelMutation.isPending

  if (sessionOutcome != null) return <SessionOutcomeScreen outcome={sessionOutcome.outcome} openAnnotations={sessionOutcome.openAnnotations} activeMs={sessionOutcome.activeMs} />

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopBar
        path={document?.path ?? requestedPath}
        sourceState={sourceState}
        canCopy={canCopy}
        canFinish={canFinish}
        waitForReview={configQuery.data?.waitForReview ?? false}
        finishing={finishing}
        onCopy={copyExport}
        onFinish={() => finishMutation.mutate(flushTerminalActiveTime())}
        onCancel={() => cancelMutation.mutate(flushTerminalActiveTime())}
      />
      {document != null && review != null ? (
        <Workspace
          document={document}
          review={review}
          selection={selection}
          sourceState={sourceState}
          comparison={comparison}
          form={form}
          exportMarkdown={exportQuery.data?.markdown ?? ""}
          exportLoading={exportQuery.isLoading || exportQuery.isFetching}
          saving={saveMutation.isPending}
          onSelection={selectLines}
          onFormChange={setForm}
          onFormSubmit={addOrUpdateAnnotation}
          onFormReset={() => { window.getSelection()?.removeAllRanges(); setSelection(NO_SELECTION); setForm(emptyForm(initialSelection)) }}
          onOpenAnnotation={(annotation) => scrollToLine(annotation.lineStart)}
          onEditAnnotation={(annotation) => setForm(formFromAnnotation(annotation))}
          onStatusAnnotation={setAnnotationStatus}
          onDeleteAnnotation={deleteAnnotation}
          onCopyExport={copyExport}
        />
      ) : (
        <StartScreen
          defaultPath={configQuery.data?.defaultDocumentPath ?? requestedPath}
          reviews={reviewsQuery.data ?? []}
          loadingReviews={reviewsQuery.isLoading}
          onOpenPath={openPath}
          onOpenFile={(file) => uploadMutation.mutate(file)}
        />
      )}
      <StatusToast message={status} />
    </div>
  )
}
