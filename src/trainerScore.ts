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
