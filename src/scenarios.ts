// Player-decision scenarios: one choice a player makes during a play, compared option by option.
// Each option fixes how the play ends; the rest of the game is simulated, on the same random numbers
// for every option, so the difference between them is down to the choice alone.
// Pure functions, no React or DOM access.

import type { GameState, PlayCall, ScenarioId } from "@clock-manager/schemas";
import {
  downAndDistance, describeSpot, outcomeStep, outcomeWinProbability, CLOSE, DEFAULT_SIM,
  type PlayOutcome, type Reason, type StepResult,
} from "./sim";
import { formatClock } from "./time";
import { simulateRunOut } from "./engine";

/** A scenario's inputs: the situation at the snap, plus the details of the play. */
export interface ScenarioInput {
  /** The situation at the snap. You have the ball. */
  game: GameState;
  /** QB: yards the sack loses. */
  sackYards: number;
  /** WR: yards gained by the time he can step out of bounds. */
  gain: number;
  /** WR: extra yards for turning upfield instead. */
  extra: number;
  /** Seconds from the snap to the end of the play. */
  seconds: number;
}

export type OptionId =
  | "throw-away" | "sack" | "out-of-bounds" | "upfield" | "score" | "go-down" | "slide" | "stay-in-bounds" | "kneel" | "run";

interface OptionDef {
  readonly id: OptionId;
  readonly label: string;
  readonly call: PlayCall;
  /** How the play ends. `null` leaves it to chance: the call's usual odds, as for a play that hasn't been run yet. */
  readonly outcome: (i: ScenarioInput) => PlayOutcome | null;
  /** For an outcome left to chance: the situation after it, in words. */
  readonly afterText?: string;
}

/** The inputs a scenario asks for beyond the situation, with their labels. */
export interface ScenarioFields {
  readonly sackYards?: string;
  readonly gain?: string;
  readonly extra?: string;
  readonly seconds?: string;
}

interface ScenarioDef {
  readonly role: "QB" | "WR" | "RB" | "Coach";
  readonly fields: ScenarioFields;
  readonly title: string;
  readonly question: string;
  readonly options: readonly [OptionDef, OptionDef];
  /** Clock values for the "where the answer flips" table. */
  readonly clocks: readonly number[];
  /** What the model doesn't capture about this decision. */
  readonly caveat: Reason;
}

/** Seconds it takes to run `yards` more after the catch: about a second per 8 yards, at least one. */
const runningTime = (yards: number) => Math.max(1, Math.round(yards / 8));

