// Small form and display pieces shared by both panels.
import type { TimelineEvent } from "./engine";
import { useState } from "react";
import { formatClock, formatClockDigits } from "./time";

export function ClockInput({ value, onChange, valid }: { value: string; onChange: (v: string) => void; valid: boolean }) {
  return (
    <label>
      Game clock
      <input
        value={value} onChange={(e) => onChange(formatClockDigits(e.target.value))}
        inputMode="numeric" placeholder="M:SS" aria-invalid={!valid}
      />
    </label>
  );
}

export function NumberSelect({ label, value, options, onChange }: {
  label: string; value: number; options: number[]; onChange: (n: number) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <table>
      <thead>
        <tr><th>Clock</th><th>Event</th><th>Detail</th></tr>
      </thead>
      <tbody>
        {events.map((e, i) => (
          <tr key={i}>
            <td>{formatClock(e.clock)}</td>
            <td>{e.event}</td>
            <td className="muted">{e.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The list of logged plays, with undo and reset. */
export function PlayLog({ summaries, onUndo, onReset }: { summaries: string[]; onUndo: () => void; onReset: () => void }) {
  if (summaries.length === 0) return null;
  return (
    <div className="drive-log">
      <ol>
        {summaries.map((text, i) => <li key={i}>{text}</li>)}
      </ol>
      <div className="row">
        <button type="button" onClick={onUndo}>Undo last play</button>
        <button type="button" onClick={onReset}>New drive</button>
      </div>
    </div>
  );
}

/**
 * A whole-number input you can clear and retype freely. Valid numbers in range apply as you type;
 * leaving the field snaps it back into range.
 */
export function NumberInput({ value, min, max, onChange, ...rest }: {
  value: number; min: number; max: number; onChange: (n: number) => void; "aria-label"?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number" inputMode="numeric" min={min} max={max} {...rest}
      value={draft ?? String(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        if (draft != null) {
          const n = Math.round(Number(draft));
          onChange(draft.trim() === "" || !Number.isFinite(n) ? value : Math.min(max, Math.max(min, n)));
        }
        setDraft(null);
      }}
    />
  );
}

export type Side = "own" | "opp";

export const yardsToGoalFrom = (side: Side, yardLine: number) => (side === "own" ? 100 - yardLine : yardLine);
export const spotFrom = (ytg: number): { side: Side; yardLine: number } =>
  ytg >= 50 ? { side: "own", yardLine: 100 - ytg } : { side: "opp", yardLine: ytg };

export function BallOnInput({ side, yardLine, onChange }: {
  side: Side; yardLine: number; onChange: (side: Side, yardLine: number) => void;
}) {
  return (
    <label>
      Ball on
      <span className="pair">
        <select value={side} onChange={(e) => onChange(e.target.value as Side, yardLine)} aria-label="Side of the field">
          <option value="own">Own</option>
          <option value="opp">Opponent</option>
        </select>
        <NumberInput value={yardLine} min={1} max={50} aria-label="Yard line" onChange={(y) => onChange(side, y)} />
      </span>
    </label>
  );
}

export function ToGoInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label>
      To go
      <NumberInput value={value} min={1} max={99} onChange={onChange} />
    </label>
  );
}

