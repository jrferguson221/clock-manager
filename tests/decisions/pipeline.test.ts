import { describe, expect, it } from "bun:test";
import { decisionWeekSchema } from "@situational-football/schemas";
import { parseCsv, type CsvRow } from "../../scripts/decisions/csv";
import { callFor, clockRunningAfter, completeWeeks, findCandidates, passTagsFrom } from "../../scripts/decisions/plays";
import { buildWeek, decisionPoint, scoreDecision, FLAG_THRESHOLD } from "../../scripts/decisions/build";

/** A play-by-play row from just the columns a test cares about. */
const row = (fields: Record<string, string>): CsvRow => ({ get: (c) => fields[c] ?? "" });

/** A late, close play: 4th quarter, 1:30 left, down 3, 2nd & 10 at the opponent's 40. */
const play = (fields: Record<string, string>): CsvRow => row({
  game_id: "2026_08_KC_DEN", play_id: "100", week: "8", qtr: "4", game_seconds_remaining: "90", score_differential: "-3",
  posteam: "KC", defteam: "DEN", home_team: "DEN", away_team: "KC", game_date: "2026-10-25", down: "2", ydstogo: "10",
  yardline_100: "40", posteam_timeouts_remaining: "1", defteam_timeouts_remaining: "2", wp: "0.3", wpa: "0.01",
  posteam_score: "17", defteam_score: "20",
  play_type: "pass", desc: "pass", ...fields,
});

describe("CSV", () => {
  it("reads quoted fields with commas, doubled quotes and newlines", () => {
    const rows = parseCsv('a,b,c\n1,"x, y","say ""hi"""\n2,"two\nlines",\n');
    expect(rows.map((r) => [r.get("a"), r.get("b"), r.get("c")])).toEqual([["1", "x, y", 'say "hi"'], ["2", "two\nlines", ""]]);
    expect(rows[0]?.get("missing")).toBe("");
  });
});

describe("what the offense called", () => {
  it("maps play types, pass location and air yards to the model's calls", () => {
    expect(callFor(play({ pass_location: "left", air_yards: "8" }))).toBe("pass-sideline");
    expect(callFor(play({ pass_location: "middle", air_yards: "8" }))).toBe("pass-middle");
    expect(callFor(play({ pass_location: "right", air_yards: "24" }))).toBe("pass-deep");
    expect(callFor(play({ play_type: "run" }))).toBe("run");
    expect(callFor(play({ play_type: "run", qb_scramble: "1" }))).toBe("pass-middle");
    expect(callFor(play({ play_type: "qb_kneel" }))).toBe("kneel");
    expect(callFor(play({ play_type: "qb_spike" }))).toBe("spike");
    expect(callFor(play({ play_type: "punt" }))).toBe("punt");
    expect(callFor(play({ play_type: "field_goal" }))).toBe("fg");
    expect(callFor(play({ play_type: "kickoff" }))).toBeNull();
  });

  it("uses FTN's charting for play-action and screens", () => {
    const tags = passTagsFrom(parseCsv("nflverse_game_id,nflverse_play_id,is_play_action,is_screen_pass\ng,1,TRUE,FALSE\ng,2,FALSE,TRUE\n"));
    expect(callFor(play({ pass_location: "left" }), tags.get("g-1"))).toBe("pass-play-action");
    expect(callFor(play({ pass_location: "left" }), tags.get("g-2"))).toBe("pass-screen");
  });

  it("skips botched snaps and fakes from kicking formations", () => {
    expect(callFor(play({ play_type: "run", desc: "(Punt formation) 13-C.Bojorquez FUMBLES (Aborted) at CLE 42" }))).toBeNull();
  });
});

describe("was the clock running?", () => {
  it("runs after an in-bounds play, and stops after incompletions, out of bounds, timeouts and the two-minute warning", () => {
    expect(clockRunningAfter(play({ play_type: "run", game_seconds_remaining: "100" }), 80)).toBe(true);
    expect(clockRunningAfter(play({ incomplete_pass: "1" }), 80)).toBe(false);
    expect(clockRunningAfter(play({ play_type: "run", out_of_bounds: "1" }), 80)).toBe(false);
    expect(clockRunningAfter(play({ play_type: "no_play", timeout: "1" }), 80)).toBe(false);
    expect(clockRunningAfter(play({ play_type: "run", game_seconds_remaining: "130" }), 118)).toBe(false);
    expect(clockRunningAfter(undefined, 80)).toBe(false);
  });
});

