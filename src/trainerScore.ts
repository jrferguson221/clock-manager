// The trainer's two pages, leading and trailing, are picked by the score. The scorebug offers every score
// from up 16 to down 16, and a score on the other side of the line moves you to the other page. The clock,
// timeouts, down, distance and ball spot carry over. The two stay separate pages so old links still work.

import { useNavigate } from "@tanstack/react-router";
import { LIMITS } from "@situational-football/schemas";
import type { SharedSituation } from "./SituationForm";

/** Every score the trainer handles, as your margin: up 16 down to down 16, with tied counted as trailing. */
export const SCORE_OPTIONS = Array.from({ length: LIMITS.lead.max + LIMITS.trail.max + 1 }, (_, i) => {
  const m = LIMITS.lead.max - i;
  return { value: m, label: m > 0 ? `Up ${m}` : m < 0 ? `Down ${-m}` : "Tied" };
});

const shared = (s: SharedSituation): SharedSituation => ({
  clock: s.clock, running: s.running, timeouts: s.timeouts, oppTimeouts: s.oppTimeouts,
  down: s.down, toGo: s.toGo, side: s.side, yardLine: s.yardLine,
});

const clampMargin = (m: number) => Math.min(LIMITS.lead.max, Math.max(-LIMITS.trail.max, m));

/**
 * Returns a function that applies a new score: on this page through `stay` when it's still on the same
 * side, or by moving to the other page, carrying `situation` over, when it isn't.
 */
export function useScoreSwitch(onLeadingPage: boolean) {
  const navigate = useNavigate();
  return (margin: number, situation: SharedSituation, stay: (margin: number) => void) => {
    const m = clampMargin(margin);
    if (m > 0 === onLeadingPage) stay(m);
    else if (m > 0) void navigate({ to: "/", search: { ...shared(situation), lead: m }, resetScroll: false });
    else void navigate({ to: "/trailing", search: { ...shared(situation), trail: -m }, resetScroll: false });
  };
}

/** The random situation's bounds: late in the game, within one score. */
export const RANDOM_BOUNDS = { minClock: 60, maxClock: 300, maxMargin: 8 } as const;

/**
 * A random late-game situation for the trainer, within one score: the clock between 1:00 and 5:00, the score
 * from down 8 to up 8, any down, distance and spot, and any timeouts. `r` returns numbers in [0, 1).
 */
export function randomSituation(r: () => number = Math.random): { situation: SharedSituation; margin: number } {
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const { minClock, maxClock, maxMargin } = RANDOM_BOUNDS;
  const clock = int(minClock, maxClock);
  // Downs weighted the way they come up: 1st down most often, 4th rarely.
  const x = r();
  const down = x < 0.4 ? 1 : x < 0.7 ? 2 : x < 0.92 ? 3 : 4;
  const ytg = int(5, 95);
  const toGo = Math.min(ytg, down === 1 ? (r() < 0.85 ? 10 : int(1, 9)) : int(1, 15));
  const spot = ytg >= 50 ? { side: "own" as const, yardLine: 100 - ytg } : { side: "opp" as const, yardLine: ytg };
  return {
    margin: int(-maxMargin, maxMargin),
    situation: {
      clock: `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, "0")}`,
      running: r() < 0.6, timeouts: int(0, 3), oppTimeouts: int(0, 3), down, toGo, ...spot,
    },
  };
}