export const SCENARIOS: Readonly<Record<ScenarioId, ScenarioDef>> = {
  "qb-throwaway": {
    role: "QB",
    fields: { sackYards: "The sack would lose (yards)", seconds: "Seconds the play takes" },
    title: "Throw it away or take the sack?",
    question: "The quarterback's first read is covered and the rush is closing in. Throw it away, or take the sack?",
    options: [
      {
        id: "throw-away", label: "Throw it away", call: "pass-sideline",
        outcome: (i) => ({ yards: 0, seconds: i.seconds, outOfBounds: false, incomplete: true }),
      },
      {
        id: "sack", label: "Take the sack", call: "pass-middle",
        outcome: (i) => ({ yards: -i.sackYards, seconds: i.seconds, outOfBounds: false, incomplete: false, sack: true }),
      },
    ],
    clocks: [180, 120, 90, 60, 45, 30, 20, 10],
    caveat: {
      text: "A throwaway is only legal from outside the tackle box with the ball reaching the line of scrimmage. Otherwise it's intentional grounding: loss of down, 10 yards or the spot of the foul, and in the last minute a 10-second runoff. The model assumes a legal throwaway, and that the quarterback holds on to the ball when sacked.",
      section: "clock-rules",
    },
  },
  "wr-sideline": {
    role: "WR",
    fields: { gain: "Gain at the catch (yards)", extra: "Extra yards by turning upfield", seconds: "Seconds the play takes" },
    title: "Get out of bounds or turn upfield?",
    question: "The receiver makes the catch near the sideline. Step out of bounds now, or turn upfield for more yards and get tackled in bounds?",
    options: [
      {
        id: "out-of-bounds", label: "Get out of bounds", call: "pass-sideline",
        outcome: (i) => ({ yards: i.gain, seconds: i.seconds, outOfBounds: true, incomplete: false }),
      },
      {
        id: "upfield", label: "Turn upfield", call: "pass-middle",
        outcome: (i) => ({ yards: i.gain + i.extra, seconds: i.seconds + runningTime(i.extra), outOfBounds: false, incomplete: false }),
      },
    ],
    clocks: [180, 120, 90, 60, 45, 30, 20, 10],
    caveat: {
      text: "Going out of bounds stops the clock until the snap in the last 2:00 of the first half and the last 5:00 of the game; earlier, it restarts when the ball is spotted. The model assumes the extra yards are there for the taking, with no fumble risk.",
      section: "clock-rules",
    },
  },
  "rb-score": {
    role: "RB",
    fields: { seconds: "Seconds from the snap to the goal line" },
    title: "Score, or go down short of the goal line?",
    question: "The running back breaks into the open with the end zone ahead. Score, or go down at the 1 to keep the ball and the clock?",
    options: [
      {
        id: "score", label: "Score", call: "run",
        outcome: (i) => ({ yards: i.game.ytg, seconds: i.seconds, outOfBounds: false, incomplete: false }),
      },
      {
        id: "go-down", label: "Go down at the 1", call: "run",
        outcome: (i) => ({ yards: Math.max(0, i.game.ytg - 1), seconds: i.seconds, outOfBounds: false, incomplete: false }),
      },
    ],
    clocks: [240, 180, 120, 90, 65, 45, 30, 15],
    caveat: {
      text: "Going down is a sure thing in the model: no fumble, and the offense always gets its snaps off. Real defenses sometimes let a runner score on purpose to get the ball back with time left; this is the runner's answer to that.",
      section: "running-out-the-clock",
    },
  },
  "qb-slide": {
    role: "QB",
    fields: { gain: "Gain if he slides (yards)", extra: "Yards given up to reach the sideline", seconds: "Seconds the play takes" },
    title: "Slide, or get out of bounds?",
    question: "The quarterback scrambles with room to run. Slide in bounds for the yards he has, or angle to the sideline and step out, giving up a few yards?",
    options: [
      {
        id: "slide", label: "Slide in bounds", call: "run",
        outcome: (i) => ({ yards: i.gain, seconds: i.seconds, outOfBounds: false, incomplete: false }),
      },
      {
        id: "out-of-bounds", label: "Get out of bounds", call: "run",
        outcome: (i) => ({ yards: Math.max(0, i.gain - i.extra), seconds: i.seconds + 1, outOfBounds: true, incomplete: false }),
      },
    ],
    clocks: [180, 120, 90, 60, 45, 30, 20, 10],
    caveat: {
      text: "A sliding quarterback is down where the slide starts, and protected from big hits. Angling for the sideline exposes him to one, and to a fumble, which the model doesn't include.",
      section: "clock-rules",
    },
  },
  "rb-inbounds": {
    role: "RB",
    fields: { gain: "Gain if he stays in bounds (yards)", extra: "Extra yards by fighting to the sideline", seconds: "Seconds the play takes" },
    title: "Stay in bounds, or fight for the extra yards?",
    question: "Protecting a lead, the running back is near the sideline. Go down in bounds to keep the clock running, or fight for extra yards and step out?",
    options: [
      {
        id: "stay-in-bounds", label: "Stay in bounds", call: "run",
        outcome: (i) => ({ yards: i.gain, seconds: i.seconds, outOfBounds: false, incomplete: false }),
      },
      {
        id: "out-of-bounds", label: "Get the extra yards", call: "run",
        outcome: (i) => ({ yards: i.gain + i.extra, seconds: i.seconds + runningTime(i.extra), outOfBounds: true, incomplete: false }),
      },
    ],
    clocks: [300, 240, 180, 150, 120, 90, 60, 30],
    caveat: {
      text: "Going out of bounds stops the clock until the snap only in the last 2:00 of the first half and the last 5:00 of the game; earlier, it restarts when the ball is spotted, and stepping out costs almost nothing.",
      section: "running-out-the-clock",
    },
  },
  "kneel-or-run": {
    role: "Coach",
    fields: {},
    title: "Kneel, or run it?",
    question: "Ahead late with the ball: take a knee, or hand it off? A kneel can't fail, but can't gain a first down either. Unlike the other scenarios, the run's result is left to chance here.",
    options: [
      {
        id: "kneel", label: "Kneel", call: "kneel",
        outcome: () => ({ yards: -1, seconds: 2, outOfBounds: false, incomplete: false }),
      },
      {
        id: "run", label: "Run", call: "run", outcome: () => null,
        afterText: "It varies: runs average about 4 yards, usually stay in bounds, and are fumbled about 1% of the time.",
      },
    ],
    clocks: [240, 180, 150, 130, 110, 90, 60, 40],
    caveat: {
      text: "The run uses the model's average run, with no extra protection from a lead-protecting offense. Real teams often run conservatively here, which lowers the fumble risk below the model's 1%.",
      section: "running-out-the-clock",
    },
  },
};

