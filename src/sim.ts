// Play-by-play game simulator and Monte Carlo win probability.
// Pure functions, no React or DOM access. All times are in whole seconds.
//
// The model is deliberately simple: each call has a fixed outcome distribution, both teams follow
// a rule-of-thumb policy after your decision, and a tie at 0:00 is a coin flip in overtime.

import { NFL_RULES, PLAY_TYPES, simulateRunOut, type Down } from "./engine";
import { formatClock } from "./time";
import type { GameState, GuideSection, PlayCall, Team } from "@situational-football/schemas";

// The game state and call types come from the schemas package, which validates them too.
export type { GameState, PlayCall, Team };

export const PLAY_CALLS: Readonly<Record<PlayCall, string>> = Object.freeze({
  timeout: "Timeout",
  run: "Run",
  "pass-sideline": "Pass to the sideline",
  "pass-middle": "Pass over the middle",
  "pass-deep": "Deep pass",
  "pass-play-action": "Play-action pass",
  "pass-screen": "Screen pass",
  spike: "Spike",
  kneel: "Kneel",
  fg: "Field goal",
  punt: "Punt",
});

export interface SimConfig {
  /** Seconds from the end of an in-bounds play to a no-huddle snap. */
  hurryUp: number;
  /** Seconds from the end of an in-bounds play to a spike. */
  spikeLineup: number;
  /** Seconds to rush the field-goal unit on with the clock running. */
  fgRush: number;
}

export const DEFAULT_SIM: SimConfig = Object.freeze({ hurryUp: 18, spikeLineup: 12, fgRush: 15 });

const WARNING = NFL_RULES.twoMinuteWarning;
const BURN = NFL_RULES.playClock - 1; // snap with 1 second on the play clock
/** The longest field-goal try: from the opponent's 45, a 62-yarder. */
export const FG_MAX_YTG = 45;
/** Punting is an option from 40 or more yards out. */
export const PUNT_MIN_YTG = 40;
/** On the last play, a team that needs only a field goal kicks from this close or closer (a 59-yarder). */
export const LAST_PLAY_FG_YTG = 42;
/** A defense that's behind uses its timeouts after in-bounds plays in the last 4 minutes. */
export const DEFENSE_TIMEOUT_WINDOW = 240;
/** Fewest seconds from the end of an in-bounds play to the next snap, even when rushing. */
export const MIN_SNAP = 8;

// ---------------------------------------------------------------------------
// Random numbers

export type Rng = () => number;

/** Small, fast seeded generator, so the same situation always gives the same estimates. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const expo = (r: Rng, mean: number) => -mean * Math.log(1 - r());

// ---------------------------------------------------------------------------
// Rules helpers

const other = (t: Team): Team => (t === "you" ? "opp" : "you");
const marginFor = (g: GameState, team: Team) => (team === "you" ? g.margin : -g.margin);
const who = (team: Team) => (team === "you" ? "You" : "They");

/**
 * Field-goal make rates by distance, measured from 2022-2026 NFL regular seasons (about 3,800 tries, in
 * 5-yard bands, at each band's middle). Kickers have got so good from long range that the rate is nearly
 * flat from the high 40s to the high 50s. Re-measure with scripts/calibrate/kicks.ts.
 */
export const FG_MAKE_BY_DISTANCE: readonly (readonly [number, number])[] = [
  [20, 0.995], [32, 0.967], [37, 0.91], [42, 0.839], [47, 0.764], [52, 0.732], [57, 0.648], [62, 0.481], [67, 0.3],
];

/** Field-goal make chance for a try from this spot (distance = yards to the goal line + 17). */
export function fgMakeChance(ytg: number): number {
  const distance = ytg + 17;
  const first = FG_MAKE_BY_DISTANCE[0];
  const last = FG_MAKE_BY_DISTANCE.at(-1);
  if (first === undefined || last === undefined) return 0;
  if (distance <= first[0]) return first[1];
  if (distance >= last[0]) return last[1];
  for (let i = 1; i < FG_MAKE_BY_DISTANCE.length; i++) {
    const hi = FG_MAKE_BY_DISTANCE[i];
    const lo = FG_MAKE_BY_DISTANCE[i - 1];
    if (hi !== undefined && lo !== undefined && distance <= hi[0]) {
      return lo[1] + ((hi[1] - lo[1]) * (distance - lo[0])) / (hi[0] - lo[0]);
    }
  }
  return last[1];
}

/** Whether a field goal ties or wins for the team with the ball, and they're in comfortable range. */
function fgPlay(g: GameState): boolean {
  const m = marginFor(g, g.poss);
  return m <= 0 && m >= -3 && g.ytg <= 35;
}

/**
 * Tempo is automatic. A team that's ahead, or that only needs a field goal and is in range, drains
 * the play clock. A trailing team draining for a kick snaps early enough to stop the clock and kick.
 * Everyone else hurries.
 */
/**
 * Seconds from the end of the last play to the snap when the clock is running, for a call: a leading team
 * drains the play clock, a trailing one hurries, a spike or a kick takes its own setup time.
 */
export function snapDelay(g: GameState, call: PlayCall, cfg: SimConfig = DEFAULT_SIM): number {
  return preSnapBurn(g, call, cfg);
}

function preSnapBurn(g: GameState, call: PlayCall, cfg: SimConfig): number {
  if (marginFor(g, g.poss) > 0) return BURN;
  if (call === "fg" || call === "punt") return cfg.fgRush;
  if (call === "spike") return cfg.spikeLineup;
  if (fgPlay(g)) return Math.min(BURN, Math.max(MIN_SNAP, g.clock - kickFloor(g, cfg)));
  return cfg.hurryUp;
}

/**
 * Clock a team draining for a field goal snaps its last play at: enough for a quick snap and a play,
 * then a timeout or a rushed field-goal unit.
 */
const kickFloor = (g: GameState, cfg: SimConfig) => (g.timeouts[g.poss] > 0 ? 20 : cfg.fgRush + 15);

/** A list with at least one element, so reading its first element can't be undefined. */
export type NonEmpty<T> = readonly [T, ...T[]];

export function availableCalls(g: GameState): readonly PlayCall[] {
  if (g.over) return [];
  const calls: PlayCall[] = [];
  if (g.timeouts[g.poss] > 0) calls.push("timeout");
  calls.push("run", "pass-screen", "pass-sideline", "pass-middle", "pass-play-action", "pass-deep");
  if (g.down <= 3) calls.push("spike");
  // Kneeling gives up a down and time, which only helps a team that's ahead, or tied and settling for overtime.
  if (marginFor(g, g.poss) >= 0) calls.push("kneel");
  if (g.ytg <= FG_MAX_YTG) calls.push("fg");
  if (g.ytg >= PUNT_MIN_YTG) calls.push("punt");
  return calls;
}

// ---------------------------------------------------------------------------
// One decision

export interface StepResult {
  state: GameState;
  /** What happened, for the play log. */
  text: string;
  /** Set when the team with the ball lost it or scored, e.g. "Touchdown". */
  driveEnded?: string;
}

