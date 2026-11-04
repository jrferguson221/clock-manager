import { useState, type JSX } from "react";
import RunOutPanel from "./RunOutPanel";
import TrailingPanel from "./TrailingPanel";
import AdvisorPanel from "./AdvisorPanel";

const MODE_IDS = ["leading", "trailing", "advisor"] as const;
type ModeId = (typeof MODE_IDS)[number];

const MODES = {
  leading: { label: "Leading: run out the clock", Panel: RunOutPanel },
  trailing: { label: "Trailing: drive to score", Panel: TrailingPanel },
  advisor: { label: "Best call", Panel: AdvisorPanel },
} as const satisfies Record<ModeId, { label: string; Panel: () => JSX.Element }>;

export default function App({ initialMode = "leading" }: { initialMode?: ModeId }) {
  const [mode, setMode] = useState<ModeId>(initialMode);
  const { Panel } = MODES[mode];

  return (
    <>
      <header>
        <h1>Clock Manager</h1>
        <div className="tabs" role="tablist">
          {MODE_IDS.map((id) => (
            <button
              key={id} role="tab" type="button"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
            >
              {MODES[id].label}
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
