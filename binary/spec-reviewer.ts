import app from "../dist/index.html";
import { loadConfig, type AppConfig } from "../src/config.ts";
import { createReviewerService } from "../src/application/app-factory.ts";
import { ReviewSessionWaiter, type ReviewCompletion } from "../src/application/review-session.ts";
import { AppError, publicError } from "../src/domain/errors.ts";
import { secureHeaders } from "../src/interfaces/http/security.ts";
import { readActiveTime, readReviewDraft, readSessionAction } from "../src/interfaces/http/actions.ts";
import { readUpload, storeUploadedMarkdown } from "../src/interfaces/http/uploads.ts";
import { openUrl } from "../src/cli/open-url.ts";
import { runSkillCommand } from "../src/cli/skill-installer.ts";

const maxJsonBytes = 3 * 1024 * 1024;
type BunServer = ReturnType<typeof Bun.serve>;
async function main(): Promise<number> {
  try {
    const config = loadConfig();
    if (config.command === "skill") {
      return await runSkillCommand(config.skillArgs);
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
    const assetServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      routes: { "/": app },
      fetch: () => text("Not found", 404),
    });
    const server = Bun.serve({
      hostname: config.host,
      port: config.port,
      fetch: (request, activeServer) => {
        return routeRequest(request, activeServer.port, config, service, waitSession, assetServer);
      },
    });
    const url = reviewUrl(config, server.port);
    writeStartup(config, url);
    if (config.openBrowser) openUrl(url);
    if (waitSession == null) return 0;
    const completion = await waitSession.wait();
    await server.stop(false);
    await assetServer.stop(false);
    return printCompletion(config, completion);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function routeRequest(
  request: Request,
  port: number,
  config: AppConfig,
  service: ReturnType<typeof createReviewerService>,
  waitSession: ReviewSessionWaiter | null,
  assetServer: BunServer,
): Promise<Response> {
  if (!isSafeRequest(request, port)) return text("Forbidden", 403);
  const url = new URL(request.url);
  try {
    if (url.pathname.startsWith("/api/")) {
      return await routeApi(request, url, config, service, waitSession);
    }
    return await fetchAsset(assetServer, url);
  } catch (error) {
    const response = publicError(error);
    return json(response.body, response.status);
  }
}

async function routeApi(
  request: Request,
  url: URL,
  config: AppConfig,
  service: ReturnType<typeof createReviewerService>,
  waitSession: ReviewSessionWaiter | null,
): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true });
  if (request.method === "GET" && url.pathname === "/api/config") {
    return json({ defaultDocumentPath: config.defaultDocumentPath, waitForReview: waitSession != null });
  }
  if (request.method === "GET" && url.pathname === "/api/session") {
    return json({ waitForReview: waitSession != null, status: waitSession?.status ?? "inactive" });
  }
  if (request.method === "GET" && url.pathname === "/api/reviews") return json(await service.listRecentReviews());
  if (request.method === "GET" && url.pathname === "/api/document") {
    return json(await service.openDocument(requirePath(url)));
  }
  if (request.method === "POST" && url.pathname === "/api/document-upload") {
    const upload = readUpload(await readJson(request));
    const path = await storeUploadedMarkdown(config.storageDir, upload.name, upload.content);
    return json(await service.openDocument(path));
  }
  if (request.method === "POST" && url.pathname === "/api/review") {
    return json(await service.saveReview(readReviewDraft(await readJson(request))));
  }
  if (request.method === "GET" && url.pathname === "/api/export") {
    return json(await service.exportReview(requirePath(url)));
  }
  if (request.method === "POST" && url.pathname === "/api/active-time") {
    const action = readActiveTime(await readJson(request));
    await service.addActiveTime(action.path, action.activeMsDelta);
    return json({ ok: true });
  }
  if (request.method === "POST" && url.pathname === "/api/session/finish") {
    if (waitSession == null) throw new AppError("invalid_request", 409, "No waiting review session");
    const action = readSessionAction(await readJson(request));
    const path = service.resolveDocumentPath(action.path);
    return json(await waitSession.runTerminal(path, action.activeMsDelta, async (terminal) => {
      const exported = await service.finishReview(path, terminal);
      return { status: "finished" as const, path, ...exported };
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/session/cancel") {
    if (waitSession == null) throw new AppError("invalid_request", 409, "No waiting review session");
    const action = readSessionAction(await readJson(request));
    const path = service.resolveDocumentPath(action.path);
    return json(await waitSession.runTerminal(path, action.activeMsDelta, async (terminal) => {
      const activeMs = await service.cancelReview(path, terminal);
      return { status: "canceled" as const, path, reason: action.reason, activeMs };
    }));
  }
  throw new AppError("not_found", 404, "Not found");
}

async function fetchAsset(assetServer: BunServer, url: URL): Promise<Response> {
  const target = new URL(url.pathname === "/" ? "/" : url.pathname, assetServer.url);
  target.search = url.search;
  const response = await fetch(target);
  if (response.status !== 404 || isAssetPath(url.pathname)) return withSecurityHeaders(response);
  return withSecurityHeaders(await fetch(new URL("/", assetServer.url)));
}

async function readJson(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared != null && Number(declared) > maxJsonBytes) {
    throw new AppError("invalid_request", 400, "JSON body is too large");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader != null) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxJsonBytes) throw new AppError("invalid_request", 400, "JSON body is too large");
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("invalid_json", 400, "JSON body is malformed");
  }
}

function requirePath(url: URL): string {
  const path = url.searchParams.get("path");
  if (path == null || path.trim() === "") throw new AppError("invalid_request", 400, "path is required");
  return path;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: secureHeaders({ "cache-control": "no-store" }) });
}

function text(value: string, status: number): Response {
  return new Response(value, { status, headers: secureHeaders({ "content-type": "text/plain; charset=utf-8" }) });
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(secureHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isSafeRequest(request: Request, port: number): boolean {
  const host = parseHttpUrl(`http://${request.headers.get("host") ?? ""}`);
  if (host == null || !isLoopback(host.hostname) || portFor(host) !== String(port)) return false;
  const originHeader = request.headers.get("origin");
  if (originHeader == null) return true;
  const origin = parseHttpUrl(originHeader);
  return origin != null && origin.protocol === "http:" && isLoopback(origin.hostname) && portFor(origin) === String(port);
}

function parseHttpUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function portFor(url: URL): string {
  return url.port || "80";
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isAssetPath(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
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
}

async function printSessions(config: AppConfig, service: ReturnType<typeof createReviewerService>): Promise<number> {
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

function printCompletion(config: AppConfig, completion: ReviewCompletion): number {
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

main().then((code) => {
  if (code !== 0) process.exitCode = code;
});
