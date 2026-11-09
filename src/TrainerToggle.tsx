// The trainer's Leading / Trailing switch. The two modes are separate pages (so old links still work),
// and switching carries the situation over: the clock, timeouts, down, distance and ball spot stay, and
// the score flips sides (up 3 becomes down 3).

import type { ReactNode } from "react";
import { SegmentedControl } from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import type { SharedSituation } from "./SituationForm";

export type TrainerSide = "leading" | "trailing";

/** Each side's name, and what you're trying to do (dropped on a phone). */
const SIDES: { value: TrainerSide; label: ReactNode }[] = [
  { value: "leading", label: <><span className="tt-side">Leading</span><span className="tt-aim"> · run out the clock</span></> },
  { value: "trailing", label: <><span className="tt-side">Trailing</span><span className="tt-aim"> · drive to score</span></> },
];

const shared = (s: SharedSituation): SharedSituation => ({
  clock: s.clock, running: s.running, timeouts: s.timeouts, oppTimeouts: s.oppTimeouts,
  down: s.down, toGo: s.toGo, side: s.side, yardLine: s.yardLine,
});

export default function TrainerToggle({ current, situation, points }: {
  current: TrainerSide;
  situation: SharedSituation;
  /** Points you lead or trail by now: the other side starts the same distance apart. */
  points: number;
}) {
  const navigate = useNavigate();
  return (
    <SegmentedControl
      className="trainer-toggle" fullWidth size="md" radius="md" aria-label="Are you leading or trailing?"
      value={current} data={SIDES}
      onChange={(value) => {
        if (value === "leading") void navigate({ to: "/", search: { ...shared(situation), lead: Math.max(1, points) } });
        else if (value === "trailing") void navigate({ to: "/trailing", search: { ...shared(situation), trail: points } });
      }}
    />
  );
}
