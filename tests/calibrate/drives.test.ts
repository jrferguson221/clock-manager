import { expect, it } from "bun:test";
import type { CsvRow } from "../../scripts/decisions/csv";
import { lateDriveStarts, modelDrive } from "../../scripts/calibrate/drives";

const row = (fields: Record<string, string>): CsvRow => ({ get: (c) => fields[c] ?? "" });
const play = (fields: Record<string, string>) => row({
  season_type: "REG", qtr: "4", game_id: "g", fixed_drive: "20", posteam: "KC", down: "1", ydstogo: "10", yardline_100: "75",
  game_seconds_remaining: "105", score_differential: "-3", posteam_timeouts_remaining: "2", defteam_timeouts_remaining: "3",
  fixed_drive_result: "Field goal", ...fields,
});

it("takes each late, trailing drive from its first snap, skipping the kickoff row", () => {
  const starts = lateDriveStarts([
    play({ down: "", play_type: "kickoff" }), // the drive's kickoff: no down yet
    play({}), // first snap
    play({ game_seconds_remaining: "100" }), // later play, same drive
    play({ fixed_drive: "21", score_differential: "4" }), // leading: not counted
    play({ fixed_drive: "22", game_seconds_remaining: "400" }), // too early: not counted
  ]);
  expect(starts.length).toBe(1);
  expect(starts[0]?.state).toMatchObject({ clock: 105, ytg: 75, margin: -3, timeouts: { you: 2, opp: 3 } });
  expect(starts[0]?.scored).toBe(true);
});

it("the model's drives score sometimes, more with more time", () => {
  const start = { clock: 150, running: false, poss: "you" as const, down: 1 as const, toGo: 10, ytg: 75, margin: -3, timeouts: { you: 2, opp: 3 }, over: false };
  const lots = modelDrive(start, 400, 1);
  const little = modelDrive({ ...start, clock: 30 }, 400, 1);
  expect(lots.scored).toBeGreaterThan(little.scored);
  expect(lots.scored).toBeGreaterThan(0.2);
  expect(lots.scored).toBeLessThan(0.8);
});
