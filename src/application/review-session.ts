import { AppError } from "../domain/errors.ts";

export type ReviewCompletion =
  | { status: "finished"; path: string; markdown: string; openAnnotations: number; carriedOver: number; activeMs: number }
  | { status: "canceled"; path: string; reason: string | null; activeMs: number };

export class ReviewSessionWaiter {
  private readonly waitPromise: Promise<ReviewCompletion>;
  private resolveWait!: (completion: ReviewCompletion) => void;
  private completion: ReviewCompletion | null = null;
  private terminalAttempt: Promise<ReviewCompletion> | null = null;
  private terminalDeltaConsumed = false;
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

  assertPath(path: string): void {
    if (path !== this.path) {
      throw new AppError("session_path_mismatch", 400, "Path does not match the waiting review session");
    }
  }

  runTerminal(
    path: string,
    activeMsDelta: unknown,
    operation: (claimedDelta: unknown) => Promise<ReviewCompletion>,
  ): Promise<ReviewCompletion> {
    this.assertPath(path);
    if (this.completion != null) return Promise.resolve(this.completion);
    if (this.terminalAttempt != null) return this.terminalAttempt;
    const claimedDelta = this.claimTerminalDelta(activeMsDelta);
    const attempt = Promise.resolve().then(() => operation(claimedDelta)).then((completion) => {
      return this.complete(completion);
    });
    this.terminalAttempt = attempt;
    void attempt.catch(() => {
      if (this.terminalAttempt === attempt && this.completion == null) this.terminalAttempt = null;
    });
    return attempt;
  }

  finish(path: string, markdown: string, openAnnotations = 0, carriedOver = 0, activeMs = 0): ReviewCompletion {
    this.assertPath(path);
    return this.complete({ status: "finished", path, markdown, openAnnotations, carriedOver, activeMs });
  }

  cancel(path: string, reason: string | null, activeMs = 0): ReviewCompletion {
    this.assertPath(path);
    return this.complete({ status: "canceled", path, reason, activeMs });
  }

  private claimTerminalDelta(value: unknown): unknown {
    if (value == null || this.terminalDeltaConsumed) return undefined;
    this.terminalDeltaConsumed = true;
    return value;
  }

  private complete(completion: ReviewCompletion): ReviewCompletion {
    if (this.completion != null) return this.completion;
    this.completion = completion;
    setTimeout(() => this.resolveWait(completion), 0);
    return completion;
  }
}
