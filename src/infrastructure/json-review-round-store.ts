import { constants } from "node:fs";
import { lstat, open, readdir, rm, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import type { ReviewRoundStore } from "../application/round-ports.ts";
import { AppError, isErrno } from "../domain/errors.ts";
import { pathKey } from "../domain/ids.ts";
import {
  MAX_ROUNDS_PER_DOCUMENT,
  MAX_STORED_ROUND_BYTES,
  ROUND_ID_PATTERN,
  type ReviewRound,
  type RoundBaseline,
} from "../domain/review-round.ts";
import { parseStoredRound } from "../domain/stored-round.ts";
import { ensurePrivateChildDirectory, ensurePrivateDirectory, syncDirectory } from "./atomic-file.ts";
import { publishPrivateFileNoReplace } from "./immutable-private-file.ts";

export class JsonReviewRoundStore implements ReviewRoundStore {
  private readonly storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
  }

  async loadLatest(documentPath: string): Promise<RoundBaseline> {
    if (this.isImmutableUpload(documentPath)) return { state: "none", reason: "immutable-upload" };
    try {
      const directory = await this.existingRoundDirectory(documentPath);
      if (directory == null) return { state: "none", reason: "no-baseline" };
      const names = finalRoundNames(await readdir(directory));
      if (names.length === 0) return { state: "none", reason: "no-baseline" };
      if (names.length > MAX_ROUNDS_PER_DOCUMENT) return { state: "unavailable", reason: "baseline-unavailable" };
      const latest = names.sort().at(-1);
      if (latest == null) return { state: "none", reason: "no-baseline" };
      return { state: "ready", round: await readRound(directory, latest, documentPath) };
    } catch {
      return { state: "unavailable", reason: "baseline-unavailable" };
    }
  }

  async loadCommitted(documentPath: string, roundId: string): Promise<ReviewRound | null> {
    if (!ROUND_ID_PATTERN.test(roundId)) throw corruptRound();
    const directory = await this.existingRoundDirectory(documentPath);
    if (directory == null) return null;
    return readCommittedRound(directory, roundId, documentPath);
  }

  async commit(input: ReviewRound): Promise<ReviewRound | null> {
    const requested = parseStoredRound(input);
    if (serializedRoundBytes(requested) > MAX_STORED_ROUND_BYTES) throw corruptRound();
    if (this.isImmutableUpload(requested.documentPath)) return null;
    const directory = await this.ensureRoundDirectory(requested.documentPath);
    const existing = await readCommittedRound(directory, requested.id, requested.documentPath);
    if (existing != null) return existing;
    const release = await acquireFinishLock(directory);
    let committed = false;
    try {
      const names = finalRoundNames(await readdir(directory));
      const afterLock = await readCommittedRound(directory, requested.id, requested.documentPath, names);
      if (afterLock != null) {
        committed = true;
        return afterLock;
      }
      if (names.length >= MAX_ROUNDS_PER_DOCUMENT) {
        throw new AppError("round_limit_reached", 409, "Review round limit reached; remove local history before retrying");
      }
      const round = monotonicRound(requested, names);
      const content = `${JSON.stringify(round, null, 2)}\n`;
      if (Buffer.byteLength(content, "utf8") > MAX_STORED_ROUND_BYTES) throw corruptRound();
      const published = await publishPrivateFileNoReplace(directory, `${round.id}.json`, content);
      if (!published) {
        const raced = await readCommittedRound(directory, requested.id, requested.documentPath);
        if (raced != null) {
          committed = true;
          return raced;
        }
        throw corruptRound();
      }
      committed = true;
      return round;
    } finally {
      await release(committed);
    }
  }

  private isImmutableUpload(documentPath: string): boolean {
    const relation = relative(join(this.storageDir, "documents"), documentPath);
    return relation !== "" && !relation.startsWith("..") && !isAbsolute(relation);
  }

  private async ensureRoundDirectory(documentPath: string): Promise<string> {
    await this.existingRoundDirectory(documentPath);
    await ensurePrivateDirectory(this.storageDir);
    const rounds = await ensurePrivateChildDirectory(this.storageDir, "rounds");
    return ensurePrivateChildDirectory(rounds, pathKey(documentPath));
  }

  private async existingRoundDirectory(documentPath: string): Promise<string | null> {
    const paths = [this.storageDir, join(this.storageDir, "rounds"), join(this.storageDir, "rounds", pathKey(documentPath))];
    try {
      for (const path of paths) await assertRealDirectoryPath(path);
      return paths[2] ?? null;
    } catch (error) {
      if (isErrno(error, "ENOENT")) return null;
      throw error instanceof AppError ? error : corruptRound();
    }
  }
}

