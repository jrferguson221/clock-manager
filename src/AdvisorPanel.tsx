// Informational mode: enter any situation and get the best call, with no play simulated.

import { useMemo, useState } from "react";
import type { Down } from "./engine";
import { evaluateCalls, recommend, DEFAULT_SIM, PLAY_CALLS, type GameState } from "./sim";
import { parseClock } from "./time";
import { BallOnInput, ClockInput, NumberSelect, ToGoInput, yardsToGoalFrom, type Side } from "./fields";
import { CallTable, tempoNote } from "./Trainer";

/** Score options from down 16 to up 16. Positive means you lead. */
const MARGINS = Array.from({ length: 33 }, (_, i) => 16 - i);
const marginLabel = (m: number) => (m > 0 ? `Up ${m}` : m < 0 ? `Down ${-m}` : "Tied");
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function AdvisorPanel() {
  const [clockText, setClockText] = useState("1:45");
  const [clockRunning, setClockRunning] = useState(true);
  const [margin, setMargin] = useState(-3);
  const [timeouts, setTimeouts] = useState(2);
  const [oppTimeouts, setOppTimeouts] = useState(3);
  const [down, setDown] = useState<Down>(1);
  const [toGo, setToGo] = useState(10);
  const [side, setSide] = useState<Side>("own");
  const [yardLine, setYardLine] = useState(25);
  const [hurryUp, setHurryUp] = useState(DEFAULT_SIM.hurryUp);

  const gameClock = parseClock(clockText);
  const ytg = yardsToGoalFrom(side, yardLine);
  const cfg = useMemo(() => ({ ...DEFAULT_SIM, hurryUp }), [hurryUp]);

  const game: GameState | null = gameClock == null ? null : {
    clock: gameClock, running: clockRunning, poss: "you", down, toGo: Math.min(toGo, ytg), ytg,
    margin, timeouts: { you: timeouts, opp: oppTimeouts }, over: false,
  };
  const key = JSON.stringify(game) + hurryUp;

  const analysis = useMemo(() => {
    if (game == null) return null;
    if (game.clock === 0) return { ended: true as const };
    const values = evaluateCalls(game, 1500, cfg);
    return { ended: false as const, values, rec: recommend(game, values, cfg) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <>
      <p className="intro">Enter any situation where you have the ball and see the best call, and why.</p>
      <form onSubmit={(e) => e.preventDefault()}>
        <ClockInput value={clockText} onChange={setClockText} valid={gameClock != null} />
        <label>
          Score
          <select value={margin} onChange={(e) => setMargin(Number(e.target.value))}>
            {MARGINS.map((m) => <option key={m} value={m}>{marginLabel(m)}</option>)}
          </select>
        </label>
        <NumberSelect label="Your timeouts" value={timeouts} options={[0, 1, 2, 3]} onChange={setTimeouts} />
        <NumberSelect label="Their timeouts" value={oppTimeouts} options={[0, 1, 2, 3]} onChange={setOppTimeouts} />
        <NumberSelect label="Down" value={down} options={[1, 2, 3, 4]} onChange={(n) => setDown(n as Down)} />
        <ToGoInput value={toGo} onChange={setToGo} />
        <BallOnInput side={side} yardLine={yardLine} onChange={(s, y) => { setSide(s); setYardLine(y); }} />
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
        {analysis == null || game == null ? (
          <p className="muted">Enter the clock as M:SS, for example 1:45.</p>
        ) : analysis.ended ? (
          <p className="muted">The clock is at 0:00: the game is over.</p>
        ) : (
          <div className="trainer">
            <div className="advice best-call">
              <p className="advice-label">Best call</p>
              <p className="verdict big">{PLAY_CALLS[analysis.rec.best]}</p>
              <p>{analysis.rec.reason}</p>
              {analysis.rec.runnerUp?.close && (
                <p className="muted">
                  {PLAY_CALLS[analysis.rec.runnerUp.call]} is about as good ({pct(analysis.rec.runnerUp.wp)}). The
                  difference is within the model's noise.
                </p>
              )}
            </div>

            <div className="wp">
              <div className="wp-head">
                <span className="advice-label">Win probability with the best call</span>
                <span className="wp-num">{pct(analysis.rec.wp)}</span>
              </div>
              <div className="wp-track"><div className="wp-fill" style={{ width: pct(analysis.rec.wp) }} /></div>
            </div>

            <div className="advice">
              <p className="advice-label">Every option</p>
              <CallTable values={analysis.values} caption="Your win probability with each call" />
              {analysis.rec.avoid.length > 0 && (
                <>
                  <p className="advice-label avoid-label">Avoid</p>
                  <ul className="reasons">
                    {analysis.rec.avoid.map((a) => (
                      <li key={a.call}><strong>{PLAY_CALLS[a.call]}</strong> ({pct(a.wp)}): {a.reason}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <p className="muted small">
              {tempoNote(game, cfg)} Each option is scored over 1,500 simulated games in which both teams then follow
              rule-of-thumb play-calling, using the same model as the trainer. See the README for its assumptions.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
