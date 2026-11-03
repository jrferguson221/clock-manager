import { useMemo, useState } from "react";
import { simulateRunOut, runOutThreshold, PLAY_TYPES, type Down, type PlayType, type RunOutResult } from "./engine";
import type { GameState } from "./sim";
import { parseClock, formatClock } from "./time";
import { BallOnInput, ClockInput, NumberSelect, Timeline, ToGoInput, spotFrom, yardsToGoalFrom, type Side } from "./fields";
import Trainer from "./Trainer";

const LEAD_OPTIONS = Array.from({ length: 16 }, (_, i) => i + 1);

export default function RunOutPanel() {
  const [clockText, setClockText] = useState("2:30");
  const [leadBy, setLeadBy] = useState(3);
  const [down, setDown] = useState<Down>(1);
  const [toGo, setToGo] = useState(10);
  const [side, setSide] = useState<Side>("own");
  const [yardLine, setYardLine] = useState(30);
  const [timeouts, setTimeouts] = useState(3);
  const [defTimeouts, setDefTimeouts] = useState(3);
  const [playType, setPlayType] = useState<PlayType>("kneel");
  const [clockRunning, setClockRunning] = useState(true);

  const gameClock = parseClock(clockText);
  const yardsToGoal = yardsToGoalFrom(side, yardLine);

  const analysis = useMemo(() => {
    if (gameClock == null) return null;
    const s = { down, defTimeouts, clockRunning, playDuration: PLAY_TYPES[playType].duration };
    return { result: simulateRunOut({ ...s, gameClock }), threshold: runOutThreshold(s) };
  }, [gameClock, down, defTimeouts, clockRunning, playType]);

  const game: GameState | null = gameClock == null ? null : {
    clock: gameClock, running: clockRunning, poss: "you", down, toGo: Math.min(toGo, yardsToGoal), ytg: yardsToGoal,
    margin: leadBy, timeouts: { you: timeouts, opp: defTimeouts }, over: false,
  };

  function setGame(g: GameState) {
    setClockText(formatClock(g.clock));
    setClockRunning(g.running);
    setTimeouts(g.timeouts.you);
    setDefTimeouts(g.timeouts.opp);
    setDown(g.down);
    setToGo(g.toGo);
    const spot = spotFrom(g.ytg);
    setSide(spot.side);
    setYardLine(spot.yardLine);
    setLeadBy(g.margin);
  }

  return (
    <>
      <p className="intro">You're ahead and have the ball. Call each play and see how it changes your chances.</p>
      <form onSubmit={(e) => e.preventDefault()}>
        <ClockInput value={clockText} onChange={setClockText} valid={gameClock != null} />
        <NumberSelect label="You lead by" value={leadBy} options={LEAD_OPTIONS} onChange={setLeadBy} />
        <NumberSelect label="Your timeouts" value={timeouts} options={[0, 1, 2, 3]} onChange={setTimeouts} />
        <NumberSelect label="Defense timeouts" value={defTimeouts} options={[0, 1, 2, 3]} onChange={setDefTimeouts} />
        <NumberSelect label="Down" value={down} options={[1, 2, 3, 4]} onChange={(n) => setDown(n as Down)} />
        <ToGoInput value={toGo} onChange={setToGo} />
        <BallOnInput side={side} yardLine={yardLine} onChange={(s, y) => { setSide(s); setYardLine(y); }} />
        <label>
          Run-out play type
          <select value={playType} onChange={(e) => setPlayType(e.target.value as PlayType)}>
            {(Object.keys(PLAY_TYPES) as PlayType[]).map((k) => (
              <option key={k} value={k}>{PLAY_TYPES[k].label} ({PLAY_TYPES[k].duration}s)</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={clockRunning} onChange={(e) => setClockRunning(e.target.checked)} />
          Clock is running
        </label>
      </form>

      <section className="result" aria-live="polite">
        {analysis == null || game == null ? (
          <p className="muted">Enter the clock as M:SS, for example 2:05.</p>
        ) : (
          <>
            <Trainer game={game} onChange={setGame} />
            <h2>Can you run it out?</h2>
            <Result {...analysis} />
          </>
        )}
      </section>
    </>
  );
}

function Result({ result: r, threshold }: { result: RunOutResult; threshold: number }) {
  return (
    <>
      {r.endsGame ? (
        <p className="verdict win">Run it out: the game ends after {r.snaps} snap{r.snaps === 1 ? "" : "s"}.</p>
      ) : (
        <p className="verdict lose">You can't run it out. The defense gets the ball with {formatClock(r.timeLeft)} left.</p>
      )}
      <p>
        {threshold >= 0 ? (
          <>From this down, with these timeouts, you can run out the clock from <strong>{formatClock(threshold)}</strong> or less.</>
        ) : (
          "You can't run out the clock from this down with these timeouts."
        )}
      </p>
      <Timeline events={r.timeline} />
      <p className="muted small">
        Assumes NFL rules, a 40-second play clock with the snap at 1, no first downs, no penalties, and a defense that
        calls a timeout right after every play.
      </p>
    </>
  );
}
