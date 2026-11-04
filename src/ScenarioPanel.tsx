// Player decisions: one choice a QB, receiver or running back makes during a play, compared option by option.

import { useMemo, type ReactNode } from "react";
import { Alert, Badge, Card, Group, Progress, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import { SCENARIO_IDS, SCENARIO_PRESETS, type ScenarioId, type ScenarioSearch } from "@clock-manager/schemas";
import { DOWNS } from "./engine";
import type { GameState } from "./sim";
import { analyzeScenario, SCENARIOS, type ScenarioAnalysis } from "./scenarios";
import { formatClock } from "./time";
import {
  BallOnInput, ChoiceSelect, ClockInput, NumberField, Segmented, TIMEOUT_OPTIONS, useClockField, useDebouncedByKey, yardsToGoalFrom,
} from "./fields";
import { ModeLayout } from "./SituationForm";
import { ReasonText } from "./ReadMore";

const route = getRouteApi("/scenarios");

const PLAYER_OPTIONS = SCENARIO_IDS.map((id) => ({ value: id, label: SCENARIOS[id].role }));
const DOWN_OPTIONS = DOWNS.map((d) => ({ value: d, label: ["1st", "2nd", "3rd", "4th"][d - 1] ?? String(d) }));
/** Score options from down 16 to up 16. Positive means you lead. */
const MARGINS = Array.from({ length: 33 }, (_, i) => {
  const m = 16 - i;
  return { value: m, label: m > 0 ? `Up ${m}` : m < 0 ? `Down ${-m}` : "Tied" };
});
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function ScenarioPanel() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<ScenarioSearch>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  // Switching players loads that scenario's starting situation, as a new history entry so Back returns.
  const choose = (id: ScenarioId) => void navigate({ search: SCENARIO_PRESETS[id] });
  const clock = useClockField(s.clock, (c) => set({ clock: c }));
  const def = SCENARIOS[s.scenario];
  const ytg = yardsToGoalFrom(s.side, s.yardLine);

  const game: GameState | null = clock.seconds == null ? null : {
    clock: clock.seconds, running: false, poss: "you", down: s.down, toGo: Math.min(s.toGo, ytg), ytg,
    margin: s.margin, timeouts: { you: s.timeouts, opp: s.oppTimeouts }, over: false,
  };
  const inputs = { scenario: s.scenario, game, sackYards: s.sackYards, gain: s.gain, extra: s.extra, seconds: s.seconds };
  const sim = useDebouncedByKey(inputs, JSON.stringify(inputs));

  const analysis = useMemo(() => {
    const { scenario, game: g, ...rest } = sim.value;
    if (g == null || g.clock === 0) return null;
    return analyzeScenario(scenario, { game: g, ...rest });
  }, [sim.value]);

  const form = (
    <Card component="form" onSubmit={(e) => e.preventDefault()} aria-label="Situation" padding="lg">
      <Text className="eyebrow" mb="sm">The decision</Text>
      <Segmented label="Player" value={s.scenario} options={PLAYER_OPTIONS} onChange={choose} />
      <Text className="eyebrow" mt="lg" mb="sm">Situation at the snap</Text>
      <SimpleGrid cols={{ base: 1, xs: 2, lg: 1 }} spacing="md" verticalSpacing="md">
        <ClockInput text={clock.text} error={clock.error} onType={clock.onType} />
        <ChoiceSelect label="Score" value={s.margin} options={MARGINS} onChange={(margin) => set({ margin })} />
        <Segmented label="Your timeouts" value={s.timeouts} options={TIMEOUT_OPTIONS} onChange={(n) => set({ timeouts: n })} />
        <Segmented label="Their timeouts" value={s.oppTimeouts} options={TIMEOUT_OPTIONS} onChange={(n) => set({ oppTimeouts: n })} />
        <Segmented label="Down" value={s.down} options={DOWN_OPTIONS} onChange={(d) => set({ down: d })} />
        <NumberField label="To go" field="toGo" value={s.toGo} onChange={(n) => set({ toGo: n })} />
        <BallOnInput side={s.side} yardLine={s.yardLine} onChange={(side, yardLine) => set({ side, yardLine })} />
        {s.scenario === "qb-throwaway" && (
          <NumberField label="The sack would lose (yards)" field="sackYards" value={s.sackYards} onChange={(n) => set({ sackYards: n })} />
        )}
        {s.scenario === "wr-sideline" && (
          <>
            <NumberField label="Gain at the catch (yards)" field="gain" value={s.gain} onChange={(n) => set({ gain: n })} />
            <NumberField label="Extra yards by turning upfield" field="extra" value={s.extra} onChange={(n) => set({ extra: n })} />
          </>
        )}
        <NumberField
          label={s.scenario === "rb-score" ? "Seconds from the snap to the goal line" : "Seconds the play takes"}
          field="seconds" value={s.seconds} onChange={(n) => set({ seconds: n })}
        />
      </SimpleGrid>
    </Card>
  );

  return (
    <ModeLayout intro="Decisions players make in the middle of a play, and what they're worth late in a game." form={form}>
      <Stack gap="md">
        <Card>
          <Text className="eyebrow">{def.role} decision</Text>
          <Title order={2} mt={4}>{def.title}</Title>
          <Text mt="xs">{def.question}</Text>
        </Card>
        {analysis == null ? (
          <Alert color="gray">{clock.seconds === 0 ? "The clock is at 0:00: the game is over." : "Enter the clock as M:SS, for example 0:50."}</Alert>
        ) : (
          <Results analysis={analysis} pending={sim.pending} caveat={<ReasonText reason={def.caveat} />} />
        )}
      </Stack>
    </ModeLayout>
  );
}

