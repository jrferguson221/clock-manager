// Play-by-play game simulator and Monte Carlo win probability.
// Pure functions, no React or DOM access. All times are in whole seconds.
//
// The model is deliberately simple: each call has a fixed outcome distribution, both teams follow
// a rule-of-thumb policy after your decision, and a tie at 0:00 is a coin flip in overtime.

import { NFL_RULES, PLAY_TYPES, simulateRunOut, type Down } from "./engine";
import { formatClock } from "./time";

export type Team = "you" | "opp";
export type PlayCall = "timeout" | "run" | "pass-sideline" | "pass-middle" | "pass-deep" | "spike" | "kneel" | "fg" | "punt";

export const PLAY_CALLS: Readonly<Record<PlayCall, string>> = Object.freeze({
  timeout: "Timeout",
  run: "Run",
  "pass-sideline": "Pass to the sideline",
  "pass-middle": "Pass over the middle",
  "pass-deep": "Deep pass",
  spike: "Spike",
  kneel: "Kneel",
  fg: "Field goal",
  punt: "Punt",
});

export interface GameState {
  /** Seconds left in the game. */
  clock: number;
  running: boolean;
  /** The team with the ball. */
  poss: Team;
  down: Down;
  toGo: number;
  /** Yards from the ball to the goal line the team with the ball is attacking. */
  ytg: number;
  /** Your points minus the opponent's. */
  margin: number;
  timeouts: Record<Team, number>;
  over: boolean;
}

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
const FG_MAX_YTG = 45; // a 62-yard try
const PUNT_MIN_YTG = 40;
/** Fewest seconds from the end of an in-bounds play to the next snap, even when rushing. */
const MIN_SNAP = 8;

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

