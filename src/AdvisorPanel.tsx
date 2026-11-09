// Informational mode: enter any situation and get the best call, with no play simulated.

import { useMemo } from "react";
import { Alert, Card, List, Stack, Text } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import type { BestCallSearch } from "@situational-football/schemas";
import { noGainCalls, evaluateCalls, recommend, DEFAULT_SIM, PLAY_CALLS, type GameState } from "./sim";
import { ChoiceSelect, NumberField, useClockField, useDebouncedByKey, yardsToGoalFrom } from "./fields";
import SituationForm, { ModeLayout } from "./SituationForm";
import { CallTable, WinMeter, tempoNote } from "./Trainer";
import { GuideLink, ReasonText } from "./ReadMore";

const route = getRouteApi("/best-call");

/** Score options from down 16 to up 16. Positive means you lead. */
const MARGINS = Array.from({ length: 33 }, (_, i) => {
  const m = 16 - i;
  return { value: m, label: m > 0 ? `Up ${m}` : m < 0 ? `Down ${-m}` : "Tied" };
});
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function AdvisorPanel() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<BestCallSearch>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false });
  const clock = useClockField(s.clock, (c) => set({ clock: c }));
  const ytg = yardsToGoalFrom(s.side, s.yardLine);

  const game: GameState | null = clock.seconds == null ? null : {
    clock: clock.seconds, running: s.running, poss: "you", down: s.down, toGo: Math.min(s.toGo, ytg), ytg,
    margin: s.margin, timeouts: { you: s.timeouts, opp: s.oppTimeouts }, over: false,
  };
  const key = `${JSON.stringify(game)}/${s.hurryUp}`;
  const sim = useDebouncedByKey({ game, hurryUp: s.hurryUp }, key);

  const analysis = useMemo(() => {
    const { game: g, hurryUp } = sim.value;
    if (g == null) return null;
    const cfg = { ...DEFAULT_SIM, hurryUp };
    if (g.clock === 0) return { ended: true as const, game: g, cfg };
    const values = evaluateCalls(g, 1500, cfg);
    return { ended: false as const, game: g, cfg, values, rec: recommend(g, values, cfg) };
  }, [sim.value]);

  const form = (
    <SituationForm
      situation={s} set={set} clock={clock} oppTimeoutsLabel="Their timeouts"
      score={<ChoiceSelect label="Score" value={s.margin} options={MARGINS} onChange={(margin) => set({ margin })} />}
      extras={<NumberField label="Hurry-up time (s)" field="hurryUp" value={s.hurryUp} onChange={(n) => set({ hurryUp: n })} />}
    />
  );

  return (
    <ModeLayout intro="Enter any situation where you have the ball and see the best call, and why." form={form}>
      {analysis == null || game == null ? (
        <Alert color="gray">Enter the clock as M:SS, for example 1:45.</Alert>
      ) : analysis.ended ? (
        <Alert color="gray">The clock is at 0:00: the game is over.</Alert>
      ) : (
        <Stack gap="md" className={sim.pending ? "is-pending" : undefined} aria-busy={sim.pending}>
          <Card className="accent-card best">
            <Text className="eyebrow">Best call</Text>
            <Text className="verdict big">{PLAY_CALLS[analysis.rec.best]}</Text>
            <Text><ReasonText reason={analysis.rec.reason} /></Text>
            {analysis.rec.runnerUp?.close && (
              <Text c="dimmed" mt="xs">
                {PLAY_CALLS[analysis.rec.runnerUp.call]} is about as good ({pct(analysis.rec.runnerUp.wp)}). The
                difference is within the model's noise.
              </Text>
            )}
          </Card>

          <WinMeter wp={analysis.rec.wp} prev={null} label="Win probability with the best call" />

          <Card>
            <Text className="eyebrow">Every option</Text>
            <CallTable values={analysis.values} caption="Your win probability with each call" noGain={noGainCalls(analysis.game)} />
            {analysis.rec.avoid.length > 0 && (
              <>
                <Text className="eyebrow" c="red" mt="md">Avoid</Text>
                <List spacing={4} mt={4}>
                  {analysis.rec.avoid.map((a) => (
                    <List.Item key={a.call}><strong>{PLAY_CALLS[a.call]}</strong> ({pct(a.wp)}): <ReasonText reason={a.reason} /></List.Item>
                  ))}
                </List>
              </>
            )}
          </Card>

          <Text size="xs" c="dimmed">
            {tempoNote(analysis.game, analysis.cfg)} Each option is scored over 1,500 simulated games in which both teams then
            follow rule-of-thumb play-calling, using the same model as the trainer.{" "}
            <GuideLink section="win-probability">How win probability works</GuideLink>
          </Text>
        </Stack>
      )}
    </ModeLayout>
  );
}
