import { useMemo, useState } from "react";
import { simulateRunOut, runOutThreshold, PLAY_TYPES, type Down, type PlayType } from "./engine";
import { parseClock, formatClock } from "./time";

export default function App() {
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
      <header>
        <h1>Clock Manager</h1>
        <p>Can the leading team run out the clock? Enter the situation to see.</p>
      </header>

      <main>
        <form onSubmit={(e) => e.preventDefault()}>
          <label>
            Game clock
            <input
              value={clockText}
              onChange={(e) => setClockText(e.target.value)}
              inputMode="numeric"
              aria-invalid={gameClock == null}
            />
          </label>
          <label>
            Down
            <select value={down} onChange={(e) => setDown(Number(e.target.value) as Down)}>
              {[1, 2, 3, 4].map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label>
            Defense timeouts
            <select value={defTimeouts} onChange={(e) => setDefTimeouts(Number(e.target.value))}>
              {[0, 1, 2, 3].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
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

        <section id="result" aria-live="polite">
          {analysis == null ? (
            <p className="muted">Enter the clock as M:SS, for example 2:05.</p>
          ) : (
            <Result {...analysis} />
          )}
        </section>
      </main>
    </>
  );
}

function Result({ result: r, threshold }: { result: ReturnType<typeof simulateRunOut>; threshold: number }) {
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
      <table>
        <thead>
          <tr><th>Clock</th><th>Event</th><th>Detail</th></tr>
        </thead>
        <tbody>
          {r.timeline.map((e, i) => (
            <tr key={i}>
              <td>{formatClock(e.clock)}</td>
              <td>{e.event}</td>
              <td className="muted">{e.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Assumes NFL rules, a 40-second play clock with the snap at 1, no first downs, no penalties, and a defense that
        calls a timeout right after every play.
      </p>
    </>
  );
}
