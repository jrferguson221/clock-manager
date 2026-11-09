// Turns nflverse play-by-play rows into late-game offensive decisions in the model's terms.
// Pure functions: no network or file access, so they're easy to test.

import { DOWNS, type Down, type GameState, type PlayCall } from "@situational-football/schemas";
import type { CsvRow } from "./csv";
import { NFL_RULES } from "../../src/engine";
import { TEAM_COLORS } from "../../src/teamColors";

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

/** What actually happened after a decision, told in a few plain sentences, and the final score. */
export interface Aftermath {
  story: string[];
  final: { home: number; away: number; overtime: boolean };
}

/** Plays that count on a drive (not timeouts, penalty-only rows or the end-of-game marker). */
const REAL_PLAY = new Set(["run", "pass", "qb_spike", "qb_kneel", "field_goal", "punt"]);

/** A play's description without the leading clock and formation: "(:35) (Shotgun) 9-K.Walker ..." → "9-K.Walker ...". */
export function trimDesc(desc: string): string {
  return desc.replace(/^\(\d*:\d\d\)\s*/, "").replace(/^(\((Shotgun|No Huddle|No Huddle, Shotgun|Pistol|Run formation)\)\s*)+/, "").trim();
}

/** Cities two teams share: those teams go by their nicknames. */
const SHARED_CITY = new Set(["New York", "Los Angeles"]);

/** A team as a sentence names it: "Minnesota", "Kansas City", or "the Giants" where a city has two teams. */
export function teamShort(abbr: string): string {
  const name = TEAM_COLORS[abbr]?.name;
  if (name === undefined) return abbr;
  const words = name.split(" ");
  const nickname = words.at(-1) ?? name;
  const city = words.slice(0, -1).join(" ");
  return SHARED_CITY.has(city) || city === "" ? `the ${nickname}` : city;
}
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** A team's yard line in words: "the Detroit 17", "the Jets 30" (a nickname already has its "the"). */
export function yardWords(team: string, yard: number | string): string {
  const name = teamShort(team);
  return `${name.startsWith("the ") ? name : `the ${name}`} ${yard}`;
}

/** A spot as play-by-play writes it ("DET 17", "50") in words: "the Detroit 17", "midfield". */
export function spotWords(spot: string): string {
  const m = spot.match(/^([A-Z]{2,3}) (\d+)$/);
  if (m === null) return spot === "50" ? "midfield" : spot;
  return m[2] === "50" ? "midfield" : yardWords(m[1] ?? "", m[2] ?? "");
}

