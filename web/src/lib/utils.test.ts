import { expect, test } from "vitest"
import { formatActiveDuration } from "@/lib/utils"

test("formatActiveDuration formats millisecond durations compactly", () => {
  expect(formatActiveDuration(0)).toBe("0s")
  expect(formatActiveDuration(59000)).toBe("59s")
  expect(formatActiveDuration(60000)).toBe("1m 00s")
  expect(formatActiveDuration(125000)).toBe("2m 05s")
  expect(formatActiveDuration(3600000)).toBe("1h 00m")
})

test("formatActiveDuration guards against invalid input", () => {
  expect(formatActiveDuration(NaN)).toBe("0s")
  expect(formatActiveDuration(-5)).toBe("0s")
  expect(formatActiveDuration(Infinity)).toBe("0s")
})
