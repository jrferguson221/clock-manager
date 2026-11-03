// Trailing-team drive planning: how many plays fit in the time left, and what to call next.
// Pure functions, no React or DOM access. All times are in whole seconds.

import { NFL_RULES, type Down, type Rules, type TimelineEvent } from "./engine";
import { formatClock } from "./time";

export type ScoreNeeded = "td" | "fg";

export interface DriveSituation {
  /** Seconds left in the game. */
  gameClock: number;
  /** Whether the game clock is running right now (the last play ended in bounds). */
  clockRunning: boolean;
  /** Timeouts the trailing offense has left. */
  timeouts: number;
  /** Down of the next snap. */
  down: Down;
  /** Yards from the ball to the opponent's goal line (1-99). */
  yardsToGoal: number;
  need: ScoreNeeded;
  /** Whether the two-minute warning has already happened (derived from the clock if omitted). */
  warningUsed?: boolean;
}

export interface DriveAssumptions {
  /** Seconds a typical play takes from snap to whistle. */
  playDuration: number;
  /** Seconds from the end of an in-bounds play to the next no-huddle snap. */
  hurryUp: number;
  /** Seconds from the end of an in-bounds play to a spike. */
  spikeLineup: number;
  /** Average yards gained per play. */
  yardsPerPlay: number;
  /** Yards from the goal line you're willing to kick from (35 = a 52-yard try). */
  fgRange: number;
  /** Share of plays that stop the clock (incomplete or out of bounds) in a typical drive. */
  stopShare: number;
}

export const DEFAULT_ASSUMPTIONS: DriveAssumptions = Object.freeze({
  playDuration: 6,
  hurryUp: 18,
  spikeLineup: 12,
  yardsPerPlay: 7,
  fgRange: 35,
  stopShare: 0.5,
});

/** Field-goal try distance from a spot: end zone (10) plus the hold (7). */
export const fgDistance = (yardsToGoal: number) => yardsToGoal + 17;

/** Plays needed to score a TD, or to reach field-goal range (0 if already there). */
export function playsNeeded(s: DriveSituation, a: DriveAssumptions = DEFAULT_ASSUMPTIONS): number {
  const target = s.need === "td" ? 0 : a.fgRange;
  return Math.ceil(Math.max(0, s.yardsToGoal - target) / a.yardsPerPlay);
}

/**
 * "inbounds": every play ends in bounds (the worst case for the clock).
 * "typical": a share of plays (assumptions.stopShare) stop the clock, spread evenly.
 * "stops-clock": every play ends out of bounds or incomplete (the best case).
 */
export type ClockMode = "inbounds" | "typical" | "stops-clock";

function playStopsClock(mode: ClockMode, playNumber: number, share: number): boolean {
  if (mode === "inbounds") return false;
  if (mode === "stops-clock") return true;
  return Math.floor(playNumber * share) > Math.floor((playNumber - 1) * share);
}

export interface DriveBudget {
  /**
   * Most offensive plays that fit. For a TD that counts every snap before the clock expires.
   * For a field goal, it's the most plays after which you can still stop the clock and kick;
   * -1 means there isn't time to kick even now.
   */
  plays: number;
  timeline: TimelineEvent[];
}

/**
 * Simulate a drive that never stops for downs, stopping the clock as often as possible:
 * the two-minute warning when it's about to hit, then timeouts, then hurry-up.
 * For a field goal, one timeout is held back for the kick.
 */
export function driveBudget(
  s: DriveSituation,
  mode: ClockMode,
  a: DriveAssumptions = DEFAULT_ASSUMPTIONS,
  rules: Rules = NFL_RULES,
): DriveBudget {
  const warnAt = rules.twoMinuteWarning;
  let t = s.gameClock;
  let running = s.clockRunning;
  let to = s.timeouts;
  let warningUsed = s.warningUsed ?? (warnAt == null || t <= warnAt);
  const reserve = s.need === "fg" && to > 0 ? 1 : 0;
  const timeline: TimelineEvent[] = [];
  const log = (event: string, note: string) => timeline.push({ event, clock: t, note });
  const crossesWarning = (before: number, after: number) =>
    !warningUsed && warnAt != null && before > warnAt && after <= warnAt;

  // A kick fits if the clock is stopped, a timeout can stop it, or there's time to spike first.
  const canKick = () => t > 0 && (!running || to > 0 || t > a.spikeLineup + 1);

  let plays = 0;
  let kickable = canKick() ? 0 : -1;

  for (;;) {
    // Before the snap: stop the clock if it's running and you can.
    if (running) {
      const afterHurry = t - a.hurryUp;
      if (crossesWarning(t, afterHurry)) {
        t = warnAt!;
        warningUsed = true;
        log("Two-minute warning", "free stop: no timeout needed");
      } else if (to > reserve) {
        to--;
        log("Timeout", `${to} left`);
      } else {
        t = Math.max(0, afterHurry);
        log("Hurry up", `${a.hurryUp}s to the next snap`);
      }
      running = false;
      if (t <= 0) break;
    }

    // The snap.
    const before = t;
    t = Math.max(0, t - a.playDuration);
    plays++;
    const stops = playStopsClock(mode, plays, a.stopShare);
    log(`Play ${plays}`, stops ? "out of bounds or incomplete" : "ends in bounds");
    if (t <= 0) break;

    running = !stops;
    if (crossesWarning(before, t)) {
      warningUsed = true;
      running = false;
      log("Two-minute warning", "clock stops after the play");
    }
    if (canKick()) kickable = plays;
  }

  if (s.need === "fg" && kickable >= 0) log("Field goal", reserve ? "after the saved timeout" : "after a stop");
  return { plays: s.need === "td" ? plays : kickable, timeline };
}

