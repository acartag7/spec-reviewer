import { useCallback, useRef, useState } from "react"
import type { Annotation, SelectionRange } from "@/api/types"
import { emptyForm, type AnnotationFormValue } from "@/lib/review-utils"

export function useReviewDraft(initialSelection: SelectionRange, initialFormSelection = initialSelection) {
  const [selection, setSelection] = useState(initialSelection)
  const selectionRef = useRef(selection)
  const [form, setForm] = useState<AnnotationFormValue>(() => emptyForm(initialFormSelection))
  const formRef = useRef(form)

  const updateSelection = useCallback((next: SelectionRange) => {
    selectionRef.current = next
    setSelection(next)
  }, [])
  const updateForm = useCallback((next: AnnotationFormValue) => {
    formRef.current = next
    setForm(next)
  }, [])
  const resetDraft = useCallback((next: SelectionRange, formSelection = next) => {
    updateSelection(next)
    updateForm(emptyForm(formSelection))
  }, [updateForm, updateSelection])
  const selectLines = useCallback((next: SelectionRange) => {
    updateSelection(next)
    updateForm({
      ...formRef.current,
      lineStart: next.lineStart,
      lineEnd: next.lineEnd,
      selectedText: next.selectedText,
    })
  }, [updateForm, updateSelection])
  const resetForm = useCallback(() => updateForm(emptyForm(selectionRef.current)), [updateForm])
  const clearSubmittedForm = useCallback((submittedForm: AnnotationFormValue, submittedSelection: SelectionRange) => {
    if (formRef.current === submittedForm && selectionRef.current === submittedSelection) {
      updateForm(emptyForm(submittedSelection))
    }
  }, [updateForm])
  const reconcileSavedAnnotation = useCallback((id: string, saved: Annotation | undefined, submitted: AnnotationFormValue) => {
    const current = formRef.current
    if (current.id !== id) return
    if (saved == null) {
      if (current === submitted) resetDraft(initialSelection, initialFormSelection)
    } else if (current.status === submitted.status) updateForm({ ...current, status: saved.status })
  }, [initialFormSelection, initialSelection, resetDraft, updateForm])

  return { selection, selectionRef, form, formRef, updateForm, resetDraft, selectLines, resetForm, clearSubmittedForm, reconcileSavedAnnotation }
}
