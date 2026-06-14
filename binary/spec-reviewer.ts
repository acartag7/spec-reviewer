import app from "../dist/index.html";
import { loadConfig, type AppConfig } from "../src/config.ts";
import { createReviewerService } from "../src/application/app-factory.ts";
import { ReviewSessionWaiter, type ReviewCompletion } from "../src/application/review-session.ts";
import { secureHeaders } from "../src/interfaces/http/security.ts";
import { readUpload, storeUploadedMarkdown } from "../src/interfaces/http/uploads.ts";
import { openUrl } from "../src/cli/open-url.ts";

const maxJsonBytes = 3 * 1024 * 1024;
type BunServer = ReturnType<typeof Bun.serve>;

async function main(): Promise<number> {
  try {
    const config = loadConfig();
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
    await server.stop(true);
    await assetServer.stop(true);
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
    return json(errorPayload(error), errorStatus(error));
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
    return json(await service.saveReview(readDraft(await readJson(request))));
  }
  if (request.method === "GET" && url.pathname === "/api/export") {
    return json(await service.exportReview(requirePath(url)));
  }
  if (request.method === "POST" && url.pathname === "/api/session/finish") {
    if (waitSession == null) return json({ error: { message: "No waiting review session" } }, 409);
    const { path } = readSessionAction(await readJson(request));
    const { markdown } = await service.exportReview(path);
    return json(waitSession.finish(path, markdown));
  }
  if (request.method === "POST" && url.pathname === "/api/session/cancel") {
    if (waitSession == null) return json({ error: { message: "No waiting review session" } }, 409);
    const action = readSessionAction(await readJson(request));
    return json(waitSession.cancel(action.path, action.reason));
  }
  return json({ error: { message: "Not found" } }, 404);
}

async function fetchAsset(assetServer: BunServer, url: URL): Promise<Response> {
  const target = new URL(url.pathname === "/" ? "/" : url.pathname, assetServer.url);
  target.search = url.search;
  const response = await fetch(target);
  if (response.status !== 404 || isAssetPath(url.pathname)) return withSecurityHeaders(response);
  return withSecurityHeaders(await fetch(new URL("/", assetServer.url)));
}

async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxJsonBytes) throw new Error("JSON body is too large");
  return raw.trim() === "" ? {} : JSON.parse(raw);
}

function readDraft(value: unknown): { path: string; summary?: unknown; annotations?: unknown } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("request body must be an object");
  const record = value as Record<string, unknown>;
  if (typeof record.path !== "string" || record.path.trim() === "") throw new Error("path is required");
  return { path: record.path, summary: record.summary, annotations: record.annotations };
}

function readSessionAction(value: unknown): { path: string; reason: string | null } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("request body must be an object");
  const record = value as Record<string, unknown>;
  if (typeof record.path !== "string" || record.path.trim() === "") throw new Error("path is required");
  const reason = typeof record.reason === "string" && record.reason.trim() !== "" ? record.reason.trim() : null;
  return { path: record.path, reason };
}

function requirePath(url: URL): string {
  const path = url.searchParams.get("path");
  if (path == null || path.trim() === "") throw new Error("path is required");
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
  if (config.defaultDocumentPath != null) out.write(`Default document: ${config.defaultDocumentPath}\n`);
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
  if (config.jsonOutput) console.log(JSON.stringify(completion));
  else console.log(completion.markdown);
  return 0;
}

function errorPayload(error: unknown): { error: { message: string } } {
  return { error: { message: error instanceof Error ? error.message : String(error) } };
}

function errorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("not found") || message.includes("ENOENT") ? 404 : 400;
}

main().then((code) => {
  if (code !== 0) process.exitCode = code;
});
