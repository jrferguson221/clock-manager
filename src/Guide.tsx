// The strategy guide: how the clock works late in a game, how the app works out win probability,
// and why one call beats another. Explainer reasons link to its sections (#/guide?section=timeouts).
//
// Every number on this page is read or computed from the model itself, so the guide can't drift
// out of date when the model changes.

import { useEffect, useMemo, type ReactNode } from "react";
import { Accordion, Card, Grid, List, Stack, Table, Text, Title } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import { GUIDE_SECTIONS, type GuideSection } from "@situational-football/schemas";
import { NFL_RULES, PLAY_TYPES, runOutThreshold, DOWNS } from "./engine";
import { DEFAULT_ASSUMPTIONS, fgDistance } from "./trailing";
import {
  bestScored, compression, evaluateCalls, fgMakeChance, goalLineRunChance, hailMaryChance, passOdds, runShape, winProbability,
  AVOID, CLOSE, DEFAULT_SIM, EXPECTED_RUN_WINDOW, FG_TIMEOUT_AT, DEFENSE_TIMEOUT_WINDOW, FG_MAX_YTG, HAIL_MARY, MIN_SNAP, PASS_ODDS, PREVENT_WINDOW, PUNT_MIN_YTG,
  END_ZONE_SHOT_CLOCK, GO_FOR_TWO_MARGINS, OBVIOUS_TO_GO, TIED_KNEEL_CLOCK, OBVIOUS_WINDOW, PLAY_CALLS, RED_ZONE, SPECIAL_TEAMS, TIE, type GameState, type PassCall,
} from "./sim";
import { formatClock } from "./time";
import { AnchorLink, GuideLink } from "./ReadMore";

const route = getRouteApi("/guide");

/** The pass calls, from the safest to the riskiest. */
const PASS_CALLS = ["pass-screen", "pass-sideline", "pass-middle", "pass-play-action", "pass-deep"] as const satisfies readonly PassCall[];

const TITLES: Readonly<Record<GuideSection, string>> = {
  "win-probability": "How win probability works",
  "play-model": "What each play call does",
  "clock-rules": "What stops the clock",
  "two-minute-warning": "The two-minute warning",
  timeouts: "Timeouts",
  spike: "The spike",
  "running-out-the-clock": "Running out the clock",
  "drive-budget": "Budgeting a two-minute drive",
  "field-goal-endgame": "Playing for a field goal",
  "prevent-defense": "Prevent defense",
  "red-zone": "The red zone and the goal line",
  "hail-mary": "The Hail Mary",
  "fourth-down": "Fourth down",
  "two-point": "Kick or go for two",
  "scoring-and-kickoffs": "Extra points, two-point tries and onside kicks",
  limitations: "What the model leaves out",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

/** A typical late-game spot the examples share: down 3, ball on your 25, 1:45 left, clock running. */
const EXAMPLE: GameState = {
  clock: 105, running: true, poss: "you", down: 1, toGo: 10, ytg: 75, margin: -3, timeouts: { you: 2, opp: 3 }, over: false,
};

export default function Guide() {
  const { section } = route.useSearch();

  // Jump to the linked section once the page has laid out. Links into the guide don't reset the scroll,
  // so nothing moves the page back afterward.
  useEffect(() => {
    if (section === undefined) return;
    const frame = requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [section]);

  return (
    <Grid gap="xl">
      <Grid.Col span={{ base: 12, md: 3 }}>
        {/* Desktop: a sticky list beside the guide. Phones: a collapsed "Contents" panel, so the guide starts on screen one. */}
        <Card className="guide-toc" component="nav" aria-label="Guide sections" visibleFrom="md">
          <Text className="eyebrow" mb="xs">Strategy guide</Text>
          <Contents current={section} />
        </Card>
        <Accordion variant="contained" hiddenFrom="md" chevronPosition="right">
          <Accordion.Item value="contents">
            <Accordion.Control>Contents</Accordion.Control>
            <Accordion.Panel>
              <nav aria-label="Guide sections"><Contents current={section} /></nav>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 9 }}>
        <Stack gap="xl" className="guide">
          <div>
            <Title order={2} className="guide-title">The late-game clock, explained</Title>
            <Text size="lg" mt="xs">
              The last few minutes of a close game are a race between the scoreboard and the clock. This guide explains the
              rules that decide how much time each play costs, the strategy that follows from them, and exactly how this app
              works out its win probabilities and best calls.
            </Text>
          </div>
          <WinProbabilitySection />
          <PlayModelSection />
          <ClockRulesSection />
          <TwoMinuteWarningSection />
          <TimeoutsSection />
          <SpikeSection />
          <RunningOutSection />
          <DriveBudgetSection />
          <FieldGoalSection />
          <PreventSection />
          <RedZoneSection />
          <HailMarySection />
          <FourthDownSection />
          <TwoPointSection />
          <ScoringSection />
          <LimitationsSection />
        </Stack>
      </Grid.Col>
    </Grid>
  );
}

