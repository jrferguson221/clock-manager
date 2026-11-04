import { useMemo } from "react";
import { Accordion, Alert, Badge, Card, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import type { TrailingSearch } from "@clock-manager/schemas";
import { adviseNextCall, driveBudget, fgDistance, playsNeeded, DEFAULT_ASSUMPTIONS, type DriveSituation } from "./trailing";
import { DEFAULT_SIM, type GameState } from "./sim";
import { ChoiceSelect, NumberField, clampTo, Timeline, useClockField, useDebouncedByKey, yardsToGoalFrom } from "./fields";
import SituationForm, { ModeLayout, sharedFromGame } from "./SituationForm";
import { GuideLink } from "./ReadMore";
import Trainer from "./Trainer";

const route = getRouteApi("/trailing");

const TRAIL_OPTIONS = Array.from({ length: 17 }, (_, i) => ({ value: i, label: i === 0 ? "Tied" : String(i) }));

export default function TrailingPanel() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<TrailingSearch>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const clock = useClockField(s.clock, (c) => set({ clock: c }));
  const gameClock = clock.seconds;
  const yardsToGoal = yardsToGoalFrom(s.side, s.yardLine);
  // A field goal ties or wins when you're down 3 or less.
  const need = s.trail <= 3 ? "fg" : "td";
  const { ypp: yardsPerPlay, hurryUp } = s;

  const analysis = useMemo(() => {
    if (gameClock == null) return null;
    const sit: DriveSituation = { gameClock, clockRunning: s.running, timeouts: s.timeouts, down: s.down, yardsToGoal, need };
    const a = { ...DEFAULT_ASSUMPTIONS, yardsPerPlay, hurryUp };
    return {
      advice: adviseNextCall(sit, a),
      needed: playsNeeded(sit, a),
      inbounds: driveBudget(sit, "inbounds", a),
      typical: driveBudget(sit, "typical", a).plays,
      best: driveBudget(sit, "stops-clock", a).plays,
    };
  }, [gameClock, s.running, s.timeouts, s.down, yardsToGoal, need, yardsPerPlay, hurryUp]);

  const game: GameState | null = gameClock == null ? null : {
    clock: gameClock, running: s.running, poss: "you", down: s.down, toGo: Math.min(s.toGo, yardsToGoal), ytg: yardsToGoal,
    margin: -s.trail, timeouts: { you: s.timeouts, opp: s.oppTimeouts }, over: false,
  };
  const sim = useDebouncedByKey(game, `${JSON.stringify(game)}/${hurryUp}`);
  const cfg = useMemo(() => ({ ...DEFAULT_SIM, hurryUp }), [hurryUp]);

  const form = (
    <SituationForm
      situation={s} set={set} clock={clock} oppTimeoutsLabel="Their timeouts"
      score={<ChoiceSelect label="You trail by" value={s.trail} options={TRAIL_OPTIONS} onChange={(trail) => set({ trail })} />}
      extras={
        <>
          <NumberField label="Yards per play" field="yardsPerPlay" value={yardsPerPlay} onChange={(n) => set({ ypp: n })} />
          <NumberField label="Hurry-up time (s)" field="hurryUp" value={hurryUp} onChange={(n) => set({ hurryUp: n })} />
        </>
      }
    />
  );

  return (
    <ModeLayout intro="You're behind or tied and have the ball. Call each play and see how it changes your chances." form={form}>
      {analysis == null || sim.value == null ? (
        <Alert color="gray">Enter the clock as M:SS, for example 1:45.</Alert>
      ) : (
        <Stack gap="lg">
          <Trainer game={sim.value} pending={sim.pending} onChange={(g) => set({ ...sharedFromGame(g), trail: clampTo("trail", -g.margin) })} cfg={cfg} />

          <Group justify="space-between" align="baseline">
            <Title order={2}>Rules of thumb</Title>
            <GuideLink section="drive-budget">How these work</GuideLink>
          </Group>
          <Card className="accent-card">
            <Text className="eyebrow">Next call</Text>
            <Text className="verdict">{analysis.advice.headline}</Text>
            <Text>{analysis.advice.detail}</Text>
          </Card>

          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" component="dl" className="stats">
            <Card className="stat">
              <Text component="dt" size="sm" c="dimmed">
                {need === "fg" ? "Plays to reach field-goal range" : "Plays to reach the end zone"} at {yardsPerPlay}{" "}
                yard{yardsPerPlay === 1 ? "" : "s"} a play
              </Text>
              <Text component="dd" className="stat-value">{analysis.needed}</Text>
            </Card>
            {([
              ["if every play ends in bounds", analysis.inbounds.plays],
              ["if about half your plays stop the clock", analysis.typical],
              ["if every play stops the clock", analysis.best],
            ] as const).map(([when, plays]) => {
              const n = Math.max(0, plays);
              const short = analysis.needed - n;
              return (
                <Card key={when} className="stat">
                  <Text component="dt" size="sm" c="dimmed">
                    {need === "fg" ? `Plays you can run and still kick, ${when}` : `Plays you can run before 0:00, ${when}`}
                  </Text>
                  <Group component="dd" gap="xs" align="center">
                    <span className="stat-value">{n}</span>
                    <Badge color={short > 0 ? "red" : "turf"} size="lg">{short > 0 ? `${short} short` : "enough time"}</Badge>
                  </Group>
                </Card>
              );
            })}
          </SimpleGrid>
          {need === "fg" && (
            <Text size="xs" c="dimmed">
              Field-goal range is the opponent's {DEFAULT_ASSUMPTIONS.fgRange}, a {fgDistance(DEFAULT_ASSUMPTIONS.fgRange)}-yard try.
              One timeout is held back for the kick.
            </Text>
          )}

          <Accordion variant="contained" radius="md">
            <Accordion.Item value="timeline">
              <Accordion.Control>Worst-case timeline: every play in bounds</Accordion.Control>
              <Accordion.Panel><Timeline events={analysis.inbounds.timeline} /></Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Text size="xs" c="dimmed">
            The rules of thumb use NFL rules, {DEFAULT_ASSUMPTIONS.playDuration}-second plays, a spike about{" "}
            {DEFAULT_ASSUMPTIONS.spikeLineup} seconds after an in-bounds play, first downs as you go, and no penalties or
            10-second runoffs.
          </Text>
        </Stack>
      )}
    </ModeLayout>
  );
}