/** What happened on a scrimmage play. Scenarios pass one to `step` to replay a specific result. */
export interface PlayOutcome {
  yards: number;
  seconds: number;
  outOfBounds: boolean;
  incomplete: boolean;
  turnover?: "interception" | "fumble";
  sack?: boolean;
}

/**
 * How the defense is playing:
 * - "prevent": ahead late, it protects the deep field (the last 4:00, outside the red zone), except on 3rd or
 *   4th and 6 or fewer, when giving up a short catch loses the down: there it guards the sticks instead.
 * - "obvious": everyone knows a pass is coming: 3rd or 4th & 7+, or the offense trailing or tied by a score
 *   in the last 5:00. More sacks, fewer completions, and play-action fools fewer defenders.
 * - "normal": anything else.
 */
export type Coverage = "normal" | "obvious" | "prevent";

/** A defense that's ahead plays prevent in the last 4 minutes. */
export const PREVENT_WINDOW = 240;
/** The offense is obviously passing when trailing or tied by a score in the last 5 minutes… */
export const OBVIOUS_WINDOW = 300;
/** …or on 3rd or 4th down with this many yards or more to go. */
export const OBVIOUS_TO_GO = 7;

/** Inside the opponent's 20 the field is compressed: less room to defend, and to throw into. */
export const RED_ZONE = 20;

export function coverageFor(g: GameState, clock: number): Coverage {
  const m = marginFor(g, g.poss);
  // Prevent protects the deep field, and in the red zone there isn't one. On 3rd or 4th and short, a defense
  // can't concede the underneath catch prevent gives up, so it plays the sticks: an obvious passing down.
  const sticks = g.down >= 3 && g.toGo < OBVIOUS_TO_GO;
  if (m < 0 && clock <= PREVENT_WINDOW && g.ytg > RED_ZONE && !sticks) return "prevent";
  if ((g.down >= 3 && g.toGo >= OBVIOUS_TO_GO) || (m <= 0 && m >= -8 && clock <= OBVIOUS_WINDOW)) return "obvious";
  return "normal";
}

/**
 * How much of a pass's normal completion rate survives at this distance from the goal line:
 * 1 outside the red zone, shrinking to 0.6 at the 1 as coverage tightens.
 */
export function compression(ytg: number): number {
  return ytg >= RED_ZONE ? 1 : 0.6 + (0.4 * Math.max(0, ytg - 1)) / (RED_ZONE - 1);
}

export type PassCall = "pass-sideline" | "pass-middle" | "pass-deep" | "pass-play-action" | "pass-screen";

interface PassOdds {
  /** Chance of a sack, per snap. */
  readonly sack: number;
  /** Chance of an interception, per snap. */
  readonly interception: number;
  /** Chance of a completion, per snap (sacks count as snaps, so this is below the per-throw rate). */
  readonly complete: number;
  /** Completions gain at least this many yards… */
  readonly minYards: number;
  /** …plus an exponential with this mean. */
  readonly extraYards: number;
  /** Share of completions that end out of bounds. */
  readonly outOfBounds: number;
}

/**
 * Pass odds by situation, fitted to the 2025 and 2026 (weeks 1-8) NFL regular seasons: about 28,800
 * dropbacks charted by FTN, so play-action and screens are known. Re-fit with scripts/calibrate/passes.ts.
 *
 * - Completion and interception rates are per throw in the data, converted to per snap here.
 * - Yards per catch: the minimum is about the 10th percentile, and the exponential's mean makes up the average.
 * - Sacks can't be tied to a target (a sacked passer never threw), so dropback passes share the measured
 *   rate: 6% normally, 10% in obvious passing situations, deep throws a little more as they take longer.
 * - Prevent has few plays (50 to 513 per kind of pass), so its numbers are pulled toward the normal ones in
 *   proportion to how few plays back them.
 * - Play-action in obvious passing and prevent keeps about half its usual edge over a dropback: the
 *   linebackers aren't fooled when a pass is expected. Real play-action passes in those spots are too few
 *   (118 and 50) to fit directly; they hint at more sacks (8.5% and 14%), which the 9% here reflects.
 */
export const PASS_ODDS: Readonly<Record<Coverage, Readonly<Record<PassCall, PassOdds>>>> = Object.freeze({
  normal: {
    // 66% complete, 9 yards a catch, 26% of catches out of bounds.
    "pass-sideline": { sack: 0.06, interception: 0.017, complete: 0.624, minYards: 3, extraYards: 6, outOfBounds: 0.26 },
    // 70% complete, 11 yards a catch, almost never out of bounds.
    "pass-middle": { sack: 0.06, interception: 0.025, complete: 0.653, minYards: 4, extraYards: 7, outOfBounds: 0.03 },
    // 36% complete for 32 yards a catch, 4% intercepted.
    "pass-deep": { sack: 0.08, interception: 0.037, complete: 0.328, minYards: 20, extraYards: 12, outOfBounds: 0.24 },
    // A run fake pulls the linebackers up: 63% complete for 13 yards a catch.
    "pass-play-action": { sack: 0.067, interception: 0.018, complete: 0.589, minYards: 2, extraYards: 11, outOfBounds: 0.25 },
    // A quick throw behind blockers: 86% complete, almost never sacked or picked, often stopped short (6 a catch).
    "pass-screen": { sack: 0.005, interception: 0.006, complete: 0.86, minYards: -2, extraYards: 8, outOfBounds: 0.14 },
  },
  obvious: {
    "pass-sideline": { sack: 0.1, interception: 0.02, complete: 0.537, minYards: 4, extraYards: 6, outOfBounds: 0.21 },
    "pass-middle": { sack: 0.1, interception: 0.035, complete: 0.597, minYards: 5, extraYards: 7, outOfBounds: 0.03 },
    "pass-deep": { sack: 0.12, interception: 0.054, complete: 0.295, minYards: 20, extraYards: 14, outOfBounds: 0.14 },
    "pass-play-action": { sack: 0.09, interception: 0.025, complete: 0.593, minYards: 3, extraYards: 9.5, outOfBounds: 0.2 },
    "pass-screen": { sack: 0.005, interception: 0.003, complete: 0.84, minYards: -1, extraYards: 8, outOfBounds: 0.08 },
  },
  prevent: {
    // Throws underneath complete as usual and gain a little more; catches near the sideline get out of bounds.
    "pass-sideline": { sack: 0.06, interception: 0.024, complete: 0.629, minYards: 3, extraYards: 7, outOfBounds: 0.32 },
    "pass-middle": { sack: 0.06, interception: 0.017, complete: 0.654, minYards: 4, extraYards: 7.5, outOfBounds: 0.03 },
    // The deep field is what prevent protects: 31% complete, 5% intercepted.
    "pass-deep": { sack: 0.08, interception: 0.047, complete: 0.276, minYards: 20, extraYards: 11.5, outOfBounds: 0.24 },
    "pass-play-action": { sack: 0.09, interception: 0.02, complete: 0.593, minYards: 3, extraYards: 10.5, outOfBounds: 0.2 },
    "pass-screen": { sack: 0.005, interception: 0.005, complete: 0.864, minYards: -2, extraYards: 8.3, outOfBounds: 0.15 },
  },
});

