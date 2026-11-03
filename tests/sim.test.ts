import { describe, expect, it } from "vitest";
import {
  availableCalls, bestCall, biggestSwing, evaluateCalls, explain, fgMakeChance, seededRng, step, winProbability, type GameState,
} from "../src/sim";

const base: GameState = {
  clock: 105, running: true, poss: "you", down: 1, toGo: 10, ytg: 75, margin: -3, timeouts: { you: 2, opp: 3 }, over: false,
};
const rng = () => seededRng(42);

describe("step", () => {
  it("a leading team's kneel drains the play clock, then the trailing defense calls timeout", () => {
    const r = step({ ...base, clock: 100, margin: 3 }, "kneel", rng());
    // 100 - 39 - 2
    expect(r.state).toMatchObject({ clock: 59, down: 2, running: false, timeouts: { you: 2, opp: 2 } });
  });

  it("the two-minute warning stops the clock before the snap", () => {
    const r = step({ ...base, clock: 150, margin: 3 }, "kneel", rng());
    expect(r.text).toContain("Two-minute warning before the snap");
    expect(r.state.clock).toBe(118);
  });

  it("a timeout stops the clock right away and uses one up", () => {
    const r = step(base, "timeout", rng());
    expect(r.state).toMatchObject({ clock: 105, running: false, timeouts: { you: 1, opp: 3 } });
  });

  it("a spike costs a down and stops the clock", () => {
    const r = step(base, "spike", rng());
    expect(r.state).toMatchObject({ clock: 92, down: 2, running: false }); // 105 - 12 - 1
  });

  it("ends the game when the clock runs out before the snap", () => {
    const r = step({ ...base, clock: 30, margin: 3, timeouts: { you: 3, opp: 0 } }, "kneel", rng());
    expect(r.state.over).toBe(true);
  });
});

describe("availableCalls", () => {
  it("offers a timeout only with one left, a spike only before 4th down, and kicks only from sensible spots", () => {
    expect(availableCalls({ ...base, timeouts: { you: 0, opp: 3 }, down: 4 })).toEqual(["run", "pass-sideline", "pass-middle", "kneel", "punt"]);
    expect(availableCalls({ ...base, ytg: 20 })).toContain("fg");
    expect(availableCalls({ ...base, ytg: 20 })).not.toContain("punt");
  });
});

describe("win probability", () => {
  it("is certain when kneel-downs run out the clock, and the best call is to kneel", () => {
    const g = { ...base, clock: 110, margin: 3, timeouts: { you: 3, opp: 0 } };
    const values = evaluateCalls(g, 200);
    expect(bestCall(values)).toBe("kneel");
    expect(values.kneel).toBe(1);
  });

  it("is low for a two-score deficit with seconds left", () => {
    expect(winProbability({ ...base, clock: 20, margin: -9 }, 300)).toBeLessThan(0.02);
  });

  it("gives the same estimates for the same situation", () => {
    expect(evaluateCalls(base, 100)).toEqual(evaluateCalls(base, 100));
  });

  it("field goals get harder with distance", () => {
    expect(fgMakeChance(10)).toBeGreaterThan(0.95);
    expect(fgMakeChance(35)).toBeLessThan(fgMakeChance(25));
  });
});

describe("explain", () => {
  it("prefers stopping the clock when you need to kick with time running out", () => {
    const g: GameState = { ...base, clock: 10, ytg: 20, toGo: 10, down: 2, margin: -1, timeouts: { you: 1, opp: 3 } };
    const values = evaluateCalls(g, 300);
    expect(bestCall(values)).toBe("timeout");
    const x = explain(g, "pass-middle", values);
    expect(x.verdict).toBe("worse");
    expect(x.headline).toContain("Timeout");
  });

  it("calls out a timeout wasted with the clock already stopped", () => {
    const g = { ...base, running: false, clock: 300, margin: 7 };
    const x = explain(g, "timeout", evaluateCalls(g, 200));
    expect(x.reasons.join(" ")).toContain("already stopped");
  });
});

describe("biggestSwing", () => {
  it("finds the call with the largest gain or loss, counting the last call to the end of the drive", () => {
    // Calls: 0.30 → 0.35 (+5), 0.35 → 0.20 (-15), 0.20 → 0.30 (+10)
    expect(biggestSwing([0.3, 0.35, 0.2], 0.3)).toMatchObject({ index: 1, before: 0.35, after: 0.2 });
    expect(biggestSwing([0.3, 0.35, 0.2], 0.9)).toMatchObject({ index: 2, after: 0.9 });
    expect(biggestSwing([], 1)).toBeNull();
  });
});