export type Call = "run-play" | "hurry" | "timeout" | "spike" | "let-warning-hit" | "kick" | "burn-then-kick";

export interface Advice {
  call: Call;
  headline: string;
  detail: string;
}

/**
 * Rule-of-thumb advice for the moment between plays.
 * Stop the clock only when the typical budget leaves fewer than `slack` spare plays.
 */
export function adviseNextCall(
  s: DriveSituation,
  a: DriveAssumptions = DEFAULT_ASSUMPTIONS,
  rules: Rules = NFL_RULES,
  slack = 1,
): Advice {
  const warnAt = rules.twoMinuteWarning;
  const warningUsed = s.warningUsed ?? (warnAt == null || s.gameClock <= warnAt);
  const t = s.gameClock;
  const needed = playsNeeded(s, a);
  const canSpike = s.down <= 3 && t > a.spikeLineup + 1;

  // Already in field-goal range: drain the clock, then stop it and kick.
  if (s.need === "fg" && needed === 0) {
    if (!s.clockRunning) {
      return s.timeouts > 0
        ? { call: "burn-then-kick", headline: "Run the ball in bounds, then kick",
            detail: "You're in range. Run safe in-bounds plays to drain the clock, then call timeout with about 3 seconds left and kick." }
        : { call: "kick", headline: "Kick now",
            detail: "You're in range with no timeouts. Running another play risks not being able to stop the clock again." };
    }
    if (s.timeouts > 0) {
      return t > 4
        ? { call: "burn-then-kick", headline: "Let it run, then call timeout and kick",
            detail: "Let the clock run to about 0:03, call timeout, then kick, so the opponent gets little or no time back." }
        : { call: "timeout", headline: "Timeout now, then kick", detail: "The clock is almost out." };
    }
    return canSpike
      ? { call: "spike", headline: `Spike by about 0:${String(a.spikeLineup + 3).padStart(2, "0")}, then kick`,
          detail: "With no timeouts, a spike is the only way to stop the clock. It uses a down, so kick on the next one." }
      : { call: "kick", headline: "Hurry the field-goal unit on", detail: "You can't spike on 4th down or this late, so get the kick off." };
  }

  const typical = driveBudget(s, "typical", a, rules).plays;
  const best = driveBudget(s, "stops-clock", a, rules).plays;
  const budget = `You need about ${needed} play${needed === 1 ? "" : "s"}, and have time for about ${typical} if half your plays stop the clock.`;
  const longShot = best < needed ? " This is a long shot: even if every play stops the clock, you need big plays." : "";

  if (!s.clockRunning) {
    return { call: "run-play", headline: "The clock is stopped: run your play", detail: budget + longShot };
  }
  if (!warningUsed && t > warnAt! && t - a.hurryUp <= warnAt!) {
    return { call: "let-warning-hit", headline: "Don't call timeout",
      detail: "The two-minute warning will stop the clock at 2:00 for free. " + budget };
  }
  if (typical - needed >= slack) {
    return { call: "hurry", headline: "Hurry up. Save your timeouts", detail: budget };
  }

  // Time is tight: stop the clock.
  const reserve = s.need === "fg" ? 1 : 0;
  const spareTimeouts = s.timeouts - reserve;
  if (canSpike && s.down <= 2 && spareTimeouts <= 1) {
    const why = s.timeouts === 0
      ? `It costs a down, but it stops the clock faster than a ${a.hurryUp}-second hurry-up snap.`
      : `It costs a down and about ${a.spikeLineup}s but saves ${s.timeouts === 1 ? "your last timeout" : "a timeout"}.`;
    return { call: "spike", headline: "Spike it", detail: `${why} ${budget}${longShot}` };
  }
  if (s.timeouts > 0) {
    const note = spareTimeouts <= 0 ? " That's the timeout you were saving for the kick." : "";
    return { call: "timeout", headline: "Call timeout", detail: budget + note + longShot };
  }
  if (canSpike) {
    return { call: "spike", headline: "Spike it",
      detail: (s.down === 3 ? "Spiking on 3rd down leaves only 4th down. " : "") + budget + longShot };
  }
  if (t <= a.hurryUp) {
    return { call: "hurry", headline: "Snap it as fast as you can",
      detail: `There's less time than a normal ${a.hurryUp}-second hurry-up. Get to the line, snap right away, and throw to the end zone or the sideline.` };
  }
  return { call: "hurry", headline: "Hurry up and get out of bounds",
    detail: "You have no way left to stop the clock, so throw to the sideline. " + budget + longShot };
}