/**
 * On 3rd and 4th down, defenses play to stop the conversion: they guard the first-down marker and give up
 * catches short of it. Each kind of pass completes this much less often, by yards to go, fitted to real
 * conversion rates on 3rd/4th down outside the red zone (2022-26; by kind of pass from FTN's 2025-26 charting):
 * - short (1-3 to go): passes convert about 55%;
 * - medium (4-6): sideline 51%, middle 58%, deep 35%, play-action 49%, screens 32% of throws;
 * - long (7+): sideline 36%, middle 41%, deep 34%, play-action 41%, screens 31% on 7-10.
 * Re-measure with scripts/calibrate/passes.ts.
 */
export type SticksBand = "short" | "medium" | "long";

export const STICKS_PASS: Readonly<Record<SticksBand, Readonly<Partial<Record<PassCall, number>>>>> = Object.freeze({
  short: { "pass-sideline": 0.86, "pass-middle": 0.86, "pass-deep": 0.86, "pass-play-action": 0.86, "pass-screen": 0.86 },
  medium: { "pass-sideline": 0.94, "pass-middle": 0.87, "pass-play-action": 0.92, "pass-screen": 0.81 },
  long: { "pass-middle": 0.86, "pass-deep": 0.85 },
});

/** On 3rd or 4th down, how far there is to go: short (1-3), medium (4-6) or long (7+). */
export function sticksBand(g: GameState): SticksBand | null {
  if (g.down < 3) return null;
  return g.toGo <= 3 ? "short" : g.toGo < OBVIOUS_TO_GO ? "medium" : "long";
}

/** Completion rate of a throw into the end zone from the 20, before compression. */
const END_ZONE_SHOT = 0.25;

/** Pass odds for a throw from this spot: completions get harder in the red zone. */
export function passOdds(coverage: Coverage, call: PassCall, ytg: number): PassOdds {
  const odds = PASS_ODDS[coverage][call];
  if (ytg > RED_ZONE) return odds;
  const c = compression(ytg);
  // From the 20 in there's no deep field: a "deep" pass is a throw into the end zone, complete
  // about 25% of the time at the 20 and less closer in.
  return call === "pass-deep" ? { ...odds, complete: END_ZONE_SHOT * c, interception: 0.06 } : { ...odds, complete: odds.complete * c };
}

/** Average run gain by coverage: prevent gives up a little more on the ground. */
const RUN_MEAN: Readonly<Record<Coverage, number>> = Object.freeze({ normal: 3.6, obvious: 3.6, prevent: 4.3 });

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, error under 1.5e-7). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Chance a run from inside the 5 reaches the end zone (ignoring the rare fumble). */
export function goalLineRunChance(ytg: number): number {
  const shape = runShape("normal", ytg);
  // Gains are rounded to whole yards, so reaching the goal line means a raw gain of ytg - 0.5.
  return 1 - normalCdf((ytg - 0.5 - shape.mean) / shape.sd);
}

interface RunShape {
  /** Typical gain, before the occasional breakaway. */
  readonly mean: number;
  readonly sd: number;
  /** Chance of a breakaway adding extra yards. */
  readonly breakaway: number;
}

/**
 * Runs by field position. Inside the 5 the defense packs the line: short gains, no breakaways. From
 * there runs blend back to the open-field shape by the 12.
 */
export function runShape(coverage: Coverage, ytg: number, sticksToGo: number | null = null): RunShape {
  const open: RunShape = { mean: RUN_MEAN[coverage], sd: 3.2, breakaway: 0.1 };
  if (ytg <= 5) return { mean: 0.7 + 0.3 * ytg, sd: 2.2, breakaway: 0 };
  const t = Math.min(1, (ytg - 5) / 7);
  const lerp = (goalLine: number, field: number) => goalLine + (field - goalLine) * t;
  const shape = { mean: lerp(2.2, open.mean), sd: lerp(2.2, open.sd), breakaway: lerp(0, open.breakaway) };
  if (sticksToGo === null) return shape;
  // On 3rd or 4th and up to 6 to go, the defense plays to stop the run short of the marker. Fitted to 2022-26:
  // runs convert about 74% of the time on 1 yard to go, 61% on 2, 55% on 3, 44% on 4, 34% on 5 and 27% on 6.
  const mean = sticksToGo <= 3 ? 1.4 + 0.45 * sticksToGo : 1.1 + 0.45 * sticksToGo;
  return { mean: Math.min(shape.mean, mean), sd: Math.min(shape.sd, 2.4), breakaway: Math.min(shape.breakaway, 0.04) };
}

/** Yards to go on 3rd or 4th and 6 or fewer, when defenses play the run to stop it short of the marker. */
export const sticksRunFor = (g: GameState): number | null => (g.down >= 3 && g.toGo < OBVIOUS_TO_GO ? g.toGo : null);

/** A last-play deep pass from this close is a heave into the end zone rather than a normal deep throw. */
export const HAIL_MARY = Object.freeze({ maxClock: 10, maxYtg: 60, interception: 0.12 });

/** Touchdown chance of an end-zone heave from this far out: about 20% from 25 yards, 10% from 45, 4% from 60. */
export function hailMaryChance(ytg: number): number {
  return Math.min(0.22, Math.max(0.04, 0.32 - 0.005 * ytg));
}

function rollHailMary(ytg: number, r: Rng): PlayOutcome {
  const base = { outOfBounds: false, incomplete: false, seconds: 6 };
  const u = r();
  // A pick in the end zone is a touchback.
  if (u < HAIL_MARY.interception) return { ...base, yards: ytg, turnover: "interception" };
  if (u < HAIL_MARY.interception + hailMaryChance(ytg)) return { ...base, yards: ytg };
  return { ...base, yards: 0, incomplete: true };
}

function rollPlay(call: PlayCall, r: Rng, coverage: Coverage, ytg: number, sticksToGo: number | null, sticks: SticksBand | null): PlayOutcome {
  const base = { outOfBounds: false, incomplete: false };
  switch (call) {
    case "kneel":
      return { ...base, yards: -1, seconds: PLAY_TYPES.kneel.duration };
    case "spike":
      return { ...base, yards: 0, seconds: 1, incomplete: true };
    case "run": {
      if (r() < 0.012) return { ...base, yards: 1, seconds: 5, turnover: "fumble" };
      const shape = runShape(coverage, ytg, sticksToGo);
      let yards = Math.round(shape.mean + shape.sd * gauss(r));
      if (r() < shape.breakaway) yards += Math.round(6 + expo(r, 9));
      yards = Math.max(-6, yards);
      return { ...base, yards, seconds: Math.round(4 + Math.max(0, yards) / 7), outOfBounds: r() < 0.07 };
    }
    case "pass-sideline":
    case "pass-middle":
    case "pass-deep":
    case "pass-play-action":
    case "pass-screen": {
      const fitted = passOdds(coverage, call, ytg);
      const factor = sticks === null ? 1 : (STICKS_PASS[sticks][call] ?? 1);
      const odds = factor === 1 ? fitted : { ...fitted, complete: fitted.complete * factor };
      // Deep throws and play-action take longer to develop; a deep pick comes farther downfield.
      const deep = call === "pass-deep";
      const slow = deep || call === "pass-play-action" ? 1 : 0;
      const u = r();
      if (u < odds.sack) return { ...base, yards: deep ? -8 : -7, seconds: 5 + slow, sack: true };
      if (u < odds.sack + odds.interception) return { ...base, yards: deep ? 25 : 12, seconds: 5 + slow, turnover: "interception" };
      if (u < odds.sack + odds.interception + odds.complete) {
        const yards = Math.round(odds.minYards + expo(r, odds.extraYards));
        return { ...base, yards, seconds: Math.round(4 + slow + yards / 10), outOfBounds: r() < odds.outOfBounds };
      }
      return { ...base, yards: 0, seconds: 5 + slow, incomplete: true };
    }
    case "timeout":
    case "fg":
    case "punt":
      throw new RangeError(`not a scrimmage play: ${call}`);
  }
}

