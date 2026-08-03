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
import { createAnnotation, formFromAnnotation, hasAnnotationDraft, removeAnnotation, upsertAnnotation } from "@/lib/review-utils"
import type { AnnotationFormValue } from "@/lib/review-utils"
import { isMarkdownFile } from "@/lib/path-utils"
import { NO_SELECTION } from "@/lib/selection-utils"
import { recoverFailedSave } from "@/lib/save-recovery"
import { useActiveReviewTime } from "@/lib/use-active-review-time"
import { useReviewDraft } from "@/lib/use-review-draft"
import { useReviewSummary } from "@/lib/use-review-summary"
import { useReviewHandoff } from "@/lib/use-review-handoff"
import { useTerminalReview } from "@/lib/use-terminal-review"

const initialSelection: SelectionRange = { lineStart: 1, lineEnd: 1, selectedText: "" }
type SaveIntent = { review: Review; submittedForm: AnnotationFormValue; submittedSelection: SelectionRange; submittedSummary: string | null; clearFormOnSuccess: boolean; reconcileFormId: string | null }
export function ReviewerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const timeoutRef = useRef<number | null>(null)
  const confirmedReviewRef = useRef<Review | null>(null)
  const saveInFlightRef = useRef(false)
  const requestedPath = searchParams.get("path") ?? ""
  const [document, setDocument] = useState<ReviewDocument | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const { selection, selectionRef, form, formRef, updateForm, resetDraft, selectLines, clearSubmittedForm, reconcileSavedAnnotation } = useReviewDraft(NO_SELECTION, initialSelection)
  const { summary, summaryRef, updateSummary, settleSubmittedSummary } = useReviewSummary()
  const [sourceState, setSourceState] = useState<ReviewSourceState>("unreviewed")
  const [comparison, setComparison] = useState<ReviewComparison>({ state: "unavailable", reason: "no-baseline" })
  const [status, setStatus] = useState("")
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
  const terminal = useTerminalReview({
    documentPath: document?.path ?? null,
    sessionPath: configQuery.data?.defaultDocumentPath ?? null,
    saveInFlightRef,
    flushActiveTime,
    showStatus,
  })
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
  const applyOpenResult = useCallback((result: OpenDocumentResult, shouldResetDraft = true) => {
    setDocument(result.document)
    setReview(result.review)
    confirmedReviewRef.current = result.review
    if (shouldResetDraft) {
      resetDraft(NO_SELECTION, initialSelection)
      updateSummary(result.review.summary)
    }
    setSourceState(result.sourceState ?? (result.stale ? "changed" : "current"))
    setComparison(result.comparison ?? { state: "unavailable", reason: "no-baseline" })
  }, [resetDraft, updateSummary])
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
      if (intent.clearFormOnSuccess) clearSubmittedForm(intent.submittedForm, intent.submittedSelection)
      if (intent.reconcileFormId != null) reconcileSavedAnnotation(intent.reconcileFormId, saved.annotations.find((item) => item.id === intent.reconcileFormId), intent.submittedForm)
      if (intent.submittedSummary != null) settleSubmittedSummary(intent.submittedSummary, saved.summary)
      setSourceState((state) => (state === "changed" ? "changed" : "current"))
      void queryClient.invalidateQueries({ queryKey: ["reviews"] })
      void queryClient.invalidateQueries({ queryKey: ["export", document?.path] })
      showStatus("Saved")
    },
    onError: async (error, intent) => {
      const confirmedSummary = confirmedReviewRef.current?.summary
      const reloaded = await recoverFailedSave(
        document?.path ?? null,
        confirmedReviewRef.current,
        setReview,
        (result) => {
          if (confirmedSummary != null && summaryRef.current === confirmedSummary) updateSummary(result.review.summary)
          if (intent.reconcileFormId != null) reconcileSavedAnnotation(intent.reconcileFormId, result.review.annotations.find((item) => item.id === intent.reconcileFormId), intent.submittedForm)
          applyOpenResult(result, false)
        },
      )
      if (reloaded && document != null) void queryClient.invalidateQueries({ queryKey: ["export", document.path] })
      const message = error instanceof Error ? error.message : String(error)
      showStatus(`${message}. ${reloaded ? "Reloaded the saved review" : "Unsaved change reverted; reload before saving again"}`)
    },
    onSettled: () => { saveInFlightRef.current = false },
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
  function openPath(path: string) {
    if (path.trim() === "") {
      showStatus("Enter a Markdown path")
      return
    }
    setSearchParams({ path: path.trim() }, { replace: true })
  }
  function saveReview(nextReview: Review, clearFormOnSuccess = false, summaryToSave?: string, reconcileFormId?: string) {
    if (saveInFlightRef.current || terminal.isInFlight()) return showStatus("Wait for the pending operation")
    const submittedSummary = summaryToSave ?? null
    const submittedReview = { ...nextReview, summary: summaryToSave ?? nextReview.summary }
    setReview(submittedReview)
    saveInFlightRef.current = true
    saveMutation.mutate({
      review: submittedReview,
      submittedForm: formRef.current,
      submittedSelection: selectionRef.current,
      submittedSummary,
      clearFormOnSuccess,
      reconcileFormId: reconcileFormId ?? null,
    })
  }
  function addOrUpdateAnnotation() {
    if (review == null) return showStatus("Open a document first")
    const annotation = createAnnotation(form, selection)
    if (!annotation.note) return showStatus("Feedback is required")
    if (form.id !== annotation.id || form.createdAt !== annotation.createdAt) {
      updateForm({ ...form, id: annotation.id, createdAt: annotation.createdAt })
    }
    saveReview(upsertAnnotation(review, annotation), true)
  }
  function deleteAnnotation(annotation: Annotation) {
    if (review == null) return
    saveReview(removeAnnotation(review, annotation.id), false, undefined, annotation.id)
  }

  function setAnnotationStatus(annotation: Annotation, status: Annotation["status"]) {
    if (review == null) return
    saveReview(upsertAnnotation(review, { ...annotation, status, updatedAt: new Date().toISOString() }), false, undefined, annotation.id)
  }

  const hasUnsavedWork = (review != null && hasAnnotationDraft(form, review.annotations)) || (review != null && summary !== review.summary)
  const handoff = useReviewHandoff({
    document, review, hasUnsavedWork, operationInFlightRef: saveInFlightRef,
    terminalInFlight: terminal.isInFlight, applyOpenResult, showStatus,
  })

  const saving = saveMutation.isPending
  const reviewLocked = saving || terminal.pending || handoff.pending
  const canCopy = document != null && !reviewLocked
  const sessionPath = configQuery.data?.defaultDocumentPath ?? null
  const canFinish = document != null && document.path === sessionPath && !reviewLocked
  const finishReview = () => hasUnsavedWork ? showStatus("Save or clear your draft before finishing") : terminal.finish()

  if (terminal.outcome != null) return <SessionOutcomeScreen outcome={terminal.outcome.outcome} openAnnotations={terminal.outcome.openAnnotations} activeMs={terminal.outcome.activeMs} />

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopBar
        path={document?.path ?? requestedPath} sourceState={sourceState}
        canCopy={canCopy} canFinish={canFinish}
        waitForReview={configQuery.data?.waitForReview ?? false}
        finishing={reviewLocked}
        openNotes={review?.annotations.filter((item) => item.status === "open").length ?? 0}
        onCopy={handoff.handoffAndCopy} onFinish={finishReview} onCancel={terminal.cancel}
      />
      {document != null && review != null ? (
        <Workspace
          document={document} review={review} selection={selection}
          sourceState={sourceState} comparison={comparison}
          form={form} summary={summary}
          exportMarkdown={exportQuery.data?.markdown ?? ""}
          exportLoading={exportQuery.isLoading || exportQuery.isFetching}
          saving={reviewLocked} terminalPending={terminal.pending}
          onSelection={selectLines}
          onFormChange={updateForm}
          onFormSubmit={addOrUpdateAnnotation}
          onFormReset={() => { window.getSelection()?.removeAllRanges(); resetDraft(NO_SELECTION, initialSelection) }}
          onSummaryChange={updateSummary}
          onSummarySave={() => saveReview(review, false, summaryRef.current)}
          onEditAnnotation={(annotation) => updateForm(formFromAnnotation(annotation))}
          onStatusAnnotation={setAnnotationStatus}
          onDeleteAnnotation={deleteAnnotation}
          onCopyExport={handoff.handoffAndCopy}
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
