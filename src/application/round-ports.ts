import type { ReviewRound, RoundBaseline } from "../domain/review-round.ts";

export interface ReviewRoundStore {
  loadLatest(documentPath: string): Promise<RoundBaseline>;
  loadCommitted(documentPath: string, roundId: string): Promise<ReviewRound | null>;
  commit(round: ReviewRound): Promise<ReviewRound | null>;
}