function describePlay(call: PlayCall, p: PlayOutcome): string {
  if (call === "kneel") return "Kneel";
  if (call === "spike") return "Spike";
  if (p.turnover === "fumble") return "Run: fumble, lost";
  if (p.turnover === "interception") return `${PLAY_CALLS[call]}: intercepted`;
  if (p.sack) return `${PLAY_CALLS[call]}: sacked for ${-p.yards}`;
  if (p.incomplete) return `${PLAY_CALLS[call]}: incomplete`;
  const gain = p.yards >= 0 ? `+${p.yards}` : `${p.yards}`;
  return `${PLAY_CALLS[call]}: ${gain}${p.outOfBounds ? ", out of bounds" : ", in bounds"}`;
}

/** The down after a play that doesn't convert. 4th down never gets here: it's a turnover on downs. */
const NEXT_DOWN = { 1: 2, 2: 3, 3: 4, 4: 4 } as const satisfies Record<Down, Down>;

function ordinal(n: Down) {
  return ["1st", "2nd", "3rd", "4th"][n - 1];
}

export function describeSpot(ytg: number): string {
  if (ytg === 50) return "midfield";
  return ytg > 50 ? `own ${100 - ytg}` : `opp ${ytg}`;
}

export function downAndDistance(g: GameState): string {
  return `${ordinal(g.down)} & ${g.toGo >= g.ytg ? "goal" : g.toGo} at ${describeSpot(g.ytg)}`;
}

/** Give the ball to the other team, `theirYtg` yards from the goal they attack. */
function changePossession(g: GameState, clock: number, theirYtg: number): GameState {
  const ytg = Math.min(99, Math.max(1, theirYtg));
  return {
    ...g, clock, running: false, poss: other(g.poss),
    down: 1, toGo: Math.min(10, ytg), ytg, over: clock <= 0,
  };
}

/** Kicking-game and try odds. The strategy guide reads these, so it always matches the model. */
export const SPECIAL_TEAMS = Object.freeze({
  /** Extra point success: 95.4% in 2022-2026 NFL regular seasons (about 5,400 kicks). */
  extraPoint: 0.954,
  /** Two-point try success: 48.1% over the same seasons (about 570 tries). */
  twoPoint: 0.481,
  /** Onside kick recovery by the kicking team. */
  onsideRecovery: 0.12,
  /** A team still behind after scoring tries an onside kick with this many seconds left or fewer. */
  onsideWindow: 300,
  /** Kickoffs are touchbacks to the receiving team's 30. */
  touchbackYardLine: 30,
  /** Net punt distance. */
  puntNet: 40,
});

// ---------------------------------------------------------------------------
// The try after a touchdown

export type TryCall = "kick" | "two";
export const TRY_CALLS: Readonly<Record<TryCall, string>> = Object.freeze({ kick: "Kick the extra point", two: "Go for 2" });

/**
 * The scoring team's margin after the 6 points (before the try) at which it goes for two in the
 * simulations: where evaluateTry favors two across the final 10:00. NFL teams almost always go for two
 * down 10, 5 or 2 and up 1 or 5, and about half the time down 8; down 4 is the model's one departure
 * from practice (teams kick 98% of the time), a small edge from a field goal then winning instead of tying.
 */
export const GO_FOR_TWO_MARGINS: readonly number[] = [-10, -8, -5, -4, -2, 1, 5];

/** The rule-of-thumb try both teams follow in the simulations. */
export const tryPolicy = (marginAfterSix: number): TryCall => (GO_FOR_TWO_MARGINS.includes(marginAfterSix) ? "two" : "kick");

/** Points, the try after a touchdown, then the kickoff (onside if the kicking team is still behind late). */
function score(g: GameState, clock: number, points: 3 | 6, r: Rng): { state: GameState; text: string } {
  const scorer = g.poss;
  const sign = scorer === "you" ? 1 : -1;
  let margin = g.margin + sign * points;
  let text = points === 6 ? "Touchdown" : "Field goal is good";
  if (points === 6) {
    if (tryPolicy(marginFor({ ...g, margin }, scorer)) === "two") {
      const good = r() < SPECIAL_TEAMS.twoPoint;
      if (good) margin += sign * 2;
      text += good ? ", 2-point try good" : ", 2-point try fails";
    } else {
      const good = r() < SPECIAL_TEAMS.extraPoint;
      if (good) margin += sign;
      text += good ? ", extra point good" : ", extra point missed";
    }
  }
  return kickoff({ ...g, margin }, clock, text, r);
}

/** After a score by the team with the ball in `scored`: the kickoff, onside if the scorer is still behind late. */
function kickoff(scored: GameState, clock: number, text: string, r: Rng): { state: GameState; text: string } {
  if (clock <= 0) return { state: { ...scored, clock: 0, running: false, over: true }, text: `${text}.` };
  const kickerMargin = marginFor(scored, scored.poss);
  if (kickerMargin < 0 && clock <= SPECIAL_TEAMS.onsideWindow) {
    const t = Math.max(0, clock - 3);
    if (r() < SPECIAL_TEAMS.onsideRecovery) {
      // The kicking team recovers around its own 45 and keeps the ball.
      const kept: GameState = { ...scored, clock: t, running: false, down: 1, toGo: 10, ytg: 55 };
      return { state: kept, text: `${text}. Onside kick recovered by the kicking team.` };
    }
    return { state: changePossession(scored, t, 45), text: `${text}. Onside kick fails.` };
  }
  return { state: changePossession(scored, clock, 100 - SPECIAL_TEAMS.touchbackYardLine), text: `${text}. Kickoff, touchback.` };
}

/**
 * Apply one decision by the team with the ball: the pre-snap clock, the play, the clock after it,
 * a defensive timeout if the defense wants one, and any change of possession.
 */
