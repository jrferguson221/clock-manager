import { describe, expect, it } from "bun:test";
import { SCENARIO_IDS, SCENARIO_PRESETS, type ScenarioId } from "@clock-manager/schemas";
import { analyzeScenario, SCENARIOS, type ScenarioInput } from "../src/scenarios";
import { policy, seededRng, step, type GameState } from "../src/sim";

const seconds = (clock: string) => {
  const [m = "0", s = "0"] = clock.split(":");
  return Number(m) * 60 + Number(s);
};

/** A preset's situation as the analysis takes it, with optional changes. */
function presetInput(id: ScenarioId, patch: Partial<GameState> = {}): ScenarioInput {
  const p = SCENARIO_PRESETS[id];
  const ytg = p.side === "own" ? 100 - p.yardLine : p.yardLine;
  return {
    game: {
      clock: seconds(p.clock), running: false, poss: "you", down: p.down, toGo: Math.min(p.toGo, ytg), ytg, margin: p.margin,
      timeouts: { you: p.timeouts, opp: p.oppTimeouts }, over: false, ...patch,
    },
    sackYards: p.sackYards, gain: p.gain, extra: p.extra, seconds: p.seconds,
  };
}

describe("scenarios", () => {
  it("QB: with no timeouts and 0:50 left, throw it away rather than take the sack", () => {
    const a = analyzeScenario("qb-throwaway", presetInput("qb-throwaway"), 1000, 200);
    expect(a.options[a.better ?? 1].id).toBe("throw-away");
    expect(a.options[1].after).toContain("clock running");
    expect(a.reason.section).toBe("clock-rules");
  });

  it("WR: at 0:18 with no timeouts get out of bounds; at 0:24 the extra yards reach field-goal range", () => {
    const late = analyzeScenario("wr-sideline", presetInput("wr-sideline"), 1000, 200);
    expect(late.better).toBe(0);
    expect(late.options[0].id).toBe("out-of-bounds");
    const earlier = analyzeScenario("wr-sideline", presetInput("wr-sideline", { clock: 24 }), 1000, 200);
    expect(earlier.better).toBe(1);
    expect(earlier.flipNote).toMatch(/or less left, get out of bounds instead/);
  });

  it("RB: tied late, go down at the 1 instead of scoring; down 4, take the touchdown", () => {
    const tied = analyzeScenario("rb-score", presetInput("rb-score"), 1000, 200);
    expect(tied.options[tied.better ?? 0].id).toBe("go-down");
    const behind = analyzeScenario("rb-score", presetInput("rb-score", { margin: -4 }), 1000, 200);
    expect(behind.options[behind.better ?? 1].id).toBe("score");
  });

  it("every scenario has two options, a caveat linked to the guide, and a flip table that includes the current clock", () => {
    for (const id of SCENARIO_IDS) {
      const input = presetInput(id);
      const a = analyzeScenario(id, input, 200, 50);
      expect(a.options.length).toBe(2);
      expect(a.flips.some((f) => f.clock === input.game.clock)).toBe(true);
      expect(SCENARIOS[id].caveat.text.length).toBeGreaterThan(0);
    }
  });
});

describe("forced outcomes", () => {
  it("step uses a forced result instead of rolling one", () => {
    const g: GameState = { clock: 50, running: false, poss: "you", down: 2, toGo: 10, ytg: 30, margin: -4, timeouts: { you: 0, opp: 3 }, over: false };
    const sacked = step(g, "pass-middle", seededRng(1), undefined, { yards: -8, seconds: 5, outOfBounds: false, incomplete: false, sack: true });
    expect(sacked.state).toMatchObject({ ytg: 38, down: 3, toGo: 18, clock: 45, running: true });
    const out = step(g, "pass-sideline", seededRng(1), undefined, { yards: 12, seconds: 5, outOfBounds: true, incomplete: false });
    expect(out.state).toMatchObject({ ytg: 18, down: 1, running: false });
  });
});

describe("last-play field goal", () => {
  it("a team that needs a field goal kicks from the 37 with seconds left, stopping the clock first", () => {
    const g: GameState = { clock: 8, running: false, poss: "you", down: 2, toGo: 10, ytg: 37, margin: -3, timeouts: { you: 0, opp: 3 }, over: false };
    expect(policy(g)).toBe("fg");
    expect(policy({ ...g, running: true, timeouts: { you: 1, opp: 3 } })).toBe("timeout");
    // Two scores behind, a field goal doesn't help: throw it to the end zone.
    expect(policy({ ...g, margin: -7 })).toBe("pass-deep");
  });
});
