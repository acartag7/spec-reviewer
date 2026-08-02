import { constants, type Stats } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { AppError } from "../domain/errors.ts";

const allowedFailureCodes = new Set([
  "EACCES",
  "EEXIST",
  "EIO",
  "EMFILE",
  "ENFILE",
  "ENOENT",
  "ENOSPC",
  "EPERM",
  "EROFS",
  "storage_path_unsafe",
  "storage_write_failed",
]);

export async function atomicWritePrivateFile(directory: string, destination: string, content: string): Promise<void> {
  await ensurePrivateDirectory(directory);
  const temporary = join(directory, `.${basename(destination)}.${randomUUID()}.tmp`);
  let renamed = false;
  try {
    const handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(content, { encoding: "utf8" });
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
    renamed = true;
    await syncDirectory(directory);
  } catch (error) {
    if (renamed) {
      throw new AppError(
        "storage_commit_indeterminate",
        500,
        "Storage directory sync failed after replacement; reload the record before retrying",
      );
    }
    await cleanupTemporary(temporary, error);
  }
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    assertRealDirectory(info);
    await chmod(directory, 0o700);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("storage_path_unsafe", 500, "Storage directory is unavailable or unsafe");
  }
}

function assertRealDirectory(info: Stats): void {
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new AppError("storage_path_unsafe", 500, "Storage path must be a real directory");
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function cleanupTemporary(temporary: string, primary: unknown): Promise<never> {
  try {
    await rm(temporary, { force: true });
  } catch {
    throw new AppError(
      "storage_cleanup_failed",
      500,
      "Storage write failed and temporary-file cleanup also failed",
      { primary: errorCode(primary) },
    );
  }
  if (primary instanceof AppError) throw primary;
  throw new AppError("storage_write_failed", 500, "Storage write failed before replacement");
}

function errorCode(error: unknown): string {
  if (error instanceof AppError) return allowedFailureCodes.has(error.code) ? error.code : "unknown";
  try {
    if (typeof error === "object" && error != null && "code" in error && typeof error.code === "string") {
      return allowedFailureCodes.has(error.code) ? error.code : "unknown";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}