export function step(g: GameState, call: PlayCall, r: Rng, cfg: SimConfig = DEFAULT_SIM, forced?: PlayOutcome): StepResult {
  if (g.over) throw new RangeError("the game is over");
  const team = g.poss;
  const def = other(team);

  if (call === "timeout") {
    if (g.timeouts[team] === 0) throw new RangeError("no timeouts left");
    const timeouts = { ...g.timeouts, [team]: g.timeouts[team] - 1 };
    const wasted = g.running ? "" : " (the clock was already stopped)";
    return {
      state: { ...g, running: false, timeouts },
      text: `${who(team)} call timeout at ${formatClock(g.clock)}${wasted}, ${timeouts[team]} left.`,
    };
  }

  // Before the snap.
  let t = g.clock;
  const notes: string[] = [];
  if (g.running) {
    const after = t - preSnapBurn(g, call, cfg);
    if (t > WARNING && after <= WARNING) {
      t = WARNING;
      notes.push("Two-minute warning before the snap.");
    } else if (after <= 0) {
      return { state: { ...g, clock: 0, running: false, over: true }, text: "The clock runs out before the snap." };
    } else {
      t = after;
    }
  }
  const snapClock = t;
  const crossed = (after: number) => snapClock > WARNING && after <= WARNING;

  if (call === "fg") {
    const end = Math.max(0, t - 5);
    const distance = g.ytg + 17;
    if (r() < fgMakeChance(g.ytg)) {
      const s = score(g, end, 3, r);
      return { state: s.state, text: `${notes.join(" ")} ${distance}-yard try: ${s.text}`.trim(), driveEnded: "Field goal" };
    }
    // They take over at the spot of the kick, or their 20 if that's farther back.
    const missed = changePossession(g, end, Math.min(80, 100 - (g.ytg + 7)));
    return { state: missed, text: `${notes.join(" ")} ${distance}-yard field goal: no good.`.trim(), driveEnded: "Missed field goal" };
  }

  if (call === "punt") {
    const end = Math.max(0, t - 7);
    const landing = g.ytg - SPECIAL_TEAMS.puntNet;
    const theirYtg = landing < 8 ? 80 : 100 - landing;
    return {
      state: changePossession(g, end, theirYtg),
      text: `${notes.join(" ")} Punt at ${formatClock(snapClock)}. They start at their ${100 - theirYtg}.`.trim(),
      driveEnded: "Punt",
    };
  }

  const play = forced ?? (call === "pass-deep" && snapClock <= HAIL_MARY.maxClock && g.ytg <= HAIL_MARY.maxYtg
    ? rollHailMary(g.ytg, r)
    : rollPlay(call, r, coverageFor(g, snapClock), g.ytg, sticksRunFor(g), sticksBand(g)));
  t = Math.max(0, t - play.seconds);
  const what = `${notes.join(" ")} ${describePlay(call, play)}`.trim();

  if (play.turnover) {
    const spot = g.ytg - play.yards;
    const theirYtg = spot <= 0 ? 80 : 100 - spot;
    return { state: changePossession(g, t, theirYtg), text: `${what}.`, driveEnded: play.turnover === "fumble" ? "Fumble" : "Interception" };
  }

  if (play.yards >= g.ytg) {
    const s = score(g, t, 6, r);
    return { state: s.state, text: `${describePlay(call, { ...play, yards: g.ytg })}. ${s.text}`, driveEnded: "Touchdown" };
  }

  const ytg = Math.min(99, g.ytg - play.yards);
  const firstDown = play.yards >= g.toGo;
  if (!firstDown && g.down === 4) {
    return { state: changePossession(g, t, 100 - ytg), text: `${what}. Turnover on downs.`, driveEnded: "Turnover on downs" };
  }

  let next: GameState = {
    ...g,
    clock: t,
    ytg,
    down: firstDown ? 1 : NEXT_DOWN[g.down],
    toGo: firstDown ? Math.min(10, ytg) : g.toGo - play.yards,
    running: !play.outOfBounds && !play.incomplete && !crossed(t) && t > 0,
    over: t <= 0,
  };
  let text = `${what} at ${formatClock(t)}.`;
  if (crossed(t)) text += " Two-minute warning.";
  if (next.over) return { state: next, text: `${what}. Time expires.` };

  // A defense that's behind stops the clock, unless the two-minute warning is about to do it for free.
  const defenseBehind = marginFor(next, def) < 0;
  const warningComing = t > WARNING && t - preSnapBurn(next, "run", cfg) <= WARNING;
  if (next.running && defenseBehind && next.timeouts[def] > 0 && t <= DEFENSE_TIMEOUT_WINDOW && !warningComing) {
    const timeouts = { ...next.timeouts, [def]: next.timeouts[def] - 1 };
    next = { ...next, running: false, timeouts };
    text += ` ${who(def)} call timeout (${timeouts[def]} left).`;
  }
  return { state: next, text: `${text} ${firstDown ? "First down. " : ""}${downAndDistance(next)}.` };
}

// ---------------------------------------------------------------------------
// The rule-of-thumb policy both teams follow after your decision

/** Whether kneel-downs end the game from here, given the defense's timeouts. */
function canKneelOut(g: GameState): boolean {
  return simulateRunOut({
    gameClock: g.clock, down: g.down, clockRunning: g.running, defTimeouts: g.timeouts[other(g.poss)],
  }).endsGame;
}

export function policy(g: GameState, cfg: SimConfig = DEFAULT_SIM): PlayCall {
  const m = marginFor(g, g.poss);
  const to = g.timeouts[g.poss];
  const t = g.clock;

  if (m > 0) {
    if (canKneelOut(g)) return "kneel";
    if (g.down === 4) return g.ytg <= 35 ? "fg" : g.ytg >= PUNT_MIN_YTG ? "punt" : "run";
    return "run";
  }

  if (m === 0 && g.ytg > 60 && t <= 30) return "kneel"; // take it to overtime

  if (fgPlay(g)) {
    const floor = kickFloor(g, cfg);
    if (g.down === 4 || t <= floor) return g.running && to > 0 ? "timeout" : "fg";
    return "run";
  }

  // Time for one last play, a field goal ties or wins, and it's within reach (a 59-yarder at most): kick,
  // stopping the clock first if it's running.
  if (m <= 0 && m >= -3 && g.ytg <= LAST_PLAY_FG_YTG && t <= 12) {
    if (!g.running) return "fg";
    if (to > 0) return "timeout";
    if (g.down <= 3 && t > cfg.spikeLineup + 1) return "spike";
    return "fg";
  }

  // Need a touchdown, under 30 seconds, and the end zone within reach: throw at it.
  if (m < -3 && t <= 30 && g.ytg <= 40 && !g.running) return "pass-deep";

  // Last play, or close to it, and a field goal won't do: take a shot at the end zone.
  if (t <= 12 && (m < -3 || g.ytg > 42)) return "pass-deep";

  if (g.down === 4) {
    if (m >= -3 && g.ytg <= 42) return "fg";
    if (t > 300 && g.ytg >= 50) return "punt";
    return g.toGo <= 2 ? "run" : g.toGo >= 15 ? "pass-deep" : "pass-middle";
  }
  if (g.running && t <= 120 && to > 0) return "timeout";
  if (g.running && t <= 40 && g.down <= 2) return "spike";
  // Late passing, chosen by testing rules over 48 trailing situations against the calibrated odds:
  // play-action with field and time to work with, the sideline when there's no timeout and little time,
  // otherwise over the middle (sideline catches only get out of bounds about a quarter of the time).
  if (t <= 120) return g.ytg > 40 && t > 30 ? "pass-play-action" : to === 0 && t <= 40 ? "pass-sideline" : "pass-middle";
  return g.down === 1 && g.toGo >= 10 && t > 150 ? "run" : "pass-middle";
}

