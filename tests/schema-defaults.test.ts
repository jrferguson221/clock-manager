// The URL schemas' defaults live in @situational-football/schemas, which can't import the engines. Check they agree.
import { expect, it } from "bun:test";
import { BEST_CALL_DEFAULTS, TRAILING_DEFAULTS, LIMITS, PLAY_TYPE_IDS } from "@situational-football/schemas";
import { DEFAULT_ASSUMPTIONS } from "../src/trailing";
import { DEFAULT_SIM } from "../src/sim";
import { PLAY_TYPES } from "../src/engine";

it("search-param defaults match the engines' defaults", () => {
  expect(TRAILING_DEFAULTS.ypp).toBe(DEFAULT_ASSUMPTIONS.yardsPerPlay);
  expect(TRAILING_DEFAULTS.hurryUp).toBe(DEFAULT_ASSUMPTIONS.hurryUp);
  expect(BEST_CALL_DEFAULTS.hurryUp).toBe(DEFAULT_SIM.hurryUp);
});

it("every run-out play type in the schema has engine timing", () => {
  for (const id of PLAY_TYPE_IDS) expect(PLAY_TYPES[id].duration).toBeGreaterThan(0);
  expect(LIMITS.timeouts).toEqual({ min: 0, max: 3 });
});
