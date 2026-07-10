import type { ReviewerService } from "../application/reviewer-service.ts";
import type { ReviewCompletion } from "../application/review-session.ts";
import type { AppConfig } from "../config.ts";

export function reviewUrl(config: AppConfig, port: number): string {
  const host = config.host.includes(":") && !config.host.startsWith("[") ? `[${config.host}]` : config.host;
  const base = `http://${host}:${port}`;
  if (config.defaultDocumentPath == null) return base;
  return `${base}/?path=${encodeURIComponent(config.defaultDocumentPath)}`;
}

export function writeStartup(config: AppConfig, url: string): void {
  const out = config.jsonOutput && config.waitForReview ? process.stderr : process.stdout;
  if (config.jsonOutput && !config.waitForReview) {
    out.write(`${JSON.stringify({ url, path: config.defaultDocumentPath })}\n`);
    return;
  }
  out.write(`Spec Reviewer running at ${url}\n`);
  if (config.defaultDocumentPath != null) out.write(`Default document: ${config.defaultDocumentPath}\n`);
}

export async function printSessions(config: AppConfig, service: ReviewerService): Promise<number> {
  const sessions = await service.listRecentReviews();
  if (config.jsonOutput) {
    console.log(JSON.stringify({ sessions }, null, 2));
    return 0;
  }
  if (sessions.length === 0) {
    console.log("No saved reviews.");
    return 0;
  }
  for (const session of sessions) {
    console.log(`${session.id}  ${session.updatedAt}  ${session.sourceState}  ${session.openAnnotations}/${session.annotations}  ${formatMs(session.activeMs)}  ${session.documentPath}`);
  }
  return 0;
}

export function printCompletion(config: AppConfig, completion: ReviewCompletion): number {
  if (completion.status === "canceled") {
    if (config.jsonOutput) console.log(JSON.stringify(completion));
    else console.error("Review canceled");
    return 1;
  }
  if (config.jsonOutput) console.log(JSON.stringify(completion));
  else console.log(completion.markdown);
  return 0;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}m`;
}