function Results({ analysis: a, pending, caveat }: { analysis: ScenarioAnalysis; pending: boolean; caveat: ReactNode }) {
  const [first, second] = a.options;
  return (
    <Stack gap="md" className={pending ? "is-pending" : undefined} aria-busy={pending}>
      <Card className={`accent-card${a.better === null ? "" : " best"}`}>
        <Text className="eyebrow">Verdict</Text>
        <Text className="verdict big">{a.better === null ? "Toss-up" : a.options[a.better].label}</Text>
        <Text><ReasonText reason={a.reason} /></Text>
        {a.flipNote !== null && <Text c="dimmed" mt="xs">{a.flipNote}</Text>}
      </Card>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {a.options.map((o, i) => (
          <Card key={o.id} aria-label={`${o.label}: ${pct(o.wp)} win probability`}>
            <Group justify="space-between" align="baseline">
              <Text fw={700} className="option-label">{o.label}</Text>
              {a.better === i && <Badge color="turf">Better</Badge>}
            </Group>
            <Text className="meter-num tabular" mt={4}>{pct(o.wp)}</Text>
            <Progress value={o.wp * 100} mt={6} aria-hidden className="meter-track" color={a.better === i ? "turf" : "gray"} />
            <Text size="sm" c="dimmed" mt="sm">Win probability. After the play: {o.after}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card>
        <Text className="eyebrow" mb="xs">Where the answer flips</Text>
        <Text size="sm" c="dimmed" mb="sm">The same play and situation, with different time left at the snap.</Text>
        <Table.ScrollContainer minWidth={320}>
          <Table className="tabular" aria-label="Win probability by clock">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Clock at the snap</Table.Th>
                <Table.Th>{first.label}</Table.Th>
                <Table.Th>{second.label}</Table.Th>
                <Table.Th>Better</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {a.flips.map((f) => (
                <Table.Tr key={f.clock}>
                  <Table.Th scope="row">{formatClock(f.clock)}</Table.Th>
                  <Table.Td fw={f.better === 0 ? 700 : undefined}>{pct(f.wps[0])}</Table.Td>
                  <Table.Td fw={f.better === 1 ? 700 : undefined}>{pct(f.wps[1])}</Table.Td>
                  <Table.Td>{f.better === null ? "Either" : a.options[f.better].label}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Alert color="gray" variant="light" title="What this leaves out">{caveat}</Alert>

      <Text size="xs" c="dimmed">
        Each option fixes how this play ends; the rest of the game is simulated 3,000 times (1,000 per row in the table),
        on the same random numbers for both options, with both teams then following rule-of-thumb play-calling.
      </Text>
    </Stack>
  );
}