export interface OptionResult {
  id: OptionId;
  label: string;
  wp: number;
  /** The situation right after the play, in words. */
  after: string;
}

export interface FlipRow {
  clock: number;
  wps: readonly [number, number];
  /** Index of the better option, or null when they're within the noise. */
  better: 0 | 1 | null;
}

export interface ScenarioAnalysis {
  /** Where the answer changes as the clock runs down, e.g. "With 0:20 or less, get out of bounds instead." */
  flipNote: string | null;
  options: readonly [OptionResult, OptionResult];
  /** Index of the better option, or null when they're within a point or two of each other. */
  better: 0 | 1 | null;
  /** Win-probability points between the options (always >= 0). */
  difference: number;
  reason: Reason;
  flips: readonly FlipRow[];
}

/** The situation after a play, in words: e.g. "3rd & 10 at opp 30, 0:45 left, clock stopped." */
function describeAfter(res: StepResult): string {
  const s = res.state;
  if (res.driveEnded !== undefined) return `${res.driveEnded}. ${formatClock(s.clock)} left; ${s.poss === "you" ? "your ball" : "their ball"}.`;
  if (s.over) return "Time expires.";
  return `${downAndDistance(s)}, ${formatClock(s.clock)} left, clock ${s.running ? "running" : "stopped"}.`;
}

const better = (a: number, b: number): 0 | 1 | null => (Math.abs(a - b) <= CLOSE ? null : a > b ? 0 : 1);

/** Compare a scenario's two options. `n` games are simulated per option; the flip table uses fewer. */
export function analyzeScenario(id: ScenarioId, input: ScenarioInput, n = 3000, flipN = 1000): ScenarioAnalysis {
  const def = SCENARIOS[id];
  const [a, b] = def.options;
  const score = (o: OptionDef, game: GameState, games: number) =>
    outcomeWinProbability(game, o.call, o.outcome({ ...input, game }) ?? undefined, games, DEFAULT_SIM);
  const result = (o: OptionDef): OptionResult => {
    const outcome = o.outcome(input);
    return {
      id: o.id, label: o.label, wp: score(o, input.game, n),
      after: outcome === null ? (o.afterText ?? "It varies.") : describeAfter(outcomeStep(input.game, o.call, outcome)),
    };
  };
  const options: readonly [OptionResult, OptionResult] = [result(a), result(b)];
  const pick = better(options[0].wp, options[1].wp);

  const clocks = [...new Set([...def.clocks, input.game.clock])].filter((c) => c > 0).sort((x, y) => y - x);
  const flips = clocks.map((clock): FlipRow => {
    const game = { ...input.game, clock };
    const wps: readonly [number, number] = [score(a, game, flipN), score(b, game, flipN)];
    return { clock, wps, better: better(wps[0], wps[1]) };
  });

  // Pin down, to the second, the clock at which the other option takes over.
  const betterAt = (clock: number) => {
    const game = { ...input.game, clock };
    return better(score(a, game, flipN), score(b, game, flipN));
  };
  const flip = pick === null ? null : findFlip(flips, input.game.clock, pick, betterAt);

  return {
    options, better: pick, difference: Math.abs(options[0].wp - options[1].wp),
    reason: explainScenario(id, input, options, pick), flips,
    flipNote: flip === null ? null : `With ${formatClock(flip.clock)} or ${flip.direction} left, ${options[flip.to].label.toLowerCase()} instead.`,
  };
}

