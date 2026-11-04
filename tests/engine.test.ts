import { describe, expect, it } from "bun:test";
import { simulateRunOut, runOutThreshold, PLAY_TYPES } from "../src/engine";
import { parseClock, formatClock, formatClockDigits } from "../src/time";

describe("clock strings", () => {
  it("formats typed digits as M:SS, filling from the right", () => {
    expect(["", "5", "13", "130", "1500", "0:05", "2:05", "1:3", "12345"].map(formatClockDigits))
      .toEqual(["", "0:05", "0:13", "1:30", "15:00", "0:05", "2:05", "0:13", "12:34"]);
  });

  it("parses and formats", () => {
    expect(parseClock("2:05")).toBe(125);
    expect(parseClock("45")).toBe(45);
    expect(parseClock("2:5")).toBeNull();
    expect(formatClock(125)).toBe("2:05");
    expect(formatClock(0)).toBe("0:00");
  });
});

describe("simulateRunOut", () => {
  it("0 defensive timeouts, 1st down at 2:00 after the warning: three kneels end it", () => {
    const r = simulateRunOut({ gameClock: 120, down: 1, defTimeouts: 0, clockRunning: false });
    expect(r.endsGame).toBe(true);
    expect(r.snaps).toBe(3);
  });

  it("defense with 3 timeouts at 2:00 forces a turnover with time left", () => {
    const r = simulateRunOut({ gameClock: 120, down: 1, defTimeouts: 3, clockRunning: false });
    expect(r.endsGame).toBe(false);
    expect(r.timeoutsUsed).toBe(3);
    // Timeouts after downs 1-3 mean the clock never runs between snaps: only 4 x 2s burn
    expect(r.timeLeft).toBe(120 - 8);
  });

  it("stops a running clock at the two-minute warning", () => {
    const r = simulateRunOut({ gameClock: 140, down: 1, defTimeouts: 0, clockRunning: true });
    expect(r.timeline[0]).toMatchObject({ event: "Two-minute warning", clock: 120 });
  });

  it("triggers the warning after a play that crosses 2:00", () => {
    const r = simulateRunOut({
      gameClock: 124, down: 1, defTimeouts: 1, clockRunning: false,
      playDuration: PLAY_TYPES.run.duration,
    });
    expect(r.timeline[1]?.event).toBe("Two-minute warning");
    expect(r.timeoutsUsed).toBe(1); // the timeout is saved for the next play, not wasted
  });
});

describe("runOutThreshold", () => {
  it.each([
    [0, "2:39"],
    [1, "2:00"],
    [2, "1:26"],
    [3, "0:47"],
  ])("1st down, clock running, %i defensive timeouts → %s", (defTimeouts, expected) => {
    expect(formatClock(runOutThreshold({ down: 1, defTimeouts, clockRunning: true }))).toBe(expected);
  });
});
