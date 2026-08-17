import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "../src/config.ts";
import { AppError } from "../src/domain/errors.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { readUpload, storeUploadedMarkdown } from "../src/interfaces/http/uploads.ts";

test("FileDocumentReader allows the explicit text set and rejects binaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-reader-"));
  const reader = new FileDocumentReader();

  for (const [name, body, format] of [
    ["plan.yaml", "# comment\nname: demo\n", "source"],
    ["plan.yml", "name: demo\n", "source"],
    ["plan.json", "{\"name\":\"demo\"}\n", "source"],
    ["plan.toml", "name = \"demo\"\n", "source"],
    ["plan.txt", "plain plan\n", "source"],
    ["plan.md", "# Title\n", "markdown"],
    ["plan.markdown", "# Title\n", "markdown"],
  ] as const) {
    const path = join(dir, name);
    await writeFile(path, body);
    const opened = await reader.readMarkdown(path);
    assert.equal(opened.document.format, format);
    if (format === "source") assert.notEqual(opened.document.lines[0]?.kind, "heading");
  }

  await writeFile(join(dir, "notes.png"), "not an image");
  await writeFile(join(dir, "page.html"), "<p>no</p>");
  await writeFile(join(dir, "code.ts"), "export {}\n");
  await writeFile(join(dir, "README"), "# no extension\n");
  for (const name of ["notes.png", "page.html", "code.ts", "README"]) {
    await assert.rejects(reader.readMarkdown(join(dir, name)), /Only .*\.yaml.* files can be reviewed/);
  }

  await writeFile(join(dir, "nul.yaml"), Buffer.from("a:\0 1\n"));
  await writeFile(join(dir, "bad.yaml"), Buffer.from([0x80, 0x81, 0x82]));
  await assert.rejects(reader.readMarkdown(join(dir, "nul.yaml")), /Binary files cannot be reviewed/);
  await assert.rejects(reader.readMarkdown(join(dir, "bad.yaml")), /Binary files cannot be reviewed/);
});

test("uploads accept the same text set and reject binaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-upload-"));
  const uploaded = await storeUploadedMarkdown(dir, "plan.yaml", "# comment\nname: demo\n");
  assert.match(uploaded, /plan\.yaml$/);
  await assert.rejects(storeUploadedMarkdown(dir, "notes.png", "nope"), /Only .*\.yaml.* files can be dropped/);
  await assert.rejects(storeUploadedMarkdown(dir, "plan.yaml", "a\0b"), (error) => (
    error instanceof AppError && error.message === "Binary files cannot be reviewed"
  ));
});

test("upload bytes are fatal-decoded before the document is stored", () => {
  const yaml = readUpload({
    name: "plan.yaml",
    bytes: Buffer.from("# comment\nname: demo\n").toString("base64"),
  });
  assert.equal(yaml.content, "# comment\nname: demo\n");
  assert.throws(
    () => readUpload({ name: "plan.yaml", bytes: Buffer.from([0x80, 0x81, 0x82]).toString("base64") }),
    (error: unknown) => error instanceof AppError && error.message === "Binary files cannot be reviewed",
  );
  assert.throws(
    () => readUpload({ name: "plan.yaml", bytes: "not-base64" }),
    (error: unknown) => error instanceof AppError && error.message === "bytes must be base64",
  );
});

test("--wait requires a document path", () => {
  assert.throws(() => loadConfig(["review", "--wait"]), /--wait requires a document path/);
});
