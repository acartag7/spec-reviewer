export type ReviewCompletion =
  | { status: "finished"; path: string; markdown: string; openAnnotations: number; carriedOver: number; activeMs: number }
  | { status: "canceled"; path: string; reason: string | null; activeMs: number };

export class ReviewSessionWaiter {
  private readonly waitPromise: Promise<ReviewCompletion>;
  private resolveWait!: (completion: ReviewCompletion) => void;
  private completion: ReviewCompletion | null = null;
  readonly path: string;

  constructor(path: string) {
    this.path = path;
    this.waitPromise = new Promise((resolve) => {
      this.resolveWait = resolve;
    });
  }

  get status(): "waiting" | ReviewCompletion["status"] {
    return this.completion?.status ?? "waiting";
  }

  wait(): Promise<ReviewCompletion> {
    return this.waitPromise;
  }

  finish(path: string, markdown: string, openAnnotations = 0, carriedOver = 0, activeMs = 0): ReviewCompletion {
    return this.complete({ status: "finished", path, markdown, openAnnotations, carriedOver, activeMs });
  }

  cancel(path: string, reason: string | null, activeMs = 0): ReviewCompletion {
    return this.complete({ status: "canceled", path, reason, activeMs });
  }

  private complete(completion: ReviewCompletion): ReviewCompletion {
    if (this.completion != null) return this.completion;
    this.completion = completion;
    setTimeout(() => this.resolveWait(completion), 0);
    return completion;
  }
}