/** Play the rest of the game out with both teams following the policy. 1 = you win, 0 = you lose. */
export function playOut(
  g: GameState, r: Rng, cfg: SimConfig = DEFAULT_SIM, log?: (s: StepResult, offense: Team) => void,
): number {
  let s = g;
  for (let i = 0; i < 500 && !s.over; i++) {
    const res = step(s, policy(s, cfg), r, cfg);
    log?.(res, s.poss);
    s = res.state;
  }
  return s.margin > 0 ? 1 : s.margin < 0 ? 0 : 0.5;
}

// ---------------------------------------------------------------------------
// Win probability

/**
 * Every situation is simulated on the same random streams (common random numbers), so comparing two
 * situations, e.g. with and without a timeout, compares like with like instead of two independent
 * samples. Estimates stay deterministic.
 */
const SEED = 0x5eed;
const streamFor = (i: number) => seededRng(SEED + i * 7919);

/** Your chance of winning from here, with both teams following the policy. */
export function winProbability(g: GameState, n = 1500, cfg: SimConfig = DEFAULT_SIM): number {
  if (g.over) return g.margin > 0 ? 1 : g.margin < 0 ? 0 : 0.5;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += playOut(g, streamFor(i), cfg);
  return sum / n;
}

/**
 * Your win probability if a play snapped from `g` turns out exactly as `outcome`: the play's result is
 * fixed, and everything after it is simulated, on the same random streams as every other estimate.
 * With no `outcome`, the play's result is rolled as usual. `g.clock` is the clock at the snap, so no
 * time runs off before it.
 */
export function outcomeWinProbability(
  g: GameState, call: PlayCall, outcome: PlayOutcome | undefined, n = 2000, cfg: SimConfig = DEFAULT_SIM,
): number {
  const atSnap = { ...g, running: false };
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const r = streamFor(i);
    sum += playOut(step(atSnap, call, r, cfg, outcome).state, r, cfg);
  }
  return sum / n;
}

/** What one play does to the situation, with its result fixed: the state after it and how it reads. */
export function outcomeStep(g: GameState, call: PlayCall, outcome: PlayOutcome, cfg: SimConfig = DEFAULT_SIM): StepResult {
  return step({ ...g, running: false }, call, streamFor(0), cfg, outcome);
}

/** A call and your win probability if you make it. */
export interface ScoredCall {
  readonly call: PlayCall;
  readonly wp: number;
}

/** Every call available in a situation, scored. Never empty: there's always a play to run. */
export type CallValues = NonEmpty<ScoredCall>;

/**
 * Your win probability for each call available now, followed by the policy afterward.
 * Every call is scored on the same random streams, so differences between calls are less noisy.
 */
export function evaluateCalls(g: GameState, n = 500, cfg: SimConfig = DEFAULT_SIM): CallValues {
  return scoreCalls(g, availableCalls(g), n, cfg);
}

function scoreCalls(g: GameState, calls: readonly PlayCall[], n: number, cfg: SimConfig): CallValues {
  const scorePlay = (state: GameState, call: PlayCall): number => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const r = streamFor(i);
      sum += playOut(step(state, call, r, cfg).state, r, cfg);
    }
    return sum / n;
  };

  const plays = calls.filter((c) => c !== "timeout").map((call): ScoredCall => ({ call, wp: scorePlay(g, call) }));
  const [firstPlay, ...otherPlays] = plays;
  if (firstPlay === undefined) throw new RangeError("the game is over: there are no calls to score");
  const scoredPlays: CallValues = [firstPlay, ...otherPlays];
  if (!calls.includes("timeout")) return scoredPlays;

  // A timeout isn't a play: it stops the clock and spends the timeout, then you run a play.
  const after = step(g, "timeout", streamFor(0), cfg).state;
  const timeoutWp = g.running
    // Stopping the clock changes the situation, so look ahead: the best play from there. This is
    // what the win-probability meter shows after you call it.
    ? bestScored(scoreCalls(after, availableCalls(after).filter((c) => c !== "timeout"), n, cfg)).wp
    // With the clock already stopped, nothing changes but the timeout count. Score the same best
    // play with one fewer timeout, on the same random streams, so the difference is what the timeout
    // was worth (taking the best of several noisy estimates would overstate it). It can't beat that
    // play outright: you could always run it and keep the timeout for later.
    : Math.min(scorePlay(after, bestScored(scoredPlays).call), bestScored(scoredPlays).wp);
  return [{ call: "timeout", wp: timeoutWp }, ...scoredPlays];
}

/**
 * Score every call but a timeout from a situation at the snap, as play-by-play data records it: the
 * clock is where the snap happened, so no time runs off before it, and a timeout is no longer an option.
 */
export function evaluateCallsAtSnap(g: GameState, n = 1500, cfg: SimConfig = DEFAULT_SIM): CallValues {
  const atSnap = { ...g, running: false };
  return scoreCalls(atSnap, availableCalls(atSnap).filter((c) => c !== "timeout"), n, cfg);
}

/** Your win probability with a call that was scored. */
export function wpOf(values: CallValues, call: PlayCall): number {
  const found = values.find((v) => v.call === call);
  if (found === undefined) throw new RangeError(`${call} wasn't available, so it wasn't scored`);
  return found.wp;
}

/** The calls sorted from best to worst win probability. */
/**
 * The calls from best to worst win probability. Exact ties go to the call that spends the least, so a
 * timeout that only matches a play (it can never beat it with the clock stopped) ranks below that play.
 */
export function ranked(values: CallValues): ScoredCall[] {
  return [...values].sort((a, b) => b.wp - a.wp || TIE_ORDER.indexOf(a.call) - TIE_ORDER.indexOf(b.call));
}

/**
 * Calls that can't help with the clock already stopped: a timeout spends a timeout and a spike a down, and
 * neither gains anything. They can tie the best play at most, never beat it.
 */
export function noGainCalls(g: GameState): readonly PlayCall[] {
  return g.running ? [] : ["timeout", "spike"];
}

/** When calls are this close, they count as tied. */
export const TIE = 0.005;

/**
 * Among tied calls, prefer the one that spends the least: no timeout, no down, no risk. On 4th down,
 * a kick counts as less risky than going for it.
 */
const TIE_ORDER: readonly PlayCall[] = [
  "kneel", "run", "punt", "fg", "pass-screen", "pass-middle", "pass-sideline", "pass-play-action", "pass-deep", "spike", "timeout",
];

/** The best call and its win probability. */
export function bestScored(values: CallValues): ScoredCall {
  const top = Math.max(...values.map((v) => v.wp));
  const preference = (v: ScoredCall) => TIE_ORDER.indexOf(v.call);
  return values.reduce((best, v) =>
    v.wp >= top - TIE && (best.wp < top - TIE || preference(v) < preference(best)) ? v : best);
}

export function bestCall(values: CallValues): PlayCall {
  return bestScored(values).call;
}

