import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { loadConfig, type AppConfig } from "./config.ts";
import { createReviewerService } from "./application/app-factory.ts";
import { ReviewSessionWaiter, type ReviewCompletion } from "./application/review-session.ts";
import { createHttpServer } from "./interfaces/http/http-server.ts";
import { openUrl } from "./cli/open-url.ts";
import { runSkillCommand } from "./cli/skill-installer.ts";

export async function runCli(argv = process.argv.slice(2), env = process.env): Promise<number> {
  try {
    const config = loadConfig(argv, env);
    if (config.command === "skill") {
      return await runSkillCommand(config.skillArgs, env);
    }
    const service = createReviewerService(config);
    if (config.command === "sessions") {
      return await printSessions(config, service);
    }
    if (config.command === "open") {
      config.defaultDocumentPath = await service.documentPathForSession(config.sessionId ?? "");
    }
    const waitSession = config.waitForReview
      ? new ReviewSessionWaiter(config.defaultDocumentPath ?? "")
      : null;
    const staticDir = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
    const server = createHttpServer(config, service, staticDir, waitSession);
    await new Promise<void>((resolveListen) => server.listen(config.port, config.host, resolveListen));
    const port = serverPort(server.address());
    const url = reviewUrl(config, port);
    writeStartup(config, url);
    if (config.openBrowser) openUrl(url);
    if (waitSession == null) return 0;
    const completion = await waitSession.wait();
    server.close();
    return printCompletion(config, completion);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function serverPort(address: string | AddressInfo | null): number {
  if (address == null || typeof address === "string") throw new Error("Server did not expose a TCP port");
  return address.port;
}

function reviewUrl(config: AppConfig, port: number): string {
  const base = `http://${config.host}:${port}`;
  if (config.defaultDocumentPath == null) return base;
  return `${base}/?path=${encodeURIComponent(config.defaultDocumentPath)}`;
}

function writeStartup(config: AppConfig, url: string): void {
  const out = config.jsonOutput && config.waitForReview ? process.stderr : process.stdout;
  if (config.jsonOutput && !config.waitForReview) {
    out.write(`${JSON.stringify({ url, path: config.defaultDocumentPath })}\n`);
    return;
  }
  out.write(`Spec Reviewer running at ${url}\n`);
  if (config.defaultDocumentPath != null) out.write(`Default document: ${config.defaultDocumentPath}\n`);
}

async function printSessions(
  config: AppConfig,
  service: ReturnType<typeof createReviewerService>,
): Promise<number> {
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
    console.log(`${session.id}  ${session.updatedAt}  ${session.sourceState}  ${session.openAnnotations}/${session.annotations}  ${session.documentPath}`);
  }
  return 0;
}

function printCompletion(config: AppConfig, completion: ReviewCompletion): number {
  if (completion.status === "canceled") {
    if (config.jsonOutput) console.log(JSON.stringify(completion));
    else console.error("Review canceled");
    return 1;
  }
  if (config.jsonOutput) {
    console.log(JSON.stringify(completion));
  } else {
    console.log(completion.markdown);
  }
  return 0;
}
