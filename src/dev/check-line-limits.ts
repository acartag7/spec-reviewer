import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { loadConfig } from "../config.ts";

const maxLines = loadConfig([]).source.maxFileLines;
const roots = ["src", "public", "test"];
const extensions = new Set([".ts", ".js", ".css", ".html"]);
const failures: string[] = [];

for (const root of roots) {
  for (const filePath of listFiles(join(process.cwd(), root))) {
    if (!matchesExtension(filePath)) continue;
    const text = readFileSync(filePath, "utf8");
    const lineCount = text.endsWith("\n")
      ? text.split("\n").length - 1
      : text.split("\n").length;
    if (lineCount > maxLines) failures.push(`${relative(process.cwd(), filePath)} has ${lineCount} lines`);
  }
}

if (failures.length > 0) {
  console.error(`Source files must stay at or below ${maxLines} lines.`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}

function* listFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) yield* listFiles(entryPath);
    else if (entry.isFile()) yield entryPath;
  }
}

function matchesExtension(filePath: string): boolean {
  for (const extension of extensions) {
    if (filePath.endsWith(extension)) return true;
  }
  return false;
}
