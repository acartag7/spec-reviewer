import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, open, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { AppError, isErrno } from "../domain/errors.ts";
import { syncDirectory } from "./atomic-file.ts";

interface PublishOptions {
  temporaryToken?: string;
}

export async function publishPrivateFileNoReplace(
  directory: string,
  filename: string,
  content: string,
  options: PublishOptions = {},
): Promise<boolean> {
  if (basename(filename) !== filename || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(filename)) throw writeFailed();
  const token = options.temporaryToken ?? randomUUID();
  if (!/^[a-zA-Z0-9-]+$/.test(token)) throw writeFailed();
  const temporary = join(directory, `.${filename}.${token}.tmp`);
  const destination = join(directory, filename);
  let created = false;
  let linked = false;
  try {
    const handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    created = true;
    try {
      await handle.chmod(0o600);
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, destination);
      linked = true;
    } catch (error) {
      if (isErrno(error, "EEXIST")) return false;
      throw error;
    }
    await syncDirectory(directory);
    return true;
  } catch {
    if (linked) throw new AppError("storage_commit_indeterminate", 500, "Review round commit is indeterminate; reload before retrying");
    throw writeFailed();
  } finally {
    if (created) {
      try {
        await rm(temporary, { force: true });
        if (linked) await syncDirectory(directory);
      } catch {
        if (linked) throw new AppError("storage_commit_indeterminate", 500, "Review round committed but temporary cleanup failed");
        throw new AppError("storage_cleanup_failed", 500, "Review round write failed and temporary cleanup also failed");
      }
    }
  }
}

function writeFailed(): AppError {
  return new AppError(
    "storage_write_failed",
    500,
    "Review round write failed before commit; check storage permissions, free space, and same-directory hard-link support",
  );
}