// ---------------------------------------------------------------------------
// Explaining a decision

export interface Explanation {
  verdict: "best" | "close" | "worse";
  headline: string;
  /** Why the best call was best, and what was wrong with yours if it wasn't. */
  reasons: Reason[];
}

/** Calls within this many win-probability points of the best count as about as good. */
export const CLOSE = 0.015;
/** Calls at least this far below the best are worth warning against. */
export const AVOID = 0.03;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** One reason in an explanation, and the guide section that explains it further. */
export interface Reason {
  readonly text: string;
  readonly section: GuideSection;
}

const reason = (text: string, section: GuideSection): Reason => ({ text, section });

/** Why a call is the best one here, and the guide section that explains it. */
export function bestCallReason(g: GameState, call: PlayCall, cfg: SimConfig = DEFAULT_SIM): Reason {
  return whyBest(g, call, cfg);
}

function whyBest(g: GameState, call: PlayCall, cfg: SimConfig): Reason {
  const m = marginFor(g, g.poss);
  switch (call) {
    case "kneel":
      if (m > 0 && canKneelOut(g))
        return reason("Kneel-downs run out the clock from here, so the opponent never gets the ball back.", "running-out-the-clock");
      if (m > 0) return reason("A kneel keeps the clock running with no risk of a fumble.", "running-out-the-clock");
      return reason("With little time and a long field, taking a tie to overtime beats risking a turnover.", "limitations");
    case "run":
      if (m > 0) return reason("A run keeps the clock moving and rarely turns the ball over.", "running-out-the-clock");
      if (fgPlay(g))
        return reason("A field goal is enough and you're in range. A run drains the clock and protects the ball before the kick.", "field-goal-endgame");
      if (g.ytg <= 5)
        return reason(`At the ${g.ytg}, the defense packs the line, but a run still scores about ${pct(goalLineRunChance(g.ytg))} of the time from here, with little risk of a turnover.`, "red-zone");
      if (g.toGo <= 2) return reason(`On ${ordinal(g.down)} & ${g.toGo}, a run is the surest way to move the chains.`, "play-model");
      return reason(
        g.clock > 120 || !g.running
          ? "A run gains steady yards with little risk, and you have time to spare."
          : "A run gains steady yards with little risk of a turnover.",
        "play-model",
      );
    case "timeout":
      if (fgPlay(g)) return reason("Stop the clock now so there's time to get the kick off.", "field-goal-endgame");
      return reason(`The clock was running with ${formatClock(g.clock)} left. A timeout saves the ${cfg.hurryUp} seconds a hurry-up snap would burn.`, "timeouts");
    case "spike":
      return reason(`A spike stops the clock about ${cfg.spikeLineup} seconds after the play and saves a timeout, at the cost of a down.`, "spike");
    case "pass-sideline": {
      const odds = passOdds(coverageFor(g, g.clock), "pass-sideline", g.ytg);
      return reason(`A sideline throw completes about ${pct(odds.complete / (1 - odds.sack))} of the time, and about ${pct(odds.outOfBounds)} of catches end out of bounds, stopping the clock without spending a timeout.`, "clock-rules");
    }
    case "pass-middle":
      if (g.ytg <= RED_ZONE)
        return reason(`Coverage tightens in the red zone, but a quick throw over the middle still completes about ${pct(passOdds("normal", "pass-middle", g.ytg).complete)} of the time from the ${g.ytg}.`, "red-zone");
      return coverageFor(g, g.clock) === "prevent"
        ? reason(`They're ahead late, so they're playing prevent: deep and soft. Throws over the middle complete about ${pct(PASS_ODDS.prevent["pass-middle"].complete)} of the time against it.`, "prevent-defense")
        : reason("A pass over the middle is the best mix of yards and safety, and the clock isn't the main problem yet.", "play-model");
    case "pass-deep":
      if (g.clock <= 12)
        return reason(`With ${formatClock(g.clock)} left and ${g.ytg} yards to go, there's time for one shot: throw it to the end zone.${g.ytg <= HAIL_MARY.maxYtg ? ` A heave from here scores about ${pct(hailMaryChance(g.ytg))} of the time.` : ""}`, "hail-mary");
      if (g.ytg <= RED_ZONE)
        return reason(`From the ${g.ytg} there's no deep field: a deep pass is a throw into the end zone, and it scores about ${pct(passOdds("normal", "pass-deep", g.ytg).complete)} of the time.`, "red-zone");
      return reason(`You need a big play: ${g.ytg} yards with ${formatClock(g.clock)} left is too far to go in small chunks. A deep pass completes about ${pct(passOdds(coverageFor(g, g.clock), "pass-deep", g.ytg).complete)} of the time, for 20+ yards.`, coverageFor(g, g.clock) === "prevent" ? "prevent-defense" : "play-model");
    case "pass-play-action": {
      const odds = passOdds(coverageFor(g, g.clock), "pass-play-action", g.ytg);
      return reason(`A run fake pulls the linebackers up and opens the middle of the field: play-action completes about ${pct(odds.complete)} of the time here, for ${odds.minYards}+ yards.`, coverageFor(g, g.clock) === "prevent" ? "prevent-defense" : "play-model");
    }
    case "pass-screen": {
      const coverage = coverageFor(g, g.clock);
      return reason(
        coverage === "prevent"
          ? `They're playing soft, so a screen gets the ball out fast into open space: it completes about ${pct(PASS_ODDS.prevent["pass-screen"].complete)} of the time and is almost never sacked or picked off.`
          : `A screen is the safest throw: it completes about ${pct(passOdds(coverage, "pass-screen", g.ytg).complete)} of the time and is almost never sacked or picked off, for steady yards.`,
        coverage === "prevent" ? "prevent-defense" : "play-model",
      );
    }
    case "fg": {
      const after = m + 3;
      const effect = after > 0 && m <= 0 ? "wins it" : after === 0 ? "ties it" : "adds to the lead";
      return reason(`A ${g.ytg + 17}-yard try is good about ${pct(fgMakeChance(g.ytg))} of the time, and it ${effect}.`, "field-goal-endgame");
    }
    case "punt":
      return reason("Punting pins them deep. Failing on 4th down here would hand them a short field.", "fourth-down");
  }
}

