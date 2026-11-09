// Decisions of the week: the costliest late-game calls in a week of NFL games, by the app's model,
// and the plays that swung games most. The data comes from the route's loader, already validated.

import { useId, useState } from "react";
import { Accordion, Alert, Badge, Card, Group, List, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import type { Aftermath, CallOutcomes, Decision, DecisionIndex, DecisionWeek } from "@situational-football/schemas";
import { bestCallReason, CLOSE, PLAY_CALLS } from "./sim";
import type { GameState, PlayCall } from "@situational-football/schemas";
import { formatClock } from "./time";
import { ChoiceSelect, spotFrom } from "./fields";
import { AnchorLink, GuideLink, ReasonText } from "./ReadMore";
import { teamName, teamPalette, teamStyle } from "./teamPalette";
import { GameBug } from "./Scorebug";

const route = getRouteApi("/decisions");

const pct = (x: number) => `${Math.round(x * 100)}%`;
const points = (x: number) => {
  const n = Math.round(x * 100);
  return `${n} point${Math.abs(n) === 1 ? "" : "s"}`;
};

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
              is worked out from the play before. A timeout is judged with the play clock it was called on: one taken
              after letting the play clock run down costs no time, only the timeout.
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

const isPass = (c: PlayCall) => c.startsWith("pass-");

/**
 * Other calls within the model's noise of the best one, so a near-tie reads as one: a pass counts once,
 * as "A pass" at its best kind, and their own call isn't listed.
 */
function alsoGood(d: Decision): { label: string; wp: number }[] {
  const out = new Map<string, number>();
  for (const v of d.values) {
    if (v.call === d.best || v.wp < d.wpBest - CLOSE) continue;
    if (v.call === d.call || (isPass(v.call) && (isPass(d.call) || isPass(d.best)))) continue;
    const label = isPass(v.call) ? "A pass" : PLAY_CALLS[v.call];
    out.set(label, Math.max(out.get(label) ?? 0, v.wp));
  }
  return [...out].map(([label, wp]) => ({ label, wp })).sort((a, b) => b.wp - a.wp);
}

/** How a drive result reads in a sentence. */
const RESULT_PHRASE: Readonly<Record<string, string>> = {
  Touchdown: "a touchdown", "Field goal": "a field goal", "Missed field goal": "a missed field goal", Punt: "a punt",
  "Turnover on downs": "a turnover on downs", Interception: "an interception", Fumble: "a lost fumble",
  "Ran out the clock": "running out the clock", "Time ran out": "time running out",
};
const phrase = (result: string) => RESULT_PHRASE[result] ?? result.toLowerCase();

/** "a touchdown 50% of the time, a turnover on downs 38% and an interception 11%" */
function driveSentence(drive: CallOutcomes["drive"]): string {
  const parts = drive.map((x, i) => `${phrase(x.result)} ${pct(x.share)}${i === 0 ? " of the time" : ""}`);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
}

/** What happened after the drive: whether they got the ball back, with how long, and how often they scored. */
function afterSentence(o: CallOutcomes, them: string): string {
  if (o.theyGetBall < 0.03) return `${them} almost never got the ball back.`;
  const clock = o.clockWhenTheyGetBall === null ? "" : `, with about ${formatClock(o.clockWhenTheyGetBall)} left on average`;
  return `${them} got the ball back in ${pct(o.theyGetBall)} of games${clock}, and scored on that possession in ${pct(o.theyScore)} of all games.`;
}

/** Points the offense scored on the drive: a touchdown or a field goal. */
const scored = (o: CallOutcomes) => o.drive.filter((x) => x.result === "Touchdown" || x.result === "Field goal").reduce((a, x) => a + x.share, 0);

/** The differences that decide it, biggest first, in plain words. */
function differences(d: Decision, detail: { their: CallOutcomes; best: CallOutcomes }): string[] {
  const { their, best } = detail;
  const them = d.defense;
  const out: { size: number; text: string }[] = [];
  const dScore = scored(best) - scored(their);
  if (Math.abs(dScore) >= 0.03)
    out.push({ size: Math.abs(dScore), text: `The drive ends in points in ${pct(scored(best))} of games, against ${pct(scored(their))}.` });
  if (their.clockWhenTheyGetBall !== null && best.clockWhenTheyGetBall !== null) {
    const dClock = best.clockWhenTheyGetBall - their.clockWhenTheyGetBall;
    if (Math.abs(dClock) >= 3)
      out.push({ size: Math.abs(dClock) / 100, text: `${them} gets the ball back with about ${Math.round(Math.abs(dClock))} seconds ${dClock > 0 ? "more" : "less"} on the clock.` });
  }
  const dTheyScore = best.theyScore - their.theyScore;
  if (Math.abs(dTheyScore) >= 0.03)
    out.push({ size: Math.abs(dTheyScore), text: `${them} scores afterward in ${pct(best.theyScore)} of games, against ${pct(their.theyScore)}.` });
  const dBall = best.theyGetBall - their.theyGetBall;
  if (Math.abs(dBall) >= 0.05)
    out.push({ size: Math.abs(dBall), text: `${them} gets the ball back in ${pct(best.theyGetBall)} of games, against ${pct(their.theyGetBall)}.` });
  return out.sort((a, b) => b.size - a.size).map((x) => x.text);
}

/** A team as the explanations name it: "the Vikings". */
const nick = (abbr: string) => `the ${teamName(abbr).split(" ").at(-1) ?? abbr}`;
const Cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const clockWords = (seconds: number | null) => (seconds === null ? "" : formatClock(seconds));
const isKick = (c: PlayCall) => c === "punt" || c === "fg";

/** What a team needs from a score margin: "a touchdown", "a field goal to win", … */
function needFor(margin: number): string {
  const behind = -margin;
  if (behind <= 0) return "";
  if (behind <= 2) return "a field goal to win";
  if (behind === 3) return "a field goal to tie, or a touchdown to win";
  if (behind <= 6) return "a touchdown";
  if (behind === 7) return "a touchdown to tie";
  if (behind === 8) return "a touchdown and a two-point try to tie";
  return "two scores";
}

/** The first bullet: the score, the clock, and what each side needs. */
function needLine(d: Decision): string {
  const s = d.situation, us = nick(d.offense), them = nick(d.defense);
  const clock = formatClock(s.clock);
  if (s.margin < 0) return `Down ${-s.margin} with ${clock} left, ${us} need ${needFor(s.margin)}.`;
  if (s.margin > 0) return `Up ${s.margin} with ${clock} left, ${us} have to keep ${them} from getting ${needFor(-s.margin)}.`;
  return `Tied with ${clock} left: the next score probably wins it.`;
}

/** A call as a sentence names it: "a punt", "running", "a pass over the middle". */
const CALL_PHRASE: Readonly<Record<PlayCall, string>> = {
  timeout: "a timeout", run: "running", "pass-screen": "a screen", "pass-sideline": "a pass to the sideline",
  "pass-middle": "a pass over the middle", "pass-play-action": "a play-action pass", "pass-deep": "a deep pass",
  spike: "a spike", kneel: "a kneel", fg: "a field goal", punt: "a punt",
};
const share = (o: CallOutcomes, result: string) => o.drive.find((x) => x.result === result)?.share ?? 0;

/** Where they take over, in words: "their own 27", "the Vikings' 33". */
function takeoverSpot(d: Decision, o: CallOutcomes): string {
  if (o.theirStart === null) return "";
  return o.theirStart >= 50 ? `${nick(d.offense)}' ${Math.round(100 - o.theirStart)}` : `their own ${Math.round(o.theirStart)}`;
}

/** What comes after the drive: the other team's possession, and whether the offense gets another chance. */
function afterLine(d: Decision, o: CallOutcomes, withSpot: boolean, stillNeed = false): string {
  const us = nick(d.offense), them = nick(d.defense), m = d.situation.margin;
  if (o.theyGetBall < 0.05) return " There's no time for another possession.";
  const spot = withSpot && o.theirStart !== null ? ` around ${takeoverSpot(d, o)}` : "";
  const clock = o.clockWhenTheyGetBall === null ? "" : ` with about ${clockWords(o.clockWhenTheyGetBall)} left`;
  let text = ` ${Cap(them)} take over${spot}${clock} and ${o.theyScore < 0.03 ? "rarely score" : `score in ${pct(o.theyScore)} of games`}.`;
  if (m <= 0 && o.backAgain >= 0.05) {
    text += ` ${Cap(us)} get the ball back in ${pct(o.backAgain)} of games${o.clockBackAgain === null ? "" : `, with about ${clockWords(o.clockBackAgain)} left`}${m < 0 && stillNeed ? `, still needing ${needFor(m)}` : ""}.`;
  }
  return text;
}

/** "no first downs (a three-and-out)", "one first down", "two first downs" */
const FD_WORDS = ["a three-and-out", "one first down", "two first downs", "three first downs"];

/**
 * For a team that needs the ball back: how the stop has to go. Each first down they give up costs time,
 * and some number of them lets the other team run out the clock.
 */
function stopClause(d: Decision, o: CallOutcomes): string {
  const us = nick(d.offense), them = nick(d.defense);
  const buckets = o.byFirstDowns;
  const runOut = buckets.findIndex((b) => b.share >= 0.03 && b.back < 0.3);
  const parts = buckets.slice(0, runOut < 0 ? buckets.length : runOut)
    .map((b, k) => (b.share >= 0.05 && b.clock !== null ? `after ${FD_WORDS[k] ?? `${k} first downs`} (${pct(b.share)} of the time), with about ${clockWords(b.clock)} left` : ""))
    .filter((x) => x !== "");
  if (parts.length === 0) return "";
  const end = runOut > 0 ? ` With ${FD_WORDS[runOut] ?? `${runOut} first downs`}, ${them} can usually run out the clock.` : "";
  return ` ${Cap(us)} need a stop, and every first down ${them} get costs time: ${us} got the ball back ${parts.join("; ")}.${end}`;
}

/** Their scoring after they take over, and what it leaves the offense needing. */
function theirScoring(d: Decision, o: CallOutcomes): string {
  const us = nick(d.offense), them = nick(d.defense), m = d.situation.margin;
  if (o.theyFieldGoal + o.theyTouchdown < 0.03) return ` ${Cap(them)} rarely score.`;
  if (m > 0) return ` ${Cap(them)} kick a field goal in ${pct(o.theyFieldGoal)} of games and score a touchdown in ${pct(o.theyTouchdown)}.`;
  const afterFg = needFor(m - 3), afterTd = needFor(m - 7);
  const fg = o.theyFieldGoal >= 0.02 ? `kick a field goal in ${pct(o.theyFieldGoal)} of games (${us} would still need just ${afterFg})` : "";
  const td = o.theyTouchdown >= 0.02 ? `score a touchdown in ${pct(o.theyTouchdown)} (${afterTd === "two scores" ? "putting it two scores away" : `then ${us} need ${afterTd}`})` : "";
  const parts = [fg, td].filter((x) => x !== "");
  return parts.length === 0 ? ` ${Cap(them)} rarely score.` : ` ${Cap(them)} ${parts.join(" and ")}.`;
}

/** One option's path: what it does, and what has to happen next. */
function pathLine(d: Decision, call: PlayCall, o: CallOutcomes, mine: boolean): string {
  const us = nick(d.offense), them = nick(d.defense), m = d.situation.margin;
  const who = mine ? "Their call" : "The best call";
  const fourth = d.situation.down === 4;
  const spotOf = (start: number | null) => (start === null ? "" : start >= 50 ? `${us}' ${Math.round(100 - start)}` : `their own ${Math.round(start)}`);
  if (call === "punt") {
    const takeover = ` ${Cap(them)} take over around ${spotOf(o.nowStart)} with ${clockWords(o.nowClock)} left.`;
    return `${who}, a punt:${takeover}${m <= 0 ? stopClause(d, o) : ""}${theirScoring(d, o)}`;
  }
  if (call === "fg") return `${who}, a field goal: it's good about ${pct(share(o, "Field goal"))} of the time.${afterLine(d, o, false)}`;
  if (fourth) {
    const scores = scored(o) >= 0.05 ? ` and score on the drive ${pct(scored(o))}` : "";
    const fails = o.handedOverNow >= 0.05 && o.nowClock !== null
      ? ` If it fails (${pct(o.handedOverNow)}), the clock stops: ${them} take over around ${spotOf(o.nowStart)} with about ${clockWords(o.nowClock)} left${o.nowStart !== null && o.nowStart >= 60 ? ", already close to field-goal range" : ""}.${theirScoring(d, o)}`
      : "";
    return `${who}, going for it: ${us} keep the ball ${pct(o.keep)} of the time${scores}.${fails}`;
  }
  const td = share(o, "Touchdown"), fg = share(o, "Field goal");
  const points = td + fg < 0.05 ? `${us} rarely score on this drive` : fg >= 0.05 && td >= 0.05
    ? `${us} score a touchdown ${pct(td)} of the time and a field goal ${pct(fg)}`
    : td >= fg ? `${us} score a touchdown ${pct(td)} of the time` : `${us} kick a field goal ${pct(fg)} of the time`;
  return `${who}, ${CALL_PHRASE[call]}: ${points}.${afterLine(d, o, false)}`;
}

/** The bottom line: what tips it to the best call. */
function bottomLine(d: Decision, detail: { their: CallOutcomes; best: CallOutcomes }): string {
  const { their, best } = detail;
  const us = nick(d.offense), them = nick(d.defense), m = d.situation.margin;
  const result = ` ${Cap(us)} win ${pct(d.wpBest)} instead of ${pct(d.wpCall)}.`;
  // Kicking against going for it on 4th down.
  if (d.situation.down === 4 && isKick(d.call) !== isKick(d.best)) {
    const go = isKick(d.best) ? their : best;
    const kick = isKick(d.best) ? best : their;
    const kickCall = isKick(d.best) ? d.best : d.call;
    if (isKick(d.best)) return `So kicking is the better bet: what it buys is worth more than a ${pct(go.keep)} chance to keep the ball.${result}`;
    const scores = scored(go) >= 0.05 ? ` and score on this drive ${pct(scored(go))}` : "";
    if (kickCall === "fg") {
      const after = m + 3;
      const what = after > 0 ? `puts ${us} up ${after}` : after === 0 ? "ties it" : `cuts it to ${-after}`;
      const clock = kick.clockWhenTheyGetBall === null ? "" : ` with about ${clockWords(kick.clockWhenTheyGetBall)} left`;
      const goScores = scored(go) >= 0.05 ? ` and scores on the drive ${pct(scored(go))} of the time` : "";
      return `A field goal ${what} but hands ${them} the ball${clock}. Going for it keeps the ball ${pct(go.keep)} of the time${goScores}, and ${them} score afterward less often (${pct(go.theyScore)} of games against ${pct(kick.theyScore)}).${result}`;
    }
    const punt = kick;
    const runOut = punt.byFirstDowns.findIndex((b) => b.share >= 0.03 && b.back < 0.3);
    const threat = runOut > 0 ? `, and ${them} can run out the clock with ${FD_WORDS[runOut] ?? `${runOut} first downs`}` : "";
    const fgStillOk = m < 0 && needFor(m - 3) !== "two scores" && go.theyFieldGoal > go.theyTouchdown
      ? ` And if the try fails, a ${them.replace(/^the /, "")} field goal still leaves ${us} just ${needFor(m - 3)}.` : "";
    return m <= 0
      ? `Either way ${us} need a stop${threat}. So the field position a punt buys matters less than the ${pct(go.keep)} chance that going for it keeps the ball${scores ? ` and the ${pct(scored(go))} chance to score on this drive` : ""}.${fgStillOk}${result}`
      : `Keeping the ball ${pct(go.keep)} of the time keeps it away from ${them}, which is worth more than the field position a punt buys.${result}`;
  }
  // Otherwise, the factor that most favors the best call.
  const reasons: { size: number; text: string }[] = [];
  const tdBest = share(best, "Touchdown"), tdTheirs = share(their, "Touchdown");
  if (m === -3 && tdBest - tdTheirs >= 0.03)
    reasons.push({ size: 2 * (tdBest - tdTheirs), text: `Down 3, a touchdown wins it while a field goal only ties: ${CALL_PHRASE[d.best]} scores a touchdown ${pct(tdBest)} of the time against ${pct(tdTheirs)} with ${CALL_PHRASE[d.call]}.` });
  if (scored(best) - scored(their) >= 0.03)
    reasons.push({ size: scored(best) - scored(their), text: `${Cap(CALL_PHRASE[d.best])} leads to points ${pct(scored(best))} of the time against ${pct(scored(their))} with ${CALL_PHRASE[d.call]}.` });
  if (their.theyScore - best.theyScore >= 0.03)
    reasons.push({ size: their.theyScore - best.theyScore, text: `${Cap(them)} score afterward in ${pct(best.theyScore)} of games with ${CALL_PHRASE[d.best]}, against ${pct(their.theyScore)} with ${CALL_PHRASE[d.call]}.` });
  if (their.clockWhenTheyGetBall !== null && best.clockWhenTheyGetBall !== null) {
    const dc = best.clockWhenTheyGetBall - their.clockWhenTheyGetBall;
    // Less time for them is better when ahead or tied; more time for us back is better when behind.
    if ((m >= 0 && dc <= -3) || (m < 0 && (best.clockBackAgain ?? 0) - (their.clockBackAgain ?? 0) >= 3))
      reasons.push({ size: Math.abs(dc) / 100, text: m >= 0
        ? `${Cap(CALL_PHRASE[d.best])} leaves ${them} about ${Math.round(-dc)} seconds less when they get the ball.`
        : `${Cap(CALL_PHRASE[d.best])} leaves ${us} more time if they get the ball back.` });
  }
  const top = reasons.sort((a, b) => b.size - a.size)[0];
  return `${top?.text ?? `Overall, ${CALL_PHRASE[d.best]} is the better bet.`}${result}`;
}

/** The Why bullets: what they need, what their call and the best call each lead to, and what decides it. */
function whyLogic(d: Decision, detail: { their: CallOutcomes; best: CallOutcomes }): string[] {
  return [needLine(d), pathLine(d, d.call, detail.their, true), pathLine(d, d.best, detail.best, false), bottomLine(d, detail)];
}

/**
 * The longer explanation, collapsed by default: what their call and the best call each led to in the
 * model's simulated games, and the differences that decide it.
 */
function WhyMore({ d, detail }: { d: Decision; detail: { their: CallOutcomes; best: CallOutcomes } }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const them = d.defense;
  const diffs = differences(d, detail);
  return (
    <div className="why-more">
      <MoreToggle open={open} controls={id} about="why" onClick={() => setOpen(!open)} />
      {open && (
        <div id={id} className="why-more-body">
          <Text size="sm" fw={600}>The rules of thumb</Text>
          <ul className="why">
            <li><Text size="sm" span><ReasonText reason={d.reason} link="In the guide" /></Text></li>
            {d.against !== null && <li><Text size="sm" span><ReasonText reason={d.against} link="In the guide" /></Text></li>}
          </ul>
          <Text size="sm" mt="xs">
            <strong>Their call, {PLAY_CALLS[d.call].toLowerCase()}:</strong> in the model's simulated games, the drive ended in{" "}
            {driveSentence(detail.their.drive)}. {afterSentence(detail.their, them)} {d.offense} won {pct(d.wpCall)}.
          </Text>
          <Text size="sm" mt="xs">
            <strong>The model's call, {PLAY_CALLS[d.best].toLowerCase()}:</strong> the drive ended in{" "}
            {driveSentence(detail.best.drive)}. {afterSentence(detail.best, them)} {d.offense} won {pct(d.wpBest)}.
          </Text>
          {diffs.length > 0 && (
            <>
              <Text size="sm" mt="xs" fw={600}>What makes the difference</Text>
              <ul className="why">{diffs.map((t) => <li key={t}><Text size="sm" span>{t}</Text></li>)}</ul>
            </>
          )}
          <Text size="xs" c="dimmed" mt="xs">
            Both calls are played out from the same situation, with both teams following the model's rules of thumb
            afterward. Percentages are shares of those games.
          </Text>
        </div>
      )}
    </div>
  );
}

/** How much better than their call another option has to be to be worth naming. */
const ALSO_BETTER = 0.03;

/**
 * Other options clearly better than their call (by 3 points or more) that aren't the best call or already
 * "about as good": e.g. a timeout that beat a run, even if a pass was best. A pass counts once.
 */
function alsoBetter(d: Decision): { label: string; wp: number; call: PlayCall }[] {
  const near = new Set(alsoGood(d).map((o) => o.label));
  const out = new Map<string, { wp: number; call: PlayCall }>();
  for (const v of d.values) {
    if (v.call === d.best || v.call === d.call || v.wp < d.wpCall + ALSO_BETTER) continue;
    if (isPass(v.call) && (isPass(d.call) || isPass(d.best))) continue;
    const label = isPass(v.call) ? "A pass" : PLAY_CALLS[v.call];
    if (near.has(label)) continue;
    // A pass is explained as its best kind.
    if ((out.get(label)?.wp ?? -1) < v.wp) out.set(label, { wp: v.wp, call: v.call });
  }
  return [...out].map(([label, o]) => ({ label, ...o })).sort((a, b) => b.wp - a.wp);
}

/** The situation a decision was judged from, in the model's terms, for explaining other options. */
function stateOf(d: Decision): GameState {
  const s = d.situation;
  return {
    clock: s.clock, running: s.running, poss: "you", down: s.down, toGo: s.toGo, ytg: s.ytg, margin: s.margin,
    timeouts: { you: s.timeouts, opp: s.oppTimeouts }, over: false,
  };
}

/** "Read more" / "Read less", with a label that says which part of the card it opens. */
function MoreToggle({ open, controls, about, onClick }: { open: boolean; controls: string; about: string; onClick: () => void }) {
  return (
    <button
      type="button" className="why-more-toggle" aria-expanded={open} aria-controls={controls} onClick={onClick}
      aria-label={`${open ? "Read less" : "Read more"} about ${about}`}
    >
      {open ? "Read less" : "Read more"}
    </button>
  );
}

/** What actually happened after the call, in a few plain sentences: collapsed by default. */
function ResultMore({ after }: { after: Aftermath }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="why-more">
      <MoreToggle open={open} controls={id} about="what happened" onClick={() => setOpen(!open)} />
      {open && (
        <div id={id} className="why-more-body">
          <Text size="sm">{after.story.join(" ")}</Text>
        </div>
      )}
    </div>
  );
}

