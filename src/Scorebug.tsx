// The situation as a broadcast-style score bar over a slim field strip, edited in place: every part of
// the bug is its own control. Tap the timeout bars to set them, the score, down, distance or ball spot to
// pick a new value, type into the clock, tap the clock state to start or stop it, and click or drag on the
// field strip to place the ball.

import { useRef, type PointerEvent, type ReactNode } from "react";
import type { Down, Side } from "@situational-football/schemas";
import { DOWNS } from "./engine";
import { spotFrom, type Option } from "./fields";
import type { SharedSituation } from "./SituationForm";

export interface ScorebugProps {
  situation: SharedSituation;
  set: (patch: Partial<SharedSituation>) => void;
  /** The clock field: its text as typed, any error, and where typing goes. */
  clock: { text: string; error: string | null; onType: (raw: string) => void };
  /** Your points minus theirs, the choices the mode allows, and how to change it. */
  margin: number;
  marginOptions: readonly Option<number>[];
  onMargin: (margin: number) => void;
  /** Mode settings, shown in the strip under the bug: BugSelects. */
  settings?: ReactNode;
}

const ORDINALS = ["1st", "2nd", "3rd", "4th"] as const;
const DOWN_OPTIONS: readonly Option<Down>[] = DOWNS.map((d) => ({ value: d, label: ORDINALS[d - 1] ?? String(d) }));

/** Every spot on the field, in yards from your own goal line: Own 1 … Midfield … Opp 1. */
const SPOT_OPTIONS: readonly Option<number>[] = Array.from({ length: 99 }, (_, i) => ({ value: i + 1, label: spotName(i + 1) }));

/** Where the ball and the line to gain are, in yards from your own goal line (0–100). */
export interface FieldMarks {
  ball: number;
  lineToGain: number;
  /** The line to gain is the goal line: "& Goal". */
  goal: boolean;
}

export function fieldMarks(side: Side, yardLine: number, toGo: number): FieldMarks {
  const ball = side === "own" ? yardLine : 100 - yardLine;
  const lineToGain = Math.min(100, ball + toGo);
  return { ball, lineToGain, goal: lineToGain >= 100 };
}

/** Horizontal position on the strip, in percent: two 10-yard end zones around the 100-yard field. */
export function stripPercent(yardsFromOwnGoal: number): number {
  return ((10 + yardsFromOwnGoal) / 120) * 100;
}

/** The spot a click on the turf lands on, in yards from your own goal line: never in an end zone. */
export function spotAt(fraction: number): number {
  return Math.min(99, Math.max(1, Math.round(fraction * 100)));
}

/** A spot named the way the bug names it: "Own 30", "Midfield", "Opp 8". */
function spotName(yardsFromOwnGoal: number): string {
  if (yardsFromOwnGoal === 50) return "Midfield";
  return yardsFromOwnGoal < 50 ? `Own ${yardsFromOwnGoal}` : `Opp ${100 - yardsFromOwnGoal}`;
}

/** A spot read aloud: "your 25", "midfield", "their 8". */
function spokenSpot(yardsFromOwnGoal: number): string {
  if (yardsFromOwnGoal === 50) return "midfield";
  return yardsFromOwnGoal < 50 ? `your ${yardsFromOwnGoal}` : `their ${100 - yardsFromOwnGoal}`;
}

/**
 * A value on the bug that's really a native select: it looks like the bug's text, and tapping it opens
 * the browser's own picker (a wheel on a phone). The select carries the label and value for screen readers.
 */
export function BugSelect<T extends string | number>({ label, value, options, onChange, children, className }: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  /** What the bug shows. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`sb-pick ${className ?? ""}`}>
      <span className="sb-pick-face" aria-hidden>{children}</span>
      <select
        aria-label={label} title={label} value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.currentTarget.value);
          if (picked) onChange(picked.value);
        }}
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </span>
  );
}

/**
 * Three timeout bars, each a toggle that's on while that timeout is left. Tap a bar to have that many
 * left, or the last lit one to use it.
 */
function Timeouts({ left, team, onChange }: { left: number; team: "You" | "Them"; onChange: (n: number) => void }) {
  const whose = team === "You" ? "Your" : "Their";
  return (
    <span className="sb-timeouts" role="group" aria-label={`${team}: ${left} timeout${left === 1 ? "" : "s"} left`}>
      {[1, 2, 3].map((n) => (
        <button
          key={n} type="button" className={n <= left ? "sb-to on" : "sb-to"} aria-pressed={n <= left}
          aria-label={`${whose} timeout ${n}`} title={`${whose} timeouts: set to ${n === left ? n - 1 : n}`}
          onClick={() => onChange(n === left ? n - 1 : n)}
        />
      ))}
    </span>
  );
}

function Football({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 14" aria-hidden focusable="false">
      <ellipse cx="12" cy="7" rx="11.5" ry="6.5" fill="#8a4b22" stroke="#4a230b" strokeWidth="1" />
      <path d="M7 7h10M9.5 5.2v3.6M12 5.2v3.6M14.5 5.2v3.6" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** Yard lines every 5 yards; the 10s get a number. */
const YARD_LINES = Array.from({ length: 19 }, (_, i) => (i + 1) * 5);

/**
 * A mini gridiron: your end zone on the left, theirs on the right, the ball and the yellow line to gain.
 * Click or drag on the turf to place the ball (the ball-spot picker in the bar does the same from the keyboard).
 */
function FieldStrip({ marks, onBall }: { marks: FieldMarks; onBall: (yardsFromOwnGoal: number) => void }) {
  const turf = useRef<HTMLDivElement>(null);
  const ball = stripPercent(marks.ball);
  const target = stripPercent(marks.lineToGain);
  const label = `Field position: ball on ${spokenSpot(marks.ball)}, ${100 - marks.ball} yards to the end zone; `
    + `line to gain ${marks.goal ? "is the goal line" : `at ${spokenSpot(marks.lineToGain)}`}`;

  const place = (e: PointerEvent<HTMLDivElement>) => {
    const box = turf.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return;
    const yards = spotAt((e.clientX - box.left) / box.width);
    if (yards !== marks.ball) onBall(yards);
  };
  return (
    <div className="sb-field" role="img" aria-label={label}>
      <div className="sbf-ez own"><span>You</span></div>
      <div
        ref={turf} className="sbf-turf" title="Click or drag to place the ball"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); place(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) place(e); }}
      >
        {YARD_LINES.map((y) => (
          <span key={y} className={y % 10 === 0 ? "sbf-tick ten" : "sbf-tick"} style={{ left: `${y}%` }}>
            {y % 10 === 0 && <span className={y === 50 ? "sbf-num mid" : "sbf-num"}>{y > 50 ? 100 - y : y}</span>}
          </span>
        ))}
      </div>
      <div className="sbf-ez opp"><span>Them</span></div>
      <div className="sbf-drive" style={{ left: `${ball}%`, width: `${target - ball}%` }} />
      <div className="sbf-ltg" style={{ left: `${target}%` }} />
      <div className="sbf-los" style={{ left: `${ball}%` }}>
        <Football className="sbf-ball" />
      </div>
    </div>
  );
}

