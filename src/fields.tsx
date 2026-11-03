// Small form and display pieces shared by both panels.
import type { TimelineEvent } from "./engine";
import { formatClock } from "./time";

export function ClockInput({ value, onChange, valid }: { value: string; onChange: (v: string) => void; valid: boolean }) {
  return (
    <label>
      Game clock
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" aria-invalid={!valid} />
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
        <input
          type="number" min={1} max={50} value={yardLine} aria-label="Yard line"
          onChange={(e) => onChange(side, Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
        />
      </span>
    </label>
  );
}

export function ToGoInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label>
      To go
      <input type="number" min={1} max={99} value={value}
        onChange={(e) => onChange(Math.min(99, Math.max(1, Number(e.target.value) || 1)))} />
    </label>
  );
}

