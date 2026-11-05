// Form inputs, the timeline table and the play log, shared by the three modes.

import { useId, useRef, useState, type ReactNode } from "react";
import {
  Button, Card, Group, Input, List, NativeSelect, NumberInput, SegmentedControl, Table, Text, TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  clockTextSchema, firstError, rangeSchema, LIMITS, SIDES, type LimitedField, type Side,
} from "@situational-football/schemas";
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

export function ClockInput({ text, error, onType }: { text: string; error: string | null; onType: (raw: string) => void }) {
  return (
    <TextInput
      label="Game clock" value={text} onChange={(e) => onType(e.currentTarget.value)}
      inputMode="numeric" placeholder="M:SS" autoComplete="off" error={error}
      classNames={{ input: "clock-input" }}
    />
  );
}

/** Labelled segmented buttons over a fixed list. `onChange` only ever receives one of the options' values. */
export function Segmented<T extends string | number>({ label, value, options, onChange, "aria-label": ariaLabel }: {
  label?: ReactNode; value: T; options: readonly Option<T>[]; onChange: (v: T) => void; "aria-label"?: string;
}) {
  const id = useId();
  const control = (
    <SegmentedControl
      value={String(value)}
      data={options.map((o) => ({ value: String(o.value), label: o.label }))}
      onChange={(v) => {
        const picked = options.find((o) => String(o.value) === v);
        if (picked !== undefined) onChange(picked.value);
      }}
      {...(label === undefined ? { "aria-label": ariaLabel } : { "aria-labelledby": `${id}-label` })}
    />
  );
  if (label === undefined) return control;
  return (
    <Input.Wrapper label={label} labelElement="div" id={id} labelProps={{ id: `${id}-label` }}>
      {control}
    </Input.Wrapper>
  );
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

export const TIMEOUT_OPTIONS = [0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }));

/**
 * A whole-number input you can clear and retype freely. Valid numbers in range apply as you type;
 * leaving the field snaps it back into range (or back to the last value, if it's empty).
 */
export function NumberField({ field, value, onChange, label, "aria-label": ariaLabel, w }: {
  field: LimitedField; value: number; onChange: (n: number) => void; label?: string; "aria-label"?: string; w?: string;
}) {
  const { min, max } = LIMITS[field];
  const [draft, setDraft] = useState<string | number | null>(null);
  const shown = draft ?? value;
  const error = draft === null || draft === "" ? null : firstError(rangeSchema(field), Number(draft));
  return (
    <NumberInput
      {...(label === undefined ? {} : { label })}
      {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
      {...(w === undefined ? {} : { w })}
      value={shown} min={min} max={max} clampBehavior="none" allowDecimal={false} allowNegative={min < 0}
      error={error}
      onChange={(v) => {
        setDraft(v);
        if (typeof v === "number" && firstError(rangeSchema(field), v) === null) onChange(v);
      }}
      onBlur={() => {
        if (draft !== null) {
          const n = Math.round(Number(draft));
          onChange(draft === "" || !Number.isFinite(n) ? value : Math.min(max, Math.max(min, n)));
        }
        setDraft(null);
      }}
    />
  );
}

const SIDE_OPTIONS = SIDES.map((s) => ({ value: s, label: s === "own" ? "Own" : "Opp" }));

export const yardsToGoalFrom = (side: Side, yardLine: number) => (side === "own" ? 100 - yardLine : yardLine);
export const spotFrom = (ytg: number): { side: Side; yardLine: number } =>
  ytg >= 50 ? { side: "own", yardLine: 100 - ytg } : { side: "opp", yardLine: ytg };

export function BallOnInput({ side, yardLine, onChange }: {
  side: Side; yardLine: number; onChange: (side: Side, yardLine: number) => void;
}) {
  return (
    <Input.Wrapper label="Ball on" labelElement="div">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <div className="grow">
          <Segmented value={side} options={SIDE_OPTIONS} onChange={(s) => onChange(s, yardLine)} aria-label="Side of the field" />
        </div>
        <NumberField field="yardLine" value={yardLine} aria-label="Yard line" w="5rem" onChange={(y) => onChange(side, y)} />
      </Group>
    </Input.Wrapper>
  );
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <Table.ScrollContainer minWidth={420}>
      <Table striped highlightOnHover className="tabular">
        <Table.Thead>
          <Table.Tr><Table.Th>Clock</Table.Th><Table.Th>Event</Table.Th><Table.Th>Detail</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {events.map((e, i) => (
            <Table.Tr key={i}>
              <Table.Td className="clock-cell">{formatClock(e.clock)}</Table.Td>
              <Table.Td>{e.event}</Table.Td>
              <Table.Td c="dimmed">{e.note}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
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
