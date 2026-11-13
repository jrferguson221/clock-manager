import { describe, expect, it } from "bun:test";
import { availableCalls, evaluateCalls, scoreCallAtTempo, seededRng, step, wpOf, type GameState } from "../src/sim";

// Down 2 at the opponent's 20, 1:30 left and the clock running: a field goal wins.
const inRange: GameState = { clock: 90, running: true, poss: "you", down: 1, toGo: 10, ytg: 20, margin: -2, timeouts: { you: 2, opp: 1 }, over: false };

describe("kneel", () => {
  it("is available in field-goal range when a field goal ties or wins", () => {
    expect(availableCalls(inRange)).toContain("kneel");
    expect(availableCalls({ ...inRange, margin: -3 })).toContain("kneel");
    // Down 7, a field goal doesn't help; out of range, there's no kick to set up.
    expect(availableCalls({ ...inRange, margin: -7 })).not.toContain("kneel");
    expect(availableCalls({ ...inRange, ytg: 60 })).not.toContain("kneel");
  });
});

describe("tempo", () => {
  it("drains the play clock to 1 second, or hurries, before the snap", () => {
    // A 4-second run from 1:00: snapped at 0:21 when draining (39 seconds off), 0:47 when hurrying (13).
    const g = { ...inRange, clock: 60, margin: -7 };
    const run = { yards: 3, seconds: 4, outOfBounds: false, incomplete: false };
    expect(step(g, "run", seededRng(1), undefined, run, "drain").state.clock).toBe(17);
    expect(step(g, "run", seededRng(1), undefined, run, "hurry").state.clock).toBe(43);
  });

  it("leaves the model's own pace alone on auto", () => {
    for (const call of ["run", "pass-sideline", "spike", "kneel"] as const) {
      expect(step(inRange, call, seededRng(3), undefined, undefined, "auto")).toEqual(step(inRange, call, seededRng(3)));
    }
    expect(scoreCallAtTempo(inRange, "run", "auto", 200)).toBeCloseTo(wpOf(evaluateCalls(inRange, 200), "run"), 10);
  });

  it("calls a drained timeout with 1 second on the play clock, or at 0:03 if that comes first", () => {
    const at = (clock: number, tempo: "drain" | "hurry") => step({ ...inRange, clock }, "timeout", seededRng(1), undefined, undefined, tempo).state.clock;
    expect(at(90, "drain")).toBe(51);
    expect(at(30, "drain")).toBe(3);
    expect(at(2, "drain")).toBe(2);
    // Draining past 2:00 stops at the two-minute warning.
    expect(at(140, "drain")).toBe(120);
    // A hurried timeout stops it right now, even when the model would wait for 0:03.
    expect(at(15, "hurry")).toBe(15);
    expect(step({ ...inRange, clock: 15 }, "timeout", seededRng(1)).state.clock).toBe(3);
  });

  it("down 2 in field-goal range: draining the clock on a run beats hurrying it", () => {
    const drain = scoreCallAtTempo(inRange, "run", "drain", 400);
    const hurry = scoreCallAtTempo(inRange, "run", "hurry", 400);
    expect(drain).toBeGreaterThan(hurry);
  });
});
