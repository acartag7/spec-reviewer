import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppConfig } from "../../config.ts";

const csp = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  // Radix and Vite-generated CSS can emit inline style attributes for layout primitives.
  "style-src 'self' 'unsafe-inline'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");

const baseSecurityHeaders = {
  "content-security-policy": csp,
  "cross-origin-opener-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export function secureHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return { ...baseSecurityHeaders, ...headers };
}

export function rejectUnsafeRequest(req: IncomingMessage, res: ServerResponse, config: AppConfig): boolean {
  if (isSafeHost(req, config) && isSafeOrigin(req, config)) return false;
  res.writeHead(403, secureHeaders({ "content-type": "text/plain; charset=utf-8" }));
  res.end("Forbidden");
  return true;
}

function isSafeHost(req: IncomingMessage, config: AppConfig): boolean {
  const header = req.headers.host;
  if (header == null) return false;
  const parsed = parseHttpUrl(`http://${header}`);
  if (parsed == null) return false;
  return isLoopback(parsed.hostname) && portMatches(parsed, req, config);
}

function isSafeOrigin(req: IncomingMessage, config: AppConfig): boolean {
  const header = req.headers.origin;
  if (header == null) return true;
  const value = Array.isArray(header) ? header[0] : header;
  const parsed = parseHttpUrl(value);
  if (parsed == null || parsed.protocol !== "http:") return false;
  return isLoopback(parsed.hostname) && portMatches(parsed, req, config);
}

function parseHttpUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function portMatches(url: URL, req: IncomingMessage, config: AppConfig): boolean {
  const actual = String(req.socket.localPort ?? config.port);
  return (url.port || "80") === actual;
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
