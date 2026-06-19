import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AppConfig } from "../../config.ts";
import type { ReviewSessionWaiter } from "../../application/review-session.ts";
import type { ReviewerService } from "../../application/reviewer-service.ts";
import { readJson, sendError, sendJson } from "./json.ts";
import { rejectUnsafeRequest } from "./security.ts";
import { serveStatic } from "./static.ts";
import { readUpload, storeUploadedMarkdown } from "./uploads.ts";

export function createHttpServer(
  config: AppConfig,
  service: ReviewerService,
  publicDir: string,
  waitSession: ReviewSessionWaiter | null = null,
) {
  return createServer(async (req, res) => {
    try {
      if (rejectUnsafeRequest(req, res, config)) return;
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        await routeApi(req, res, url, config, service, waitSession);
        return;
      }
      await serveStatic(url.pathname, publicDir, res);
    } catch (error) {
      sendError(res, error);
    }
  });
}

async function routeApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  config: AppConfig,
  service: ReviewerService,
  waitSession: ReviewSessionWaiter | null,
): Promise<void> {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, {
      defaultDocumentPath: config.defaultDocumentPath,
      waitForReview: waitSession != null,
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/session") {
    sendJson(res, 200, { waitForReview: waitSession != null, status: waitSession?.status ?? "inactive" });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/reviews") {
    sendJson(res, 200, await service.listRecentReviews());
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/document") {
    sendJson(res, 200, await service.openDocument(requirePath(url)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/document-upload") {
    const upload = readUpload(await readJson(req));
    const path = await storeUploadedMarkdown(config.storageDir, upload.name, upload.content);
    sendJson(res, 200, await service.openDocument(path));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/review") {
    sendJson(res, 200, await service.saveReview(readDraft(await readJson(req))));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/export") {
    sendJson(res, 200, await service.exportReview(requirePath(url)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/active-time") {
    // Lightweight passive flush (tab close / document switch) — accumulates a delta WITHOUT a
    // draft, so it must NOT go through saveReview (which would wipe annotations). No wait session
    // required; addActiveTime is a no-op when nothing is stored yet.
    const action = readActiveTime(await readJson(req));
    await service.addActiveTime(action.path, action.activeMsDelta);
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/session/finish") {
    if (waitSession == null) {
      sendJson(res, 409, { error: { message: "No waiting review session" } });
      return;
    }
    const action = readSessionAction(await readJson(req));
    // Persist the final active-time delta before resolving. Guard on "waiting" so a second
    // finish (idempotent complete()) does not double-persist. addActiveTime preserves annotations.
    if (waitSession.status === "waiting" && action.activeMsDelta != null) {
      await service.addActiveTime(action.path, action.activeMsDelta);
    }
    const exported = await service.exportReview(action.path);
    sendJson(res, 200, waitSession.finish(action.path, exported.markdown, exported.openAnnotations, exported.carriedOver, exported.activeMs));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/session/cancel") {
    if (waitSession == null) {
      sendJson(res, 409, { error: { message: "No waiting review session" } });
      return;
    }
    const action = readSessionAction(await readJson(req));
    if (waitSession.status === "waiting" && action.activeMsDelta != null) {
      await service.addActiveTime(action.path, action.activeMsDelta);
    }
    const exported = await service.exportReview(action.path);
    sendJson(res, 200, waitSession.cancel(action.path, action.reason, exported.activeMs));
    return;
  }
  sendJson(res, 404, { error: { message: "Not found" } });
}

function requirePath(url: URL): string {
  const path = url.searchParams.get("path");
  if (path == null || path.trim() === "") throw new Error("path is required");
  return path;
}

function readDraft(value: unknown): { path: string; summary?: unknown; annotations?: unknown; activeMsDelta?: unknown } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("request body must be an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.path !== "string" || record.path.trim() === "") {
    throw new Error("path is required");
  }
  return { path: record.path, summary: record.summary, annotations: record.annotations, activeMsDelta: record.activeMsDelta };
}

function readSessionAction(value: unknown): { path: string; reason: string | null; activeMsDelta?: unknown } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("request body must be an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.path !== "string" || record.path.trim() === "") {
    throw new Error("path is required");
  }
  const reason = typeof record.reason === "string" && record.reason.trim() !== "" ? record.reason.trim() : null;
  return { path: record.path, reason, activeMsDelta: record.activeMsDelta };
}

function readActiveTime(value: unknown): { path: string; activeMsDelta: unknown } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("request body must be an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.path !== "string" || record.path.trim() === "") {
    throw new Error("path is required");
  }
  return { path: record.path, activeMsDelta: record.activeMsDelta };
}
