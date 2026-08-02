import { AppError } from "../domain/errors.ts";
import { randomUUID } from "node:crypto";

export interface TerminalAttempt {
  id: string;
  completedAt: string;
  activeMsDelta: unknown;
  confirmActiveTime(): void;
}

export type ReviewCompletion =
  | { status: "finished"; path: string; markdown: string; openAnnotations: number; carriedOver: number; activeMs: number }
  | { status: "canceled"; path: string; reason: string | null; activeMs: number };

let lastTerminalEpoch = 0;

export class ReviewSessionWaiter {
  private readonly waitPromise: Promise<ReviewCompletion>;
  private resolveWait!: (completion: ReviewCompletion) => void;
  private completion: ReviewCompletion | null = null;
  private terminalAttempt: Promise<ReviewCompletion> | null = null;
  private terminalIdentity: { id: string; completedAt: string } | null = null;
  private terminalDelta: unknown;
  private terminalDeltaClaimed = false;
  private terminalDeltaConfirmed = false;
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
    operation: (attempt: TerminalAttempt) => Promise<ReviewCompletion>,
  ): Promise<ReviewCompletion> {
    this.assertPath(path);
    if (this.completion != null) return Promise.resolve(this.completion);
    if (this.terminalAttempt != null) return this.terminalAttempt;
    const terminal = this.createTerminalAttempt(activeMsDelta);
    const attempt = Promise.resolve().then(() => operation(terminal)).then((completion) => {
      return this.complete(completion);
    });
    this.terminalAttempt = attempt;
    void attempt.catch(() => {
      if (this.terminalAttempt === attempt && this.completion == null) this.terminalAttempt = null;
    });
    return attempt;
  }

  private createTerminalAttempt(value: unknown): TerminalAttempt {
    if (this.terminalIdentity == null) {
      const epoch = Math.max(Date.now(), lastTerminalEpoch + 1);
      lastTerminalEpoch = epoch;
      this.terminalIdentity = {
        id: `${String(epoch).padStart(13, "0")}-${randomUUID().replaceAll("-", "")}`,
        completedAt: new Date(epoch).toISOString(),
      };
    }
    if (!this.terminalDeltaClaimed) {
      this.terminalDelta = value;
      this.terminalDeltaClaimed = true;
    }
    return {
      ...this.terminalIdentity,
      activeMsDelta: this.terminalDeltaConfirmed ? undefined : this.terminalDelta,
      confirmActiveTime: () => { this.terminalDeltaConfirmed = true; },
    };
  }

  private complete(completion: ReviewCompletion): ReviewCompletion {
    if (this.completion != null) return this.completion;
    this.completion = completion;
    setTimeout(() => this.resolveWait(completion), 0);
    return completion;
  }
}
