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

/** A select over a fixed list of numbers. `onChange` only ever receives one of `options`. */
export function NumberSelect<T extends number>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly T[]; onChange: (n: T) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => {
        const picked = options.find((n) => n === Number(e.target.value));
        if (picked !== undefined) onChange(picked);
      }}>
        {options.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

export interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** A select over a fixed set of string values. `onChange` only ever receives one of their values. */
export function OptionSelect<T extends string>({ value, options, onChange, ...rest }: {
  value: T; options: readonly Option<T>[]; onChange: (v: T) => void; "aria-label"?: string;
}) {
  return (
    <select {...rest} value={value} onChange={(e) => {
      const picked = options.find((o) => o.value === e.target.value);
      if (picked !== undefined) onChange(picked.value);
    }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
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

const SIDES = [
  { value: "own", label: "Own" },
  { value: "opp", label: "Opponent" },
] as const satisfies readonly Option<string>[];
export type Side = (typeof SIDES)[number]["value"];

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
        <OptionSelect value={side} options={SIDES} onChange={(v) => onChange(v, yardLine)} aria-label="Side of the field" />
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

