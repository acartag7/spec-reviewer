import type { AppConfig } from "../config.ts";
import { FileDocumentReader } from "../infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../infrastructure/json-review-store.ts";
import { ReviewerService } from "./reviewer-service.ts";

export function createReviewerService(config: AppConfig): ReviewerService {
  return new ReviewerService(
    new FileDocumentReader(),
    new JsonReviewStore(config.storageDir),
  );
}
