import { useMemo, useState } from "react";
import { DOWNS, type Down } from "./engine";
import { adviseNextCall, driveBudget, fgDistance, playsNeeded, DEFAULT_ASSUMPTIONS, type DriveSituation } from "./trailing";
import { DEFAULT_SIM, type GameState } from "./sim";
import { formatClock, parseClock } from "./time";
import { BallOnInput, ClockInput, NumberInput, NumberSelect, Timeline, ToGoInput, spotFrom, yardsToGoalFrom, type Side } from "./fields";
import Trainer from "./Trainer";

const TRAIL_OPTIONS = Array.from({ length: 17 }, (_, i) => i);

export default function TrailingPanel() {
  const [clockText, setClockText] = useState("1:45");
  const [clockRunning, setClockRunning] = useState(true);
  const [timeouts, setTimeouts] = useState(2);
  const [oppTimeouts, setOppTimeouts] = useState(3);
  const [down, setDown] = useState<Down>(1);
  const [toGo, setToGo] = useState(10);
  const [side, setSide] = useState<Side>("own");
  const [yardLine, setYardLine] = useState(25);
  const [trailBy, setTrailBy] = useState(3);
  const [yardsPerPlay, setYardsPerPlay] = useState(DEFAULT_ASSUMPTIONS.yardsPerPlay);
  const [hurryUp, setHurryUp] = useState(DEFAULT_ASSUMPTIONS.hurryUp);

  const gameClock = parseClock(clockText);
  const yardsToGoal = yardsToGoalFrom(side, yardLine);
  // A field goal ties or wins when you're down 3 or less.
  const need = trailBy <= 3 ? "fg" : "td";

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

  const game: GameState | null = gameClock == null ? null : {
    clock: gameClock, running: clockRunning, poss: "you", down, toGo: Math.min(toGo, yardsToGoal), ytg: yardsToGoal,
    margin: -trailBy, timeouts: { you: timeouts, opp: oppTimeouts }, over: false,
  };

  function setGame(g: GameState) {
    setClockText(formatClock(g.clock));
    setClockRunning(g.running);
    setTimeouts(g.timeouts.you);
    setOppTimeouts(g.timeouts.opp);
    setDown(g.down);
    setToGo(g.toGo);
    const spot = spotFrom(g.ytg);
    setSide(spot.side);
    setYardLine(spot.yardLine);
    setTrailBy(-g.margin);
  }

  return (
    <>
      <p className="intro">You're behind or tied and have the ball. Call each play and see how it changes your chances.</p>
      <form onSubmit={(e) => e.preventDefault()}>
        <ClockInput value={clockText} onChange={setClockText} valid={gameClock != null} />
        <label>
          You trail by
          <select value={trailBy} onChange={(e) => setTrailBy(Number(e.target.value))}>
            {TRAIL_OPTIONS.map((n) => <option key={n} value={n}>{n === 0 ? "Tied" : n}</option>)}
          </select>
        </label>
        <NumberSelect label="Your timeouts" value={timeouts} options={[0, 1, 2, 3]} onChange={setTimeouts} />
        <NumberSelect label="Their timeouts" value={oppTimeouts} options={[0, 1, 2, 3]} onChange={setOppTimeouts} />
        <NumberSelect label="Down" value={down} options={DOWNS} onChange={setDown} />
        <ToGoInput value={toGo} onChange={setToGo} />
        <BallOnInput side={side} yardLine={yardLine} onChange={(s, y) => { setSide(s); setYardLine(y); }} />
        <label>
          Yards per play
          <NumberInput value={yardsPerPlay} min={1} max={30} onChange={setYardsPerPlay} />
        </label>
        <label>
          Hurry-up time (s)
          <NumberInput value={hurryUp} min={5} max={40} onChange={setHurryUp} />
        </label>
        <label className="check">
          <input type="checkbox" checked={clockRunning} onChange={(e) => setClockRunning(e.target.checked)} />
          Clock is running
        </label>
      </form>

      <section className="result" aria-live="polite">
        {analysis == null || game == null ? (
          <p className="muted">Enter the clock as M:SS, for example 1:45.</p>
        ) : (
          <>
            <Trainer game={game} onChange={setGame} cfg={{ ...DEFAULT_SIM, hurryUp }} />

            <h2>Rules of thumb</h2>
            <div className="advice">
              <p className="advice-label">Next call</p>
              <p className="verdict">{analysis.advice.headline}</p>
              <p>{analysis.advice.detail}</p>
            </div>

            <dl className="stats">
              <div>
                <dt>
                  {need === "fg" ? "Plays to reach field-goal range" : "Plays to reach the end zone"} at {yardsPerPlay}{" "}
                  yard{yardsPerPlay === 1 ? "" : "s"} a play
                </dt>
                <dd>{analysis.needed}</dd>
              </div>
              {([
                ["if every play ends in bounds", analysis.inbounds.plays],
                ["if about half your plays stop the clock", analysis.typical],
                ["if every play stops the clock", analysis.best],
              ] as const).map(([when, plays]) => {
                const n = Math.max(0, plays);
                const short = analysis.needed - n;
                return (
                  <div key={when}>
                    <dt>{need === "fg" ? `Plays you can run and still kick, ${when}` : `Plays you can run before 0:00, ${when}`}</dt>
                    <dd className={short > 0 ? "lose" : "win"}>
                      {n} <span className="fit">{short > 0 ? `${short} short` : "enough time"}</span>
                    </dd>
                  </div>
                );
              })}
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
              The rules of thumb use NFL rules, {DEFAULT_ASSUMPTIONS.playDuration}-second plays, a spike about{" "}
              {DEFAULT_ASSUMPTIONS.spikeLineup} seconds after an in-bounds play, first downs as you go, and no penalties or
              10-second runoffs.
            </p>
          </>
        )}
      </section>
    </>
  );
}
