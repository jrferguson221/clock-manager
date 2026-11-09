// Turns nflverse play-by-play rows into late-game offensive decisions in the model's terms.
// Pure functions: no network or file access, so they're easy to test.

import { DOWNS, type Down, type GameState, type PlayCall } from "@situational-football/schemas";
import type { CsvRow } from "./csv";
import { NFL_RULES } from "../../src/engine";

/** Decisions in the final 5:00 of the 4th quarter, in one-score games. */
export const WINDOW_SECONDS = 300;
export const MAX_MARGIN = 8;

export interface Candidate {
  id: string;
  gameId: string;
  week: number;
  offense: string;
  defense: string;
  home: string;
  away: string;
  date: string;
  /** The situation at the decision, for the offense ("you"). */
  state: GameState;
  /** What the offense did. */
  call: PlayCall;
  /**
   * "snap": a play, scored at the snap (the clock is where the snap happened).
   * "timeout": an offensive timeout, scored before it, with the clock as it was.
   */
  kind: "snap" | "timeout";
  description: string;
  /** Whether we're sure the clock was running before a timeout. Always true for snaps. */
  clockKnown: boolean;
  nflverseWp: number | null;
  nflverseWpa: number | null;
  /** The score before the play: the offense's points and the defense's, or null if the data lacks it. */
  score: { offense: number; defense: number } | null;
  /**
   * For a timeout with the clock running: about how many seconds were left on the 40-second play clock
   * when it was called (the play before's snap, less a typical play, minus the timeout's clock). Null for
   * plays, and when the clock was stopped.
   */
  playClockLeft: number | null;
}

/** FTN's charting of a pass play: was it play-action, or a screen? Keyed by "gameId-playId". */
export interface PassTag {
  playAction: boolean;
  screen: boolean;
}
export type PassTags = ReadonlyMap<string, PassTag>;

/** Read FTN charting rows (nflverse's ftn_charting file) into pass tags. */
export function passTagsFrom(rows: readonly CsvRow[]): PassTags {
  return new Map(rows.map((r) => [
    `${r.get("nflverse_game_id")}-${r.get("nflverse_play_id")}`,
    { playAction: r.get("is_play_action") === "TRUE", screen: r.get("is_screen_pass") === "TRUE" },
  ]));
}

const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));
const flag = (row: CsvRow, column: string) => row.get(column) === "1";
const toDown = (n: number | null): Down | null => DOWNS.find((d) => d === n) ?? null;

/**
 * The model's call for what an offense did on a play, or null for plays that aren't offensive decisions.
 * `tag` is FTN's charting of the play, when there is one: it tells play-action and screens apart.
 */
export function callFor(row: CsvRow, tag?: PassTag): PlayCall | null {
  const type = row.get("play_type");
  // A botched snap or a fake from a kicking formation isn't the offense choosing a play.
  const desc = row.get("desc");
  if (/Aborted|\((Punt|Field Goal) formation\)/i.test(desc)) return null;
  if (type === "qb_kneel" || flag(row, "qb_kneel")) return "kneel";
  if (type === "qb_spike" || flag(row, "qb_spike")) return "spike";
  if (type === "punt") return "punt";
  if (type === "field_goal") return "fg";
  const isPass = type === "pass" || (type === "run" && flag(row, "qb_scramble"));
  // Screens and play-action are play calls, charted by FTN, so they count as themselves.
  if (isPass && tag?.screen === true) return "pass-screen";
  if (isPass && tag?.playAction === true) return "pass-play-action";
  // A scramble or a sack was a called pass; where it was going isn't recorded, so count it as a typical one.
  if (type === "run") return flag(row, "qb_scramble") ? "pass-middle" : "run";
  if (type === "pass") {
    const location = row.get("pass_location");
    const air = num(row.get("air_yards"));
    if (location === "") return "pass-middle";
    if (air !== null && air >= 20) return "pass-deep";
    return location === "middle" ? "pass-middle" : "pass-sideline";
  }
  return null;
}

/**
 * Was the game clock running when this play (or timeout) came, judging by the play before it? It stops
 * after incompletions, out-of-bounds plays late in the game, timeouts, scores, changes of possession,
 * penalties and the two-minute warning.
 */
export function clockRunningAfter(prev: CsvRow | undefined, nextClock: number): boolean {
  if (prev === undefined) return false;
  const type = prev.get("play_type");
  if (type !== "run" && type !== "pass" && type !== "qb_kneel") return false;
  if (flag(prev, "incomplete_pass") || flag(prev, "out_of_bounds") || flag(prev, "timeout")) return false;
  if (flag(prev, "touchdown") || flag(prev, "interception") || flag(prev, "fumble_lost")) return false;
  if (prev.get("penalty") === "1") return false;
  const prevClock = num(prev.get("game_seconds_remaining"));
  // The play crossed 2:00, or the clock ran down to it before this snap: the warning stopped it.
  if (prevClock !== null && prevClock > 120 && nextClock <= 120) return false;
  return true;
}