const clockWords = (seconds: number, overtime: boolean) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left${overtime ? " in overtime" : ""}`;
};

/** "1 first down", "3 first downs". */
const firstDowns = (n: number) => `${n} first down${n === 1 ? "" : "s"}`;

/**
 * What actually happened after a decision (id "gameId-playId"), from a week's play-by-play: how its drive
 * turned out, each drive after it to the end of the game, and the final score, in a few plain sentences.
 */
export function aftermathOf(rows: readonly CsvRow[], id: string): Aftermath | null {
  const cut = id.lastIndexOf("-");
  const gameId = id.slice(0, cut), playId = id.slice(cut + 1);
  const game = rows.filter((r) => r.get("game_id") === gameId);
  const at = game.findIndex((r) => r.get("play_id") === playId);
  if (at < 0) return null;
  const first = game[0];
  if (first === undefined) return null;
  const home = first.get("home_team"), away = first.get("away_team");
  const overtimeRow = (r: CsvRow) => r.get("qtr") === "5";
  const clockOf = (r: CsvRow) => num(r.get("game_seconds_remaining")) ?? 0;
  const scoreAfter = (r: CsvRow, team: string) => {
    const h = num(r.get("total_home_score")) ?? 0, a = num(r.get("total_away_score")) ?? 0;
    return team === home ? { us: h, them: a } : { us: a, them: h };
  };
  /** "to lead 31–28", "to tie it at 28", "to make it 24–28". */
  const scorePhrase = (r: CsvRow, team: string) => {
    const { us, them } = scoreAfter(r, team);
    return us > them ? `to lead ${us}–${them}` : us === them ? `to tie it at ${us}` : `to make it ${us}–${them}`;
  };

  /** One drive from row index `from`: the sentence for how it went. `opening` starts the sentence. */
  const tellDrive = (from: number, opening: string): { text: string; lastIndex: number; result: string } | null => {
    const startRow = game[from];
    if (startRow === undefined) return null;
    const driveNo = startRow.get("fixed_drive");
    const indexes = game.map((r, i) => ({ r, i })).filter(({ r, i }) => i >= from && r.get("fixed_drive") === driveNo);
    const team = indexes.find(({ r }) => r.get("posteam") !== "")?.r.get("posteam") ?? "";
    const last = indexes.at(-1);
    if (team === "" || last === undefined) return null;
    const defense = team === home ? away : home;
    const plays = indexes.map(({ r }) => r).filter((r) => REAL_PLAY.has(r.get("play_type")));
    const result = last.r.get("fixed_drive_result");
    const lastPlay = plays.at(-1);
    const overtime = overtimeRow(last.r);
    const fd = plays.filter((r) => r.get("first_down") === "1").length;
    const defenseTimeouts = indexes.filter(({ r }) => r.get("timeout") === "1" && r.get("timeout_team") === defense).length;
    const furthest = Math.min(...plays.map((r) => num(r.get("yardline_100")) ?? 100));
    const reached = furthest <= 40 && plays.length > 1 ? `reached ${yardWords(defense, furthest)}` : "";
    const when = clockWords(clockOf(lastPlay ?? last.r), overtime);
    let outcome: string;
    switch (result) {
      case "Touchdown": {
        const before = scoreAfter(startRow, team), after = scoreAfter(last.r, team);
        if (after.them > before.them && after.us === before.us) {
          const how = lastPlay?.get("interception") === "1" ? "threw an interception that was returned for a touchdown" : "lost a fumble that was returned for a touchdown";
          outcome = `${how} with ${when}`;
        } else {
          outcome = `scored a touchdown with ${when} ${scorePhrase(last.r, team)}`;
        }
        break;
      }
      case "Field goal": outcome = `kicked a ${lastPlay?.get("kick_distance") ?? ""}-yard field goal with ${when} ${scorePhrase(last.r, team)}`; break;
      case "Missed field goal": outcome = `missed a ${lastPlay?.get("kick_distance") ?? ""}-yard field goal with ${when}`; break;
      case "Punt": {
        const next = game.find((r, i) => i > last.i && r.get("fixed_drive") !== driveNo && r.get("drive_start_yard_line") !== "");
        const to = next === undefined ? "" : ` to ${spotWords(next.get("drive_start_yard_line"))}`;
        outcome = `punted${lastPlay?.get("kick_distance") ? ` ${lastPlay.get("kick_distance")} yards` : ""}${to} with ${when}`;
        break;
      }
      case "Turnover":
        outcome = `${lastPlay?.get("interception") === "1" ? "threw an interception" : "lost a fumble"} with ${when}`;
        break;
      case "Turnover on downs": outcome = `turned it over on downs with ${when}`; break;
      case "Safety": outcome = `gave up a safety with ${when}`; break;
      case "Opp touchdown": outcome = `gave up a defensive touchdown with ${when}`; break;
      default: {
        const { us, them } = scoreAfter(last.r, team);
        const onlyKneels = plays.length > 0 && plays.every((r) => r.get("play_type") === "qb_kneel");
        outcome = us > them || us === them
          ? (onlyKneels ? "knelt to run out the clock" : "ran out the clock")
          : "ran out of time";
      }
    }
    const clauses = [fd > 0 && result !== "Punt" ? `got ${firstDowns(fd)}` : "", reached].filter((x) => x !== "");
    const bare = !opening.includes(" got the ball");
    // One step joins with "and" ("got 2 first downs and ran out the clock"); a sequence with "then".
    const steps = clauses.length === 0 ? outcome
      : clauses.length === 1 ? `${clauses[0] ?? ""} and ${outcome}` : `${clauses.join(", ")}, then ${outcome}`;
    let text = bare ? `${opening} ${steps}` : `${opening}${clauses.length === 0 ? " and" : ","} ${steps}`;
    if (defenseTimeouts > 0 && (result === "End of half" || result === "")) text += `, while ${teamShort(defense)} used ${defenseTimeouts === 1 ? "a timeout" : `${defenseTimeouts} timeouts`}`;
    return { text: `${capital(text.replace(/\s+/g, " ").trim())}.`, lastIndex: last.i, result };
  };

  const story: string[] = [];
  // The decision's own drive: from the decision on (a timeout row's drive is the next play's).
  const anchor = game.findIndex((r, i) => i >= at && r.get("posteam") !== "");
  if (anchor < 0) return null;
  const anchorRow = game[anchor];
  if (anchorRow === undefined) return null;
  const own = tellDrive(at, teamShort(anchorRow.get("posteam")));
  if (own === null) return null;
  story.push(own.text);
  // Every later drive to the end of the game.
  let i = own.lastIndex + 1;
  let saidOvertime = overtimeRow(game[own.lastIndex] ?? first);
  // After a punt the last sentence already said where the ball went, so the next drive starts with the team.
  let previous = own.result;
  while (i < game.length) {
    const r = game[i];
    if (r === undefined) break;
    if (r.get("posteam") === "" || r.get("fixed_drive") === "" || !REAL_PLAY.has(r.get("play_type")) && r.get("play_type") !== "kickoff") { i++; continue; }
    if (!saidOvertime && overtimeRow(r)) { story.push("The game went to overtime."); saidOvertime = true; }
    const startSpot = r.get("drive_start_yard_line");
    const newPeriod = overtimeRow(r) && !overtimeRow(game[i - 1] ?? r);
    const opening = previous === "Punt" && !newPeriod
      ? teamShort(r.get("posteam"))
      : `${teamShort(r.get("posteam"))} got the ball${startSpot ? ` at ${spotWords(startSpot)}` : ""} with ${clockWords(clockOf(r), overtimeRow(r))}`;
    const told = tellDrive(i, opening);
    if (told === null) break;
    story.push(told.text);
    previous = told.result;
    i = told.lastIndex + 1;
  }
  const finalHome = num(first.get("home_score")) ?? 0, finalAway = num(first.get("away_score")) ?? 0;
  const overtime = game.some(overtimeRow);
  const [winner, w, l] = finalHome > finalAway ? [home, finalHome, finalAway] : [away, finalAway, finalHome];
  story.push(finalHome === finalAway
    ? `It ended in a tie, ${finalHome}–${finalAway}${overtime ? ", after overtime" : ""}.`
    : `${capital(teamShort(winner))} won ${w}–${l}${overtime ? " in overtime" : ""}.`);
  return { story, final: { home: finalHome, away: finalAway, overtime } };
}
