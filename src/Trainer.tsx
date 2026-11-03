// Play-calling trainer shared by both modes: win probability, the call buttons, and an
// explanation after each call of what the best decision would have been.

import { useMemo, useState } from "react";
import {
  availableCalls, bestCall, biggestSwing, evaluateCalls, explain, playOut, seededRng, step, winProbability,
  DEFAULT_SIM, PLAY_CALLS, type CallValues, type Explanation, type GameState, type PlayCall, type SimConfig,
} from "./sim";
import { PlayLog } from "./fields";

interface Entry {
  before: GameState;
  after: GameState;
  call: PlayCall;
  text: string;
  values: CallValues;
  explanation: Explanation;
  driveEnded?: string;
}

const CALL_ORDER: PlayCall[] = ["timeout", "run", "pass-sideline", "pass-middle", "spike", "kneel", "fg", "punt"];

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Your win probability, assuming the best call now and the rule-of-thumb policy after. */
function useWinProbability(g: GameState, cfg: SimConfig) {
  const key = JSON.stringify(g) + cfg.hurryUp;
  return useMemo(() => {
    if (g.over || g.poss !== "you") return { wp: winProbability(g, 1500, cfg), values: null };
    const values = evaluateCalls(g, 500, cfg);
    return { wp: values[bestCall(values)]!, values };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export default function Trainer({ game, onChange, cfg = DEFAULT_SIM }: {
  /** The situation from the form. You have the ball. */
  game: GameState;
  /** Called with the new situation after a play, or the old one on undo. */
  onChange: (g: GameState) => void;
  cfg?: SimConfig;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const last = entries.at(-1);
  const ended = last && (last.driveEnded || last.after.over) ? last : null;
  const current = ended ? ended.after : game;
  const { wp, values } = useWinProbability(current, cfg);
  const prevWp = last ? last.values[bestCall(last.values)]! : null;
  const available = availableCalls(game);
  const [finish, setFinish] = useState<{ lines: string[]; result: number } | null>(null);
  const gameOver = ended != null && (ended.after.over || finish != null);
  const finalResult = finish?.result ?? wp;

  function call(c: PlayCall) {
    if (!values) return;
    const res = step(game, c, seededRng((Math.random() * 2 ** 32) >>> 0), cfg);
    const entry: Entry = {
      before: game, after: res.state, call: c, text: res.text, values,
      explanation: explain(game, c, values, cfg), driveEnded: res.driveEnded,
    };
    setEntries([...entries, entry]);
    setFinish(null);
    if (!res.driveEnded && !res.state.over) onChange(res.state);
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
    <section className="trainer" aria-label="Play caller">
      <WinMeter wp={wp} delta={prevWp == null ? null : wp - prevWp} />

      {last && <Explainer entry={last} />}

      {ended ? (
        <div className="advice">
          <p className="advice-label">Drive over</p>
          <p className="verdict">{ended.driveEnded ?? "Time expired"}</p>
          {finish ? (
            <ul className="play-out small">
              {finish.lines.map((l, i) => <li key={i} className={l.endsWith("ball:") ? "drive-head" : ""}>{l}</li>)}
            </ul>
          ) : (
            !ended.after.over && <p>The opponent has the ball. See one way the rest of the game could go.</p>
          )}
          <div className="row">
            {!ended.after.over && <button type="button" className="primary" onClick={playItOut}>{finish ? "Play it out again" : "Play it out"}</button>}
          </div>
        </div>
      ) : (
        <div className="calls">
          <p className="advice-label">Call the play</p>
          <div className="call-grid">
            {CALL_ORDER.map((c) => (
              <button key={c} type="button" disabled={!available.includes(c)} onClick={() => call(c)}>
                {PLAY_CALLS[c]}
              </button>
            ))}
          </div>
          <p className="muted small">{tempoNote(game, cfg)}</p>
        </div>
      )}

      {gameOver && <Recap entries={entries} driveEndWp={wp} result={finalResult} />}

      <PlayLog
        summaries={entries.map((e) => `${e.text} (${e.explanation.verdict === "worse" ? "better: " + PLAY_CALLS[bestCall(e.values)] : "good call"})`)}
        onUndo={undo}
        onReset={() => { setEntries([]); setFinish(null); }}
      />
    </section>
  );
}

function tempoNote(g: GameState, cfg: SimConfig): string {
  if (!g.running) return "The clock is stopped. The next snap comes right away.";
  return g.margin > 0
    ? "The clock is running. Plays drain the play clock to 1 before the snap; a timeout stops the clock right now."
    : `The clock is running. Plays use a ${cfg.hurryUp}-second hurry-up (${cfg.spikeLineup}s for a spike), except when a field goal is enough and you're in range, when they drain the clock. A timeout stops it right now.`;
}

function WinMeter({ wp, delta }: { wp: number; delta: number | null }) {
  const points = delta == null ? 0 : Math.round(delta * 100);
  return (
    <div className="wp" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(wp * 100)} aria-label="Win probability">
      <div className="wp-head">
        <span className="advice-label">Win probability</span>
        <span className="wp-num">{pct(wp)}</span>
        {delta != null && (
          <span className={`wp-delta ${points > 0 ? "win" : points < 0 ? "lose" : "muted"}`}>
            {points > 0 ? "▲" : points < 0 ? "▼" : "▬"} {points > 0 ? "+" : ""}{points} pts on the last call
          </span>
        )}
      </div>
      <div className="wp-track"><div className="wp-fill" style={{ width: pct(wp) }} /></div>
    </div>
  );
}

function Explainer({ entry }: { entry: Entry }) {
  const { explanation: x, values, call } = entry;
  const best = bestCall(values);
  const ranked = (Object.entries(values) as [PlayCall, number][]).sort((a, b) => b[1] - a[1]);
  return (
    <div className={`advice explainer ${x.verdict}`}>
      <p className="advice-label">Last play</p>
      <p>{entry.text}</p>
      <p className="verdict">{x.verdict === "worse" ? "✗ " : "✓ "}{x.headline}</p>
      <ul className="reasons">{x.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      <table className="call-values">
        <caption className="muted small">Win probability by call, before the play</caption>
        <tbody>
          {ranked.map(([c, v]) => (
            <tr key={c}>
              <th scope="row">
                {PLAY_CALLS[c]}
                {c === best && <span className="tag">best</span>}
                {c === call && <span className="tag">your call</span>}
              </th>
              <td className="bar-cell"><div className="bar" style={{ width: pct(v) }} title={`${PLAY_CALLS[c]}: ${pct(v)}`} /></td>
              <td className="num">{pct(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const resultText = (r: number) => (r === 1 ? "You win" : r === 0 ? "You lose" : "Tied: overtime, a coin flip here");

/** After the game: the call with the biggest win-probability swing, and whether the call itself was right. */
function Recap({ entries, driveEndWp, result }: { entries: Entry[]; driveEndWp: number; result: number }) {
  const before = entries.map((e) => e.values[bestCall(e.values)]!);
  const swing = biggestSwing(before, driveEndWp);
  if (!swing) return null;
  const e = entries[swing.index];
  const points = Math.round(swing.added * 100);
  const best = bestCall(e.values);
  const mine = e.values[e.call]!;
  const top = e.values[best]!;
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

  if (points === 0) {
    return (
      <div className="advice recap best">
        <p className="advice-label">Game recap</p>
        <p className="verdict">{resultText(result)}</p>
        <p>No call swung your chances by even a point: the game was never in doubt on your drive.</p>
      </div>
    );
  }

  return (
    <div className={`advice recap ${points > 0 ? "best" : "worse"}`}>
      <p className="advice-label">Game recap</p>
      <p className="verdict">{resultText(result)}</p>
      <p>
        <strong>Biggest swing: call {swing.index + 1} of {entries.length}, {PLAY_CALLS[e.call]}</strong>{" "}
        <span className={points > 0 ? "win" : "lose"}>
          ({points > 0 ? "▲ +" : "▼ "}{points} pts, {pct(swing.before)} → {pct(swing.after)})
        </span>
      </p>
      <p>{e.text}</p>
      <p>{judgment}</p>
      <p className="muted small">
        Swings count your calls only: each runs from your win probability before the call to the next one, and the last
        runs to the end of your drive. What happens after your drive isn't charged to any single call.
      </p>
    </div>
  );
}
