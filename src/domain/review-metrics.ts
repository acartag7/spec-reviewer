export interface ReviewMetrics {
  activeMs: number;
}

export const MAX_ACTIVE_MS = 1000 * 60 * 60 * 24 * 366;

export function normalizeActiveMsDelta(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string" && value.trim() === "") return 0;
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number < 0) return 0;
  if (number > MAX_ACTIVE_MS) return MAX_ACTIVE_MS;
  return Math.floor(number);
}

export function normalizeMetrics(previous: ReviewMetrics | undefined, delta: unknown): ReviewMetrics {
  const base = previous?.activeMs ?? 0;
  const total = base + normalizeActiveMsDelta(delta);
  return { activeMs: total > MAX_ACTIVE_MS ? MAX_ACTIVE_MS : total };
}
