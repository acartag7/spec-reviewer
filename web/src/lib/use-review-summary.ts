import { useCallback, useRef, useState } from "react"

export function useReviewSummary() {
  const [summary, setSummary] = useState("")
  const summaryRef = useRef(summary)

  const updateSummary = useCallback((value: string) => {
    summaryRef.current = value
    setSummary(value)
  }, [])

  const settleSubmittedSummary = useCallback((submitted: string, saved: string) => {
    if (summaryRef.current === submitted) updateSummary(saved)
  }, [updateSummary])

  return { summary, summaryRef, updateSummary, settleSubmittedSummary }
}
