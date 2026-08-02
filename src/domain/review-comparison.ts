export type ComparisonUnavailableReason = "no-baseline" | "baseline-unavailable" | "immutable-upload";

export type DiffRow =
  | { kind: "context" | "add" | "remove"; oldLine: number | null; newLine: number | null; text: string }
  | { kind: "no-newline"; oldLine: null; newLine: null; text: "No newline at end of file" }
  | { kind: "gap"; hiddenOld: number; hiddenNew: number };

interface ComparedRound {
  roundId: string;
  completedAt: string;
  beforeDigest: string;
  afterDigest: string;
}

export type ReviewComparison =
  | { state: "unavailable"; reason: ComparisonUnavailableReason }
  | (ComparedRound & { state: "unchanged"; added: 0; removed: 0; rows: [] })
  | (ComparedRound & { state: "too-large"; added: null; removed: null; rows: [] })
  | (ComparedRound & { state: "diff"; added: number; removed: number; rows: DiffRow[] });