export default function Scorebug({ situation: s, set, clock, margin, marginOptions, onMargin, settings }: ScorebugProps) {
  const marks = fieldMarks(s.side, s.yardLine, s.toGo);
  const ytg = 100 - marks.ball;
  // Distances that fit before the goal line, then "Goal".
  const distances: Option<number>[] = [
    ...Array.from({ length: Math.min(99, ytg - 1) }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
    { value: ytg, label: "Goal" },
  ];
  const score = marginOptions.find((o) => o.value === margin)?.label ?? String(margin);
  const tone = margin > 0 ? "ahead" : margin < 0 ? "behind" : "tied";
  const placeBall = (yards: number) => set(spotFrom(100 - yards));

  return (
    <section className="scorebug" aria-label="Situation">
      <div className="sb-bar">
        <div className="sb-team you">
          <span className="sb-name">
            You
            <span className="sb-poss" role="img" aria-label="has the ball" title="Has the ball"><Football className="sb-poss-ball" /></span>
          </span>
          <Timeouts left={s.timeouts} team="You" onChange={(n) => set({ timeouts: n })} />
        </div>
        <div className={`sb-margin ${tone}`}>
          <span className="sb-cap">Score</span>
          <BugSelect label="Score" value={margin} options={marginOptions} onChange={onMargin} className="sb-big">{score}</BugSelect>
        </div>
        <div className="sb-team opp">
          <span className="sb-name">Them</span>
          <Timeouts left={s.oppTimeouts} team="Them" onChange={(n) => set({ oppTimeouts: n })} />
        </div>
        <div className="sb-clock">
          <span className="sb-qtr">4th</span>
          <span className="sb-clock-stack">
            <span className="sb-big sb-time">
              <span className={s.running ? "sb-dot running" : "sb-dot"} aria-hidden />
              <input
                className={clock.error === null ? "sb-clock-input" : "sb-clock-input invalid"}
                value={clock.text} onChange={(e) => clock.onType(e.currentTarget.value)}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Game clock" aria-invalid={clock.error !== null} title={clock.error ?? "Game clock: type to change it"}
                inputMode="numeric" autoComplete="off" placeholder="M:SS" size={5}
              />
            </span>
            <button
              type="button" className="sb-cap sb-run-toggle" aria-pressed={s.running}
              title={s.running ? "Stop the clock" : "Start the clock"} onClick={() => set({ running: !s.running })}
            >
              {clock.error === null ? (s.running ? "Clock running" : "Clock stopped") : "Enter M:SS"}
            </button>
          </span>
        </div>
        <div className="sb-down">
          <span className="sb-big sb-dd">
            <BugSelect label="Down" value={s.down} options={DOWN_OPTIONS} onChange={(down) => set({ down })}>{ORDINALS[s.down - 1]}</BugSelect>
            <span aria-hidden>&amp;</span>
            <BugSelect label="Yards to go" value={Math.min(s.toGo, ytg)} options={distances} onChange={(toGo) => set({ toGo })}>
              {marks.goal ? "Goal" : s.toGo}
            </BugSelect>
          </span>
          <BugSelect label="Ball on" value={marks.ball} options={SPOT_OPTIONS} onChange={placeBall} className="sb-cap sb-spot">
            {spotName(marks.ball)}
          </BugSelect>
        </div>
      </div>
      <FieldStrip marks={marks} onBall={placeBall} />
      <div className="sb-notes">
        {settings}
        <span className="sb-hint">Tap any part of the scorebug to change it</span>
      </div>
    </section>
  );
}
