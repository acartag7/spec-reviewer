import { useCallback, useRef, useState } from "react"
import type { SelectionRange } from "@/api/types"
import { emptyForm, type AnnotationFormValue } from "@/lib/review-utils"

export function useReviewDraft(initialSelection: SelectionRange) {
  const [selection, setSelection] = useState(initialSelection)
  const selectionRef = useRef(selection)
  const [form, setForm] = useState<AnnotationFormValue>(() => emptyForm(initialSelection))
  const formRef = useRef(form)

  const updateSelection = useCallback((next: SelectionRange) => {
    selectionRef.current = next
    setSelection(next)
  }, [])
  const updateForm = useCallback((next: AnnotationFormValue) => {
    formRef.current = next
    setForm(next)
  }, [])
  const resetDraft = useCallback((next: SelectionRange) => {
    updateSelection(next)
    updateForm(emptyForm(next))
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

  return { selection, selectionRef, form, formRef, updateForm, resetDraft, selectLines, resetForm, clearSubmittedForm }
}
