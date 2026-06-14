import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadConfig } from "./config.ts";
import { ReviewerService } from "./application/reviewer-service.ts";
import { FileDocumentReader } from "./infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "./infrastructure/json-review-store.ts";
import { createHttpServer } from "./interfaces/http/http-server.ts";

const config = loadConfig();
const service = new ReviewerService(
  new FileDocumentReader(),
  new JsonReviewStore(config.storageDir),
);
const staticDir = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const server = createHttpServer(config, service, staticDir);

server.listen(config.port, config.host, () => {
  const url = `http://${config.host}:${config.port}`;
  console.log(`Spec Reviewer running at ${url}`);
  if (config.defaultDocumentPath != null) {
    console.log(`Default document: ${config.defaultDocumentPath}`);
  }
});
