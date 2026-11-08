import { useMemo } from "react";
import { Alert, Card, Group, Stack, Text, Title } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import type { LeadingSearch } from "@situational-football/schemas";
import { simulateRunOut, runOutThreshold, PLAY_TYPE_IDS, PLAY_TYPES, type RunOutResult } from "./engine";
import type { GameState } from "./sim";
import { formatClock } from "./time";
import { ChoiceSelect, Timeline, clampTo, useClockField, useDebouncedByKey, yardsToGoalFrom } from "./fields";
import SituationForm, { ModeLayout, sharedFromGame } from "./SituationForm";
import { GuideLink } from "./ReadMore";
import Scorebug from "./Scorebug";
import Trainer from "./Trainer";

const route = getRouteApi("/");

const PLAY_TYPE_OPTIONS = PLAY_TYPE_IDS.map((k) => ({ value: k, label: `${PLAY_TYPES[k].label} (${PLAY_TYPES[k].duration}s)` }));
const LEAD_OPTIONS = Array.from({ length: 16 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

export default function RunOutPanel() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<LeadingSearch>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const clock = useClockField(s.clock, (c) => set({ clock: c }));
  const gameClock = clock.seconds;
  const yardsToGoal = yardsToGoalFrom(s.side, s.yardLine);

  const analysis = useMemo(() => {
    if (gameClock == null) return null;
    const sit = { down: s.down, defTimeouts: s.oppTimeouts, clockRunning: s.running, playDuration: PLAY_TYPES[s.playType].duration };
    return { result: simulateRunOut({ ...sit, gameClock }), threshold: runOutThreshold(sit) };
  }, [gameClock, s.down, s.oppTimeouts, s.running, s.playType]);

  const game: GameState | null = gameClock == null ? null : {
    clock: gameClock, running: s.running, poss: "you", down: s.down, toGo: Math.min(s.toGo, yardsToGoal), ytg: yardsToGoal,
    margin: s.lead, timeouts: { you: s.timeouts, opp: s.oppTimeouts }, over: false,
  };
  const sim = useDebouncedByKey(game, JSON.stringify(game));

  const form = (
    <SituationForm
      situation={s} set={set} clock={clock} oppTimeoutsLabel="Defense timeouts"
      score={<ChoiceSelect label="You lead by" value={s.lead} options={LEAD_OPTIONS} onChange={(lead) => set({ lead })} />}
      extras={
        <ChoiceSelect label="Run-out play type" value={s.playType} options={PLAY_TYPE_OPTIONS} onChange={(playType) => set({ playType })} />
      }
    />
  );

  return (
    <ModeLayout
      intro="You're ahead and have the ball. Call each play and see how it changes your chances." form={form} mustEdit={gameClock == null}
      scorebug={(edit) => (
        <Scorebug {...s} margin={s.lead} notes={[`Run out with: ${PLAY_TYPES[s.playType].label.toLowerCase()}`]} onEdit={edit} />
      )}
    >
      {analysis == null || sim.value == null ? (
        <Alert color="gray">Enter the clock as M:SS, for example 2:05.</Alert>
      ) : (
        <Stack gap="lg">
          <Trainer game={sim.value} pending={sim.pending} onChange={(g) => set({ ...sharedFromGame(g), lead: clampTo("lead", g.margin) })} />
          <Group justify="space-between" align="baseline">
            <Title order={2}>Can you run it out?</Title>
            <GuideLink section="running-out-the-clock">How this works</GuideLink>
          </Group>
          <Result {...analysis} />
        </Stack>
      )}
    </ModeLayout>
  );
}

function Result({ result: r, threshold }: { result: RunOutResult; threshold: number }) {
  return (
    <Card>
      <Stack gap="sm">
        {r.endsGame ? (
          <Alert color="turf.8" variant="filled" title="Run it out">
            The game ends after {r.snaps} snap{r.snaps === 1 ? "" : "s"}.
          </Alert>
        ) : (
          <Alert color="red.9" variant="filled" title="You can't run it out">
            The defense gets the ball with {formatClock(r.timeLeft)} left.
          </Alert>
        )}
        <Text>
          {threshold >= 0 ? (
            <>From this down, with these timeouts, you can run out the clock from <strong>{formatClock(threshold)}</strong> or less.</>
          ) : (
            "You can't run out the clock from this down with these timeouts."
          )}
        </Text>
        <Timeline events={r.timeline} />
        <Text size="xs" c="dimmed">
          Assumes NFL rules, a 40-second play clock with the snap at 1, no first downs, no penalties, and a defense that
          calls a timeout right after every play.
        </Text>
      </Stack>
    </Card>
  );
}
