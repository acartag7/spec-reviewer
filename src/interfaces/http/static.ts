import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";
import { secureHeaders } from "./security.ts";

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
]);

export async function serveStatic(pathname: string, publicDir: string, res: ServerResponse): Promise<void> {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const root = resolve(publicDir);
  let filePath = resolve(join(root, relative));
  if (!filePath.startsWith(`${root}/`) && filePath !== root) {
    res.writeHead(403, secureHeaders({ "content-type": "text/plain; charset=utf-8" }));
    res.end("Forbidden");
    return;
  }

  try {
    await sendFile(filePath, res);
  } catch {
    if (isSpaRoute(relative)) {
      filePath = resolve(join(root, "index.html"));
      try {
        await sendFile(filePath, res);
        return;
      } catch {
        // Fall through to the plain static 404 below.
      }
    }
    res.writeHead(404, secureHeaders({ "content-type": "text/plain; charset=utf-8" }));
    res.end("Not found");
  }
}

async function sendFile(filePath: string, res: ServerResponse): Promise<void> {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error("Not a file");
  res.writeHead(200, secureHeaders({
    "content-type": types.get(extname(filePath)) ?? "application/octet-stream",
    "cache-control": "no-store",
  }));
  createReadStream(filePath).pipe(res);
}

function isSpaRoute(relative: string): boolean {
  return relative === "index.html" || extname(relative) === "";
}
