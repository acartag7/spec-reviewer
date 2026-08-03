import { useRef } from "react"
import type { DiffRow, ReviewComparison, ReviewDocument, SelectionRange } from "@/api/types"
import { sourceTextForRange } from "@/lib/markdown-provenance"
import { selectionFromElement, selectionFromWindow } from "@/lib/selection-utils"
import { cn } from "@/lib/utils"

interface ChangesViewProps {
  comparison: ReviewComparison
  document: ReviewDocument
  selection: SelectionRange
  onSelect: (selection: SelectionRange) => void
}

export function ChangesView({ comparison, document, selection, onSelect }: ChangesViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  if (comparison.state === "unavailable") {
    return <EmptyChanges message={unavailableMessage(comparison.reason)} />
  }
  if (comparison.state === "too-large") {
    return <EmptyChanges message="Changes are too large to display safely." />
  }
  if (comparison.state === "unchanged") {
    return <EmptyChanges message={`No line-content changes since ${checkpointDescription(comparison.trigger)}.`} />
  }
  return (
    <div
      ref={containerRef}
      className="overflow-hidden border bg-card"
      role="region"
      aria-label={`Changes: ${comparison.added} added, ${comparison.removed} removed`}
      onMouseUp={() => {
        const next = selectionFromWindow(containerRef.current, document.lines)
        if (next == null) return
        suppressClickRef.current = true
        onSelect(exactSourceSelection(next, document.lines))
      }}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          return
        }
        const next = selectionFromElement(event.target, document.lines)
        if (next != null) onSelect(next)
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
        <span className="font-medium">Changes since {checkpointDescription(comparison.trigger)} {formatCompletedAt(comparison.completedAt)}</span>
        <span className="font-mono">
          <span className="text-emerald-700 dark:text-emerald-300">+{comparison.added}</span>{" "}
          <span className="text-red-700 dark:text-red-300">−{comparison.removed}</span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-xs" aria-label="Unified line changes">
          <thead className="sr-only">
            <tr><th>Marker</th><th>Old line</th><th>New line</th><th>Text</th></tr>
          </thead>
          <tbody>{comparison.rows.map((row, index) => {
            const currentLine = currentLineForRow(row)
            return <ChangeRow
              key={`${index}-${row.kind}`}
              row={row}
              selected={currentLine != null && selection.lineStart <= currentLine && selection.lineEnd >= currentLine}
              onSelect={onSelect}
              document={document}
            />
          })}</tbody>
        </table>
      </div>
    </div>
  )
}

export function changesTabLabel(comparison: ReviewComparison): string {
  return comparison.state === "diff"
    ? `Changes, ${comparison.added} added, ${comparison.removed} removed`
    : "Changes";
}

function ChangeRow({
  row,
  selected,
  onSelect,
  document,
}: {
  row: DiffRow
  selected: boolean
  onSelect: (selection: SelectionRange) => void
  document: ReviewDocument
}) {
  if (row.kind === "gap") {
    return (
      <tr className="border-y bg-muted/60 text-muted-foreground">
        <td colSpan={4} className="px-3 py-1.5 text-center" aria-label={`Collapsed gap: ${row.hiddenOld} old lines and ${row.hiddenNew} new lines hidden`}>
          ··· {row.hiddenOld} old / {row.hiddenNew} new lines hidden ···
        </td>
      </tr>
    )
  }
  if (row.kind === "no-newline") {
    return (
      <tr className="text-muted-foreground" aria-label="No newline at end of file">
        <td className="select-none px-2 py-0.5">\</td>
        <td /><td />
        <td className="px-2 py-0.5 italic">No newline at end of file</td>
      </tr>
    )
  }
  const marker = row.kind === "add" ? "+" : row.kind === "remove" ? "−" : " "
  const label = row.kind === "add"
    ? `Added, plus marker, new line ${row.newLine}`
    : row.kind === "remove"
      ? `Removed, minus marker, old line ${row.oldLine}`
      : `Context, old line ${row.oldLine}, new line ${row.newLine}`
  return (
    <tr
      className={cn(
        "border-b last:border-b-0",
        row.kind === "add" && "bg-emerald-100/80 dark:bg-emerald-950/50",
        row.kind === "remove" && "bg-red-100/80 dark:bg-red-950/50",
        selected && "shadow-[inset_3px_0_0_#2563eb] dark:shadow-[inset_3px_0_0_#60a5fa]",
      )}
      aria-label={label}
      data-source-line={row.newLine ?? undefined}
      data-source-end-line={row.newLine ?? undefined}
      tabIndex={row.newLine == null ? undefined : 0}
      onKeyDown={(event) => {
        if (event.key === "Enter" && row.newLine != null) {
          onSelect(selectionForLine(document.lines, row.newLine))
        }
      }}
    >
      <td className="w-8 select-none border-r px-2 py-0.5 text-center font-bold" aria-hidden="true">{marker}</td>
      <LineNumber value={row.oldLine} />
      <LineNumber value={row.newLine} />
      <td className="whitespace-pre px-2 py-0.5 [unicode-bidi:isolate]" dir="ltr">{visibleDiffText(row.text)}</td>
    </tr>
  )
}

function LineNumber({ value }: { value: number | null }) {
  return <td className="w-12 select-none border-r px-2 py-0.5 text-right text-muted-foreground" aria-hidden="true">{value ?? ""}</td>
}

function EmptyChanges({ message }: { message: string }) {
  return <div className="border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{message}</div>
}

function unavailableMessage(reason: Extract<ReviewComparison, { state: "unavailable" }>["reason"]): string {
  if (reason === "immutable-upload") return "Uploaded documents do not have a mutable review baseline."
  if (reason === "baseline-unavailable") return "The latest review checkpoint is unavailable or invalid."
  return "Copy feedback or finish the review to create a comparison baseline."
}

function formatCompletedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "at the latest checkpoint" : `at ${date.toLocaleString()}`
}

function checkpointDescription(trigger: "handoff" | "finish" | undefined): string {
  return trigger === "handoff" ? "feedback was copied" : "the review was finished"
}

function visibleDiffText(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0)
    if (codePoint == null || !isObscuringControl(codePoint)) return character
    const point = codePoint?.toString(16).toUpperCase().padStart(4, "0") ?? "????"
    return `[U+${point}]`
  }).join("")
}

function isObscuringControl(codePoint: number): boolean {
  return codePoint <= 0x08
    || codePoint === 0x0b
    || codePoint === 0x0c
    || codePoint === 0x0d
    || (codePoint >= 0x0e && codePoint <= 0x1f)
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || codePoint === 0xad
    || codePoint === 0x61c
    || codePoint === 0x180e
    || codePoint === 0x200b
    || codePoint === 0x200e
    || codePoint === 0x200f
    || (codePoint >= 0x2028 && codePoint <= 0x202e)
    || (codePoint >= 0x2060 && codePoint <= 0x2064)
    || (codePoint >= 0x2066 && codePoint <= 0x206f)
    || codePoint === 0xfeff
    || (codePoint >= 0xe0000 && codePoint <= 0xe007f)
}

function exactSourceSelection(selection: SelectionRange, lines: ReviewDocument["lines"]): SelectionRange {
  return {
    ...selection,
    selectedText: sourceTextForRange(lines, selection.lineStart, selection.lineEnd),
  }
}

function selectionForLine(lines: ReviewDocument["lines"], line: number): SelectionRange {
  return { lineStart: line, lineEnd: line, selectedText: sourceTextForRange(lines, line, line) }
}

function currentLineForRow(row: DiffRow): number | null {
  return row.kind === "gap" || row.kind === "no-newline" ? null : row.newLine
}
