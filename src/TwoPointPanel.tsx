// Kick or go for two: you've just scored a touchdown. Which try gives you the better chance to win?

import { useMemo } from "react";
import { Alert, Card, Table, Text, SimpleGrid } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import type { TwoPointSearch } from "@situational-football/schemas";
import { evaluateTry, CLOSE, SPECIAL_TEAMS, TRY_CALLS, type GameState, type TryCall, type TryValues } from "./sim";
import { ChoiceSelect, ClockInput, Segmented, TIMEOUT_OPTIONS, useClockField, useDebouncedByKey } from "./fields";
import { ModeLayout } from "./SituationForm";
import { WinMeter } from "./Trainer";
import { GuideLink } from "./ReadMore";

const route = getRouteApi("/two-point");

const scoreLabel = (m: number) => (m > 0 ? `Up ${m}` : m < 0 ? `Down ${-m}` : "Tied");
/** The score with the touchdown's 6 points counted, from down 16 to up 16. */
const MARGINS = Array.from({ length: 33 }, (_, i) => ({ value: 16 - i, label: scoreLabel(16 - i) }));
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Beyond the fourth quarter the model's late-game play-calling doesn't hold. */
const MAX_CLOCK = 15 * 60;

/** A result's win probability, with the score it leaves. */
function Outcome({ wp, margin }: { wp: number; margin: number }) {
  return (
    <>
      {pct(wp)}
      <Text size="xs" c="dimmed">{scoreLabel(margin)}</Text>
    </>
  );
}

export default function TwoPointPanel() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<TwoPointSearch>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const clock = useClockField(s.clock, (c) => set({ clock: c }));

  const game: GameState | null = clock.seconds == null ? null : {
    clock: clock.seconds, running: false, poss: "you", down: 1, toGo: 10, ytg: 75,
    margin: s.margin, timeouts: { you: s.timeouts, opp: s.oppTimeouts }, over: false,
  };
  const sim = useDebouncedByKey(game, JSON.stringify(game));
  const values = useMemo(() => (sim.value == null ? null : evaluateTry(sim.value)), [sim.value]);

  const form = (
    <Card component="form" onSubmit={(e) => e.preventDefault()} aria-label="Situation" padding="lg">
      <Text className="eyebrow" mb="sm">After the touchdown</Text>
      <SimpleGrid cols={{ base: 1, xs: 2, lg: 1 }} spacing="md" verticalSpacing="md">
        <ClockInput label="Time left" text={clock.text} error={clock.error} onType={clock.onType} />
        <ChoiceSelect label="Score, counting the touchdown" value={s.margin} options={MARGINS} onChange={(margin) => set({ margin })} />
        <Segmented label="Your timeouts" value={s.timeouts} options={TIMEOUT_OPTIONS} onChange={(n) => set({ timeouts: n })} />
        <Segmented label="Their timeouts" value={s.oppTimeouts} options={TIMEOUT_OPTIONS} onChange={(n) => set({ oppTimeouts: n })} />
      </SimpleGrid>
    </Card>
  );

  return (
    <ModeLayout intro="You've just scored a touchdown. Kick the extra point or go for 2? Enter the score with the touchdown counted and the time left." form={form}>
      {values == null || game == null ? (
        <Alert color="gray">Enter the clock as M:SS, for example 3:00.</Alert>
      ) : (
        <TryResult values={values} margin={game.margin} clock={game.clock} pending={sim.pending} />
      )}
    </ModeLayout>
  );
}

function TryResult({ values, margin, clock, pending }: { values: TryValues; margin: number; clock: number; pending: boolean }) {
  const other: TryCall = values.best === "two" ? "kick" : "two";
  const edge = Math.abs(values.two - values.kick);
  const close = edge < CLOSE;
  const wp = Math.max(values.two, values.kick);
  return (
    <div className={pending ? "is-pending" : undefined} aria-busy={pending} style={{ display: "grid", gap: "var(--mantine-spacing-md)" }}>
      {clock > MAX_CLOCK && (
        <Alert color="yellow">The model plays out late-game situations. With more than 15:00 left, treat this as a rough guide.</Alert>
      )}
      <Card className={`accent-card ${close ? "" : "best"}`}>
        <Text className="eyebrow">{close ? "Toss-up" : "Best call"}</Text>
        <Text className="verdict big">{close ? "Either one" : TRY_CALLS[values.best]}</Text>
        <Text>
          {close
            ? `Both are within the model's noise (${pct(values.kick)} to kick, ${pct(values.two)} to go for 2). Either is reasonable.`
            : `${pct(wp)} to win, against ${pct(values[other])} if you ${other === "two" ? "go for 2" : "kick"}: ${Math.round(edge * 1000) / 10} points better.`}
        </Text>
      </Card>

      <WinMeter wp={wp} prev={null} label="Win probability with the better try" />

      <Card>
        <Text className="eyebrow">Both options</Text>
        <Table.ScrollContainer minWidth={330}>
          <Table className="tabular try-table" withRowBorders={false} verticalSpacing={6} horizontalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Try</Table.Th>
                <Table.Th>Success</Table.Th>
                <Table.Th>Win if good</Table.Th>
                <Table.Th>Win if not</Table.Th>
                <Table.Th>Overall</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(["kick", "two"] as const).map((call) => {
                const points = call === "kick" ? 1 : 2;
                return (
                  <Table.Tr key={call} className={call === values.best && !close ? "is-best" : undefined}>
                    <Table.Th scope="row">{call === "kick" ? "Extra point" : "2-point try"}</Table.Th>
                    <Table.Td>{pct(call === "kick" ? SPECIAL_TEAMS.extraPoint : SPECIAL_TEAMS.twoPoint)}</Table.Td>
                    <Table.Td><Outcome wp={values.byPoints[points]} margin={margin + points} /></Table.Td>
                    <Table.Td><Outcome wp={values.byPoints[0]} margin={margin} /></Table.Td>
                    <Table.Td fw={700}>{pct(values[call])}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Text size="sm" c="dimmed" mt={4}>
          Under each win probability is the score that result leaves. Overall weighs the two by the success rate.
        </Text>
        <Text mt="sm">
          {values.breakEven === null
            ? "Two points don't help here, so kick."
            : values.breakEven < 0.05
              ? "Going for 2 is the better call even if your team rarely converts: the extra point barely helps here."
              : values.breakEven >= 1
              ? "Going for 2 only makes sense if you'd convert every time."
              : `Going for 2 is the better call if your team converts at least ${pct(values.breakEven)} of the time (the league converts ${pct(SPECIAL_TEAMS.twoPoint)}).`}
        </Text>
      </Card>

      <Text size="xs" c="dimmed">
        Each result is played out over 3,000 simulated games: the kickoff (onside if you're still behind late), then both
        teams follow rule-of-thumb play-calling, with the same model as the rest of the app. A tie counts as half a win.{" "}
        <GuideLink section="two-point">Kick or go for two, explained</GuideLink>
      </Text>
    </div>
  );
}