function stateFrom(row: CsvRow, clock: number, running: boolean, timeoutsAdded = 0): GameState | null {
  const down = toDown(num(row.get("down")));
  const toGo = num(row.get("ydstogo"));
  const ytg = num(row.get("yardline_100"));
  const margin = num(row.get("score_differential"));
  const to = num(row.get("posteam_timeouts_remaining"));
  const oppTo = num(row.get("defteam_timeouts_remaining"));
  if (down === null || toGo === null || ytg === null || margin === null || to === null || oppTo === null) return null;
  if (ytg < 1 || ytg > 99 || toGo < 1) return null;
  return {
    clock, running, poss: "you", down, toGo: Math.min(toGo, ytg), ytg, margin,
    timeouts: { you: Math.min(3, to + timeoutsAdded), opp: oppTo }, over: false,
  };
}

/** Seconds a play takes, snap to whistle, for estimating the play clock at a timeout. */
const TYPICAL_PLAY_SECONDS = 6;

/** The score before a play, from the offense's side. */
function scoreFrom(row: CsvRow): { offense: number; defense: number } | null {
  const offense = num(row.get("posteam_score"));
  const defense = num(row.get("defteam_score"));
  return offense === null || defense === null || offense < 0 || defense < 0 ? null : { offense, defense };
}

const inWindow = (row: CsvRow) => {
  const clock = num(row.get("game_seconds_remaining"));
  const margin = num(row.get("score_differential"));
  return row.get("qtr") === "4" && clock !== null && clock > 0 && clock <= WINDOW_SECONDS && margin !== null && Math.abs(margin) <= MAX_MARGIN;
};

/** Every late, close offensive decision in the rows, in order. Rows must be in play order. */
export function findCandidates(rows: readonly CsvRow[], tags: PassTags = new Map()): Candidate[] {
  const out: Candidate[] = [];
  // Plays of the same game, in order, so each can see the one before it.
  let prev: CsvRow | undefined;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row === undefined) continue;
    if (prev !== undefined && prev.get("game_id") !== row.get("game_id")) prev = undefined;
    const meta = (r: CsvRow) => ({
      gameId: r.get("game_id"), week: Number(r.get("week")), offense: r.get("posteam"), defense: r.get("defteam"),
      home: r.get("home_team"), away: r.get("away_team"), date: r.get("game_date"), score: scoreFrom(r),
    });

    // An offensive timeout: the situation comes from the next play, the clock from the timeout.
    if (flag(row, "timeout") && row.get("play_type") === "no_play" && row.get("posteam") === "") {
      const next = rows[i + 1];
      const clock = num(row.get("game_seconds_remaining"));
      if (next !== undefined && clock !== null && next.get("game_id") === row.get("game_id")
        && next.get("posteam") === row.get("timeout_team") && inWindow(next) && row.get("qtr") === "4") {
        const running = clockRunningAfter(prev, clock);
        const state = stateFrom(next, clock, running, 1);
        const prevSnap = prev === undefined ? null : num(prev.get("game_seconds_remaining"));
        const playClockLeft = running && prevSnap !== null
          ? Math.max(1, Math.min(NFL_RULES.playClock, NFL_RULES.playClock - (prevSnap - TYPICAL_PLAY_SECONDS - clock)))
          : null;
        if (state !== null) {
          out.push({
            id: `${row.get("game_id")}-${row.get("play_id")}`, ...meta(next), state, call: "timeout", kind: "timeout",
            description: row.get("desc"), clockKnown: running, nflverseWp: num(next.get("wp")), nflverseWpa: null, playClockLeft,
          });
        }
      }
      prev = row;
      continue;
    }

    const call = callFor(row, tags.get(`${row.get("game_id")}-${row.get("play_id")}`));
    const clock = num(row.get("game_seconds_remaining"));
    if (call !== null && clock !== null && row.get("posteam") !== "" && inWindow(row)) {
      const state = stateFrom(row, clock, clockRunningAfter(prev, clock));
      if (state !== null) {
        out.push({
          id: `${row.get("game_id")}-${row.get("play_id")}`, ...meta(row), state, call, kind: "snap",
          description: row.get("desc"), clockKnown: true, nflverseWp: num(row.get("wp")), nflverseWpa: num(row.get("wpa")), playClockLeft: null,
        });
      }
    }
    if (row.get("play_type") !== "" ) prev = row;
  }
  return out;
}

/** Weeks in which every game has finished (has an END GAME row). */
export function completeWeeks(rows: readonly CsvRow[]): number[] {
  const games = new Map<string, { week: number; ended: boolean }>();
  for (const r of rows) {
    const id = r.get("game_id");
    if (id === "") continue;
    const g = games.get(id) ?? { week: Number(r.get("week")), ended: false };
    if (r.get("desc").startsWith("END GAME")) g.ended = true;
    games.set(id, g);
  }
  const byWeek = new Map<number, boolean>();
  for (const g of games.values()) byWeek.set(g.week, (byWeek.get(g.week) ?? true) && g.ended);
  return [...byWeek].filter(([, done]) => done).map(([w]) => w).sort((a, b) => a - b);
}
