// URL search params for each mode. A shared or bookmarked link carries the whole situation.
//
// Search params are untrusted input: every field falls back to its default when it's missing or
// invalid, so any URL parses to a usable situation. Defaults are left out of the URL.

import * as z from "zod/mini";
import { downSchema, type Down } from "./game";
import { clockTextSchema, playTypeSchema, rangeSchema, sideSchema, type LimitedField, type PlayType, type Side } from "./fields";

/** A schema that fills in `fallback` when the value is missing, and when it's invalid. */
const withFallback = <T extends z.ZodMiniType>(schema: T, fallback: Exclude<z.output<T>, undefined>) => z.catch(z._default(schema, fallback), fallback);
const int = (field: LimitedField, fallback: number) => withFallback(rangeSchema(field), fallback);

/** Fields every mode shares: the clock, timeouts, down and distance, and the ball's spot. */
const situationShape = (d: {
  clock: string; timeouts: number; oppTimeouts: number; down: Down; toGo: number; side: Side; yardLine: number;
}) => ({
  /** Game clock, M:SS. */
  clock: withFallback(clockTextSchema, d.clock),
  /** Whether the game clock is running. */
  running: withFallback(z.boolean(), true),
  /** Your timeouts. */
  timeouts: int("timeouts", d.timeouts),
  /** The opponent's timeouts. */
  oppTimeouts: int("timeouts", d.oppTimeouts),
  down: withFallback(downSchema, d.down),
  toGo: int("toGo", d.toGo),
  /** Which half of the field the ball is in. */
  side: withFallback(sideSchema, d.side),
  yardLine: int("yardLine", d.yardLine),
});

const DEFAULT_HURRY_UP = 18;
const DEFAULT_YARDS_PER_PLAY = 7;
const DEFAULT_PLAY_TYPE: PlayType = "kneel";

export const leadingSearchSchema = z.object({
  ...situationShape({ clock: "2:30", timeouts: 3, oppTimeouts: 3, down: 1, toGo: 10, side: "own", yardLine: 30 }),
  /** Points you lead by. */
  lead: int("lead", 3),
  /** How you run out the clock. */
  playType: withFallback(playTypeSchema, DEFAULT_PLAY_TYPE),
});

export const trailingSearchSchema = z.object({
  ...situationShape({ clock: "1:45", timeouts: 2, oppTimeouts: 3, down: 1, toGo: 10, side: "own", yardLine: 25 }),
  /** Points you trail by; 0 is tied. */
  trail: int("trail", 3),
  /** Average yards a play, for the rules of thumb. */
  ypp: int("yardsPerPlay", DEFAULT_YARDS_PER_PLAY),
  /** Seconds from an in-bounds play to a no-huddle snap. */
  hurryUp: int("hurryUp", DEFAULT_HURRY_UP),
});

export const bestCallSearchSchema = z.object({
  ...situationShape({ clock: "1:45", timeouts: 2, oppTimeouts: 3, down: 1, toGo: 10, side: "own", yardLine: 25 }),
  /** Your points minus the opponent's, from -16 to 16. */
  margin: int("margin", -3),
  hurryUp: int("hurryUp", DEFAULT_HURRY_UP),
});

// ---------------------------------------------------------------------------
// Scenarios: one decision during a play, compared option by option.

export const SCENARIO_IDS = ["qb-throwaway", "qb-slide", "wr-sideline", "rb-score", "rb-inbounds", "kneel-or-run"] as const;
export const scenarioIdSchema = z.enum(SCENARIO_IDS);
export type ScenarioId = z.infer<typeof scenarioIdSchema>;

/** The situation at the snap, plus each scenario's own inputs. Fields a scenario doesn't use are ignored. */
const scenarioShape = (d: {
  scenario: ScenarioId; clock: string; margin: number; timeouts: number; oppTimeouts: number; down: Down; toGo: number;
  side: Side; yardLine: number; sackYards: number; gain: number; extra: number; seconds: number;
}) => ({
  scenario: withFallback(scenarioIdSchema, d.scenario),
  /** Game clock at the snap. */
  clock: withFallback(clockTextSchema, d.clock),
  margin: int("margin", d.margin),
  timeouts: int("timeouts", d.timeouts),
  oppTimeouts: int("timeouts", d.oppTimeouts),
  down: withFallback(downSchema, d.down),
  toGo: int("toGo", d.toGo),
  side: withFallback(sideSchema, d.side),
  yardLine: int("yardLine", d.yardLine),
  sackYards: int("sackYards", d.sackYards),
  gain: int("gain", d.gain),
  extra: int("extra", d.extra),
  seconds: int("seconds", d.seconds),
});

