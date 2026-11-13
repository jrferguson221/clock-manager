import { expect, it } from "bun:test";
import { RANDOM_BOUNDS, randomSituation } from "../src/trainerScore";
import { seededRng } from "../src/sim";

it("deals late, one-score situations that are always legal", () => {
  const r = seededRng(7);
  const seen = { margins: new Set<number>(), downs: new Set<number>(), running: new Set<boolean>(), sides: new Set<string>() };
  for (let i = 0; i < 5000; i++) {
    const { situation: s, margin } = randomSituation(r);
    const [m = "0", sec = "0"] = s.clock.split(":");
    const clock = Number(m) * 60 + Number(sec);
    expect(clock).toBeGreaterThanOrEqual(RANDOM_BOUNDS.minClock);
    expect(clock).toBeLessThanOrEqual(RANDOM_BOUNDS.maxClock);
    expect(Math.abs(margin)).toBeLessThanOrEqual(RANDOM_BOUNDS.maxMargin);
    expect(s.timeouts).toBeGreaterThanOrEqual(0);
    expect(s.timeouts).toBeLessThanOrEqual(3);
    expect(s.oppTimeouts).toBeLessThanOrEqual(3);
    expect(s.yardLine).toBeGreaterThanOrEqual(1);
    expect(s.yardLine).toBeLessThanOrEqual(50);
    const ytg = s.side === "own" ? 100 - s.yardLine : s.yardLine;
    expect(s.toGo).toBeGreaterThanOrEqual(1);
    expect(s.toGo).toBeLessThanOrEqual(ytg);
    seen.margins.add(margin); seen.downs.add(s.down); seen.running.add(s.running); seen.sides.add(s.side);
  }
  // Every score from down 8 to up 8 comes up, and every down, both clock states and both halves of the field.
  expect(seen.margins.size).toBe(2 * RANDOM_BOUNDS.maxMargin + 1);
  expect(seen.downs.size).toBe(4);
  expect(seen.running.size).toBe(2);
  expect(seen.sides.size).toBe(2);
});
