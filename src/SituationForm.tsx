// The situation form every mode shares: clock, score, timeouts, down and distance, ball spot and clock state.

import type { ReactNode } from "react";
import { Card, Grid, SimpleGrid, Stack, Switch, Text } from "@mantine/core";
import type { BestCallSearch, LeadingSearch, TrailingSearch } from "@situational-football/schemas";
import { DOWNS } from "./engine";
import type { GameState } from "./sim";
import { formatClock } from "./time";
import { BallOnInput, ClockInput, NumberField, Segmented, TIMEOUT_OPTIONS, spotFrom, type useClockField } from "./fields";

/** The search params every mode has. */
export type SharedSituation = Pick<
  LeadingSearch & TrailingSearch & BestCallSearch,
  "clock" | "running" | "timeouts" | "oppTimeouts" | "down" | "toGo" | "side" | "yardLine"
>;

const DOWN_OPTIONS = DOWNS.map((d) => ({ value: d, label: ["1st", "2nd", "3rd", "4th"][d - 1] ?? String(d) }));

/** The shared fields of a situation after a play, for writing back to the URL. */
export function sharedFromGame(g: GameState): SharedSituation {
  return {
    clock: formatClock(g.clock), running: g.running, timeouts: g.timeouts.you, oppTimeouts: g.timeouts.opp,
    down: g.down, toGo: g.toGo, ...spotFrom(g.ytg),
  };
}

export default function SituationForm({ situation: s, set, clock, score, oppTimeoutsLabel, extras }: {
  situation: SharedSituation;
  set: (patch: Partial<SharedSituation>) => void;
  clock: ReturnType<typeof useClockField>;
  /** The mode's score field. */
  score: ReactNode;
  oppTimeoutsLabel: string;
  /** Mode-specific fields, after the ball spot. */
  extras?: ReactNode;
}) {
  return (
    <Card component="form" onSubmit={(e) => e.preventDefault()} aria-label="Situation" padding="lg">
      <Text className="eyebrow" mb="sm">Situation</Text>
      <SimpleGrid cols={{ base: 1, xs: 2, lg: 1 }} spacing="md" verticalSpacing="md">
        <ClockInput text={clock.text} error={clock.error} onType={clock.onType} />
        {score}
        <Segmented label="Your timeouts" value={s.timeouts} options={TIMEOUT_OPTIONS} onChange={(n) => set({ timeouts: n })} />
        <Segmented label={oppTimeoutsLabel} value={s.oppTimeouts} options={TIMEOUT_OPTIONS} onChange={(n) => set({ oppTimeouts: n })} />
        <Segmented label="Down" value={s.down} options={DOWN_OPTIONS} onChange={(d) => set({ down: d })} />
        <NumberField label="To go" field="toGo" value={s.toGo} onChange={(n) => set({ toGo: n })} />
        <BallOnInput side={s.side} yardLine={s.yardLine} onChange={(side, yardLine) => set({ side, yardLine })} />
        {extras}
        <Switch
          label="Clock is running" checked={s.running} onChange={(e) => set({ running: e.currentTarget.checked })}
          className="running-switch"
        />
      </SimpleGrid>
    </Card>
  );
}

/**
 * A mode's page: its intro, then the form beside the results on wide screens, above them on narrow ones.
 * A mode that shows its situation as a scorebug (edited in place) passes `scorebug` instead of a form:
 * the bug sits over full-width results, and nothing moves while you edit it.
 */
export function ModeLayout({ intro, form, scorebug, toggle, children }: {
  intro: string;
  /** A switch between related modes, above everything else. */
  toggle?: ReactNode;
  form?: ReactNode;
  scorebug?: ReactNode;
  children: ReactNode;
}) {
  const results = <section className="results" aria-live="polite" aria-label="Results">{children}</section>;
  return (
    <>
      {toggle}
      <Text c="dimmed" mb="md">{intro}</Text>
      {scorebug === undefined ? (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <div className="form-column">{form}</div>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 8 }}>{results}</Grid.Col>
        </Grid>
      ) : (
        <Stack gap="lg">
          {scorebug}
          {results}
        </Stack>
      )}
    </>
  );
}
