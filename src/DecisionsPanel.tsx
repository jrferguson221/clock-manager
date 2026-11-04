// Decisions of the week: the costliest late-game calls in a week of NFL games, by the app's model,
// and the plays that swung games most. The data comes from the route's loader, already validated.

import { Accordion, Alert, Badge, Card, Group, List, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import type { Decision, DecisionIndex, DecisionWeek } from "@clock-manager/schemas";
import { PLAY_CALLS } from "./sim";
import { formatClock } from "./time";
import { ChoiceSelect, spotFrom } from "./fields";
import { AnchorLink, GuideLink, ReasonText } from "./ReadMore";
import { teamName, teamStyle } from "./teamPalette";

const route = getRouteApi("/decisions");

const pct = (x: number) => `${Math.round(x * 100)}%`;
const points = (x: number) => {
  const n = Math.round(x * 100);
  return `${n} point${Math.abs(n) === 1 ? "" : "s"}`;
};
const ordinal = (d: number) => ["1st", "2nd", "3rd", "4th"][d - 1] ?? `${d}th`;
const spot = (ytg: number) => (ytg === 50 ? "midfield" : ytg > 50 ? `own ${100 - ytg}` : `opp ${ytg}`);
const score = (m: number) => (m > 0 ? `up ${m}` : m < 0 ? `down ${-m}` : "tied");

export default function DecisionsPanel() {
  const { index, week } = route.useLoaderData();
  const navigate = route.useNavigate();

  if (week === null) {
    return <Alert color="gray" title="No decisions yet">There's no finished week of games to look at yet.</Alert>;
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Text className="eyebrow">{week.season} season</Text>
          <Title order={2}>Decisions of the week</Title>
        </div>
        <WeekPicker index={index} week={week.week} onChange={(w) => void navigate({ search: { week: w } })} />
      </Group>

      <Text>
        The costliest calls in the final five minutes of one-score games in week {week.week}, by this app's model: each
        offense's play call, kick or timeout, scored against every option it had. Calls are judged by the odds at the
        time, not by how they turned out, so a call that worked can still make the list.
      </Text>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <Stat label="Games" value={String(week.games)} />
        <Stat label="Decisions scored" value={String(week.evaluated)} />
        <Stat label="Costly calls" value={String(week.worst.length)} />
        <Stat label="Models agree within 10 points" value={pct(week.agreement.within10)} />
      </SimpleGrid>

      <Method week={week} />

      <section aria-labelledby="worst-title">
        <Title order={3} id="worst-title" mb="sm">The costliest calls</Title>
        {week.worst.length === 0 ? (
          <Alert color="gray">No call this week cost 6 points of win probability or more. Good week for coaches.</Alert>
        ) : (
          <Stack gap="md">{week.worst.map((d, i) => <DecisionCard key={d.id} d={d} rank={i + 1} kind="worst" />)}</Stack>
        )}
      </section>

      <section aria-labelledby="notable-title">
        <Title order={3} id="notable-title" mb="sm">The biggest swings</Title>
        <Text c="dimmed" mb="sm">The late plays that moved win probability most, by nflverse's model: what actually happened.</Text>
        <Stack gap="md">{week.notable.map((d) => <DecisionCard key={d.id} d={d} kind="notable" />)}</Stack>
      </section>

      <Text size="xs" c="dimmed">
        {week.source}. Generated {week.generatedAt.slice(0, 10)}. The verdicts are this app's model, not nflverse's or FTN's.
      </Text>
    </Stack>
  );
}

function WeekPicker({ index, week, onChange }: { index: DecisionIndex; week: number; onChange: (w: number) => void }) {
  const options = [...index.weeks].reverse().map((w) => ({
    value: w.week, label: `Week ${w.week}${w.worst > 0 ? ` (${w.worst} costly call${w.worst === 1 ? "" : "s"})` : ""}`,
  }));
  return <ChoiceSelect label="Week" value={week} options={options} onChange={onChange} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="sm">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text className="stat-value tabular">{value}</Text>
    </Card>
  );
}

