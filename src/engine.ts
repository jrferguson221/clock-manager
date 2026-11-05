// Clock-management engine: pure functions, no DOM access.
// All times are in whole seconds.

import { DOWNS, PLAY_TYPE_IDS, type Down, type PlayType } from "@situational-football/schemas";

export { DOWNS, PLAY_TYPE_IDS, type Down, type PlayType };

export interface Rules {
  readonly name: string;
  /** Play clock after a play ends with the game clock running. */
  readonly playClock: number;
  /** Game-clock time of the two-minute warning, or null for none. */
  readonly twoMinuteWarning: number | null;
}

/** NFL rules. Typed as its literal values, so code written only for the NFL knows the warning exists. */
export const NFL_RULES = Object.freeze({
  name: "NFL",
  playClock: 40,
  twoMinuteWarning: 120,
} as const satisfies Rules);

export const PLAY_TYPES: Readonly<Record<PlayType, { readonly label: string; readonly duration: number }>> = Object.freeze({
  kneel: { label: "Kneel down", duration: 2 },
  run: { label: "Run, stays in bounds", duration: 6 },
});

/**
 * If the clock going from `before` to `after` runs through the two-minute warning (and it hasn't
 * happened yet), the warning's game-clock time; otherwise null.
 */
export function warningCrossed(rules: Rules, warningUsed: boolean, before: number, after: number): number | null {
  const w = rules.twoMinuteWarning;
  return !warningUsed && w !== null && before > w && after <= w ? w : null;
}

export interface Situation {
  /** Seconds left in the game. */
  gameClock: number;
  down: Down;
  /** Timeouts the defense has left. */
  defTimeouts: number;
  /** Whether the game clock is running right now. */
  clockRunning: boolean;
  /** Seconds on the play clock now (defaults to rules.playClock). */
  playClock?: number;
  /** Whether the two-minute warning has already happened (derived from the clock if omitted). */
  warningUsed?: boolean;
  /** Seconds each snap takes (default: kneel). */
  playDuration?: number;
  /** Play-clock second the offense snaps on (default 1). */
  snapAt?: number;
}

export interface TimelineEvent {
  event: string;
  /** Game clock after the event. */
  clock: number;
  note: string;
}

export interface RunOutResult {
  endsGame: boolean;
  timeLeft: number;
  snaps: number;
  timeoutsUsed: number;
  timeline: TimelineEvent[];
}

/**
 * Simulate the leading offense trying to run out the clock without gaining a first down.
 * Assumes the defense calls a timeout right after every play while it has any left,
 * which is its best way to save time.
 */
export function simulateRunOut(s: Situation, rules: Rules = NFL_RULES): RunOutResult {
  const playDuration = s.playDuration ?? PLAY_TYPES.kneel.duration;
  const snapAt = s.snapAt ?? 1;
  const warningAt = rules.twoMinuteWarning;

  let t = s.gameClock;
  let running = s.clockRunning;
  let playClock = s.playClock ?? rules.playClock;
  let defTO = s.defTimeouts;
  let warningUsed = s.warningUsed ?? (warningAt == null || t <= warningAt);
  let timeoutsUsed = 0;
  let snaps = 0;
  const timeline: TimelineEvent[] = [];
  const log = (event: string, note: string) => timeline.push({ event, clock: t, note });
  const result = (endsGame: boolean): RunOutResult => ({ endsGame, timeLeft: t, snaps, timeoutsUsed, timeline });

  const crossesWarning = (before: number, after: number) => warningCrossed(rules, warningUsed, before, after);

  for (let down = s.down; down <= 4; down++) {
    // Pre-snap: let the play clock run down if the game clock is running.
    if (running) {
      const burn = Math.max(0, playClock - snapAt);
      const before = t;
      t = Math.max(0, t - burn);
      const warning = crossesWarning(before, t);
      if (warning !== null) {
        t = warning;
        warningUsed = true;
        running = false;
        log("Two-minute warning", "clock stops before the snap");
      } else if (burn > 0) {
        log("Play clock runs", `${burn}s burned before the snap`);
      }
    }
    if (t <= 0) {
      log("Game over", "clock expired before the snap");
      return result(true);
    }

    // The snap.
    const before = t;
    t = Math.max(0, t - playDuration);
    snaps++;
    log(`Snap, ${ordinal(down)} down`, `play takes ${playDuration}s`);
    if (t <= 0) {
      log("Game over", "clock expired during the play");
      return result(true);
    }
    if (down === 4) {
      log("Turnover on downs", "defense takes over");
      return result(false);
    }

    // After the play: the clock keeps running unless something stops it.
    playClock = rules.playClock;
    if (crossesWarning(before, t) !== null) {
      warningUsed = true;
      running = false;
      log("Two-minute warning", "clock stops after the play");
    } else if (defTO > 0) {
      defTO--;
      timeoutsUsed++;
      running = false;
      log("Defense timeout", `${defTO} left`);
    } else {
      running = true;
    }
  }
  // Only reachable if s.down is outside 1-4.
  throw new RangeError(`invalid down: ${s.down}`);
}

/**
 * The largest game clock from which the offense is guaranteed to run out the clock,
 * meaning every smaller clock value works too. Returns -1 if even 0:01 doesn't work.
 */
export function runOutThreshold(
  s: Omit<Situation, "gameClock" | "warningUsed">, rules: Rules = NFL_RULES, max = 15 * 60,
): number {
  let best = -1;
  for (let t = 1; t <= max; t++) {
    // No warningUsed: it's worked out from each clock value.
    if (!simulateRunOut({ ...s, gameClock: t }, rules).endsGame) break;
    best = t;
  }
  return best;
}

function ordinal(n: number): string {
  return ["1st", "2nd", "3rd", "4th"][n - 1] ?? `${n}th`;
}
