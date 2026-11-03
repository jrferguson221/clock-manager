import { useMemo, useState } from "react";
import { simulateRunOut, runOutThreshold, PLAY_TYPES, type Down, type PlayType, type RunOutResult } from "./engine";
import { parseClock, formatClock } from "./time";
import { ClockInput, NumberSelect, Timeline } from "./fields";

export default function RunOutPanel() {
  const [clockText, setClockText] = useState("2:30");
  const [down, setDown] = useState<Down>(1);
  const [defTimeouts, setDefTimeouts] = useState(3);
  const [playType, setPlayType] = useState<PlayType>("kneel");
  const [clockRunning, setClockRunning] = useState(true);

  const gameClock = parseClock(clockText);

  const analysis = useMemo(() => {
    if (gameClock == null) return null;
    const s = { down, defTimeouts, clockRunning, playDuration: PLAY_TYPES[playType].duration };
    return { result: simulateRunOut({ ...s, gameClock }), threshold: runOutThreshold(s) };
  }, [gameClock, down, defTimeouts, clockRunning, playType]);

  return (
    <>
      <p className="intro">Can the leading team run out the clock? Enter the situation to see.</p>
      <form onSubmit={(e) => e.preventDefault()}>
        <ClockInput value={clockText} onChange={setClockText} valid={gameClock != null} />
        <NumberSelect label="Down" value={down} options={[1, 2, 3, 4]} onChange={(n) => setDown(n as Down)} />
        <NumberSelect label="Defense timeouts" value={defTimeouts} options={[0, 1, 2, 3]} onChange={setDefTimeouts} />
        <label>
          Play type
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
        {analysis == null ? (
          <p className="muted">Enter the clock as M:SS, for example 2:05.</p>
        ) : (
          <Result {...analysis} />
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
