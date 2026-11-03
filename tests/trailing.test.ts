import { describe, expect, it } from "vitest";
import {
  adviseNextCall, applyPlay, checkPlay, describeSpot, driveBudget, fgDistance, playsNeeded,
  type DriveSituation, type DriveState,
} from "../src/trailing";

const base: DriveSituation = {
  gameClock: 60, clockRunning: false, timeouts: 0, down: 1, yardsToGoal: 75, need: "td",
};

describe("playsNeeded", () => {
  it("counts plays to the end zone at 7 yards a play", () => {
    expect(playsNeeded(base)).toBe(11); // 75 / 7 = 10.7
  });
  it("counts plays to field-goal range, 0 once inside it", () => {
    expect(playsNeeded({ ...base, need: "fg" })).toBe(6); // 40 yards to the 35
    expect(playsNeeded({ ...base, need: "fg", yardsToGoal: 30 })).toBe(0);
  });
  it("converts a spot to a field-goal distance", () => {
    expect(fgDistance(35)).toBe(52);
  });
});

describe("driveBudget", () => {
  it("fits a play every 6 seconds when every play stops the clock", () => {
    expect(driveBudget(base, "stops-clock").plays).toBe(10); // snaps at 60, 54, ... 6
  });

  it("fits a play every 24 seconds in bounds with no timeouts", () => {
    // snaps at 0:60, 0:36, 0:12
    expect(driveBudget(base, "inbounds").plays).toBe(3);
  });

  it("typical mode alternates in-bounds plays and clock stops", () => {
    // snaps at 60 (in bounds), 36 (stops), 30 (in bounds), 6 → 4
    expect(driveBudget(base, "typical").plays).toBe(4);
  });

  it("each timeout buys back one hurry-up", () => {
    // snaps at 60, 54, 48, 42, then hurry-up: 18, 0 is out → 5
    expect(driveBudget({ ...base, timeouts: 3 }, "inbounds").plays).toBe(5);
  });

  it("takes the free two-minute warning instead of a timeout", () => {
    const r = driveBudget({ ...base, gameClock: 130, clockRunning: true, timeouts: 1 }, "inbounds");
    expect(r.timeline[0]).toMatchObject({ event: "Two-minute warning", clock: 120 });
  });

  it("holds a timeout back for a field goal", () => {
    const r = driveBudget({ ...base, need: "fg", timeouts: 1 }, "inbounds");
    expect(r.timeline.some((e) => e.event === "Timeout")).toBe(false);
    // snaps at 0:60, 0:36, 0:12; the saved timeout stops the clock at 0:06 for the kick
    expect(r.plays).toBe(3);
  });

  it("reports -1 when there isn't time left to kick", () => {
    expect(driveBudget({ ...base, need: "fg", gameClock: 5, clockRunning: true, yardsToGoal: 20 }, "inbounds").plays).toBe(-1);
  });
});

describe("adviseNextCall", () => {
  it("lets the two-minute warning stop the clock", () => {
    expect(adviseNextCall({ ...base, gameClock: 130, clockRunning: true, timeouts: 3 }).call).toBe("let-warning-hit");
  });

  it("hurries up when there's plenty of time", () => {
    expect(adviseNextCall({ ...base, gameClock: 110, clockRunning: true, timeouts: 3, yardsToGoal: 30 }).call).toBe("hurry");
  });

  it("calls timeout when time is tight and timeouts are plentiful", () => {
    expect(adviseNextCall({ ...base, gameClock: 50, clockRunning: true, timeouts: 3, yardsToGoal: 50 }).call).toBe("timeout");
  });

  it("spikes on early downs to save the last timeout", () => {
    expect(adviseNextCall({ ...base, gameClock: 50, clockRunning: true, timeouts: 1, yardsToGoal: 50 }).call).toBe("spike");
  });

  it("doesn't spike early in a long two-minute drive", () => {
    expect(adviseNextCall({ ...base, gameClock: 105, clockRunning: true, timeouts: 2, yardsToGoal: 75, need: "fg" }).call)
      .toBe("hurry");
  });

  it("with seconds left and no stops, says to snap immediately", () => {
    const r = adviseNextCall({ ...base, gameClock: 8, clockRunning: true, down: 2, yardsToGoal: 10 });
    expect(r.headline).toBe("Snap it as fast as you can");
  });

  it("never spikes on 4th down", () => {
    const r = adviseNextCall({ ...base, gameClock: 50, clockRunning: true, timeouts: 0, down: 4, yardsToGoal: 50 });
    expect(r.call).toBe("hurry");
  });

  it("in field-goal range, drains the clock before the kick", () => {
    expect(adviseNextCall({ ...base, need: "fg", gameClock: 40, clockRunning: true, timeouts: 1, yardsToGoal: 25 }).call)
      .toBe("burn-then-kick");
  });
});