interface Flip {
  /** The clock at which the other option is first better, going away from the current clock. */
  clock: number;
  direction: "less" | "more";
  to: 0 | 1;
}

/**
 * Where the answer changes: the nearest table row on either side of the current clock where the other
 * option is better, narrowed to the second by bisecting against the row next to it.
 */
function findFlip(flips: readonly FlipRow[], now: number, pick: 0 | 1, betterAt: (clock: number) => 0 | 1 | null): Flip | null {
  const other = pick === 0 ? 1 : 0;
  // Rows are sorted from most time left to least.
  const belowIndex = flips.findIndex((f) => f.clock < now && f.better === other);
  if (belowIndex > 0) {
    // Between the row before it (still `pick` or even) and this one (`other`), as the clock runs down.
    let hi = flips[belowIndex - 1]?.clock ?? now;
    let lo = flips[belowIndex]?.clock ?? now;
    while (hi - lo > 1) {
      const mid = Math.floor((hi + lo) / 2);
      if (betterAt(mid) === other) lo = mid; else hi = mid;
    }
    return { clock: lo, direction: "less", to: other };
  }
  const aboveRows = flips.filter((f) => f.clock > now);
  const aboveIndex = aboveRows.map((f) => f.better).lastIndexOf(other);
  if (aboveIndex >= 0) {
    let lo = aboveRows[aboveIndex + 1]?.clock ?? now;
    let hi = aboveRows[aboveIndex]?.clock ?? now;
    while (hi - lo > 1) {
      const mid = Math.floor((hi + lo) / 2);
      if (betterAt(mid) === other) hi = mid; else lo = mid;
    }
    return { clock: hi, direction: "more", to: other };
  }
  return null;
}

const ordinalDown = (d: number) => ["1st", "2nd", "3rd", "4th"][d - 1] ?? `${d}th`;

const pts = (x: number) => `${Math.round(x * 100)} point${Math.round(x * 100) === 1 ? "" : "s"}`;