function Contents({ current }: { current: GuideSection | undefined }) {
  return (
    <List listStyleType="none" spacing={6} size="sm">
      {GUIDE_SECTIONS.map((id) => (
        <List.Item key={id}>
          <AnchorLink to="/guide" search={{ section: id }} resetScroll={false} fw={id === current ? 700 : undefined}>
            {TITLES[id]}
          </AnchorLink>
        </List.Item>
      ))}
    </List>
  );
}

function Section({ id, children }: { id: GuideSection; children: ReactNode }) {
  return (
    <section id={id} className="guide-section" aria-labelledby={`${id}-title`}>
      <Title order={3} id={`${id}-title`} mb="sm">{TITLES[id]}</Title>
      <Stack gap="sm">{children}</Stack>
    </section>
  );
}

/** A small table of numbers. Rows are label + values; the first column is a row heading. */
function NumberTable({ caption, head, rows }: { caption: string; head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    // The caption sits outside the scroll area, so it wraps instead of scrolling away on narrow screens.
    <div>
      <Text className="guide-caption" id={captionId(caption)}>{caption}</Text>
      <Table.ScrollContainer minWidth={320}>
      <Table className="tabular guide-table" withTableBorder aria-labelledby={captionId(caption)}>
        <Table.Thead>
          <Table.Tr>{head.map((h) => <Table.Th key={h}>{h}</Table.Th>)}</Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(([first, ...rest]) => (
            <Table.Tr key={first}>
              <Table.Th scope="row">{first}</Table.Th>
              {rest.map((v, i) => <Table.Td key={i}>{v}</Table.Td>)}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      </Table.ScrollContainer>
    </div>
  );
}

/** A stable element id for a table caption. */
const captionId = (caption: string) => `table-${caption.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

// ---------------------------------------------------------------------------

function WinProbabilitySection() {
  // How the estimate settles down as more games are simulated. Each larger sample includes the smaller ones.
  const convergence = useMemo(() => [25, 100, 500, 2000].map((n) => {
    const p = winProbability(EXAMPLE, n);
    return { n, p, margin: 1.96 * Math.sqrt((p * (1 - p)) / n) };
  }), []);

  return (
    <Section id="win-probability">
      <Text>
        Win probability is your chance of winning from this exact situation: the clock, score, down, distance, field
        position and both teams' timeouts. The app doesn't look it up in a table of past games. It plays the rest of the
        game out, many times, and counts how often you win.
      </Text>
      <List spacing={4}>
        <List.Item>
          <strong>One simulated game</strong> starts from the situation and runs play by play. Each play's result (yards,
          time off the clock, out of bounds or not, sacks, turnovers) is drawn at random from that call's odds, described
          in <GuideLink section="play-model">what each play call does</GuideLink>. The clock follows the{" "}
          <GuideLink section="clock-rules">NFL's clock rules</GuideLink>.
        </List.Item>
        <List.Item>
          <strong>After your call, both teams play by rules of thumb</strong>: the leading team kneels when that ends the
          game and runs otherwise; a team that only needs a field goal drains the clock and kicks; a trailing team throws,
          stops the clock with timeouts and spikes, throws at the end zone from {END_ZONE_SHOT_CLOCK} seconds when it needs
          a touchdown and is in reach, and heaves it on the last play; a tied team deep in its own end kneels with{" "}
          {TIED_KNEEL_CLOCK} seconds or less, and punts on 4th down, to play for overtime. Real coaches can do better or worse,
          so the numbers describe sound, not perfect, play.
        </List.Item>
        <List.Item>
          <strong>Possessions change hands</strong> through punts, missed kicks, turnovers and kickoffs, and the game
          continues until 0:00. A tie at the end counts as half a win: overtime is treated as a coin flip.
        </List.Item>
        <List.Item>
          <strong>Your win probability is the share of simulated games you win.</strong> To score a call, the app
          simulates games that start with it: 500 per call in the trainers and 1,500 in Best call. The meter shows the
          best call's number, so it's your chance if you choose well from here.
        </List.Item>
      </List>

      <Title order={4}>Why the numbers wobble, and how much to trust them</Title>
      <Text>
        A simulation is a sample, so it has a margin of error that shrinks as more games are played. Here's one
        situation (down 3 at your own 25, 1:45 left, clock running, you with 2 timeouts and them with 3) estimated with
        more and more games, with both teams playing by the rules of thumb from the first snap:
      </Text>
      <NumberTable
        caption="Win probability, down 3 at your own 25 with 1:45 left"
        head={["Simulated games", "Estimate", "Margin of error (95%)"]}
        rows={convergence.map((c) => [c.n.toLocaleString("en-US"), pct1(c.p), `± ${(c.margin * 100).toFixed(1)} points`])}
      />
      <Text>
        That's why the app treats calls within {Math.round(TIE * 1000) / 10} of a point as tied, calls a choice within{" "}
        {Math.round(CLOSE * 1000) / 10} points of the best one "close", and only lists calls under "Avoid" when they're at
        least {Math.round(AVOID * 100)} points worse (or waste a timeout or a down outright).
      </Text>
      <Text>
        Comparing two calls is more precise than either number alone. Every situation and every call is simulated on the
        same sequence of random numbers, so when two calls differ, it's because of the calls, not the luck of the draw.
        That also means having more timeouts never looks worse just by chance.
      </Text>
    </Section>
  );
}

/** Completion rate per throw: the model's odds are per snap, and sacks count as snaps. */
const perThrow = (o: { complete: number; sack: number }) => o.complete / (1 - o.sack);

function ObviousTable() {
  const rows = PASS_CALLS.map((call) => {
    const n = PASS_ODDS.normal[call];
    const o = PASS_ODDS.obvious[call];
    return [PLAY_CALLS[call], `${pct(perThrow(n))} → ${pct(perThrow(o))}`, `${pct(n.sack)} → ${pct(o.sack)}`, `${pct(n.interception)} → ${pct(o.interception)}`];
  });
  return <NumberTable caption="Normal → obvious passing situation" head={["Pass", "Complete (per throw)", "Sacked", "Intercepted"]} rows={rows} />;
}

function PlayModelSection() {
  const normal = PASS_ODDS.normal;
  const passRows = PASS_CALLS.map((call) => {
    const o = normal[call];
    const label = PLAY_CALLS[call];
    return [label, pct(perThrow(o)), o.minYards < 0
      ? `From a ${-o.minYards}-yard loss up, about ${Math.round(o.minYards + o.extraYards)} on average`
      : `${o.minYards}+ yards, about ${Math.round(o.minYards + o.extraYards)} on average`, pct(o.outOfBounds), pct(o.sack), pct(o.interception)];
  });
  const run = runShape("normal", 75);
  const expected = runShape("normal", 75, null, true);

  return (
    <Section id="play-model">
      <Text>
        Each call has fixed odds in the open field. The pass odds are fitted to real NFL plays: the 2025 season and
        2026 so far, about 28,800 dropbacks charted by FTN Data, so play-action and screens are known. They describe an
        average offense against an average defense, not any one team.
      </Text>
      <NumberTable
        caption="Passes, between the 20s, against a normal defense"
        head={["Call", "Complete (per throw)", "Gain when complete", "Out of bounds (completions)", "Sack", "Interception"]}
        rows={passRows}
      />
      <Text>
        When everyone knows a pass is coming (3rd or 4th and {OBVIOUS_TO_GO} or more, or trailing or tied by a score in
        the last {OBVIOUS_WINDOW / 60} minutes), defenses rush harder and drop into coverage. Every pass gets harder,
        and play-action keeps only about half its usual edge over a regular dropback: the linebackers aren't fooled
        when they know it's a pass.
      </Text>
      <ObviousTable />
      <List spacing={4}>
        <List.Item>
          <strong>Run:</strong> about {run.mean.toFixed(1)} yards typically, with a {pct(run.breakaway)} chance of a
          breakaway for more. Runs rarely go out of bounds (7%), so they usually keep the clock running, and are lost to a
          fumble about 1% of the time. When you're ahead in the last {EXPECTED_RUN_WINDOW / 60} minutes the defense expects
          the run and loads up to stop it: about {expected.mean.toFixed(1)} yards typically, with a {pct(expected.breakaway)}{" "}
          chance of a breakaway, so runs are stuffed more often (about 22% at or behind the line, against 16%).
        </List.Item>
        <List.Item>
          <strong>Kneel:</strong> loses a yard and takes {PLAY_TYPES.kneel.duration} seconds, with no risk. The clock keeps
          running.
        </List.Item>
        <List.Item>
          <strong>Spike:</strong> an intentional incompletion that stops the clock. It takes about a second but costs a
          down. See <GuideLink section="spike">the spike</GuideLink>.
        </List.Item>
        <List.Item>
          <strong>Field goal and punt:</strong> see <GuideLink section="field-goal-endgame">playing for a field goal</GuideLink>{" "}
          and <GuideLink section="fourth-down">fourth down</GuideLink>.
        </List.Item>
      </List>
      <Text>
        The odds change with the situation: a defense that's ahead late plays{" "}
        <GuideLink section="prevent-defense">prevent</GuideLink>, the field shrinks in the{" "}
        <GuideLink section="red-zone">red zone</GuideLink>, and a deep ball on the last play becomes a{" "}
        <GuideLink section="hail-mary">Hail Mary</GuideLink>.
      </Text>
    </Section>
  );
}

function ClockRulesSection() {
  return (
    <Section id="clock-rules">
      <Text>
        Late in a game, time matters as much as yards, and most of the strategy comes from one question: does this play
        stop the clock or not?
      </Text>
      <NumberTable
        caption="After the play, the clock..."
        head={["What happened", "Clock", "Starts again"]}
        rows={[
          ["Run or catch that ends in bounds", "Keeps running", "Never stopped"],
          ["Sack", "Keeps running", "Never stopped"],
          ["Kneel", "Keeps running", "Never stopped"],
          ["Incomplete pass or spike", "Stops", "On the snap"],
          ["Ball carrier goes out of bounds", "Stops", "On the snap in the last 2:00 of the first half and 5:00 of the game; otherwise when the ball is spotted"],
          ["Timeout", "Stops", "On the snap"],
          ["Score, or change of possession", "Stops", "On the snap"],
          ["Two-minute warning", "Stops", "On the snap"],
        ]}
      />
      <Text>
        Unlike in college, a first down doesn't stop the clock in the NFL. While the clock runs, the offense still has to
        snap within the {NFL_RULES.playClock}-second play clock, so how fast it snaps is a choice:
      </Text>
      <List spacing={4}>
        <List.Item>
          <strong>A team that's ahead drains it</strong>, snapping with a second left: about {NFL_RULES.playClock - 1}{" "}
          seconds gone before every snap.
        </List.Item>
        <List.Item>
          <strong>A team that's behind hurries.</strong> The app assumes a no-huddle snap about {DEFAULT_SIM.hurryUp} seconds
          after an in-bounds play ends (you can change this in Trailing and Best call), {DEFAULT_SIM.spikeLineup} seconds to
          line up and spike, {DEFAULT_SIM.fgRush} to rush the field-goal unit on, and never less than {MIN_SNAP}.
        </List.Item>
      </List>
      <Text>
        That's why a sideline throw is so valuable late: a catch that ends out of bounds gains yards and stops the clock,
        while the same catch in bounds can cost {DEFAULT_SIM.hurryUp} seconds or a timeout.
      </Text>
    </Section>
  );
}

function TwoMinuteWarningSection() {
  return (
    <Section id="two-minute-warning">
      <Text>
        When the clock reaches 2:00 in each half, it stops automatically, as if a free timeout had been called. If a play
        is running, the warning comes after it ends.
      </Text>
      <List spacing={4}>
        <List.Item>
          <strong>Don't call a timeout just before it.</strong> If the clock will reach 2:00 before your next snap anyway,
          the warning stops it for free; a timeout there throws one away.
        </List.Item>
        <List.Item>
          <strong>It's a free stop for the defense too.</strong> A team trying to run out the clock from 2:20 can't burn
          straight through 2:00: the warning stops the clock there, as if the defense had a fourth timeout.
        </List.Item>
      </List>
    </Section>
  );
}

function TimeoutsSection() {
  const byTimeouts = useMemo(() => [3, 2, 1, 0].map((you) =>
    bestScored(evaluateCalls({ ...EXAMPLE, running: false, timeouts: { you, opp: 3 } }, 500)).wp), []);

  return (
    <Section id="timeouts">
      <Text>
        Each team gets three timeouts a half. A timeout stops the clock right away, which saves whatever time the next
        snap would have cost: about {DEFAULT_SIM.hurryUp} seconds in a hurry-up, about {NFL_RULES.playClock} for a team
        that's draining the clock.
      </Text>
      <NumberTable
        caption="Win probability with the best call: down 3 at your own 25, 1:45 left, clock stopped"
        head={["Your timeouts", "3", "2", "1", "0"]}
        rows={[["Win probability", ...byTimeouts.map(pct)]]}
      />
      <List spacing={4}>
        <List.Item>
          <strong>Timeouts are worth the most to the trailing team.</strong> Each one buys roughly one more play. When
          you're ahead, you rarely need yours, so the app values them near zero.
        </List.Item>
        <List.Item>
          <strong>Never call one with the clock already stopped.</strong> It changes nothing now and costs you a stop later.
          The app scores that timeout as the same best play with one fewer timeout, never above it, and always flags it.
        </List.Item>
        <List.Item>
          <strong>With the clock running, a timeout is scored by what comes next:</strong> the best play from the
          stopped-clock situation. That's also exactly what the meter shows after you call it.
        </List.Item>
        <List.Item>
          <strong>Save one for the kick</strong> when a field goal is enough. See{" "}
          <GuideLink section="field-goal-endgame">playing for a field goal</GuideLink>.
        </List.Item>
        <List.Item>
          <strong>Defenses use theirs too.</strong> A defense that's behind calls timeout after in-bounds plays in the last{" "}
          {DEFENSE_TIMEOUT_WINDOW / 60} minutes, to save time for its own offense, unless the two-minute warning is about
          to stop the clock anyway. So does a defense that's ahead or tied when the other team is draining for a field
          goal that would beat it: it stops the clock after each run to keep time for its answer. If the kick would only
          tie, it keeps them: a tie only means overtime.
        </List.Item>
      </List>
    </Section>
  );
}

function SpikeSection() {
  return (
    <Section id="spike">
      <Text>
        A spike is a quick snap and an immediate throw into the ground. It's an incomplete pass, so it stops the clock,
        but it uses a down. It takes about {DEFAULT_SIM.spikeLineup} seconds after a play ends to line up and spike.
      </Text>
      <List spacing={4}>
        <List.Item><strong>Spike to save a timeout</strong>, especially your last one, when you have downs to spare.</List.Item>
        <List.Item><strong>Spike on 1st or 2nd down</strong>, so you still have downs to gain the yards you need.</List.Item>
        <List.Item><strong>Never on 4th down:</strong> an incompletion there hands the ball over.</List.Item>
        <List.Item><strong>Never with the clock already stopped:</strong> it just throws away a down.</List.Item>
      </List>
    </Section>
  );
}

function RunningOutSection() {
  const thresholds = useMemo(() => DOWNS.map((down) => [
    `${["1st", "2nd", "3rd", "4th"][down - 1]} down`,
    ...[0, 1, 2, 3].map((defTimeouts) => {
      const t = runOutThreshold({ down, defTimeouts, clockRunning: true });
      return t < 0 ? "—" : formatClock(t);
    }),
  ]), []);

  return (
    <Section id="running-out-the-clock">
      <Text>
        When you're ahead and have the ball, every snap with the clock running burns about {NFL_RULES.playClock} seconds:
        let the play clock run down to 1, then kneel ({PLAY_TYPES.kneel.duration} seconds). Kneel on every down and the
        game ends if the clock runs out before 4th down is over. The defense's answer is its timeouts: each one stops the
        clock after a play, so the next snap burns only the play itself.
      </Text>
      <NumberTable
        caption="The latest clock you can kneel it out from, with the clock running (no first downs)"
        head={["", "Defense has 0", "1", "2", "3"]}
        rows={thresholds}
      />
      <Text>
        Above those times, kneeling hands the ball back. Then a run is usually better: it can gain a first down, which
        resets the count, and it keeps the clock moving. Passes are a mistake when you're protecting a lead: an
        incompletion stops the clock for them, and an interception gives them the ball. The table comes from the "Can you
        run it out?" calculator in Leading mode.
      </Text>
    </Section>
  );
}

function DriveBudgetSection() {
  const a = DEFAULT_ASSUMPTIONS;
  return (
    <Section id="drive-budget">
      <Text>
        The "Rules of thumb" in Trailing mode are quick arithmetic, separate from the win-probability simulation. They
        answer one question: do you have time for the plays you need?
      </Text>
      <List spacing={4}>
        <List.Item>
          <strong>Plays you need:</strong> the yards to the end zone, or to field-goal range (the opponent's {a.fgRange},
          a {fgDistance(a.fgRange)}-yard try), divided by your yards per play ({a.yardsPerPlay} by default). It's a typical
          count, not a minimum: any play can score.
        </List.Item>
        <List.Item>
          <strong>Plays you can run before 0:00</strong>, three ways: if every play ends in bounds (the worst case), if
          about half your plays stop the clock (typical), and if every play does (the best case). Plays take{" "}
          {a.playDuration} seconds; in-bounds plays are followed by a {a.hurryUp}-second hurry-up, or a timeout while you
          have one.
        </List.Item>
        <List.Item>
          <strong>The advice:</strong> hurry and save timeouts while the typical case leaves a spare play; stop the clock
          once it doesn't; let the two-minute warning stop it when it's about to; spike on early downs to save a last
          timeout; and when you need a field goal, keep one timeout for the kick.
        </List.Item>
      </List>
      <Text>
        For a fuller answer that weighs yards, risk and the clock together, use{" "}
        <AnchorLink to="/best-call">Best call</AnchorLink>.
      </Text>
    </Section>
  );
}

function FieldGoalSection() {
  const distances = [20, 30, 40, 45, 50, 55, 60, FG_MAX_YTG + 17];
  return (
    <Section id="field-goal-endgame">
      <Text>
        A try is the distance to the goal line plus 17 yards: 10 for the end zone and 7 for the hold. The longest try the
        app allows is {FG_MAX_YTG + 17} yards.
      </Text>
      <NumberTable
        caption="Field-goal make chance by distance"
        head={["Distance", ...distances.map((d) => `${d}`)]}
        rows={[["Good", ...distances.map((d) => pct(fgMakeChance(d - 17)))]]}
      />
      <Text>When a field goal ties or wins and you're in range, the clock becomes the main opponent:</Text>
      <List spacing={4}>
        <List.Item>
          <strong>Drain it, then kick.</strong> Run safe in-bounds plays to burn time, let the clock run down to about{" "}
          {FG_TIMEOUT_AT} seconds, then call timeout and kick, so they get little or no time back. Kicking early leaves
          them time to answer.
        </List.Item>
        <List.Item>
          <strong>Spread the clock over your downs.</strong> Don't burn it all before one snap: let the play clock run
          part of the way on each down, so you still get every play before the kick. Each run can gain yards and shorten
          the kick, and the last one still ends with the clock nearly gone. Expect the defense to call timeouts after
          your runs if your kick would beat them; it still pays to drain, but they'll get some time back.
        </List.Item>
        <List.Item>
          <strong>Keep a timeout for the kick.</strong> Without one, you need a spike (a down, about{" "}
          {DEFAULT_SIM.spikeLineup} seconds) or a rushed field-goal unit (about {DEFAULT_SIM.fgRush} seconds), and the clock
          may run out first.
        </List.Item>
        <List.Item>
          <strong>A miss gives them the ball</strong> at the spot of the kick, or at their 20 if the kick was from closer.
        </List.Item>
      </List>
    </Section>
  );
}

function PreventSection() {
  const rows = PASS_CALLS.map((call) => {
    const label = PLAY_CALLS[call];
    const n = PASS_ODDS.normal[call];
    const p = PASS_ODDS.prevent[call];
    return [label, `${pct(perThrow(n))} → ${pct(perThrow(p))}`, `${pct(n.interception)} → ${pct(p.interception)}`, `${pct(n.sack)} → ${pct(p.sack)}`];
  });
  return (
    <Section id="prevent-defense">
      <Text>
        A defense protecting a lead late plays "prevent": safeties deep, coverage that gives up short catches to stop the
        long ones. In the app, a defense that's ahead plays prevent in the last {PREVENT_WINDOW / 60} minutes, outside
        the red zone, except on 3rd or 4th and short: there, giving up a short catch loses the down, so it guards the
        first-down marker instead.
      </Text>
      <NumberTable caption="Normal → prevent" head={["Pass", "Complete (per throw)", "Intercepted", "Sacked"]} rows={rows} />
      <Text>
        In real games, prevent mostly takes away the deep ball, which completes far less and is picked off more. Short
        and sideline throws complete about as usual and gain a little more, and catches near the sideline get out of
        bounds more often. Runs average about {runShape("prevent", 75).mean.toFixed(1)} yards instead of{" "}
        {runShape("normal", 75).mean.toFixed(1)}. So against prevent, take the underneath throws and get out of bounds.
        A defense that's behind doesn't play prevent.
      </Text>
    </Section>
  );
}

function RedZoneSection() {
  const spots = [20, 15, 10, 5, 3, 1];
  return (
    <Section id="red-zone">
      <Text>
        Inside the opponent's {RED_ZONE}, the field shrinks: there's less room behind the defense, so coverage is tighter
        and every throw is harder. Prevent defense doesn't apply here; there's no deep field left to protect.
      </Text>
      <NumberTable
        caption="Pass completion by spot (completion rates are scaled down as the field shrinks)"
        head={["Ball on the", ...spots.map(String)]}
        rows={[
          ["Share of normal completion rate", ...spots.map((y) => pct(compression(y)))],
          ["Pass over the middle", ...spots.map((y) => pct(passOdds("normal", "pass-middle", y).complete))],
          ["Deep pass (a throw into the end zone)", ...spots.map((y) => pct(passOdds("normal", "pass-deep", y).complete))],
        ]}
      />
      <Text>
        At the goal line, the defense packs the line of scrimmage. Runs average under 2 yards with no breakaways, but they
        only need a yard or two:
      </Text>
      <NumberTable
        caption="Chance a single run scores, by spot"
        head={["Ball on the", "1", "2", "3", "4", "5"]}
        rows={[["Touchdown", ...[1, 2, 3, 4, 5].map((y) => pct(goalLineRunChance(y)))]]}
      />
      <Text>
        So from the 1, run it. From the 3 with time to spare, runs and quick throws are close; with seconds left, throw,
        because an incompletion stops the clock and a run that comes up short doesn't.{" "}
        <AnchorLink to="/best-call" search={{ clock: "0:40", margin: -4, toGo: 3, side: "opp", yardLine: 3, running: false }}>
          Try 1st & goal at the 3 in Best call
        </AnchorLink>
        .
      </Text>
    </Section>
  );
}

function HailMarySection() {
  const spots = [25, 30, 35, 40, 45, 50, 55, 60];
  return (
    <Section id="hail-mary">
      <Text>
        With {HAIL_MARY.maxClock} seconds or less and no time for anything else, a deep pass from within{" "}
        {HAIL_MARY.maxYtg} yards is a heave into the end zone: several receivers, a crowd of defenders, a jump ball.
      </Text>
      <NumberTable
        caption={`Hail Mary touchdown chance (intercepted about ${pct(HAIL_MARY.interception)} of the time)`}
        head={["Yards to go", ...spots.map(String)]}
        rows={[["Touchdown", ...spots.map((y) => pct(hailMaryChance(y)))]]}
      />
      <Text>
        A few extra seconds are worth a lot: with about 8 seconds instead of 3, an incompletion can leave time for a
        second heave.
      </Text>
    </Section>
  );
}

function FourthDownSection() {
  return (
    <Section id="fourth-down">
      <Text>On 4th down there are three choices: kick a field goal, punt, or go for it.</Text>
      <List spacing={4}>
        <List.Item>
          <strong>Punts</strong> net {SPECIAL_TEAMS.puntNet} yards (a touchback if they'd reach the end zone) and are an
          option from {PUNT_MIN_YTG} or more yards out. Going for it and failing hands them the ball where you stopped.
        </List.Item>
        <List.Item>
          <strong>The team that's ahead</strong> kicks a field goal from the opponent's 35 or closer, punts from{" "}
          {PUNT_MIN_YTG} or more yards out, and goes for it in between.
        </List.Item>
        <List.Item>
          <strong>The team that's behind</strong> kicks when a field goal ties or wins and it's in range, punts only with
          more than five minutes left from its own side of the field, and otherwise goes for it: late in a game, giving
          the ball back usually ends it.
        </List.Item>
      </List>
      <Text>
        Close 4th-down calls really are close: two options within a point or two of each other are both reasonable, and
        the app says so.
      </Text>
    </Section>
  );
}

/** The scores after a touchdown where going for two is the call, as words. */
const scoreWords = (ms: readonly number[]) => ms.map((m) => String(Math.abs(m))).join(", ").replace(/, ([^,]*)$/, " or $1");

function TwoPointSection() {
  const down = GO_FOR_TWO_MARGINS.filter((m) => m < 0).sort((a, b) => b - a);
  const up = GO_FOR_TWO_MARGINS.filter((m) => m > 0);
  return (
    <Section id="two-point">
      <Text>
        A touchdown is worth 6, and then comes the try: an extra point, good {pct(SPECIAL_TEAMS.extraPoint)} of the time
        and worth about {Math.round(SPECIAL_TEAMS.extraPoint * 100) / 100} points, or a two-point try, good{" "}
        {pct(SPECIAL_TEAMS.twoPoint)} of the time and worth about {Math.round(2 * SPECIAL_TEAMS.twoPoint * 100) / 100}.
        On average they're almost even, so late in a game the choice comes down to which scores the result leaves you
        with.
      </Text>
      <Text>
        <strong>Go for 2</strong> when the touchdown leaves you down {scoreWords(down)}, or up {scoreWords(up)}.
        Otherwise, kick. That's the model's answer over the final 10 minutes, and the rule both teams follow in its
        simulations.
      </Text>
      <List spacing={4}>
        <List.Item><strong>Down 2:</strong> two points tie the game. The clearest call on the chart, and the closer to the end, the bigger the edge.</List.Item>
        <List.Item><strong>Up 1:</strong> two points make it a 3-point lead, so a field goal can only tie, not beat you.</List.Item>
        <List.Item><strong>Down 5:</strong> two points leave you down 3, so a field goal ties; a kick leaves you down 4, still needing a touchdown.</List.Item>
        <List.Item><strong>Up 5:</strong> two points make it a 7-point lead, so a touchdown and extra point only tie.</List.Item>
        <List.Item>
          <strong>Down 8 and down 10:</strong> two points turn the deficit into 6 or 8, so your next touchdown wins or can
          tie. If the try fails you learn early that you need two more scores, while there's still time to plan for them.
        </List.Item>
        <List.Item>
          <strong>Down 4:</strong> the model's one departure from what teams do (they kick almost every time). Going for 2
          leaves you down 2, where a field goal wins rather than ties, and a tie is only a coin flip in overtime. The edge is
          small: one to two points of win probability.
        </List.Item>
        <List.Item><strong>Down 1 or tied:</strong> kick. The extra point ties or takes the lead almost every time.</List.Item>
      </List>
      <Text>
        Most other scores are within a point either way, so either is reasonable there. If your offense converts more
        often than the league, going for 2 gets better: the{" "}
        <AnchorLink to="/two-point">kick or go for 2 tool</AnchorLink> shows the conversion rate at which the two choices
        break even for any score and time.
      </Text>
    </Section>
  );
}

function ScoringSection() {
  return (
    <Section id="scoring-and-kickoffs">
      <List spacing={4}>
        <List.Item>
          <strong>After a touchdown</strong>, the extra point is good {pct(SPECIAL_TEAMS.extraPoint)} of the time and a
          two-point try {pct(SPECIAL_TEAMS.twoPoint)} (2022-2026 NFL seasons). Which to try depends on the score: see{" "}
          <GuideLink section="two-point">kick or go for two</GuideLink>.
        </List.Item>
        <List.Item>
          <strong>Kickoffs</strong> are touchbacks: the receiving team starts at its {SPECIAL_TEAMS.touchbackYardLine}.
        </List.Item>
        <List.Item>
          <strong>Onside kicks:</strong> a team still behind after scoring, with {SPECIAL_TEAMS.onsideWindow / 60} minutes
          or less left, kicks onside. It recovers {pct(SPECIAL_TEAMS.onsideRecovery)} of the time, around its own 45;
          otherwise the other team gets a short field.
        </List.Item>
      </List>
    </Section>
  );
}

function LimitationsSection() {
  return (
    <Section id="limitations">
      <Text>
        The model is built to get the clock logic right, and to be honest about its odds. It leaves out things that real
        games include:
      </Text>
      <List spacing={4}>
        <List.Item>Penalties, including 10-second runoffs in the last minute, and injuries.</List.Item>
        <List.Item>Kickoff and punt returns, safeties, and fumbles on pass plays.</List.Item>
        <List.Item>Team strength: both teams are average, every week, in any weather.</List.Item>
        <List.Item>Overtime, which is a coin flip. That's also why a tied team deep in its own end with under a minute left may kneel.</List.Item>
        <List.Item>
          The shorter play clock after timeouts and other stoppages: the app always uses {NFL_RULES.playClock} seconds.
        </List.Item>
        <List.Item>Tempo you choose yourself: it's set automatically from the score and situation.</List.Item>
        <List.Item>
          Play-calling after your decision follows rules of thumb, so the numbers assume sound, not perfect, play from
          both teams.
        </List.Item>
      </List>
      <Text>
        Treat the numbers as well-founded estimates, accurate to a point or two, and the comparisons between calls as the
        most reliable part.
      </Text>
    </Section>
  );
}