function Method({ week }: { week: DecisionWeek }) {
  return (
    <Accordion variant="contained">
      <Accordion.Item value="method">
        <Accordion.Control>How the calls are judged</Accordion.Control>
        <Accordion.Panel>
          <List spacing={6} size="sm">
            <List.Item>
              Every offensive decision in the last 5:00 of a game within 8 points: the play call (run, pass, kneel, spike,
              punt or field goal) and offensive timeouts. For each, the model scores every option the offense had by
              simulating the rest of the game thousands of times. <GuideLink section="win-probability">How win probability works</GuideLink>
            </List.Item>
            <List.Item>
              The cost of a call is how much win probability it gave up against the best option. A call makes the list at
              6 points or more.
            </List.Item>
            <List.Item>
              Passes are judged as one decision, "throw it", and credited with the best kind of pass: where the ball went,
              and whether it was play-action or a screen, depends on the coverage and the play design, which play-by-play
              can't show. Play-action and screens come from FTN's charting.
            </List.Item>
            <List.Item>
              When the clock was running before a play, the call is judged from the end of the play before, so each option
              pays its own time to the snap: a spike's quick lineup, a hurry-up, or a timeout. Whether the clock was running
              is worked out from the play before.
            </List.Item>
            <List.Item>
              As a check, every situation's win probability is compared with nflverse's independent model. They agree
              within 10 points on {pct(week.agreement.within10)} of this week's decisions (an average gap of{" "}
              {points(week.agreement.meanAbsDiff)}). Where they disagree by more than 15 points, the verdict is left off
              the list, as are timeouts called when the clock may already have been stopped.
            </List.Item>
            <List.Item>
              The model leaves things out: penalties, injuries, team strength, weather. <GuideLink section="limitations">What the model leaves out</GuideLink>
            </List.Item>
          </List>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

function DecisionCard({ d, rank, kind }: { d: Decision; rank?: number; kind: "worst" | "notable" }) {
  const s = d.situation;
  const sameCall = d.call === d.best || d.cost < 0.005;
  return (
    <Card
      className={`team-card team-colors${kind === "worst" ? " costly" : ""}`} style={teamStyle(d.offense)}
      aria-label={`${teamName(d.offense)} versus ${teamName(d.defense)}, ${formatClock(d.snapClock)} left`}
    >
      <Group justify="space-between" align="center" wrap="wrap" gap="xs">
        <Group gap={6} align="center" wrap="nowrap">
          {rank !== undefined && <Text className="eyebrow">#{rank}</Text>}
          <TeamChip team={d.offense} />
          <Text className="eyebrow">vs</Text>
          <TeamChip team={d.defense} />
          <Text className="eyebrow">· {d.date}</Text>
        </Group>
        {d.lowConfidence && <Badge color="gray" variant="light">Models disagree: less certain</Badge>}
      </Group>
      <Title order={4} mt={4}>
        {d.offense}: {PLAY_CALLS[d.call]}, {ordinal(s.down)} & {s.toGo >= s.ytg ? "goal" : s.toGo} at {spot(s.ytg)}, {formatClock(d.snapClock)} left
      </Title>
      <Text size="sm" c="dimmed">
        {d.offense} {score(s.margin)}, timeouts {s.timeouts}–{s.oppTimeouts}.{" "}
        {s.running && s.clock !== d.snapClock
          ? `The clock was running: the call was made at ${formatClock(s.clock)}, at the end of the play before, and judged from there.`
          : `Clock ${s.running ? "running" : "stopped"}.`}
      </Text>
      <Text mt="xs" className="play-desc">“{d.description}”</Text>

      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" mt="sm">
        <div>
          <Text size="sm" c="dimmed">Their call</Text>
          <Text fw={700}>{PLAY_CALLS[d.call]}: {pct(d.wpCall)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">The model's best call</Text>
          <Text fw={700}>{sameCall ? "The same, or as good" : `${PLAY_CALLS[d.best]}: ${pct(d.wpBest)}`}</Text>
        </div>
      </SimpleGrid>
      {kind === "worst" && <Text mt="xs" fw={600}>Cost: {points(d.cost)} of win probability.</Text>}
      {!sameCall && <Text size="sm" mt="xs"><ReasonText reason={d.reason} /></Text>}

      <Text size="sm" c="dimmed" mt="xs">
        {d.nflverseWp !== null && <>nflverse's win probability before the play: {pct(d.nflverseWp)}. </>}
        {d.nflverseWpa !== null && (
          <>How it turned out: {Math.abs(d.nflverseWpa) < 0.005 ? "about even" : `${d.nflverseWpa > 0 ? "+" : "−"}${points(Math.abs(d.nflverseWpa))}`}.</>
        )}
      </Text>
      <AnchorLink
        to="/best-call" mt="xs" size="sm"
        search={{
          clock: formatClock(s.clock), running: s.running, margin: Math.max(-16, Math.min(16, s.margin)),
          timeouts: s.timeouts, oppTimeouts: s.oppTimeouts, down: s.down, toGo: Math.min(99, s.toGo), ...spotFrom(s.ytg),
        }}
      >
        Try this situation in Best call
      </AnchorLink>
    </Card>
  );
}

/** A team's abbreviation on its color, with the full name for screen readers and on hover. */
function TeamChip({ team }: { team: string }) {
  return (
    <abbr className="team-chip team-colors" style={teamStyle(team)} title={teamName(team)}>
      {team}
    </abbr>
  );
}
