import { describe, expect, it } from "bun:test";
import {
  availableCalls, bestCall, bestScored, biggestSwing, compression, coverageFor, goalLineRunChance, passOdds, recommend, wpOf, evaluateCalls, explain, fgMakeChance, seededRng, step, winProbability, type GameState,
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
    expect(availableCalls({ ...base, timeouts: { you: 0, opp: 3 }, down: 4 })).toEqual(["run", "pass-sideline", "pass-middle", "pass-deep", "kneel", "punt"]);
    expect(availableCalls({ ...base, ytg: 20 })).toContain("fg");
    expect(availableCalls({ ...base, ytg: 20 })).not.toContain("punt");
  });
});

describe("win probability", () => {
  it("is certain when kneel-downs run out the clock, and the best call is to kneel", () => {
    const g = { ...base, clock: 110, margin: 3, timeouts: { you: 3, opp: 0 } };
    const values = evaluateCalls(g, 200);
    expect(bestCall(values)).toBe("kneel");
    expect(wpOf(values, "kneel")).toBe(1);
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
    expect(x.reasons.map((r) => r.text).join(" ")).toContain("already stopped");
  });
});

describe("biggestSwing", () => {
  it("finds the call with the largest gain or loss, counting the last call to the end of the drive", () => {
    // Calls: a 0.30 → 0.35 (+5), b 0.35 → 0.20 (-15), c 0.20 → 0.30 (+10)
    const steps = [{ item: "a", before: 0.3 }, { item: "b", before: 0.35 }, { item: "c", before: 0.2 }];
    expect(biggestSwing(steps, 0.3)).toMatchObject({ item: "b", index: 1, before: 0.35, after: 0.2 });
    expect(biggestSwing(steps, 0.9)).toMatchObject({ item: "c", index: 2, after: 0.9 });
    expect(biggestSwing([], 1)).toBeNull();
  });
});

describe("recommend", () => {
  it("recommends kneeling when kneel-downs end the game, and flags a pass to avoid", () => {
    const g: GameState = { ...base, clock: 110, margin: 3, timeouts: { you: 3, opp: 0 } };
    const r = recommend(g, evaluateCalls(g, 300));
    expect(r.best).toBe("kneel");
    expect(r.wp).toBe(1);
    expect(r.reason.text).toContain("run out the clock");
    expect(r.reason.section).toBe("running-out-the-clock");
  });

  it("lists clearly worse calls to avoid, with reasons", () => {
    const g: GameState = { ...base, clock: 10, ytg: 20, toGo: 10, down: 2, margin: -1, timeouts: { you: 1, opp: 3 } };
    const r = recommend(g, evaluateCalls(g, 300));
    expect(r.best).toBe("timeout");
    expect(r.avoid.map((a) => a.call)).toContain("kneel");
  });
});

describe("deep pass", () => {
  it("is the best call on the last play when you need a touchdown from far out", () => {
    // With 3 seconds there's no time for a sideline throw to set up another play.
    const g: GameState = { ...base, clock: 3, running: false, ytg: 45, toGo: 10, margin: -5, timeouts: { you: 0, opp: 3 } };
    const values = evaluateCalls(g, 1000);
    expect(bestCall(values)).toBe("pass-deep");
    expect(explain(g, "pass-deep", values).reasons[0]?.text).toContain("one shot");
    expect(explain(g, "pass-deep", values).reasons[0]?.section).toBe("hail-mary");
    expect(["timeout", "spike"]).not.toContain(recommend(g, values).runnerUp?.call);
  });

  const completionRate = (g: GameState) => {
    let completions = 0;
    for (let i = 0; i < 4000; i++) {
      const r = step({ ...g, running: false, ytg: 99, toGo: 10 }, "pass-deep", seededRng(i));
      if (r.state.poss === "you" && 99 - r.state.ytg >= 20) completions++;
    }
    return completions / 4000;
  };

  it("completes about a third of the time against a normal defense", () => {
    const rate = completionRate({ ...base, clock: 600 });
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.4);
  });

  it("completes far less against a prevent defense: the defense leads in the last 4 minutes", () => {
    const rate = completionRate({ ...base, clock: 200, margin: -3 });
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.25);
    // When you're the one ahead, the defense is chasing the game and doesn't play prevent.
    expect(completionRate({ ...base, clock: 200, margin: 3 })).toBeGreaterThan(0.3);
  });
});

describe("call values", () => {
  it("are never empty while the game is on, and evaluating a finished game is an error", () => {
    expect(evaluateCalls(base, 10).length).toBeGreaterThan(0);
    expect(() => evaluateCalls({ ...base, over: true }, 10)).toThrow(RangeError);
  });

  it("can't look up a call that wasn't available", () => {
    const values = evaluateCalls({ ...base, timeouts: { you: 0, opp: 3 } }, 10);
    expect(() => wpOf(values, "timeout")).toThrow(RangeError);
  });
});

