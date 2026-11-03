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