describe("applyPlay", () => {
  const start: DriveState = { ...base, gameClock: 100, clockRunning: true, timeouts: 2, toGo: 10, yardsToGoal: 75 };

  it("moves the chains on a first down and keeps the clock running in bounds", () => {
    const r = applyPlay(start, { outcome: "inbounds", yards: 12, clockAfter: 76 });
    expect(r.state).toMatchObject({ gameClock: 76, down: 1, toGo: 10, yardsToGoal: 63, clockRunning: true });
    expect(r.summary).toContain("First down");
  });

  it("advances the down and stops the clock out of bounds", () => {
    const r = applyPlay(start, { outcome: "out-of-bounds", yards: 4, clockAfter: 80 });
    expect(r.state).toMatchObject({ down: 2, toGo: 6, yardsToGoal: 71, clockRunning: false });
  });

  it("an incomplete pass gains nothing and stops the clock", () => {
    const r = applyPlay(start, { outcome: "incomplete", yards: 30, clockAfter: 90 });
    expect(r.state).toMatchObject({ down: 2, toGo: 10, yardsToGoal: 75, clockRunning: false });
  });

  it("a timeout uses one up and keeps the down", () => {
    const r = applyPlay(start, { outcome: "timeout", yards: 0, clockAfter: 95 });
    expect(r.state).toMatchObject({ gameClock: 95, timeouts: 1, down: 1, clockRunning: false });
  });

  it("a play through the two-minute warning stops the clock", () => {
    const r = applyPlay({ ...start, gameClock: 125 }, { outcome: "inbounds", yards: 3, clockAfter: 118 });
    expect(r.state.clockRunning).toBe(false);
    expect(r.summary).toContain("Two-minute warning");
  });

  it("goal to go after a first down inside the 10", () => {
    const r = applyPlay({ ...start, yardsToGoal: 15 }, { outcome: "out-of-bounds", yards: 10, clockAfter: 90 });
    expect(r.state).toMatchObject({ down: 1, toGo: 5, yardsToGoal: 5 });
    expect(r.summary).toContain("1st & goal at opp 5");
  });

  it("ends the drive on a touchdown, a 4th-down stop, or time running out", () => {
    expect(applyPlay({ ...start, yardsToGoal: 8 }, { outcome: "inbounds", yards: 8, clockAfter: 90 }).ended).toBe("touchdown");
    expect(applyPlay({ ...start, down: 4, toGo: 5 }, { outcome: "inbounds", yards: 3, clockAfter: 90 }).ended)
      .toBe("turnover-on-downs");
    expect(applyPlay(start, { outcome: "inbounds", yards: 3, clockAfter: 0 }).ended).toBe("time-expired");
  });

  it("rejects impossible entries", () => {
    expect(checkPlay(start, { outcome: "inbounds", yards: 5, clockAfter: 110 })).toMatch(/can't be later/);
    expect(checkPlay({ ...start, timeouts: 0 }, { outcome: "timeout", yards: 0, clockAfter: 90 })).toMatch(/no timeouts/);
    expect(checkPlay({ ...start, down: 4 }, { outcome: "spike", yards: 0, clockAfter: 90 })).toMatch(/4th down/);
  });

  it("names spots on the field", () => {
    expect([describeSpot(75), describeSpot(50), describeSpot(30)]).toEqual(["own 25", "midfield", "opp 30"]);
  });
});
