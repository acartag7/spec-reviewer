import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { api, recordActiveTime } from "@/api/client"
import type { Annotation, OpenDocumentResult, Review, ReviewDocument, ReviewSourceState, SelectionRange } from "@/api/types"
import { StartScreen } from "@/components/StartScreen"
import { SessionOutcomeScreen } from "@/components/SessionOutcomeScreen"
import { StatusToast } from "@/components/StatusToast"
import { TopBar } from "@/components/TopBar"
import { Workspace } from "@/components/Workspace"
import { createAnnotation, emptyForm, formFromAnnotation, removeAnnotation, upsertAnnotation } from "@/lib/review-utils"
import type { AnnotationFormValue } from "@/lib/review-utils"
import { isMarkdownFile } from "@/lib/path-utils"
import { useActiveReviewTime } from "@/lib/use-active-review-time"

const initialSelection: SelectionRange = { lineStart: 1, lineEnd: 1, selectedText: "" }

export function ReviewerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const timeoutRef = useRef<number | null>(null)
  const requestedPath = searchParams.get("path") ?? ""
  const [document, setDocument] = useState<ReviewDocument | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [selection, setSelection] = useState<SelectionRange>(initialSelection)
  const [form, setForm] = useState<AnnotationFormValue>(() => emptyForm(initialSelection))
  const [sourceState, setSourceState] = useState<ReviewSourceState>("unreviewed")
  const [status, setStatus] = useState("")
  const [sessionOutcome, setSessionOutcome] = useState<{ outcome: "finished" | "canceled"; openAnnotations: number; carriedOver: number; activeMs: number } | null>(null)

  const showStatus = useCallback((message: string) => {
    setStatus(message)
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setStatus(""), 1800)
  }, [])

  const { flush: flushActiveTime } = useActiveReviewTime({
    digest: document?.digest ?? null, path: document?.path ?? null,
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
    const nextSelection = { lineStart: 1, lineEnd: 1, selectedText: "" }
    setDocument(result.document)
    setReview(result.review)
    setSelection(nextSelection)
    setForm(emptyForm(nextSelection))
    setSourceState(result.sourceState ?? (result.stale ? "changed" : "current"))
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
    mutationFn: (nextReview: Review) => {
      if (document == null) throw new Error("Open a document first")
      return api.saveReview({
        path: document.path,
        summary: nextReview.summary,
        annotations: nextReview.annotations,
        activeMsDelta: flushActiveTime(),
      })
    },
    onSuccess: (saved) => {
      setReview(saved)
      setSourceState((state) => (state === "changed" ? "changed" : "current"))
      void queryClient.invalidateQueries({ queryKey: ["reviews"] })
      void queryClient.invalidateQueries({ queryKey: ["export", document?.path] })
      showStatus("Saved")
    },
    onError: (error) => showStatus(error instanceof Error ? error.message : String(error)),
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
      if (document == null) throw new Error("Open a document first")
      return api.finishReview(document.path, activeMsDelta)
    },
    onSuccess: (completion) => {
      if (completion.status === "finished") setSessionOutcome({ outcome: "finished", openAnnotations: completion.openAnnotations, carriedOver: completion.carriedOver, activeMs: completion.activeMs })
    },
    onError: (error) => showStatus(error instanceof Error ? error.message : String(error)),
  })

  const cancelMutation = useMutation({
    mutationFn: (activeMsDelta: number) => {
      if (document == null) throw new Error("Open a document first")
      return api.cancelReview(document.path, activeMsDelta)
    },
    onSuccess: (completion) => {
      if (completion.status === "canceled") setSessionOutcome({ outcome: "canceled", openAnnotations: 0, carriedOver: 0, activeMs: completion.activeMs })
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

  function selectLines(nextSelection: SelectionRange) {
    setSelection(nextSelection)
    setForm((current) => ({
      ...current,
      lineStart: nextSelection.lineStart,
      lineEnd: nextSelection.lineEnd,
      selectedText: nextSelection.selectedText,
    }))
  }

  function saveReview(nextReview: Review) {
    setReview(nextReview)
    saveMutation.mutate(nextReview)
  }

  function addOrUpdateAnnotation() {
    if (review == null) return showStatus("Open a document first")
    const annotation = createAnnotation(form, selection)
    if (!annotation.note) return showStatus("Feedback is required")
    saveReview(upsertAnnotation(review, annotation))
    setForm(emptyForm(selection))
  }

  function deleteAnnotation(annotation: Annotation) {
    if (review == null) return
    saveReview(removeAnnotation(review, annotation.id))
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

  const canCopy = document != null
  const exportMarkdown = exportQuery.data?.markdown ?? ""
  const finishing = finishMutation.isPending || cancelMutation.isPending

  if (sessionOutcome != null) {
    return <SessionOutcomeScreen outcome={sessionOutcome.outcome} openAnnotations={sessionOutcome.openAnnotations} carriedOver={sessionOutcome.carriedOver} activeMs={sessionOutcome.activeMs} />
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopBar
        path={document?.path ?? requestedPath}
        sourceState={sourceState}
        canCopy={canCopy}
        waitForReview={configQuery.data?.waitForReview ?? false}
        finishing={finishing}
        onCopy={copyExport}
        onFinish={() => finishMutation.mutate(flushActiveTime())}
        onCancel={() => cancelMutation.mutate(flushActiveTime())}
      />
      {document != null && review != null ? (
        <Workspace
          document={document}
          review={review}
          selection={selection}
          sourceState={sourceState}
          form={form}
          exportMarkdown={exportMarkdown}
          exportLoading={exportQuery.isLoading || exportQuery.isFetching}
          saving={saveMutation.isPending}
          onSelection={selectLines}
          onFormChange={setForm}
          onFormSubmit={addOrUpdateAnnotation}
          onFormReset={() => setForm(emptyForm(selection))}
          onOpenAnnotation={(annotation) => scrollToLine(annotation.lineStart)}
          onEditAnnotation={(annotation) => setForm(formFromAnnotation(annotation))}
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

function scrollToLine(line: number) {
  const exact = window.document.querySelector(`[data-line="${line}"], [data-source-line="${line}"]`)
  const ranged = Array.from(window.document.querySelectorAll<HTMLElement>("[data-source-line][data-source-end-line]"))
    .find((element) => {
      const start = Number(element.dataset.sourceLine)
      const end = Number(element.dataset.sourceEndLine)
      return start <= line && end >= line
    })
  const target = exact ?? ranged
  target?.scrollIntoView({ block: "center", behavior: "smooth" })
}
