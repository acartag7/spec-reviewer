import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { loadConfig, type AppConfig } from "./config.ts";
import { createReviewerService } from "./application/app-factory.ts";
import { ReviewSessionWaiter, type ReviewCompletion } from "./application/review-session.ts";
import { createHttpServer } from "./interfaces/http/http-server.ts";
import { openUrl } from "./cli/open-url.ts";
import { printCompletion, printSessions, reviewUrl, writeStartup } from "./cli/output.ts";
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