/** A team on the scorebug: its plate in its own color, with the score and timeouts at the decision. */
function bugTeam(abbr: string, points: number | null, timeouts: number) {
  // The daytime accent: the team's own color whenever it holds up on white, so a solid plate shows the real
  // color (the night accent swaps very dark colors, like Denver's navy, for a neutral that reads on dark cards).
  const { accent, onAccent } = teamPalette(abbr, "light");
  return { abbr, name: teamName(abbr), points, timeouts, plate: { background: accent, color: onAccent } };
}

/**
 * One decision, in reading order: the situation (a scorebug with the real score), their call, the best
 * call, why the best call was better than theirs, and what actually happened.
 */
function DecisionCard({ d, rank, kind }: { d: Decision; rank?: number; kind: "worst" | "notable" }) {
  const s = d.situation;
  const sameCall = d.call === d.best || d.cost < 0.005;
  const decidedEarlier = s.running && s.clock !== d.snapClock;
  return (
    <Card
      className={`team-card team-colors${kind === "worst" ? " costly" : ""}`} style={teamStyle(d.offense)}
      aria-label={`${teamName(d.offense)} versus ${teamName(d.defense)}, ${formatClock(d.snapClock)} left`}
    >
      <Group justify="space-between" align="center" wrap="wrap" gap="xs" mb="sm">
        <Group gap={6} align="center" wrap="nowrap">
          {rank !== undefined && <Text className="eyebrow">#{rank}</Text>}
          <TeamChip team={d.offense} />
          <Text className="eyebrow">vs</Text>
          <TeamChip team={d.defense} />
          <Text className="eyebrow">· {d.date}</Text>
        </Group>
        {d.lowConfidence && <Badge color="gray" variant="light">Models disagree: less certain</Badge>}
      </Group>

      <GameBug
        offense={bugTeam(d.offense, d.score?.offense ?? null, s.timeouts)}
        defense={bugTeam(d.defense, d.score?.defense ?? null, s.oppTimeouts)}
        margin={s.margin} clock={formatClock(s.clock)} running={s.running} down={s.down} toGo={s.toGo} ytg={s.ytg}
      />
      {d.playClockLeft !== null && (
        <Text size="sm" c="dimmed" mt={6}>
          {d.playClockLeft <= 5
            ? `They let the play clock run down to about ${d.playClockLeft} seconds before the timeout, so it cost no time: every option is judged from there.`
            : `They called it with about ${d.playClockLeft} seconds left on the play clock: every option is judged against what that play clock allowed.`}
        </Text>
      )}
      {decidedEarlier && (
        <Text size="sm" c="dimmed" mt={6}>
          The clock was running, so the call is judged from the end of the play before, at {formatClock(s.clock)}. They
          snapped at {formatClock(d.snapClock)}.
        </Text>
      )}

      <dl className="call-sheet">
        <dt>Their call</dt>
        <dd><span className="call-name">{PLAY_CALLS[d.call]}</span>: {pct(d.wpCall)} to win</dd>

        <dt>Best call</dt>
        <dd>
          {sameCall ? "Theirs, or one as good" : <><span className="call-name">{PLAY_CALLS[d.best]}</span>: {pct(d.wpBest)} to win</>}
          {kind === "worst" && !sameCall && <> · <strong>{points(d.cost)} better</strong></>}
          {!sameCall && alsoGood(d).length > 0 && (
            <Text size="sm" c="dimmed" mt={4}>
              About as good: {alsoGood(d).map((o) => `${o.label} (${pct(o.wp)})`).join(", ")}. The difference is within the model's noise.
            </Text>
          )}
          {!sameCall && alsoBetter(d).length > 0 && (
            <>
              <Text size="sm" c="dimmed" mt={4}>Also better than their call:</Text>
              <ul className="why also-better">
                {alsoBetter(d).map((o) => (
                  <li key={o.label}>
                    <Text size="sm" span>
                      <strong>{o.label}</strong> ({pct(o.wp)}, {points(o.wp - d.wpCall)} better):{" "}
                      <ReasonText reason={bestCallReason(stateOf(d), o.call)} link="In the guide" />
                    </Text>
                  </li>
                ))}
              </ul>
            </>
          )}
        </dd>

        {!sameCall && (
          <>
            <dt>Why</dt>
            <dd>
              {d.detail !== null ? (
                <ul className="why">{whyLogic(d, d.detail).map((t) => <li key={t}>{t}</li>)}</ul>
              ) : (
                <ul className="why">
                  <li><ReasonText reason={d.reason} link="In the guide" /></li>
                  {d.against !== null && <li><ReasonText reason={d.against} link="In the guide" /></li>}
                </ul>
              )}
              {d.detail !== null && <WhyMore d={d} detail={d.detail} />}
            </dd>
          </>
        )}

        <dt>Result</dt>
        <dd>
          <Text className="play-desc">“{d.description}”</Text>
          {d.aftermath !== null && <ResultMore after={d.aftermath} />}
          {(d.nflverseWp !== null || d.nflverseWpa !== null) && (
            <Text size="sm" c="dimmed" mt={4}>
              {d.nflverseWp !== null && <>nflverse's win probability before the play: {pct(d.nflverseWp)}. </>}
              {d.nflverseWpa !== null && (
                <>The play: {Math.abs(d.nflverseWpa) < 0.005 ? "about even" : `${d.nflverseWpa > 0 ? "+" : "−"}${points(Math.abs(d.nflverseWpa))}`}.</>
              )}
            </Text>
          )}
        </dd>
      </dl>

      <AnchorLink
        to="/best-call" mt="sm" size="sm"
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