function finalRoundNames(entries: string[]): string[] {
  const names = entries.filter((entry) => ROUND_ID_PATTERN.test(entry.replace(/\.json$/, "")) && entry.endsWith(".json"));
  const suffixes = new Set<string>();
  for (const name of names) {
    const suffix = ROUND_ID_PATTERN.exec(name.replace(/\.json$/, ""))?.[2];
    if (suffix == null || suffixes.has(suffix)) throw corruptRound();
    suffixes.add(suffix);
  }
  return names;
}

function serializedRoundBytes(round: ReviewRound): number {
  return Buffer.byteLength(`${JSON.stringify(round, null, 2)}\n`, "utf8");
}

function monotonicRound(round: ReviewRound, names: string[]): ReviewRound {
  const requested = ROUND_ID_PATTERN.exec(round.id);
  const latest = [...names].sort().at(-1);
  const latestMatch = latest == null ? null : ROUND_ID_PATTERN.exec(latest.replace(/\.json$/, ""));
  if (requested == null || (latest != null && latestMatch == null)) throw corruptRound();
  const requestedEpoch = Number(requested[1]);
  const latestEpoch = Number(latestMatch?.[1] ?? 0);
  const epoch = Math.max(requestedEpoch, latestEpoch + 1);
  if (epoch === requestedEpoch) return round;
  return parseStoredRound({
    ...round,
    id: `${String(epoch).padStart(13, "0")}-${requested[2]}`,
    completedAt: new Date(epoch).toISOString(),
  });
}

async function assertRealDirectoryPath(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new AppError("storage_path_unsafe", 500, "Storage directory is unavailable or unsafe");
  }
}

async function readCommittedRound(
  directory: string,
  requestedId: string,
  expectedPath: string,
  knownNames?: string[],
): Promise<ReviewRound | null> {
  const match = ROUND_ID_PATTERN.exec(requestedId);
  if (match == null) throw corruptRound();
  const suffix = `-${match[2]}.json`;
  const matches = (knownNames ?? finalRoundNames(await readdir(directory))).filter((name) => name.endsWith(suffix));
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw corruptRound();
  return readRound(directory, matches[0]!, expectedPath);
}

async function readRound(directory: string, filename: string, expectedPath: string): Promise<ReviewRound> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(join(directory, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || (info.mode & 0o777) !== 0o600 || info.size > MAX_STORED_ROUND_BYTES) throw corruptRound();
    const round = parseStoredRound(JSON.parse((await handle.readFile()).toString("utf8")));
    if (`${round.id}.json` !== filename || round.documentPath !== expectedPath) throw corruptRound();
    return round;
  } catch (error) {
    if (isErrno(error, "ENOENT")) throw error;
    throw error instanceof AppError ? error : corruptRound();
  } finally {
    await handle?.close();
  }
}

async function acquireFinishLock(directory: string): Promise<(committed: boolean) => Promise<void>> {
  const path = join(directory, ".finish.lock");
  let handle: FileHandle | undefined;
  let created = false;
  try {
    handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    created = true;
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => {});
    if (isErrno(error, "EEXIST")) {
      throw new AppError(
        "round_store_busy",
        409,
        "Another Finish may be active; if none is running, stop Spec Reviewer, remove the local .finish.lock file, and retry",
      );
    }
    if (created) {
      try {
        await rm(path);
        await syncDirectory(directory);
      } catch {
        throw new AppError("storage_cleanup_failed", 500, "Review round lock creation and cleanup both failed");
      }
    }
    throw new AppError("storage_write_failed", 500, "Review round lock could not be created");
  }
  return async (committed) => {
    try {
      await rm(path);
      await syncDirectory(directory);
    } catch {
      if (committed) {
        throw new AppError("storage_commit_indeterminate", 500, "Review round committed but its Finish lock could not be cleared");
      }
      throw new AppError("storage_cleanup_failed", 500, "Review round failed and its Finish lock could not be cleared");
    }
  };
}

function corruptRound(): AppError {
  return new AppError("round_store_corrupt", 500, "Stored review round is malformed");
}
