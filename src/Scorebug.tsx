// The situation as a TV-style scorebug: the teams with their timeouts, the score, the clock, and down and
// distance at the ball's spot. An Edit button opens the full situation form.

import type { ReactNode } from "react";
import { Button } from "@mantine/core";
import type { Down, Side } from "@situational-football/schemas";

export interface ScorebugProps {
  /** Game clock, M:SS. */
  clock: string;
  running: boolean;
  /** Your points minus theirs. */
  margin: number;
  timeouts: number;
  oppTimeouts: number;
  down: Down;
  toGo: number;
  side: Side;
  yardLine: number;
  /** Mode settings shown under the bug, e.g. the run-out play type. */
  notes?: readonly string[];
  onEdit: () => void;
}

const ORDINALS = ["1st", "2nd", "3rd", "4th"] as const;

/** Three timeout bars: lit while the team still has them. */
function Timeouts({ left, team }: { left: number; team: string }) {
  return (
    <span className="sb-timeouts" role="img" aria-label={`${team}: ${left} timeout${left === 1 ? "" : "s"} left`}>
      {[0, 1, 2].map((i) => <span key={i} className={i < left ? "sb-to on" : "sb-to"} />)}
    </span>
  );
}

function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`sb-cell ${className ?? ""}`}>
      <span className="sb-label">{label}</span>
      <span className="sb-value">{children}</span>
    </div>
  );
}

export default function Scorebug(p: ScorebugProps) {
  const score = p.margin > 0 ? `Up ${p.margin}` : p.margin < 0 ? `Down ${-p.margin}` : "Tied";
  const ytg = p.side === "own" ? 100 - p.yardLine : p.yardLine;
  const distance = p.toGo >= ytg ? "Goal" : String(p.toGo);
  const spot = p.yardLine === 50 ? "Midfield" : `${p.side === "own" ? "Own" : "Opp"} ${p.yardLine}`;
  return (
    <section className="scorebug" aria-label="Situation">
      <div className="sb-bar">
        <div className="sb-teams">
          <div className="sb-team you">
            <span className="sb-name">You <span className="sb-ball" aria-label="has the ball" title="Has the ball">◀</span></span>
            <Timeouts left={p.timeouts} team="You" />
          </div>
          <div className="sb-team opp">
            <span className="sb-name">Them</span>
            <Timeouts left={p.oppTimeouts} team="Them" />
          </div>
        </div>
        <Cell label="Score" className={p.margin > 0 ? "sb-score ahead" : p.margin < 0 ? "sb-score behind" : "sb-score"}>{score}</Cell>
        <Cell label={p.running ? "4th · running" : "4th · stopped"} className="sb-clock">
          <span className={p.running ? "sb-dot running" : "sb-dot"} aria-hidden />
          {p.clock}
        </Cell>
        <Cell label={spot} className="sb-down">{ORDINALS[p.down - 1]} &amp; {distance}</Cell>
        <div className="sb-edit">
          <Button variant="filled" size="sm" onClick={p.onEdit} aria-label="Edit the situation">Edit</Button>
        </div>
      </div>
      {p.notes !== undefined && p.notes.length > 0 && <div className="sb-notes">{p.notes.join(" · ")}</div>}
    </section>
  );
}
