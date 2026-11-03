import { useState } from "react";
import RunOutPanel from "./RunOutPanel";
import TrailingPanel from "./TrailingPanel";

const MODES = [
  { id: "leading", label: "Leading: run out the clock", Panel: RunOutPanel },
  { id: "trailing", label: "Trailing: drive to score", Panel: TrailingPanel },
] as const;

type ModeId = (typeof MODES)[number]["id"];

export default function App({ initialMode = "leading" }: { initialMode?: ModeId }) {
  const [mode, setMode] = useState<ModeId>(initialMode);
  const { Panel } = MODES.find((m) => m.id === mode)!;

  return (
    <>
      <header>
        <h1>Clock Manager</h1>
        <div className="tabs" role="tablist">
          {MODES.map((m) => (
            <button
              key={m.id} role="tab" type="button"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>
      <main role="tabpanel">
        <Panel />
      </main>
    </>
  );
}
