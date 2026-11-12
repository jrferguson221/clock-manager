import { describe, expect, it } from "bun:test";
import {
  bestCallSearchSchema, clockTextSchema, guideSearchSchema, scenarioSearchSchema, GUIDE_SECTIONS, SCENARIO_DEFAULTS, SCENARIO_PRESETS, firstError, gameStateSchema, leadingSearchSchema, rangeSchema, trailingSearchSchema,
  BEST_CALL_DEFAULTS, CLOCK_HINT, LEADING_DEFAULTS, LIMITS, TRAILING_DEFAULTS, type GameState,
} from "../src";

describe("clockTextSchema", () => {
  it("accepts M:SS and MM:SS", () => {
    for (const ok of ["0:00", "0:05", "1:45", "15:00", "59:59"]) expect(clockTextSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects anything else, with the hint the form shows", () => {
    for (const bad of ["", "1:75", "145", "1:5", "100:00", ":30", "1:45 "]) {
      expect(firstError(clockTextSchema, bad)).toBe(CLOCK_HINT);
    }
  });
});

describe("rangeSchema", () => {
  it("accepts whole numbers within the field's limits", () => {
    expect(rangeSchema("toGo").parse(LIMITS.toGo.min)).toBe(1);
    expect(rangeSchema("toGo").parse(LIMITS.toGo.max)).toBe(99);
    expect(rangeSchema("margin").parse(-16)).toBe(-16);
  });

  it("says the range when a value is out of it or not whole", () => {
    expect(firstError(rangeSchema("hurryUp"), 4)).toBe("Enter a whole number from 5 to 40");
    expect(firstError(rangeSchema("hurryUp"), 41)).toBe("Enter a whole number from 5 to 40");
    expect(firstError(rangeSchema("yardLine"), 2.5)).toBe("Enter a whole number from 1 to 50");
    expect(firstError(rangeSchema("yardLine"), "20")).toBe("Enter a whole number from 1 to 50");
  });
});

describe("search params", () => {
  it("parse an empty query to each mode's defaults", () => {
    expect(LEADING_DEFAULTS).toEqual({
      clock: "2:30", running: true, timeouts: 3, oppTimeouts: 3, down: 1, toGo: 10, side: "own", yardLine: 30,
      lead: 3, playType: "kneel",
    });
    expect(TRAILING_DEFAULTS).toEqual({
      clock: "1:45", running: true, timeouts: 2, oppTimeouts: 3, down: 1, toGo: 10, side: "own", yardLine: 25,
      trail: 3, hurryUp: 18,
    });
    expect(BEST_CALL_DEFAULTS).toEqual({
      clock: "1:45", running: true, timeouts: 2, oppTimeouts: 3, down: 1, toGo: 10, side: "own", yardLine: 25,
      margin: -3, hurryUp: 18,
    });
  });

  it("keep valid values", () => {
    const s = trailingSearchSchema.parse({ clock: "0:58", running: false, trail: 7, down: 3, side: "opp", yardLine: 40 });
    expect(s).toMatchObject({ clock: "0:58", running: false, trail: 7, down: 3, side: "opp", yardLine: 40, timeouts: 2 });
  });

  it("replace each invalid value with its default rather than rejecting the URL", () => {
    const s = leadingSearchSchema.parse({
      clock: "9:99", running: "yes", timeouts: 4, oppTimeouts: -1, down: 5, toGo: 0, side: "midfield", yardLine: 51,
      lead: 0, playType: "spike", extra: "ignored",
    });
    expect(s).toEqual(LEADING_DEFAULTS);
  });

  it("only allow scores each mode makes sense for", () => {
    expect(leadingSearchSchema.parse({ lead: 16 }).lead).toBe(16);
    expect(leadingSearchSchema.parse({ lead: 17 }).lead).toBe(3);
    expect(trailingSearchSchema.parse({ trail: 0 }).trail).toBe(0);
    expect(bestCallSearchSchema.parse({ margin: -16 }).margin).toBe(-16);
    expect(bestCallSearchSchema.parse({ margin: 2.5 }).margin).toBe(-3);
  });
});

describe("gameStateSchema", () => {
  const g: GameState = {
    clock: 105, running: true, poss: "you", down: 1, toGo: 10, ytg: 75, margin: -3, timeouts: { you: 2, opp: 3 }, over: false,
  };

  it("accepts a game state", () => {
    expect(gameStateSchema.parse(g)).toEqual(g);
  });

  it("rejects impossible states", () => {
    expect(gameStateSchema.safeParse({ ...g, down: 5 }).success).toBe(false);
    expect(gameStateSchema.safeParse({ ...g, poss: "them" }).success).toBe(false);
    expect(gameStateSchema.safeParse({ ...g, timeouts: { you: 4, opp: 3 } }).success).toBe(false);
    expect(gameStateSchema.safeParse({ ...g, ytg: 101 }).success).toBe(false);
    expect(gameStateSchema.safeParse({ ...g, clock: -1 }).success).toBe(false);
  });
});

describe("guideSearchSchema", () => {
  it("accepts any guide section, and drops a missing or unknown one", () => {
    for (const section of GUIDE_SECTIONS) expect(guideSearchSchema.parse({ section })).toEqual({ section });
    expect(guideSearchSchema.parse({}).section).toBeUndefined();
    expect(guideSearchSchema.parse({ section: "nonsense" }).section).toBeUndefined();
    expect(guideSearchSchema.parse({ section: 7 }).section).toBeUndefined();
  });
});

describe("scenarioSearchSchema", () => {
  it("defaults to the QB preset, and every preset is a valid set of params", () => {
    expect(SCENARIO_DEFAULTS).toEqual(SCENARIO_PRESETS["qb-throwaway"]);
    for (const preset of Object.values(SCENARIO_PRESETS)) expect(scenarioSearchSchema.parse(preset)).toEqual(preset);
  });

  it("drops an unknown scenario or out-of-range input back to the default", () => {
    const parsed = scenarioSearchSchema.parse({ scenario: "kicker", sackYards: 99, extra: 0, gain: 12 });
    expect(parsed.scenario).toBe("qb-throwaway");
    expect(parsed.sackYards).toBe(SCENARIO_DEFAULTS.sackYards);
    expect(parsed.extra).toBe(SCENARIO_DEFAULTS.extra);
  });
});
