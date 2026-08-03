import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTapFormulaVersionCanAdvance, compareReleaseVersions, isTapFormulaVersionOlder } from "../scripts/update-homebrew-tap.js";

test("Homebrew formula versions never move backward", () => {
  assert.equal(compareReleaseVersions("0.6.0", "0.6.0"), 0);
  assert.equal(compareReleaseVersions("0.6.0", "0.5.0"), 1);
  assert.equal(compareReleaseVersions("0.6.0-rc.1", "0.6.0"), -1);
  assert.equal(isTapFormulaVersionOlder("0.6.0", "0.5.0"), true);
  assert.throws(() => assertTapFormulaVersionCanAdvance("0.6.0", "0.5.0"), /Refusing to replace/);
  assert.doesNotThrow(() => assertTapFormulaVersionCanAdvance("0.5.0", "0.6.0"));
});
