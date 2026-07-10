import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { reviewUrl } from "../src/cli/output.ts";
import { loadConfig } from "../src/config.ts";

test("blank environment config falls back to safe defaults", () => {
  const config = loadConfig([], {
    SPEC_REVIEWER_HOST: "",
    SPEC_REVIEWER_PORT: "",
    SPEC_REVIEWER_STORAGE_DIR: "",
  });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3217);
  assert.equal(config.storageDir, join(homedir(), ".spec-reviewer"));
});

test("invalid nonblank environment ports are rejected", () => {
  assert.throws(() => loadConfig([], { SPEC_REVIEWER_PORT: "not-a-port" }), /Invalid port/);
});

test("review URL brackets an IPv6 host", () => {
  const config = loadConfig([], { SPEC_REVIEWER_HOST: "::1" });
  assert.equal(reviewUrl(config, 3217), "http://[::1]:3217");
});
