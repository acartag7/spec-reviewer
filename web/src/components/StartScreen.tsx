import { useEffect, useRef, useState } from "react"
import { FolderOpen, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { RecentReview } from "@/api/types"
import { shortDate, sourceStateLabel } from "@/lib/path-utils"
import { cn } from "@/lib/utils"

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
    <main className="grid min-h-[calc(100dvh-3.5rem)] gap-5 p-5 lg:grid-cols-[minmax(340px,1.2fr)_minmax(280px,0.8fr)] lg:p-10">
      <section
        className={cn(
          "flex min-h-80 flex-col justify-center gap-5 rounded-lg border border-dashed bg-card p-8",
          dragging && "border-primary bg-muted",
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
        <div className="grid gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-normal">Review a Markdown spec</h1>
          <p className="text-sm text-muted-foreground">Drop a `.md` file here or open a local Markdown path.</p>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            onOpenPath(path.trim())
          }}
        >
          <Input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="~/project/.../README.md"
            autoComplete="off"
          />
          <Button type="submit">
            <FolderOpen />
            Open path
          </Button>
        </form>
        <div>
          <Button type="button" variant="outline" asChild>
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
        </div>
      </section>
      <Card className="min-h-80 rounded-lg">
        <CardHeader>
          <CardTitle>Recent Reviews</CardTitle>
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
          className="grid gap-1 rounded-lg border bg-background p-3 text-left hover:bg-muted"
          onClick={() => onOpenPath(review.documentPath)}
        >
          <span className="font-medium">{review.title}</span>
          <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <Badge variant="outline" className="capitalize">{sourceStateLabel(review.sourceState)}</Badge>
            {review.openAnnotations} open / {review.annotations} total
            <span>{shortDate(review.updatedAt)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