/** Field-goal make chance for a try from this spot: roughly the NFL's recent rates by distance. */
export function fgMakeChance(ytg: number): number {
  const distance = ytg + 17;
  return 1 / (1 + Math.exp(0.12 * (distance - 57)));
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
  calls.push("run", "pass-sideline", "pass-middle", "pass-deep");
  if (g.down <= 3) calls.push("spike");
  calls.push("kneel");
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

interface PlayOutcome {
  yards: number;
  seconds: number;
  outOfBounds: boolean;
  incomplete: boolean;
  turnover?: "interception" | "fumble";
  sack?: boolean;
}

function rollPlay(call: PlayCall, r: Rng): PlayOutcome {
  const base = { outOfBounds: false, incomplete: false };
  switch (call) {
    case "kneel":
      return { ...base, yards: -1, seconds: PLAY_TYPES.kneel.duration };
    case "spike":
      return { ...base, yards: 0, seconds: 1, incomplete: true };
    case "run": {
      if (r() < 0.012) return { ...base, yards: 1, seconds: 5, turnover: "fumble" };
      let yards = Math.round(3.6 + 3.2 * gauss(r));
      if (r() < 0.1) yards += Math.round(6 + expo(r, 9));
      yards = Math.max(-6, yards);
      return { ...base, yards, seconds: Math.round(4 + Math.max(0, yards) / 7), outOfBounds: r() < 0.07 };
    }
    case "pass-sideline":
    case "pass-middle": {
      const sideline = call === "pass-sideline";
      const u = r();
      const intAt = 0.06 + (sideline ? 0.025 : 0.03);
      const completeAt = intAt + (sideline ? 0.52 : 0.6);
      if (u < 0.06) return { ...base, yards: -7, seconds: 5, sack: true };
      if (u < intAt) return { ...base, yards: 12, seconds: 5, turnover: "interception" };
      if (u < completeAt) {
        const yards = Math.round(4 + expo(r, sideline ? 6 : 7));
        return { ...base, yards, seconds: Math.round(4 + yards / 10), outOfBounds: r() < (sideline ? 0.7 : 0.08) };
      }
      return { ...base, yards: 0, seconds: 5, incomplete: true };
    }
    case "pass-deep": {
      // A long-developing throw 20+ yards downfield: more sacks and picks, fewer completions.
      const u = r();
      if (u < 0.08) return { ...base, yards: -8, seconds: 6, sack: true };
      if (u < 0.13) return { ...base, yards: 25, seconds: 6, turnover: "interception" };
      if (u < 0.48) {
        const yards = Math.round(20 + expo(r, 12));
        return { ...base, yards, seconds: Math.round(5 + yards / 10), outOfBounds: r() < 0.25 };
      }
      return { ...base, yards: 0, seconds: 6, incomplete: true };
    }
    default:
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

/** Points, the try after a touchdown, then the kickoff (onside if the kicking team is still behind late). */
function score(g: GameState, clock: number, points: 3 | 6, r: Rng): { state: GameState; text: string } {
  const scorer = g.poss;
  const sign = scorer === "you" ? 1 : -1;
  let margin = g.margin + sign * points;
  let text = points === 6 ? "Touchdown" : "Field goal is good";
  if (points === 6) {
    const after = marginFor({ ...g, margin }, scorer);
    if (after === -2) {
      const good = r() < 0.48;
      if (good) margin += sign * 2;
      text += good ? ", 2-point try good" : ", 2-point try fails";
    } else {
      const good = r() < 0.95;
      if (good) margin += sign;
      text += good ? ", extra point good" : ", extra point missed";
    }
  }
  const scored = { ...g, margin };
  if (clock <= 0) return { state: { ...scored, clock: 0, running: false, over: true }, text: `${text}.` };

  const kickerMargin = marginFor(scored, scorer);
  if (kickerMargin < 0 && clock <= 300) {
    const t = Math.max(0, clock - 3);
    if (r() < 0.12) {
      // The kicking team recovers around its own 45 and keeps the ball.
      const kept: GameState = { ...scored, clock: t, running: false, down: 1, toGo: 10, ytg: 55 };
      return { state: kept, text: `${text}. Onside kick recovered by the kicking team.` };
    }
    return { state: changePossession(scored, t, 45), text: `${text}. Onside kick fails.` };
  }
  return { state: changePossession(scored, clock, 70), text: `${text}. Kickoff, touchback.` };
}

/**
 * Apply one decision by the team with the ball: the pre-snap clock, the play, the clock after it,
 * a defensive timeout if the defense wants one, and any change of possession.
 */
export function step(g: GameState, call: PlayCall, r: Rng, cfg: SimConfig = DEFAULT_SIM): StepResult {
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
    const landing = g.ytg - 40;
    const theirYtg = landing < 8 ? 80 : 100 - landing;
    return {
      state: changePossession(g, end, theirYtg),
      text: `${notes.join(" ")} Punt at ${formatClock(snapClock)}. They start at their ${100 - theirYtg}.`.trim(),
      driveEnded: "Punt",
    };
  }

  const play = rollPlay(call, r);
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
  if (next.running && defenseBehind && next.timeouts[def] > 0 && t <= 240 && !warningComing) {
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

  // Last play, or close to it, and a field goal won't do: take a shot at the end zone.
  if (t <= 12 && (m < -3 || g.ytg > 42)) return "pass-deep";

  if (g.down === 4) {
    if (m >= -3 && g.ytg <= 42) return "fg";
    if (t > 300 && g.ytg >= 50) return "punt";
    return g.toGo <= 2 ? "run" : g.toGo >= 15 ? "pass-deep" : "pass-middle";
  }
  if (g.running && t <= 120 && to > 0) return "timeout";
  if (g.running && t <= 40 && g.down <= 2) return "spike";
  if (t <= 120) return to === 0 || t <= 30 ? "pass-sideline" : "pass-middle";
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

function seedFor(g: GameState): number {
  const key = [g.clock, +g.running, g.poss, g.down, g.toGo, g.ytg, g.margin, g.timeouts.you, g.timeouts.opp].join("|");
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Your chance of winning from here, with both teams following the policy. */
export function winProbability(g: GameState, n = 1500, cfg: SimConfig = DEFAULT_SIM): number {
  if (g.over) return g.margin > 0 ? 1 : g.margin < 0 ? 0 : 0.5;
  const seed = seedFor(g);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += playOut(g, seededRng(seed + i * 7919), cfg);
  return sum / n;
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
  const seed = seedFor(g);
  const score = (call: PlayCall): ScoredCall => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const r = seededRng(seed + i * 7919);
      sum += playOut(step(g, call, r, cfg).state, r, cfg);
    }
    return { call, wp: sum / n };
  };
  const [first, ...rest] = availableCalls(g);
  if (first === undefined) throw new RangeError("the game is over: there are no calls to score");
  return [score(first), ...rest.map(score)];
}

/** Your win probability with a call that was scored. */
export function wpOf(values: CallValues, call: PlayCall): number {
  const found = values.find((v) => v.call === call);
  if (found === undefined) throw new RangeError(`${call} wasn't available, so it wasn't scored`);
  return found.wp;
}

/** The calls sorted from best to worst win probability. */
export function ranked(values: CallValues): ScoredCall[] {
  return [...values].sort((a, b) => b.wp - a.wp);
}

/** When calls are this close, they count as tied. */
export const TIE = 0.005;

/**
 * Among tied calls, prefer the one that spends the least: no timeout, no down, no risk. On 4th down,
 * a kick counts as less risky than going for it.
 */
const TIE_ORDER: readonly PlayCall[] = ["kneel", "run", "punt", "fg", "pass-middle", "pass-sideline", "pass-deep", "spike", "timeout"];

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
  reasons: string[];
}

/** Calls within this many win-probability points of the best count as about as good. */
export const CLOSE = 0.015;
/** Calls at least this far below the best are worth warning against. */
export const AVOID = 0.03;

const pct = (x: number) => `${Math.round(x * 100)}%`;

function whyBest(g: GameState, call: PlayCall, cfg: SimConfig): string {
  const m = marginFor(g, g.poss);
  switch (call) {
    case "kneel":
      if (m > 0 && canKneelOut(g)) return "Kneel-downs run out the clock from here, so the opponent never gets the ball back.";
      if (m > 0) return "A kneel keeps the clock running with no risk of a fumble.";
      return "With little time and a long field, taking a tie to overtime beats risking a turnover.";
    case "run":
      if (m > 0) return "A run keeps the clock moving and rarely turns the ball over.";
      if (fgPlay(g)) return "A field goal is enough and you're in range. A run drains the clock and protects the ball before the kick.";
      if (g.toGo <= 2) return `On ${ordinal(g.down)} & ${g.toGo}, a run is the surest way to move the chains.`;
      return g.clock > 120 || !g.running
        ? "A run gains steady yards with little risk, and you have time to spare."
        : "A run gains steady yards with little risk of a turnover.";
    case "timeout":
      if (fgPlay(g)) return `Stop the clock now so there's time to get the kick off.`;
      return `The clock was running with ${formatClock(g.clock)} left. A timeout saves the ${cfg.hurryUp} seconds a hurry-up snap would burn.`;
    case "spike":
      return `A spike stops the clock about ${cfg.spikeLineup} seconds after the play and saves a timeout, at the cost of a down.`;
    case "pass-sideline":
      return "A sideline throw usually ends out of bounds, which stops the clock without spending a timeout.";
    case "pass-middle":
      return "A pass over the middle is the best mix of yards and safety, and the clock isn't the main problem yet.";
    case "pass-deep":
      return g.clock <= 12
        ? `With ${formatClock(g.clock)} left and ${g.ytg} yards to go, there's time for one shot: throw it to the end zone.`
        : `You need a big play: ${g.ytg} yards with ${formatClock(g.clock)} left is too far to go in small chunks. A deep pass completes about a third of the time, for 20+ yards.`;
    case "fg": {
      const after = m + 3;
      const effect = after > 0 && m <= 0 ? "wins it" : after === 0 ? "ties it" : "adds to the lead";
      return `A ${g.ytg + 17}-yard try is good about ${pct(fgMakeChance(g.ytg))} of the time, and it ${effect}.`;
    }
    case "punt":
      return "Punting pins them deep. Failing on 4th down here would hand them a short field.";
  }
}

function whyNot(g: GameState, call: PlayCall): string | null {
  const m = marginFor(g, g.poss);
  if (call === "timeout" && !g.running) return "Your timeout was wasted: the clock was already stopped.";
  if (call === "spike" && !g.running) return "Spiking with the clock already stopped throws away a down.";
  if (call === "kneel" && m <= 0) return "Kneeling gives up a down and time you need.";
  if (call === "pass-deep" && m <= 0)
    return "A deep pass completes only about a third of the time and risks a sack or an interception; shorter throws were the better bet here.";
  if ((call === "pass-middle" || call === "pass-sideline" || call === "pass-deep") && m > 0)
    return "A pass risks an incompletion that stops the clock for them, and an interception.";
  if (call === "fg" && fgPlay(g) && g.down < 4 && g.clock > 20) return "Kicking now leaves them time to answer. Drain the clock first.";
  if (call === "punt") {
    return m <= 0
      ? "Punting gives the ball back when you need to score."
      : "Punting gives the ball back when you still had a good chance to keep it.";
  }
  if ((call === "run" || call === "kneel") && m < 0 && !fgPlay(g) && g.clock <= 120)
    return "A play that ends in bounds keeps the clock running when you're short on time.";
  return null;
}

export function explain(g: GameState, chosen: PlayCall, values: CallValues, cfg: SimConfig = DEFAULT_SIM): Explanation {
  const { call: best, wp: top } = bestScored(values);
  const mine = wpOf(values, chosen);
  if (chosen === best || top - mine <= TIE) {
    return { verdict: "best", headline: `Best call: ${PLAY_CALLS[chosen]} (${pct(mine)})`, reasons: [whyBest(g, chosen, cfg)] };
  }
  const reasons = [whyBest(g, best, cfg)];
  const not = whyNot(g, chosen);
  if (not) reasons.push(not);
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
  reason: string;
  /** The next-best call, and whether it's close enough to be a coin flip. */
  runnerUp: { call: PlayCall; wp: number; close: boolean } | null;
  /** Calls to avoid here, with why, worst first. */
  avoid: Avoid[];
}

export interface Avoid {
  call: PlayCall;
  wp: number;
  reason: string;
}

export function recommend(g: GameState, values: CallValues, cfg: SimConfig = DEFAULT_SIM): Recommendation {
  const { call: best, wp } = bestScored(values);
  const others = ranked(values).filter((v) => v.call !== best);
  // With the clock already stopped, a timeout or a spike only postpones the decision, so neither is a real alternative.
  const next = others.find((v) => g.running || (v.call !== "timeout" && v.call !== "spike"));
  const runnerUp = next === undefined ? null : { call: next.call, wp: next.wp, close: wp - next.wp <= CLOSE };
  const avoid = others
    .filter((v) => wp - v.wp >= AVOID)
    .flatMap((v): Avoid[] => {
      const reason = whyNot(g, v.call);
      return reason === null ? [] : [{ call: v.call, wp: v.wp, reason }];
    })
    .sort((a, b) => a.wp - b.wp);
  return { best, wp, reason: whyBest(g, best, cfg), runnerUp, avoid };
}
