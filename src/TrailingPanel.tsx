import { useMemo, useState } from "react";
import type { Down } from "./engine";
import {
  adviseNextCall, driveBudget, fgDistance, playsNeeded, DEFAULT_ASSUMPTIONS,
  type DriveSituation, type ScoreNeeded,
} from "./trailing";
import { parseClock } from "./time";
import { ClockInput, NumberSelect, Timeline } from "./fields";

type Side = "own" | "opp";

export default function TrailingPanel() {
  const [clockText, setClockText] = useState("1:45");
  const [clockRunning, setClockRunning] = useState(true);
  const [timeouts, setTimeouts] = useState(2);
  const [down, setDown] = useState<Down>(1);
  const [side, setSide] = useState<Side>("own");
  const [yardLine, setYardLine] = useState(25);
  const [need, setNeed] = useState<ScoreNeeded>("fg");
  const [yardsPerPlay, setYardsPerPlay] = useState(DEFAULT_ASSUMPTIONS.yardsPerPlay);
  const [hurryUp, setHurryUp] = useState(DEFAULT_ASSUMPTIONS.hurryUp);

  const gameClock = parseClock(clockText);
  const yardsToGoal = side === "own" ? 100 - yardLine : yardLine;

  const analysis = useMemo(() => {
    if (gameClock == null) return null;
    const s: DriveSituation = { gameClock, clockRunning, timeouts, down, yardsToGoal, need };
    const a = { ...DEFAULT_ASSUMPTIONS, yardsPerPlay, hurryUp };
    return {
      advice: adviseNextCall(s, a),
      needed: playsNeeded(s, a),
      inbounds: driveBudget(s, "inbounds", a),
      typical: driveBudget(s, "typical", a).plays,
      best: driveBudget(s, "stops-clock", a).plays,
    };
  }, [gameClock, clockRunning, timeouts, down, yardsToGoal, need, yardsPerPlay, hurryUp]);

  return (
    <>
      <p className="intro">You're behind and have the ball. See how many plays you have time for, and what to call next.</p>
      <form onSubmit={(e) => e.preventDefault()}>
        <ClockInput value={clockText} onChange={setClockText} valid={gameClock != null} />
        <NumberSelect label="Your timeouts" value={timeouts} options={[0, 1, 2, 3]} onChange={setTimeouts} />
        <NumberSelect label="Down" value={down} options={[1, 2, 3, 4]} onChange={(n) => setDown(n as Down)} />
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
            <div className="advice">
              <p className="advice-label">Next call</p>
              <p className="verdict">{analysis.advice.headline}</p>
              <p>{analysis.advice.detail}</p>
            </div>

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