function whyNot(g: GameState, call: PlayCall): Reason | null {
  const m = marginFor(g, g.poss);
  if (call === "timeout" && !g.running)
    return reason("A timeout gains nothing with the clock already stopped, and spends one you may need later.", "timeouts");
  if (call === "spike" && !g.running) return reason("A spike gains nothing with the clock already stopped, and throws away a down.", "spike");
  if (call === "kneel" && m <= 0) return reason("Kneeling gives up a down and time you need.", "clock-rules");
  if (call === "pass-deep" && m <= 0) {
    const coverage = coverageFor(g, g.clock);
    const odds = passOdds(coverage, "pass-deep", g.ytg);
    if (g.ytg <= RED_ZONE)
      return reason(`From the ${g.ytg} there's no room to throw deep: an end-zone throw scores only about ${pct(odds.complete)} of the time. Shorter throws and runs were the better bet.`, "red-zone");
    return coverage === "prevent"
      ? reason(`They're ahead late and playing prevent, with safeties deep: a deep pass completes only about ${pct(odds.complete)} of the time and is picked off about ${pct(odds.interception)}. Shorter throws were the better bet.`, "prevent-defense")
      : reason(`A deep pass completes only about ${pct(odds.complete)} of the time and risks a sack or an interception; shorter throws were the better bet here.`, "play-model");
  }
  if ((call === "pass-middle" || call === "pass-sideline" || call === "pass-deep" || call === "pass-play-action" || call === "pass-screen") && m > 0)
    return reason("A pass risks an incompletion that stops the clock for them, and an interception.", "running-out-the-clock");
  if (call === "fg" && fgPlay(g) && g.down < 4 && g.clock > 20)
    return reason("Kicking now leaves them time to answer. Drain the clock first.", "field-goal-endgame");
  if (call === "punt") {
    return reason(
      m <= 0 ? "Punting gives the ball back when you need to score." : "Punting gives the ball back when you still had a good chance to keep it.",
      "fourth-down",
    );
  }
  if ((call === "run" || call === "kneel") && m < 0 && !fgPlay(g) && g.clock <= 120)
    return reason("A play that ends in bounds keeps the clock running when you're short on time.", "clock-rules");
  return null;
}

/**
 * With the clock already stopped, a timeout spends a timeout and a spike spends a down, and neither
 * gains anything. Any cost at all makes them a mistake, even one too small to otherwise count.
 */
const wastesResource = (g: GameState, call: PlayCall) => !g.running && (call === "timeout" || call === "spike");

export function explain(g: GameState, chosen: PlayCall, values: CallValues, cfg: SimConfig = DEFAULT_SIM): Explanation {
  const { call: best, wp: top } = bestScored(values);
  const mine = wpOf(values, chosen);
  const wasted = wastesResource(g, chosen);
  if (chosen === best || (top - mine <= TIE && !wasted)) {
    return { verdict: "best", headline: `Best call: ${PLAY_CALLS[chosen]} (${pct(mine)})`, reasons: [whyBest(g, chosen, cfg)] };
  }
  const reasons = [whyBest(g, best, cfg)];
  const not = whyNot(g, chosen);
  if (not) reasons.push(not);
  if (wasted) {
    const what = chosen === "timeout" ? "Your timeout" : "Your spike";
    return {
      verdict: "worse",
      headline: `Better call: ${PLAY_CALLS[best]} (${pct(top)}). ${what} gained nothing: the clock was already stopped.`,
      reasons,
    };
  }
  if (top - mine <= CLOSE) {
    return {
      verdict: "close",
      headline: `Close: ${PLAY_CALLS[best]} was about as good (${pct(top)} vs ${pct(mine)})`,
      reasons,
    };
  }
  return {
    verdict: "worse",
    headline: `Better call: ${PLAY_CALLS[best]} (${pct(top)} vs your ${pct(mine)})`,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Game recap

export interface Swing<T> {
  /** The step, e.g. a call in the play log. */
  item: T;
  /** Its position in the drive, from 0. */
  index: number;
  before: number;
  after: number;
  /** Win probability added (negative if lost). */
  added: number;
}

/**
 * The step with the largest win probability added or lost. Each step runs from its own `before` to
 * the next step's, and the last one runs to `final`.
 */
export function biggestSwing<T>(steps: readonly { item: T; before: number }[], final: number): Swing<T> | null {
  let biggest: Swing<T> | null = null;
  steps.forEach(({ item, before }, index) => {
    const after = steps[index + 1]?.before ?? final;
    const added = after - before;
    if (biggest === null || Math.abs(added) > Math.abs(biggest.added)) biggest = { item, index, before, after, added };
  });
  return biggest;
}

// ---------------------------------------------------------------------------
// Recommending a call without playing it

export interface Recommendation {
  best: PlayCall;
  /** Your win probability with the best call. */
  wp: number;
  /** Why the best call is best. */
  reason: Reason;
  /** The next-best call, and whether it's close enough to be a coin flip. */
  runnerUp: { call: PlayCall; wp: number; close: boolean } | null;
  /** Calls to avoid here, with why, worst first. */
  avoid: Avoid[];
}

export interface Avoid {
  call: PlayCall;
  wp: number;
  reason: Reason;
}

export function recommend(g: GameState, values: CallValues, cfg: SimConfig = DEFAULT_SIM): Recommendation {
  const { call: best, wp } = bestScored(values);
  const others = ranked(values).filter((v) => v.call !== best);
  // With the clock already stopped, a timeout or a spike only postpones the decision, so neither is a real alternative.
  const next = others.find((v) => g.running || (v.call !== "timeout" && v.call !== "spike"));
  const runnerUp = next === undefined ? null : { call: next.call, wp: next.wp, close: wp - next.wp <= CLOSE };
  const avoid = others
    // A timeout or spike with the clock stopped is always worth avoiding, even when it costs nothing
    // measurable: it gives up something and can't gain anything.
    .filter((v) => wp - v.wp >= AVOID || wastesResource(g, v.call))
    .flatMap((v): Avoid[] => {
      const why = whyNot(g, v.call);
      return why === null ? [] : [{ call: v.call, wp: v.wp, reason: why }];
    })
    .sort((a, b) => a.wp - b.wp);
  return { best, wp, reason: whyBest(g, best, cfg), runnerUp, avoid };
}

// ---------------------------------------------------------------------------
// Kick or go for two

export interface TryValues {
  /** Your win probability if the try adds 0, 1 or 2 points, everything after it simulated. */
  byPoints: readonly [number, number, number];
  /** Your win probability with each call, at the league's success rates. */
  kick: number;
  two: number;
  best: TryCall;
  /** The two-point success rate at which going for two is as good as kicking (null: two never helps). */
  breakEven: number | null;
}

/**
 * Kick or go for two, for you, just after you score a touchdown. `g.margin` already counts the 6
 * points, `g.clock` is the time left after the touchdown, and the kickoff follows the try.
 */
export function evaluateTry(g: GameState, n = 3000, cfg: SimConfig = DEFAULT_SIM): TryValues {
  const scored: GameState = { ...g, poss: "you", running: false };
  const wpAfter = (extra: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const r = streamFor(i);
      const s = kickoff({ ...scored, margin: scored.margin + extra }, scored.clock, "", r).state;
      sum += s.over ? (s.margin > 0 ? 1 : s.margin < 0 ? 0 : 0.5) : playOut(s, r, cfg);
    }
    return sum / n;
  };
  const byPoints = [wpAfter(0), wpAfter(1), wpAfter(2)] as const;
  const [w0, w1, w2] = byPoints;
  const kick = w0 + SPECIAL_TEAMS.extraPoint * (w1 - w0);
  const two = w0 + SPECIAL_TEAMS.twoPoint * (w2 - w0);
  const gain = w2 - w0;
  const breakEven = gain > 0 ? Math.min(1, (SPECIAL_TEAMS.extraPoint * (w1 - w0)) / gain) : null;
  return { byPoints, kick, two, best: two > kick ? "two" : "kick", breakEven };
}
