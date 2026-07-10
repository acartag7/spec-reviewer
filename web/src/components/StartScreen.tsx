import { useEffect, useRef, useState } from "react"
import { ArrowRight, FileCheck2, FolderOpen, LockKeyhole, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { RecentReview } from "@/api/types"
import { shortDate, sourceStateLabel } from "@/lib/path-utils"
import { cn, formatActiveDuration } from "@/lib/utils"

interface StartScreenProps {
  defaultPath: string
  reviews: RecentReview[]
  loadingReviews: boolean
  onOpenPath: (path: string) => void
  onOpenFile: (file: File) => void
}

export function StartScreen({
  defaultPath,
  reviews,
  loadingReviews,
  onOpenPath,
  onOpenFile,
}: StartScreenProps) {
  const [path, setPath] = useState(defaultPath)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (path === "" && defaultPath !== "") setPath(defaultPath)
  }, [defaultPath, path])

  return (
    <main className="mx-auto grid min-h-[calc(100dvh-2.5rem)] w-full max-w-6xl items-center gap-8 p-6 lg:grid-cols-[minmax(420px,1fr)_360px] lg:p-10">
      <section
        className={cn(
          "flex min-h-[25rem] flex-col justify-center gap-5 p-4 sm:p-8",
          dragging && "rounded-xl bg-accent/50",
        )}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files.item(0)
          if (file != null) onOpenFile(file)
        }}
      >
        <div className="grid gap-4">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileCheck2 className="size-5" />
          </span>
          <div className="grid gap-2">
            <h1 className="max-w-xl font-heading text-3xl font-semibold tracking-tight">Review a Markdown spec</h1>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground">
              Read the rendered document, anchor feedback to source lines, and return one clean handoff to the agent.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-background px-2.5 py-1">Local only</span>
            <span className="rounded-full border bg-background px-2.5 py-1">Source anchored</span>
            <span className="rounded-full border bg-background px-2.5 py-1">Agent ready</span>
          </div>
        </div>
        <form
          className="flex flex-col gap-1 rounded-lg border bg-card p-1 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            onOpenPath(path.trim())
          }}
        >
          <Input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
            placeholder="~/project/specs/plan.md"
            autoComplete="off"
          />
          <Button type="submit" size="lg">
            <FolderOpen />
            Open path
            <ArrowRight />
          </Button>
        </form>
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" asChild>
            <label>
              <Upload />
              Choose Markdown file
              <input
                ref={fileInput}
                type="file"
                accept=".md,.markdown"
                hidden
                onChange={() => {
                  const file = fileInput.current?.files?.item(0)
                  if (file != null) onOpenFile(file)
                  if (fileInput.current != null) fileInput.current.value = ""
                }}
              />
            </label>
          </Button>
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><LockKeyhole className="size-3.5" /> Files stay on this machine</span>
        </div>
      </section>
      <Card className="min-h-80 rounded-xl bg-card shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">Recent reviews <Badge variant="secondary">{reviews.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          <RecentReviews reviews={reviews} loading={loadingReviews} onOpenPath={onOpenPath} />
        </CardContent>
      </Card>
    </main>
  )
}

function RecentReviews({
  reviews,
  loading,
  onOpenPath,
}: {
  reviews: RecentReview[]
  loading: boolean
  onOpenPath: (path: string) => void
}) {
  if (loading) return <div className="text-sm text-muted-foreground">Loading reviews...</div>
  if (reviews.length === 0) return <div className="text-sm text-muted-foreground">No saved reviews yet.</div>
  return (
    <div className="grid gap-2">
      {reviews.map((review) => (
        <button
          key={review.documentPath}
          type="button"
          className="group grid gap-2 rounded-lg border border-transparent bg-muted/45 p-3 text-left transition hover:border-border hover:bg-muted/70"
          onClick={() => onOpenPath(review.documentPath)}
        >
          <span className="flex items-center justify-between gap-3 font-medium">{review.title}<ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" /></span>
          <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <Badge variant="outline" className="capitalize">{sourceStateLabel(review.sourceState)}</Badge>
            {review.openAnnotations} open / {review.annotations} total
            {review.activeMs > 0 ? <span>{formatActiveDuration(review.activeMs)}</span> : null}
            <span>{shortDate(review.updatedAt)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
