import { useMemo, useState } from "react";
import type { Down } from "./engine";
import {
  adviseNextCall, applyPlay, checkPlay, driveBudget, fgDistance, playsNeeded, DEFAULT_ASSUMPTIONS, PLAY_OUTCOMES,
  type DriveEnd, type DriveState, type PlayOutcome, type ScoreNeeded,
} from "./trailing";
import { formatClock, parseClock } from "./time";
import { ClockInput, NumberSelect, Timeline } from "./fields";

type Side = "own" | "opp";

interface LogEntry {
  /** The situation before this play, so it can be undone. */
  before: { clockText: string; clockRunning: boolean; timeouts: number; down: Down; toGo: number; side: Side; yardLine: number };
  summary: string;
}

const spotFromYardsToGoal = (ytg: number): { side: Side; yardLine: number } =>
  ytg >= 50 ? { side: "own", yardLine: 100 - ytg } : { side: "opp", yardLine: ytg };

export default function TrailingPanel() {
  const [clockText, setClockText] = useState("1:45");
  const [clockRunning, setClockRunning] = useState(true);
  const [timeouts, setTimeouts] = useState(2);
  const [down, setDown] = useState<Down>(1);
  const [toGo, setToGo] = useState(10);
  const [side, setSide] = useState<Side>("own");
  const [yardLine, setYardLine] = useState(25);
  const [need, setNeed] = useState<ScoreNeeded>("fg");
  const [yardsPerPlay, setYardsPerPlay] = useState(DEFAULT_ASSUMPTIONS.yardsPerPlay);
  const [hurryUp, setHurryUp] = useState(DEFAULT_ASSUMPTIONS.hurryUp);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [ended, setEnded] = useState<DriveEnd | null>(null);

  const gameClock = parseClock(clockText);
  const yardsToGoal = side === "own" ? 100 - yardLine : yardLine;

  const analysis = useMemo(() => {
    if (gameClock == null) return null;
    const s: DriveState = { gameClock, clockRunning, timeouts, down, toGo, yardsToGoal, need };
    const a = { ...DEFAULT_ASSUMPTIONS, yardsPerPlay, hurryUp };
    return {
      advice: adviseNextCall(s, a),
      needed: playsNeeded(s, a),
      inbounds: driveBudget(s, "inbounds", a),
      typical: driveBudget(s, "typical", a).plays,
      best: driveBudget(s, "stops-clock", a).plays,
    };
  }, [gameClock, clockRunning, timeouts, down, toGo, yardsToGoal, need, yardsPerPlay, hurryUp]);

  const state: DriveState | null =
    gameClock == null ? null : { gameClock, clockRunning, timeouts, down, toGo, yardsToGoal, need };

  function recordPlay(summary: string, next: DriveState, end?: DriveEnd) {
    setLog([...log, { before: { clockText, clockRunning, timeouts, down, toGo, side, yardLine }, summary }]);
    setClockText(formatClock(next.gameClock));
    setClockRunning(next.clockRunning);
    setTimeouts(next.timeouts);
    setDown(next.down);
    setToGo(next.toGo);
    const spot = spotFromYardsToGoal(next.yardsToGoal);
    setSide(spot.side);
    setYardLine(spot.yardLine);
    setEnded(end ?? null);
  }

  function undo() {
    const last = log.at(-1);
    if (!last) return;
    const b = last.before;
    setClockText(b.clockText);
    setClockRunning(b.clockRunning);
    setTimeouts(b.timeouts);
    setDown(b.down);
    setToGo(b.toGo);
    setSide(b.side);
    setYardLine(b.yardLine);
    setLog(log.slice(0, -1));
    setEnded(null);
  }

  function newDrive() {
    setLog([]);
    setEnded(null);
  }

  return (
    <>
      <p className="intro">You're behind and have the ball. See how many plays you have time for, and what to call next.</p>
      <form onSubmit={(e) => e.preventDefault()}>
        <ClockInput value={clockText} onChange={setClockText} valid={gameClock != null} />
        <NumberSelect label="Your timeouts" value={timeouts} options={[0, 1, 2, 3]} onChange={setTimeouts} />
        <NumberSelect label="Down" value={down} options={[1, 2, 3, 4]} onChange={(n) => setDown(n as Down)} />
        <label>
          To go
          <input type="number" min={1} max={99} value={toGo}
            onChange={(e) => setToGo(Math.min(99, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
        <label>
          Ball on
          <span className="pair">
            <select value={side} onChange={(e) => setSide(e.target.value as Side)} aria-label="Side of the field">
              <option value="own">Own</option>
              <option value="opp">Opponent</option>
            </select>
            <input
              type="number" min={1} max={50} value={yardLine} aria-label="Yard line"
              onChange={(e) => setYardLine(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
            />
          </span>
        </label>
        <label>
          You need
          <select value={need} onChange={(e) => setNeed(e.target.value as ScoreNeeded)}>
            <option value="fg">Field goal</option>
            <option value="td">Touchdown</option>
          </select>
        </label>
        <label>
          Yards per play
          <input type="number" min={1} max={30} value={yardsPerPlay}
            onChange={(e) => setYardsPerPlay(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
        <label>
          Hurry-up time (s)
          <input type="number" min={5} max={40} value={hurryUp}
            onChange={(e) => setHurryUp(Math.min(40, Math.max(5, Number(e.target.value) || 5)))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={clockRunning} onChange={(e) => setClockRunning(e.target.checked)} />
          Clock is running
        </label>
      </form>

      <section className="result" aria-live="polite">
        {analysis == null ? (
          <p className="muted">Enter the clock as M:SS, for example 1:45.</p>
        ) : (
          <>
            {ended ? (
              <div className="advice">
                <p className="advice-label">Drive over</p>
                <p className={`verdict ${ended === "touchdown" ? "win" : "lose"}`}>{DRIVE_END_TEXT[ended]}</p>
                <p>Undo the last play, or start a new drive.</p>
              </div>
            ) : (
              <div className="advice">
                <p className="advice-label">Next call</p>
                <p className="verdict">{analysis.advice.headline}</p>
                <p>{analysis.advice.detail}</p>
              </div>
            )}

            {state && !ended && <PlayForm key={log.length} state={state} hurryUp={hurryUp} onApply={recordPlay} />}
            {log.length > 0 && (
              <div className="drive-log">
                <ol>
                  {log.map((e, i) => <li key={i}>{e.summary}</li>)}
                </ol>
                <div className="row">
                  <button type="button" onClick={undo}>Undo last play</button>
                  <button type="button" onClick={newDrive}>New drive</button>
                </div>
              </div>
            )}

            <dl className="stats">
              <div>
                <dt>{need === "fg" ? "Plays to field-goal range" : "Plays to the end zone"}</dt>
                <dd>{analysis.needed}</dd>
              </div>
              {([
                ["Time for: all in bounds", analysis.inbounds.plays],
                ["Time for: typical (half stop the clock)", analysis.typical],
                ["Time for: every play stops the clock", analysis.best],
              ] as const).map(([label, plays]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={plays < analysis.needed ? "lose" : "win"}>{Math.max(0, plays)}</dd>
                </div>
              ))}
            </dl>
            {need === "fg" && (
              <p className="muted small">
                Field-goal range is the opponent's {DEFAULT_ASSUMPTIONS.fgRange}, a {fgDistance(DEFAULT_ASSUMPTIONS.fgRange)}-yard try.
                One timeout is held back for the kick.
              </p>
            )}

            <details>
              <summary>Worst-case timeline: every play in bounds</summary>
              <Timeline events={analysis.inbounds.timeline} />
            </details>

            <p className="muted small">
              Rules of thumb under NFL rules. Assumes {DEFAULT_ASSUMPTIONS.playDuration}-second plays, a spike about{" "}
              {DEFAULT_ASSUMPTIONS.spikeLineup} seconds after an in-bounds play, first downs as you go, and no penalties or
              10-second runoffs.
            </p>
          </>
        )}
      </section>
    </>
  );
}

const DRIVE_END_TEXT: Record<DriveEnd, string> = {
  touchdown: "Touchdown!",
  "turnover-on-downs": "Turnover on downs",
  "time-expired": "Time expired",
};

/** A starting guess for the clock after a play, from the usual timings. */
function suggestedClock(s: DriveState, outcome: PlayOutcome, hurryUp: number): number {
  if (outcome === "timeout") return s.gameClock;
  const { spikeLineup, playDuration } = DEFAULT_ASSUMPTIONS;
  const elapsed = outcome === "spike"
    ? (s.clockRunning ? spikeLineup : 1)
    : (s.clockRunning ? hurryUp : 0) + playDuration;
  return Math.max(0, s.gameClock - elapsed);
}

/** Enter what happened on the last play; the situation above updates to match. */
function PlayForm({ state, hurryUp, onApply }: {
  state: DriveState; hurryUp: number; onApply: (summary: string, next: DriveState, end?: DriveEnd) => void;
}) {
  const [outcome, setOutcome] = useState<PlayOutcome>("inbounds");
  const [yardsText, setYardsText] = useState("");
  // null means "use the suggested clock", which follows the outcome until the user edits it.
  const [clockText, setClockText] = useState<string | null>(null);

  const { hasYards } = PLAY_OUTCOMES[outcome];
  const shownClock = clockText ?? formatClock(suggestedClock(state, outcome, hurryUp));
  const clockAfter = parseClock(shownClock);
  const yards = hasYards ? Number(yardsText) : 0;

  const entry = clockAfter == null ? null : { outcome, yards: hasYards && yardsText.trim() === "" ? NaN : yards, clockAfter };
  const problem = entry == null ? "Enter the clock as M:SS." : checkPlay(state, entry);

  return (
    <form
      className="play-form"
      aria-label="Log the last play"
      onSubmit={(e) => {
        e.preventDefault();
        if (entry == null || problem) return;
        const r = applyPlay(state, entry);
        onApply(r.summary, r.state, r.ended);
      }}
    >
      <p className="advice-label span-all">Log the play</p>
      <label>
        What happened
        <select value={outcome} onChange={(e) => { setOutcome(e.target.value as PlayOutcome); setClockText(null); }}>
          {(Object.keys(PLAY_OUTCOMES) as PlayOutcome[]).map((k) => (
            <option key={k} value={k} disabled={(k === "timeout" && state.timeouts === 0) || (k === "spike" && state.down === 4)}>
              {PLAY_OUTCOMES[k].label}
            </option>
          ))}
        </select>
      </label>
      {hasYards && (
        <label>
          Yards gained
          <input type="number" inputMode="numeric" value={yardsText} placeholder="e.g. 8 or -3"
            onChange={(e) => setYardsText(e.target.value)} />
        </label>
      )}
      <label>
        {outcome === "timeout" ? "Clock at the timeout" : "Clock after the play"}
        <input value={shownClock} onChange={(e) => setClockText(e.target.value)} inputMode="numeric"
          aria-invalid={clockAfter == null} />
      </label>
      <div className="span-all row">
        <button type="submit" className="primary" disabled={problem != null}>Update situation</button>
        {problem && <span className="muted small">{problem}</span>}
      </div>
    </form>
  );
}
