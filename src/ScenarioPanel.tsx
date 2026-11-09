// Player decisions: one choice a QB, receiver or running back makes during a play, compared option by option.

import { useMemo, type ReactNode } from "react";
import { Alert, Badge, Card, Group, Progress, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import { LIMITS, SCENARIO_IDS, SCENARIO_PRESETS, type LimitedField, type ScenarioId, type ScenarioSearch } from "@situational-football/schemas";
import type { GameState } from "./sim";
import { analyzeScenario, SCENARIOS, type ScenarioAnalysis } from "./scenarios";
import { formatClock } from "./time";
import { ChoiceSelect, useClockField, useDebouncedByKey, yardsToGoalFrom } from "./fields";
import { ModeLayout } from "./SituationForm";
import Scorebug, { BugSelect } from "./Scorebug";
import { ReasonText } from "./ReadMore";

const route = getRouteApi("/scenarios");

const DECISION_OPTIONS = SCENARIO_IDS.map((id) => ({ value: id, label: `${SCENARIOS[id].role}: ${SCENARIOS[id].title}` }));
/** Score options from down 16 to up 16. Positive means you lead. */
const MARGINS = Array.from({ length: 33 }, (_, i) => {
  const m = 16 - i;
  return { value: m, label: m > 0 ? `Up ${m}` : m < 0 ? `Down ${-m}` : "Tied" };
});
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Every whole number a scenario input allows. */
const rangeOptions = (field: LimitedField) => {
  const { min, max } = LIMITS[field];
  return Array.from({ length: max - min + 1 }, (_, i) => ({ value: min + i, label: String(min + i) }));
};

export default function ScenarioPanel() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<ScenarioSearch>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false });
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

  /** The scenario's own inputs, as pickers in the strip under the bug. */
  const extras = (["sackYards", "gain", "extra", "seconds"] as const).flatMap((field) => {
    const label = def.fields[field];
    if (label === undefined) return [];
    return [(
      <span key={field} className="sb-setting">
        <span className="sb-setting-label">{label}</span>
        <BugSelect label={label} value={s[field]} options={rangeOptions(field)} onChange={(n) => set({ [field]: n })}>{s[field]}</BugSelect>
      </span>
    )];
  });
  const scorebug = (
    <Scorebug
      situation={{ timeouts: s.timeouts, oppTimeouts: s.oppTimeouts, ball: { down: s.down, toGo: s.toGo, side: s.side, yardLine: s.yardLine } }}
      set={set} clock={clock} clockNote="At the snap"
      margin={s.margin} marginOptions={MARGINS} onMargin={(margin) => set({ margin })}
      settings={extras}
    />
  );
  const picker = (
    <div className="decision-picker">
      <ChoiceSelect label="Decision" value={s.scenario} options={DECISION_OPTIONS} onChange={choose} />
    </div>
  );

  return (
    <ModeLayout toggle={picker} intro="Decisions players make in the middle of a play, and what they're worth late in a game." scorebug={scorebug}>
      <Stack gap="md">
        <Card>
          <Text className="eyebrow">{def.role === "Coach" ? "Play call" : `${def.role} decision`}</Text>
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
              {a.better === i && <Badge color="green">Better</Badge>}
            </Group>
            <Text className="meter-num tabular" mt={4}>{pct(o.wp)}</Text>
            <Progress value={o.wp * 100} mt={6} aria-hidden className="meter-track" color={a.better === i ? "green" : "gray"} />
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