describe("finding decisions", () => {
  it("keeps late, close plays and offensive timeouts, with the timeout's situation from the next play", () => {
    const rows = [
      play({ play_id: "1", play_type: "run", game_seconds_remaining: "120" }),
      // Offensive timeout: no posteam on its own row.
      row({ game_id: "2026_08_KC_DEN", play_id: "2", qtr: "4", play_type: "no_play", timeout: "1", timeout_team: "KC", game_seconds_remaining: "95", desc: "Timeout #2 by KC at 01:35." }),
      play({ play_id: "3", posteam_timeouts_remaining: "1", game_seconds_remaining: "95" }),
      // Out of the window: a 20-point game.
      play({ play_id: "4", score_differential: "-20" }),
    ];
    const found = findCandidates(rows);
    expect(found.map((c) => [c.call, c.kind])).toEqual([["run", "snap"], ["timeout", "timeout"], ["pass-middle", "snap"]]);
    const timeout = found[1];
    // The timeout row says 1 left after it, so KC had 2 when it chose to call it; the run before kept the clock running.
    expect(timeout?.state).toMatchObject({ clock: 95, running: true, timeouts: { you: 2, opp: 2 } });
  });

  it("only counts weeks where every game has finished", () => {
    const rows = [row({ game_id: "a", week: "1", desc: "END GAME" }), row({ game_id: "b", week: "2", desc: "x" })];
    expect(completeWeeks(rows)).toEqual([1]);
  });
});

describe("scoring", () => {
  it("judges a running-clock play from the end of the play before, adding the call's time to the snap", () => {
    const [c] = findCandidates([play({ play_id: "1", play_type: "run", game_seconds_remaining: "100" }), play({ play_id: "2", play_type: "qb_spike", game_seconds_remaining: "80" })]).slice(1);
    if (c === undefined) throw new Error("no spike found");
    expect(c.call).toBe("spike");
    // A trailing team spikes about 12 seconds after the play ends.
    expect(decisionPoint(c)).toMatchObject({ clock: 92, running: true });
  });

  it("judges every pass as one decision, credited with the best kind of pass", () => {
    const [c] = findCandidates([play({ pass_location: "left", air_yards: "5", game_seconds_remaining: "90" })]);
    if (c === undefined) throw new Error("no pass found");
    const d = scoreDecision(c, 200);
    if (d === null) throw new Error("not scored");
    const bestPass = Math.max(...d.values.filter((v) => v.call.startsWith("pass")).map((v) => v.wp));
    expect(d.wpCall).toBe(bestPass);
  });

  it("lists only confident calls that cost at least the threshold, and every file matches the schema", () => {
    const [c] = findCandidates([play({ play_type: "punt", down: "4", ydstogo: "1", yardline_100: "45", game_seconds_remaining: "100" })]);
    if (c === undefined) throw new Error("no punt found");
    const d = scoreDecision(c, 300);
    if (d === null) throw new Error("not scored");
    const confident = buildWeek(2026, 8, [{ ...d, lowConfidence: false, cost: FLAG_THRESHOLD }], 1, "2026-11-04T00:00:00Z", "test");
    expect(confident.worst.length).toBe(1);
    const unsure = buildWeek(2026, 8, [{ ...d, lowConfidence: true, cost: 0.3 }], 1, "2026-11-04T00:00:00Z", "test");
    expect(unsure.worst.length).toBe(0);
    const small = buildWeek(2026, 8, [{ ...d, lowConfidence: false, cost: FLAG_THRESHOLD - 0.01 }], 1, "2026-11-04T00:00:00Z", "test");
    expect(small.worst.length).toBe(0);
    expect(decisionWeekSchema.safeParse(confident).success).toBe(true);
  });
});

describe("the score and the case against the call", () => {
  it("carries the actual score before the play, from the offense's side", () => {
    const [c] = findCandidates([play({ game_seconds_remaining: "90" })]);
    expect(c?.score).toEqual({ offense: 17, defense: 20 });
    const [none] = findCandidates([play({ posteam_score: "" })]);
    expect(none?.score).toBeNull();
  });

  it("explains why a punt was worse when trailing late", () => {
    const [c] = findCandidates([play({ play_type: "punt", down: "4", ydstogo: "1", yardline_100: "45", game_seconds_remaining: "100" })]);
    if (c === undefined) throw new Error("no candidate");
    const d = scoreDecision(c, 200);
    expect(d?.against?.text).toBe("Punting gives the ball back when you need to score.");
    expect(d?.score).toEqual({ offense: 17, defense: 20 });
  });
});
