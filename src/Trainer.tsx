// Play-calling trainer shared by both modes: win probability, the call buttons, and an
// explanation after each call of what the best decision would have been.

import { useEffect, useId, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Group, List, Progress, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import { noGainCalls,
  availableCalls, bestScored, biggestSwing, evaluateCalls, explain, playOut, ranked, seededRng, step, winProbability, wpOf,
  DEFAULT_SIM, PLAY_CALLS, type CallValues, type Explanation, type GameState, type PlayCall, type SimConfig,
} from "./sim";
import { PLAY_CALL_IDS } from "@situational-football/schemas";
import { ReasonText } from "./ReadMore";
import { PlayLog } from "./fields";

interface Entry {
  before: GameState;
  after: GameState;
  call: PlayCall;
  text: string;
  values: CallValues;
  explanation: Explanation;
  /** Set when this call ended the drive, e.g. "Touchdown". */
  driveEnded: string | null;
}

/** How long a play's result stays on screen, in milliseconds. */
export const FLASH_MS = 2600;

type FlashTone = "good" | "bad" | "neutral";

/**
 * A play's result for the flash: the play in a headline ("Pass to the sideline: +5, in bounds") with the
 * rest of the text under it, colored by how it went for you.
 */
export function playFlash(before: GameState, after: GameState, text: string, driveEnded: string | null): { headline: string; detail: string; tone: FlashTone } {
  const cut = text.indexOf(". ");
  const first = (cut < 0 ? text : text.slice(0, cut)).replace(/ at \d+:\d\d$/, "").replace(/\.$/, "");
  const detail = cut < 0 ? "" : text.slice(cut + 2);
  if (driveEnded !== null) {
    const good = driveEnded === "Touchdown" || driveEnded === "Field goal";
    return { headline: driveEnded, detail: text, tone: good ? "good" : "bad" };
  }
  const firstDown = after.down === 1 && (before.down !== 1 || after.ytg < before.ytg - before.toGo + 1) && after.ytg < before.ytg;
  const lost = /incomplete|sacked|intercepted|fumble|: -\d/.test(first);
  return {
    headline: firstDown ? `${first}. First down!` : first,
    detail: firstDown ? detail.replace(/^First down\. /, "") : detail,
    tone: firstDown ? "good" : lost ? "bad" : "neutral",
  };
}

/**
 * Each call's color family on its button: every pass shares one, and each other kind of call has its own.
 * Timeout is yellow and spike is red.
 */
export const CALL_KIND: Readonly<Record<PlayCall, "pass" | "run" | "timeout" | "spike" | "kneel" | "fg" | "punt">> = {
  "pass-screen": "pass", "pass-sideline": "pass", "pass-middle": "pass", "pass-play-action": "pass", "pass-deep": "pass",
  run: "run", timeout: "timeout", spike: "spike", kneel: "kneel", fg: "fg", punt: "punt",
};

/** Call buttons in the order the schema lists the calls. */
const CALL_ORDER: readonly PlayCall[] = PLAY_CALL_IDS;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Your win probability, assuming the best call now and the rule-of-thumb policy after. */
function useWinProbability(g: GameState, cfg: SimConfig) {
  const key = JSON.stringify(g) + cfg.hurryUp;
  return useMemo(() => {
    if (g.over || g.poss !== "you") return { wp: winProbability(g, 1500, cfg), values: null };
    const values = evaluateCalls(g, 500, cfg);
    return { wp: bestScored(values).wp, values };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export default function Trainer({ game, pending = false, onChange, cfg = DEFAULT_SIM }: {
  /** The situation from the form. You have the ball. */
  game: GameState;
  /** True while the form has changed and `game` hasn't caught up yet: calls wait until it has. */
  pending?: boolean;
  /** Called with the new situation after a play, or the old one on undo. */
  onChange: (g: GameState) => void;
  cfg?: SimConfig;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const last = entries.at(-1);
  const ended = last !== undefined && (last.driveEnded !== null || last.after.over) ? last : null;
  const current = ended ? ended.after : game;
  const { wp, values } = useWinProbability(current, cfg);
  const prevWp = last ? bestScored(last.values).wp : null;
  const available = availableCalls(game);
  const [finish, setFinish] = useState<{ lines: string[]; result: number } | null>(null);
  // The last play's result, flashed on screen for a moment.
  const [flash, setFlash] = useState<(ReturnType<typeof playFlash> & { id: number }) | null>(null);
  useEffect(() => {
    if (flash === null) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);
  const gameOver = ended != null && (ended.after.over || finish != null);
  const finalResult = finish?.result ?? wp;

  function call(c: PlayCall) {
    if (!values || pending) return;
    const res = step(game, c, seededRng((Math.random() * 2 ** 32) >>> 0), cfg);
    const entry: Entry = {
      before: game, after: res.state, call: c, text: res.text, values,
      explanation: explain(game, c, values, cfg), driveEnded: res.driveEnded ?? null,
    };
    setEntries([...entries, entry]);
    setFinish(null);
    if (!res.driveEnded && !res.state.over) onChange(res.state);
    setFlash({ id: entries.length + 1, ...playFlash(game, res.state, res.text, res.driveEnded ?? null) });
    // Back up to the scorebug, to see the new situation.
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.querySelector("section.scorebug")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function undo() {
    if (!last) return;
    onChange(last.before);
    setEntries(entries.slice(0, -1));
    setFinish(null);
  }

  function playItOut() {
    if (!ended) return;
    const lines: string[] = [];
    let offense: string | null = null;
    const result = playOut(ended.after, seededRng((Math.random() * 2 ** 32) >>> 0), cfg, (s, team) => {
      if (team !== offense) lines.push(team === "you" ? "Your ball:" : "Their ball:");
      offense = team;
      lines.push(s.text);
    });
    setFinish({ lines, result });
  }

  return (
    <Stack component="section" gap="md" aria-label="Play caller" className="trainer">
      {/* Over the top of the trainer, just under the scorebug the page scrolls back to. */}
      {flash && (
        <div
          key={`flash-${flash.id}`} className={`play-flash ${flash.tone}`} role="status" aria-live="polite"
          onClick={() => setFlash(null)}
        >
          <div className="play-flash-head">{flash.headline}</div>
          {flash.detail && <div className="play-flash-detail">{flash.detail}</div>}
        </div>
      )}
      <WinMeter wp={wp} prev={prevWp} />

      {last && <Explainer key={entries.length} entry={last} />}

      {ended ? (
        <Card className="accent-card">
          <Text className="eyebrow">Drive over</Text>
          <Text className="verdict">{ended.driveEnded ?? "Time expired"}</Text>
          {finish ? (
            <List size="sm" spacing={2} listStyleType="none" className="play-out">
              {finish.lines.map((l, i) => (
                <List.Item key={i} className={l.endsWith("ball:") ? "drive-head" : undefined}>{l}</List.Item>
              ))}
            </List>
          ) : (
            !ended.after.over && <Text>The opponent has the ball. See one way the rest of the game could go.</Text>
          )}
          {!ended.after.over && (
            <Group mt="md"><Button onClick={playItOut}>{finish ? "Play it out again" : "Play it out"}</Button></Group>
          )}
        </Card>
      ) : (
        <Card>
          <Text className="eyebrow" mb="xs">Call the play</Text>
          <SimpleGrid cols={{ base: 2, xs: 3 }} spacing="xs" aria-busy={pending}>
            {CALL_ORDER.map((c) => (
              <Button
                key={c} variant="default" size="md" className="call-button" data-kind={CALL_KIND[c]}
                disabled={pending || !available.includes(c)} onClick={() => call(c)}
              >
                {PLAY_CALLS[c]}
              </Button>
            ))}
          </SimpleGrid>
          <Text size="xs" c="dimmed" mt="sm">{tempoNote(game, cfg)}</Text>
        </Card>
      )}

      {gameOver && <Recap entries={entries} driveEndWp={wp} result={finalResult} />}

      <PlayLog
        summaries={entries.map((e) => `${e.text} (${e.explanation.verdict === "worse" ? "better: " + PLAY_CALLS[bestScored(e.values).call] : "good call"})`)}
        onUndo={undo}
        onReset={() => { setEntries([]); setFinish(null); }}
      />
    </Stack>
  );
}

export function tempoNote(g: GameState, cfg: SimConfig): string {
  if (!g.running) return "The clock is stopped. The next snap comes right away.";
  return g.margin > 0
    ? "The clock is running. Plays drain the play clock to 1 before the snap; a timeout stops the clock right now."
    : `The clock is running. Plays use a hurry-up of ${cfg.hurryUp} seconds (${cfg.spikeLineup} for a spike), except when a field goal is enough and you're in range, when they drain the clock. A timeout stops it right now.`;
}

/** Red when the game's slipping away, blue while it's in the balance, green when it's in hand. */
const meterColor = (wp: number) => (wp < 0.25 ? "red" : wp < 0.6 ? "blue" : "green");

/** The win-probability meter, with the change on the last call when there was one. */
export function WinMeter({ wp, prev, label = "Win probability" }: { wp: number; prev: number | null; label?: string }) {
  // The change between the two percentages as shown, so "26% → 24%" always reads as -2.
  const delta = prev === null ? null : Math.round(wp * 100) - Math.round(prev * 100);
  const points = delta ?? 0;
  const value = Math.round(wp * 100);
  return (
    <Card className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
      <Text className="eyebrow">{label}</Text>
      <Group gap="sm" align="baseline" wrap="wrap">
        <span className="meter-num">{pct(wp)}</span>
        {delta != null && (
          <Text size="sm" fw={600} c={points > 0 ? "green" : points < 0 ? "red" : "dimmed"} className="tabular">
            {points > 0 ? "▲" : points < 0 ? "▼" : "▬"} {points > 0 ? "+" : ""}{points} pts on the last call
          </Text>
        )}
      </Group>
      <Progress value={value} size="xl" mt="sm" color={meterColor(wp)} aria-hidden className="meter-track" />
    </Card>
  );
}

const VERDICT_COLOR = { best: "green", close: "gray", worse: "red" } as const;

/**
 * What happened on the last call and how it rated. On a phone, the table of every call's win probability
 * starts collapsed behind a toggle, so the call buttons stay close; on wider screens it's always shown
 * (CSS decides, so there's no flash while the page works out the screen size).
 */
function Explainer({ entry }: { entry: Entry }) {
  const { explanation: x, values, call } = entry;
  const [open, setOpen] = useState(false);
  const tableId = useId();
  return (
    <Alert color={VERDICT_COLOR[x.verdict]} variant="outline" className="explainer" title={<span className="eyebrow">Last play</span>}>
      <Text>{entry.text}</Text>
      <Text className="verdict" mt="xs">{x.verdict === "worse" ? "✗ " : "✓ "}{x.headline}</Text>
      <List size="sm" spacing={2} mb="sm">{x.reasons.map((r, i) => <List.Item key={i}><ReasonText reason={r} /></List.Item>)}</List>
      <button type="button" className="calls-toggle" aria-expanded={open} aria-controls={tableId} onClick={() => setOpen(!open)}>
        <span className="calls-toggle-chevron" aria-hidden>{open ? "▾" : "▸"}</span>
        {open ? "Hide" : "Show"} win probability for every call
      </button>
      <div id={tableId} className={open ? "calls-detail open" : "calls-detail"}>
        <CallTable values={values} chosen={call} caption="Win probability by call, before the play" noGain={noGainCalls(entry.before)} />
      </div>
    </Alert>
  );
}

/** Every call's win probability as a ranked bar list, tagging the best call and (optionally) yours. */
export function CallTable({ values, chosen, caption, noGain = [] }: {
  values: CallValues; chosen?: PlayCall; caption: string;
  /** Calls that can't gain anything here (a timeout or spike with the clock stopped), tagged as such. */
  noGain?: readonly PlayCall[];
}) {
  const best = bestScored(values).call;
  return (
    <Table className="call-values" withRowBorders={false} verticalSpacing={4} horizontalSpacing={0} captionSide="top">
      <Table.Caption>{caption}</Table.Caption>
      <Table.Tbody>
        {ranked(values).map(({ call: c, wp: v }) => (
          <Table.Tr key={c}>
            <Table.Th scope="row" className="call-name">
              {PLAY_CALLS[c]}
              {c === best && <Badge color="green" ml={6} size="sm">best</Badge>}
              {c === chosen && <Badge color="blue" ml={6} size="sm">your call</Badge>}
              {noGain.includes(c) && <Badge color="gray" variant="light" ml={6} size="sm">no gain</Badge>}
            </Table.Th>
            <Table.Td className="bar-cell">
              <Progress
                value={Math.round(v * 100)} size="md" color={c === best ? "green" : "blue"}
                aria-hidden title={`${PLAY_CALLS[c]}: ${pct(v)}`}
              />
            </Table.Td>
            <Table.Td className="num">{pct(v)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

const resultText = (r: number) => (r === 1 ? "You win" : r === 0 ? "You lose" : "Tied: overtime, a coin flip here");

/** After the game: the call with the biggest win-probability swing, and whether the call itself was right. */
function Recap({ entries, driveEndWp, result }: { entries: Entry[]; driveEndWp: number; result: number }) {
  const swing = biggestSwing(entries.map((e) => ({ item: e, before: bestScored(e.values).wp })), driveEndWp);
  if (swing === null) return null;
  const e = swing.item;
  const points = Math.round(swing.added * 100);
  const { call: best, wp: top } = bestScored(e.values);
  const mine = wpOf(e.values, e.call);
  const cost = Math.round((top - mine) * 100);

  let judgment: string;
  if (e.explanation.verdict === "worse") {
    judgment = `The call itself cost about ${cost} point${cost === 1 ? "" : "s"}: ${PLAY_CALLS[best]} was better (${pct(top)} vs ${pct(mine)}).`;
  } else if (e.explanation.verdict === "close") {
    judgment = `The call was about as good as the best one (${PLAY_CALLS[best]}), so the swing came from how the play turned out.`;
  } else {
    judgment = points < 0
      ? "It was the right call. The result was bad luck."
      : "It was the right call, and it paid off.";
  }

  const title = <span className="eyebrow">Game recap</span>;
  if (points === 0) {
    return (
      <Alert color="green" variant="outline" title={title} className="recap">
        <Text className="verdict">{resultText(result)}</Text>
        <Text>No call swung your chances by even a point: the game was never in doubt on your drive.</Text>
      </Alert>
    );
  }

  return (
    <Alert color={points > 0 ? "green" : "red"} variant="outline" title={title} className="recap">
      <Stack gap={6}>
        <Text className="verdict">{resultText(result)}</Text>
        <Text>
          <strong>Biggest swing: call {swing.index + 1} of {entries.length}, {PLAY_CALLS[e.call]}</strong>{" "}
          <Text span fw={600} c={points > 0 ? "green" : "red"}>
            ({points > 0 ? "▲ +" : "▼ "}{points} pts, {pct(swing.before)} → {pct(swing.after)})
          </Text>
        </Text>
        <Text>{e.text}</Text>
        <Text>{judgment}</Text>
        <Text size="xs" c="dimmed">
          Swings count your calls only: each runs from your win probability before the call to the next one, and the last
          runs to the end of your drive. What happens after your drive isn't charged to any single call.
        </Text>
      </Stack>
    </Alert>
  );
}
