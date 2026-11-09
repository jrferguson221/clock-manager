// Shared pieces: the clock field's logic, the decision picker, ball-spot helpers, the timeline and the play log.

import { useRef, useState } from "react";
import { Button, Card, Group, List, NativeSelect, Table, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { clockTextSchema, firstError, LIMITS, type LimitedField, type Side } from "@situational-football/schemas";
import type { TimelineEvent } from "./engine";
import { formatClock, formatClockDigits, parseClock } from "./time";

export interface Option<T extends string | number> {
  readonly value: T;
  readonly label: string;
}

/**
 * The game-clock field's text. Valid clocks go straight to `commit` (the URL); anything else stays a
 * draft with an error, until the next valid entry or until the committed clock changes (say, after a play).
 */
export function useClockField(committed: string, commit: (clock: string) => void) {
  const [draft, setDraft] = useState<{ for: string; text: string } | null>(null);
  const text = draft !== null && draft.for === committed ? draft.text : committed;
  const error = firstError(clockTextSchema, text);
  return {
    text,
    error,
    /** Seconds on the clock, or null while the field holds an invalid draft. */
    seconds: error === null ? parseClock(text) : null,
    onType(raw: string) {
      const next = formatClockDigits(raw);
      if (firstError(clockTextSchema, next) === null) {
        setDraft(null);
        commit(next);
      } else {
        setDraft({ for: committed, text: next });
      }
    },
  };
}

/**
 * A dropdown over a fixed list. It's a native select, so phones show their own picker (easier with a
 * thumb on the sideline than a long custom dropdown). `onChange` only ever receives one of the options' values.
 */
export function ChoiceSelect<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly Option<T>[]; onChange: (v: T) => void;
}) {
  return (
    <NativeSelect
      label={label}
      value={String(value)}
      data={options.map((o) => ({ value: String(o.value), label: o.label }))}
      onChange={(e) => {
        const v = e.currentTarget.value;
        const picked = options.find((o) => String(o.value) === v);
        if (picked !== undefined) onChange(picked.value);
      }}
    />
  );
}

/** A number pulled into a field's range, so a situation after a play always fits the URL schema. */
export const clampTo = (field: LimitedField, n: number) => Math.min(LIMITS[field].max, Math.max(LIMITS[field].min, n));

export const yardsToGoalFrom = (side: Side, yardLine: number) => (side === "own" ? 100 - yardLine : yardLine);
export const spotFrom = (ytg: number): { side: Side; yardLine: number } =>
  ytg >= 50 ? { side: "own", yardLine: 100 - ytg } : { side: "opp", yardLine: ytg };

/** One side's entry on the timeline: what happened, and the detail under it. */
function TimelineEntry({ e }: { e: TimelineEvent }) {
  return (
    <>
      <span className="tl-event">{e.event}</span>
      <span className="tl-detail">{e.note}</span>
    </>
  );
}

/**
 * A timeline as a sideline sheet: the game clock runs down the middle, the other team's moves sit to
 * its left and yours to its right, and what the rules do (the two-minute warning, the final whistle)
 * spans the sheet. A real table, so a screen reader reads each row as them, clock, you.
 */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <Table className="tl" layout="fixed" withRowBorders={false} verticalSpacing={0} horizontalSpacing={0}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th className="tl-side them" scope="col">Them</Table.Th>
          <Table.Th className="tl-clock" scope="col">Clock</Table.Th>
          <Table.Th className="tl-side you" scope="col">You</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {events.map((e, i) => {
          const clock = formatClock(e.clock);
          if (e.who === "game") {
            return (
              <Table.Tr key={i} className="tl-rule">
                <Table.Td colSpan={3}>
                  <span className="tl-rule-text">
                    <span className="tl-rule-clock">{clock}</span>
                    <span className="tl-event">{e.event}</span>
                    <span className="tl-detail">{e.note}</span>
                  </span>
                </Table.Td>
              </Table.Tr>
            );
          }
          return (
            <Table.Tr key={i} className={`tl-row ${e.who}`}>
              <Table.Td className="tl-side them">{e.who === "them" && <TimelineEntry e={e} />}</Table.Td>
              <Table.Td className="tl-clock"><span className="tl-clock-tag">{clock}</span></Table.Td>
              <Table.Td className="tl-side you">{e.who === "you" && <TimelineEntry e={e} />}</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

/** The list of logged plays, with undo and reset. */
export function PlayLog({ summaries, onUndo, onReset }: { summaries: string[]; onUndo: () => void; onReset: () => void }) {
  if (summaries.length === 0) return null;
  return (
    <Card>
      <Text className="eyebrow" mb="xs">Play log</Text>
      <List type="ordered" spacing={4} mb="md" className="tabular">
        {summaries.map((text, i) => <List.Item key={i}>{text}</List.Item>)}
      </List>
      <Group gap="sm">
        <Button variant="default" onClick={onUndo}>Undo last play</Button>
        <Button variant="default" onClick={onReset}>New drive</Button>
      </Group>
    </Card>
  );
}

/**
 * `value`, held back until `key` has stopped changing for `wait` ms, so typing in the form doesn't run
 * the simulations on every keystroke. The first change after a pause applies at once (a called play
 * updates the meter right away). `pending` is true while the returned value is behind.
 */
export function useDebouncedByKey<T>(value: T, key: string, wait = 250): { value: T; pending: boolean } {
  const seen = useRef(new Map<string, T>());
  seen.current.set(key, value);
  const [settledKey] = useDebouncedValue(key, wait, { leading: true });
  const settled = seen.current.get(settledKey);
  for (const k of seen.current.keys()) if (k !== key && k !== settledKey) seen.current.delete(k);
  return settled === undefined ? { value, pending: false } : { value: settled, pending: settledKey !== key };
}
