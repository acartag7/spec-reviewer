import { expect, test } from "vitest"
import { readDroppedReviewFile } from "@/lib/path-utils"

test("dropped files send original bytes after a fatal UTF-8 check", async () => {
  const file = new File(["# comment\nname: demo\n"], "plan.yaml", { type: "text/yaml" })
  await expect(readDroppedReviewFile(file)).resolves.toEqual({
    name: "plan.yaml",
    bytes: btoa("# comment\nname: demo\n"),
  })
})

test("dropped files reject invalid UTF-8 before upload", async () => {
  const file = new File([new Uint8Array([0x80, 0x81, 0x82])], "plan.yaml", { type: "text/yaml" })
  await expect(readDroppedReviewFile(file)).rejects.toThrow("Binary files cannot be reviewed")
})

test("dropped files reject unsupported extensions", async () => {
  const file = new File(["nope"], "notes.png")
  await expect(readDroppedReviewFile(file)).rejects.toThrow("Drop a Markdown or supported text file")
})