// ---------------------------------------------------------------------------
// Live drive tracking: apply an entered play result to the situation.

export type PlayOutcome = "inbounds" | "out-of-bounds" | "incomplete" | "spike" | "timeout";

export const PLAY_OUTCOMES: Readonly<Record<PlayOutcome, { label: string; hasYards: boolean }>> = Object.freeze({
  inbounds: { label: "In bounds", hasYards: true },
  "out-of-bounds": { label: "Out of bounds", hasYards: true },
  incomplete: { label: "Incomplete pass", hasYards: false },
  spike: { label: "Spike", hasYards: false },
  timeout: { label: "Timeout", hasYards: false },
});

/** A drive situation plus the yards needed for a first down. */
export interface DriveState extends DriveSituation {
  toGo: number;
}

export interface PlayEntry {
  outcome: PlayOutcome;
  /** Yards gained (negative for a loss). Ignored for outcomes without yards. */
  yards: number;
  /** Game clock when the play ended, or when the timeout was called. */
  clockAfter: number;
}

export type DriveEnd = "touchdown" | "turnover-on-downs" | "time-expired";

export interface PlayUpdate {
  state: DriveState;
  summary: string;
  ended?: DriveEnd;
}

/** Returns why an entry can't be applied, or null if it's fine. */
export function checkPlay(s: DriveState, p: PlayEntry): string | null {
  if (p.clockAfter > s.gameClock) return "The clock after the play can't be later than the clock now.";
  if (p.outcome === "timeout" && s.timeouts === 0) return "You have no timeouts left.";
  if (p.outcome === "spike" && s.down === 4) return "Spiking on 4th down turns the ball over.";
  if (PLAY_OUTCOMES[p.outcome].hasYards && !Number.isFinite(p.yards)) return "Enter the yards gained.";
  return null;
}

/** "own 25", "opp 40", or "midfield" for a distance from the opponent's goal line. */
export function describeSpot(yardsToGoal: number): string {
  if (yardsToGoal === 50) return "midfield";
  return yardsToGoal > 50 ? `own ${100 - yardsToGoal}` : `opp ${yardsToGoal}`;
}

function downAndDistance(s: DriveState): string {
  const down = ["1st", "2nd", "3rd", "4th"][s.down - 1];
  const dist = s.toGo >= s.yardsToGoal ? "goal" : String(s.toGo);
  return `${down} & ${dist} at ${describeSpot(s.yardsToGoal)}`;
}

/**
 * Apply a play's result (NFL rules, late in the 4th quarter): an in-bounds play keeps the
 * clock running; out of bounds, incompletions, spikes and timeouts stop it, and so does a
 * play that runs through the two-minute warning.
 */
export function applyPlay(s: DriveState, p: PlayEntry, rules: Rules = NFL_RULES): PlayUpdate {
  const problem = checkPlay(s, p);
  if (problem) throw new RangeError(problem);

  const t = Math.max(0, p.clockAfter);
  const clock = formatClock(t);

  if (p.outcome === "timeout") {
    const state = { ...s, gameClock: t, clockRunning: false, timeouts: s.timeouts - 1 };
    return { state, summary: `Timeout at ${clock}, ${state.timeouts} left. ${downAndDistance(state)}.` };
  }

  const warnAt = rules.twoMinuteWarning;
  const crossedWarning = warnAt != null && s.gameClock > warnAt && t <= warnAt;
  const yards = PLAY_OUTCOMES[p.outcome].hasYards ? Math.round(p.yards) : 0;
  const what = PLAY_OUTCOMES[p.outcome].hasYards
    ? `${yards >= 0 ? "+" : ""}${yards} yd${p.outcome === "out-of-bounds" ? ", out of bounds" : ", in bounds"}`
    : PLAY_OUTCOMES[p.outcome].label;

  if (yards >= s.yardsToGoal) {
    return { state: { ...s, gameClock: t, clockRunning: false }, summary: `${what} at ${clock}: touchdown!`, ended: "touchdown" };
  }

  // The ball can't go back past your own 1 without a safety, which this doesn't model.
  const yardsToGoal = Math.min(99, s.yardsToGoal - yards);
  const firstDown = yards >= s.toGo;
  const state: DriveState = {
    ...s,
    gameClock: t,
    yardsToGoal,
    clockRunning: p.outcome === "inbounds" && !crossedWarning && t > 0,
    down: firstDown ? 1 : (Math.min(4, s.down + 1) as Down),
    toGo: firstDown ? Math.min(10, yardsToGoal) : s.toGo - yards,
  };

  if (!firstDown && s.down === 4) {
    return { state, summary: `${what} at ${clock}: turnover on downs.`, ended: "turnover-on-downs" };
  }
  if (t <= 0) {
    return { state, summary: `${what}: time expired.`, ended: "time-expired" };
  }
  const extra = crossedWarning ? " Two-minute warning." : "";
  return { state, summary: `${what} at ${clock}.${extra} ${firstDown ? "First down! " : ""}${downAndDistance(state)}.` };
}

