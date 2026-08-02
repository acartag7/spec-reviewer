import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError, publicError } from "../../domain/errors.ts";
import { secureHeaders } from "./security.ts";

const maxJsonBytes = 3 * 1024 * 1024;

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxJsonBytes) throw new AppError("invalid_request", 400, "JSON body is too large");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("invalid_json", 400, "JSON body is malformed");
  }
}

export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, secureHeaders({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  }));
  res.end(`${body}\n`);
}

export function sendError(res: ServerResponse, error: unknown): void {
  const response = publicError(error);
  sendJson(res, response.status, response.body);
}