describe("tie-breaking", () => {
  it("prefers a punt to going for it when they're tied", () => {
    expect(bestCall([{ call: "pass-middle", wp: 0.766 }, { call: "punt", wp: 0.7663 }, { call: "run", wp: 0.7 }])).toBe("punt");
  });

  it("still picks a clearly better call over a preferred one", () => {
    expect(bestCall([{ call: "kneel", wp: 0.5 }, { call: "pass-deep", wp: 0.6 }])).toBe("pass-deep");
  });
});

describe("timeouts", () => {
  const trailing: GameState = { ...base, running: false, clock: 105, ytg: 75, margin: -3, timeouts: { you: 2, opp: 3 } };

  it("are worth something when trailing: more timeouts never means a lower win probability", () => {
    const wp = (you: number) => bestScored(evaluateCalls({ ...trailing, timeouts: { you, opp: 3 } }, 500)).wp;
    const [three, two, one, zero] = [wp(3), wp(2), wp(1), wp(0)];
    expect(three).toBeGreaterThanOrEqual(two);
    expect(two).toBeGreaterThanOrEqual(one);
    expect(one).toBeGreaterThan(zero);
  });

  it("taking one with the clock stopped costs exactly a timeout: it scores what the situation with one fewer is worth", () => {
    const values = evaluateCalls(trailing, 500);
    const oneFewer = bestScored(evaluateCalls({ ...trailing, timeouts: { you: 1, opp: 3 } }, 500)).wp;
    expect(wpOf(values, "timeout")).toBeCloseTo(oneFewer, 10);
    expect(wpOf(values, "timeout")).toBeLessThan(bestScored(values).wp);
  });

  it("a wasted timeout is called out as a mistake, even when it only costs a point or two", () => {
    const values = evaluateCalls(trailing, 500);
    const x = explain(trailing, "timeout", values);
    expect(x.verdict).toBe("worse");
    expect(x.reasons.map((r) => r.text).join(" ")).toContain("already stopped");
    expect(recommend(trailing, values).avoid.map((a) => a.call)).toContain("timeout");
  });
});

describe("Hail Mary", () => {
  it("a last-play heave scores about 1 in 10 from 45 yards and about 1 in 5 from 25", () => {
    const rate = (ytg: number) => {
      let tds = 0;
      for (let i = 0; i < 4000; i++) {
        const r = step({ ...base, clock: 3, running: false, ytg, toGo: 10, margin: -5 }, "pass-deep", seededRng(i));
        if (r.driveEnded === "Touchdown") tds++;
      }
      return tds / 4000;
    };
    expect(rate(45)).toBeGreaterThan(0.07);
    expect(rate(45)).toBeLessThan(0.13);
    expect(rate(25)).toBeGreaterThan(0.16);
    expect(rate(25)).toBeLessThan(0.24);
  });
});

describe("field position", () => {
  const goalToGo = (ytg: number): GameState => ({ ...base, clock: 600, running: false, down: 1, toGo: Math.min(10, ytg), ytg, margin: 0 });
  const tdRate = (ytg: number, call: "run" | "pass-middle" | "pass-deep") => {
    let tds = 0;
    for (let i = 0; i < 6000; i++) if (step(goalToGo(ytg), call, seededRng(i)).driveEnded === "Touchdown") tds++;
    return tds / 6000;
  };

  it("runs near the goal line score about as often as in the NFL: ~60% from the 1, ~35% from the 3", () => {
    expect(tdRate(1, "run")).toBeGreaterThan(0.5);
    expect(tdRate(1, "run")).toBeLessThan(0.66);
    expect(tdRate(3, "run")).toBeGreaterThan(0.28);
    expect(tdRate(3, "run")).toBeLessThan(0.4);
  });

  it("the explainer's goal-line run chance matches the simulation", () => {
    for (const ytg of [1, 3, 5]) expect(Math.abs(goalLineRunChance(ytg) - tdRate(ytg, "run"))).toBeLessThan(0.03);
  });

  it("pass completions get harder the closer you get, and deep passes become end-zone throws", () => {
    expect(compression(45)).toBe(1);
    expect(compression(10)).toBeLessThan(compression(15));
    expect(compression(1)).toBeCloseTo(0.6, 10);
    expect(passOdds("normal", "pass-middle", 3).complete).toBeLessThan(passOdds("normal", "pass-middle", 45).complete);
    expect(passOdds("normal", "pass-deep", 20).complete).toBeCloseTo(0.25, 10);
    expect(tdRate(3, "pass-deep")).toBeLessThan(tdRate(3, "pass-middle"));
  });

  it("a defense doesn't play prevent in the red zone: there's no deep field to protect", () => {
    const late: GameState = { ...base, clock: 100, margin: -3 };
    expect(coverageFor({ ...late, ytg: 40 }, 100)).toBe("prevent");
    expect(coverageFor({ ...late, ytg: 15 }, 100)).toBe("normal");
  });
});
