import { expect, it } from "bun:test";
import { fieldMarks, stripPercent } from "../../src/Scorebug";

it("places the ball and the line to gain in yards from your own goal line", () => {
  expect(fieldMarks("own", 30, 10)).toEqual({ ball: 30, lineToGain: 40, goal: false });
  expect(fieldMarks("opp", 35, 10)).toEqual({ ball: 65, lineToGain: 75, goal: false });
  // & Goal: the line to gain is the opponent's goal line.
  expect(fieldMarks("opp", 8, 8)).toEqual({ ball: 92, lineToGain: 100, goal: true });
  expect(fieldMarks("opp", 5, 10)).toEqual({ ball: 95, lineToGain: 100, goal: true });
});

it("maps the field onto the strip between two 10-yard end zones", () => {
  expect(stripPercent(0)).toBeCloseTo(100 / 12);
  expect(stripPercent(50)).toBe(50);
  expect(stripPercent(100)).toBeCloseTo(100 - 100 / 12);
});