/** Each scenario's starting situation: a spot where the choice is a real one. */
export const SCENARIO_PRESETS = {
  // Down 4 with 0:50 left and no timeouts, 2nd & 10 at the opponent's 30: the first read is covered.
  "qb-throwaway": {
    scenario: "qb-throwaway", clock: "0:50", margin: -4, timeouts: 0, oppTimeouts: 3, down: 2, toGo: 10,
    side: "opp", yardLine: 30, sackYards: 8, gain: 12, extra: 6, seconds: 5,
  },
  // Down 3 with 0:18 left and no timeouts, 1st & 10 at your 45: a 12-yard catch near the sideline.
  "wr-sideline": {
    scenario: "wr-sideline", clock: "0:18", margin: -3, timeouts: 0, oppTimeouts: 3, down: 1, toGo: 10,
    side: "own", yardLine: 45, sackYards: 8, gain: 12, extra: 6, seconds: 5,
  },
  // Down 3 with 0:40 left and no timeouts: the quarterback scrambles for 9 from your 45.
  "qb-slide": {
    scenario: "qb-slide", clock: "0:40", margin: -3, timeouts: 0, oppTimeouts: 3, down: 2, toGo: 10,
    side: "own", yardLine: 45, sackYards: 8, gain: 9, extra: 3, seconds: 6,
  },
  // Up 1 with 1:15 left, 2nd & 10 at your 35, the opponent with 1 timeout: the runner near the sideline, 4 yards in.
  "rb-inbounds": {
    scenario: "rb-inbounds", clock: "1:15", margin: 1, timeouts: 2, oppTimeouts: 1, down: 2, toGo: 10,
    side: "own", yardLine: 35, sackYards: 8, gain: 4, extra: 3, seconds: 5,
  },
  // Up 6 with 2:10 left, 1st & 10 at your 30, and the opponent has all its timeouts.
  "kneel-or-run": {
    scenario: "kneel-or-run", clock: "2:10", margin: 6, timeouts: 2, oppTimeouts: 3, down: 1, toGo: 10,
    side: "own", yardLine: 30, sackYards: 8, gain: 12, extra: 6, seconds: 5,
  },
  // Tied with 1:05 left, a run from the opponent's 25 breaks into the open.
  "rb-score": {
    scenario: "rb-score", clock: "1:05", margin: 0, timeouts: 2, oppTimeouts: 2, down: 1, toGo: 10,
    side: "opp", yardLine: 25, sackYards: 8, gain: 12, extra: 6, seconds: 5,
  },
} as const satisfies Record<ScenarioId, Parameters<typeof scenarioShape>[0]>;

export const scenarioSearchSchema = z.object(scenarioShape(SCENARIO_PRESETS["qb-throwaway"]));
export type ScenarioSearch = z.output<typeof scenarioSearchSchema>;
export const SCENARIO_DEFAULTS: ScenarioSearch = scenarioSearchSchema.parse({});

// ---------------------------------------------------------------------------
// Kick or go for two, just after you score a touchdown.

export const twoPointSearchSchema = z.object({
  /** Time left after the touchdown, M:SS. */
  clock: withFallback(clockTextSchema, "3:00"),
  /** Your points minus theirs with the touchdown's 6 counted, before the try. */
  margin: int("margin", 1),
  timeouts: int("timeouts", 2),
  oppTimeouts: int("timeouts", 3),
});
export type TwoPointSearch = z.output<typeof twoPointSearchSchema>;
export const TWO_POINT_DEFAULTS: TwoPointSearch = twoPointSearchSchema.parse({});

export type LeadingSearch = z.output<typeof leadingSearchSchema>;
export type TrailingSearch = z.output<typeof trailingSearchSchema>;
export type BestCallSearch = z.output<typeof bestCallSearchSchema>;

/** Each mode's situation with nothing in the URL. */
export const LEADING_DEFAULTS: LeadingSearch = leadingSearchSchema.parse({});
export const TRAILING_DEFAULTS: TrailingSearch = trailingSearchSchema.parse({});
export const BEST_CALL_DEFAULTS: BestCallSearch = bestCallSearchSchema.parse({});