function explainScenario(id: ScenarioId, input: ScenarioInput, options: readonly [OptionResult, OptionResult], pick: 0 | 1 | null): Reason {
  const g = input.game;
  const ahead = g.margin > 0;
  const clock = formatClock(g.clock);
  const diff = Math.abs(options[0].wp - options[1].wp);
  if (pick === null) {
    return {
      text: `It's a toss-up: the two choices are within ${pts(diff)} of each other, which is inside the model's margin of error. Either is defensible.`,
      section: "win-probability",
    };
  }
  const winner = options[pick].label;
  switch (id) {
    case "qb-throwaway":
      if (pick === 0) {
        const stop = g.timeouts.you > 0 ? "a timeout to stop the clock afterward" : "the time a hurry-up snap takes, with no timeout to stop the clock";
        return {
          text: `Throw it away. It stops the clock with ${clock} left and keeps the ball at the ${describeSpot(g.ytg)}. The sack costs ${input.sackYards} yards and ${stop}: ${pts(diff)} of win probability.`,
          section: g.timeouts.you > 0 ? "timeouts" : "clock-rules",
        };
      }
      return {
        text: ahead
          ? `Take the sack. You're ahead, and a sack keeps the clock running, which is worth more to you than the ${input.sackYards} yards (${pts(diff)}). An incompletion would stop the clock for them.`
          : `Take the sack: the model has it ${pts(diff)} ahead here, an unusual result when you're not ahead. See how it changes with the clock in the table below.`,
        section: ahead ? "running-out-the-clock" : "win-probability",
      };
    case "wr-sideline":
      if (pick === 0) {
        return {
          text: `Get out of bounds. Stopping the clock with ${clock} left is worth more than ${input.extra} more yards with it running: ${pts(diff)}.${g.timeouts.you > 0 ? "" : " With no timeouts left, the sideline is the only way to stop it without spending a down on a spike."}`,
          section: g.timeouts.you > 0 ? "clock-rules" : "spike",
        };
      }
      return {
        text: ahead
          ? `${winner}. You're ahead: staying in bounds keeps the clock running for you, on top of the extra ${input.extra} yards (${pts(diff)}).`
          : `${winner}. The extra ${input.extra} yards are worth more than the seconds the running clock costs (${pts(diff)}): ${g.timeouts.you > 0 ? "a timeout can stop it afterward" : "there's still time to spike it and keep going"}.`,
        section: ahead ? "running-out-the-clock" : g.timeouts.you > 0 ? "timeouts" : "drive-budget",
      };
    case "rb-score":
      if (pick === 1) {
        return {
          text: `Go down at the 1. You keep the ball and the clock: ${g.margin > 0 ? "kneel it out" : "drain it, then kick a chip-shot field goal"}. Scoring now gives them the ball back with time to answer: ${pts(diff)}.`,
          section: g.margin > 0 ? "running-out-the-clock" : "field-goal-endgame",
        };
      }
      return {
        text: g.margin < -3
          ? `Score. A field goal doesn't get you even, so you need the touchdown, and taking it now is worth ${pts(diff)} over trying to punch it in later.`
          : `Score. With ${clock} left, there's too much time to run out from the 1, and the points are worth ${pts(diff)} more than the ball.`,
        section: g.margin < -3 ? "red-zone" : "running-out-the-clock",
      };
    case "qb-slide":
      if (pick === 1) {
        return {
          text: `Get out of bounds. With ${clock} left, stopping the clock is worth more than the ${input.extra} yards it costs to reach the sideline (${pts(diff)}).${g.timeouts.you > 0 ? "" : " With no timeouts, it's the only way to stop the clock without a spike."}`,
          section: g.timeouts.you > 0 ? "clock-rules" : "spike",
        };
      }
      return {
        text: ahead
          ? `Slide. You're ahead: staying in bounds keeps the clock running for you, and the slide keeps him safe (${pts(diff)}).`
          : `Slide. The extra ${input.extra} yards are worth more than the seconds the running clock costs (${pts(diff)}): ${g.timeouts.you > 0 ? "a timeout can stop it afterward" : "there's still time to spike it and keep going"}.`,
        section: ahead ? "running-out-the-clock" : g.timeouts.you > 0 ? "timeouts" : "spike",
      };
    case "rb-inbounds": {
      const stayConverts = input.gain >= g.toGo;
      const extraConverts = input.gain + input.extra >= g.toGo;
      if (pick === 1) {
        return {
          text: extraConverts && !stayConverts
            ? `Get the extra yards. They move the chains (${input.gain + input.extra} yards on ${ordinalDown(g.down)} & ${g.toGo}), and a fresh set of downs burns far more clock than one stopped play costs (${pts(diff)}).`
            : `Get the extra yards: here they're worth more than the seconds a stopped clock gives back (${pts(diff)}).`,
          section: "running-out-the-clock",
        };
      }
      return {
        text: `Stay in bounds. Keeping the clock running with ${clock} left is worth more than ${input.extra} more yards${extraConverts && !stayConverts ? ", even with a first down at stake" : ""} (${pts(diff)}). Stepping out would stop the clock for them.`,
        section: "running-out-the-clock",
      };
    }
    case "kneel-or-run": {
      const kneelsEndIt = simulateRunOut({ gameClock: g.clock, down: g.down, defTimeouts: g.timeouts.opp, clockRunning: false }).endsGame;
      if (pick === 0) {
        return {
          text: kneelsEndIt
            ? `Kneel. Kneel-downs end the game from here, so there's nothing to gain from a run and a fumble to risk (${pts(diff)}).`
            : `Kneel. Even though kneels alone can't end it, a run's chance of a first down isn't worth its fumble risk here (${pts(diff)}).`,
          section: "running-out-the-clock",
        };
      }
      return {
        text: `Run it. Kneel-downs can't run out ${clock} against ${g.timeouts.opp} timeout${g.timeouts.opp === 1 ? "" : "s"}, so you need a first down, and only a run can get one. That's worth more than its small fumble risk (${pts(diff)}).`,
        section: "running-out-the-clock",
      };
    }
  }
}
