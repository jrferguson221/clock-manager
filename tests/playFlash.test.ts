import { describe, expect, it } from "bun:test";
import { playFlash } from "../src/Trainer";
import type { GameState } from "../src/sim";

const g: GameState = { clock: 95, running: true, poss: "you", down: 2, toGo: 7, ytg: 40, margin: -3, timeouts: { you: 1, opp: 2 }, over: false };

describe("the flashed play result", () => {
  it("headlines the play and puts the new situation under it", () => {
    const f = playFlash(g, { ...g, down: 3, toGo: 2, ytg: 35 }, "Pass to the sideline: +5, in bounds at 1:12. 3rd & 2 at opp 35.", null);
    expect(f).toEqual({ headline: "Pass to the sideline: +5, in bounds", detail: "3rd & 2 at opp 35.", tone: "neutral" });
  });

  it("is green for a first down or a score, red for an incompletion, a sack or a turnover", () => {
    expect(playFlash(g, { ...g, down: 1, toGo: 10, ytg: 28 }, "Run: +12, in bounds at 1:10. First down. 1st & 10 at opp 28.", null))
      .toEqual({ headline: "Run: +12, in bounds. First down!", detail: "1st & 10 at opp 28.", tone: "good" });
    expect(playFlash(g, { ...g, down: 3 }, "Deep pass: incomplete at 1:11. 3rd & 7 at opp 40.", null).tone).toBe("bad");
    expect(playFlash(g, g, "Pass over the middle: sacked for 7 at 1:05. 3rd & 14 at opp 47.", null).tone).toBe("bad");
    expect(playFlash(g, g, "Deep pass: +40 at 1:05. Touchdown.", "Touchdown")).toMatchObject({ headline: "Touchdown", tone: "good" });
    expect(playFlash(g, g, "Pass over the middle: intercepted at 1:05.", "Interception")).toMatchObject({ headline: "Interception", tone: "bad" });
  });

  it("doesn't call a timeout or a spike a first down", () => {
    expect(playFlash(g, g, "You call timeout at 1:35, 0 left.", null)).toEqual({ headline: "You call timeout at 1:35, 0 left", detail: "", tone: "neutral" });
    expect(playFlash(g, { ...g, down: 3 }, "Spike at 1:24. 3rd & 7 at opp 40.", null).tone).toBe("neutral");
  });
});
