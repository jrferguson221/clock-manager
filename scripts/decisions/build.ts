// Builds the "Decisions of the week" data: scores every late, close offensive decision in a season's
// NFL play-by-play with the app's model, and writes one JSON file per finished week plus an index.
//
//   bun scripts/decisions/build.ts --season 2026                  download from nflverse and build every finished week
//   bun scripts/decisions/build.ts --season 2026 --input pbp.csv.gz   use a local copy instead
//
// Play-by-play data: nflverse (https://github.com/nflverse/nflverse-data), CC-BY 4.0.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { decisionIndexSchema, decisionWeekSchema, type CallOutcomes, type Decision, type DecisionWeek } from "@situational-football/schemas";
import {
  availableCalls, bestCallReason, bestScored, evaluateCalls, evaluateCallsAtSnap, outcomeWinProbability, playOut, ranked, seededRng,
  snapDelay, step, whyNot, wpOf, DEFAULT_SIM, type CallValues, type StepResult,
} from "../../src/sim";
import type { GameState, PlayCall, Team } from "@situational-football/schemas";
import { parseCsv } from "./csv";
import { aftermathOf, completeWeeks, findCandidates, passTagsFrom, type Candidate, type PassTag } from "./plays";

export const SOURCE_PBP = "Play-by-play data: nflverse (github.com/nflverse/nflverse-data), CC-BY 4.0";
export const SOURCE_FTN = "Play-action and screen charting: FTN Data via nflverse (ftnfantasy.com/data), CC-BY-SA 4.0";
/** Games simulated per option. */
const GAMES_PER_CALL = 1500;
/** Beyond this gap between the app's win probability and nflverse's, a verdict is flagged as uncertain. */
export const DISAGREEMENT = 0.15;
const WORST_PER_WEEK = 10;
/** Only calls that cost at least this much make the list: smaller gaps rest too much on model assumptions. */
export const FLAG_THRESHOLD = 0.06;

/** Every kind of pass. In the weekly lists they're judged together as one decision: "throw it". */
const PASSES = new Set(["pass-sideline", "pass-middle", "pass-deep", "pass-play-action", "pass-screen"]);
const NOTABLE_PER_WEEK = 5;

/**
 * Where to judge a decision from. With the clock stopped before the snap, it's the snap itself: every
 * option snaps at the same clock. With it running, it's the end of the play before, so each option pays its
 * own time to the snap: a spike's quick lineup, a hurry-up, a drained play clock, or a timeout's instant
 * stop. Play-by-play gives the snap clock, so the decision clock is that plus the call's time to the snap.
 */
export function decisionPoint(c: Candidate): GameState {
  if (c.kind === "timeout" || !c.state.running) return c.state;
  return { ...c.state, clock: c.state.clock + snapDelay(c.state, c.call) };
}

/** Seconds a call would let run before its snap, given what's left on the play clock. */
function burnBefore(at: GameState, call: PlayCall, playClockLeft: number): number {
  return Math.min(snapDelay(at, call), playClockLeft - 1);
}

/** The situation at a call's snap after `burn` seconds run, stopping at the two-minute warning. */
function snapAfter(at: GameState, burn: number): GameState {
  const clock = at.clock > 120 && at.clock - burn <= 120 ? 120 : Math.max(0, at.clock - burn);
  return { ...at, clock, running: false };
}

/**
 * A timeout called with the clock running, judged against what the offense could have done with the play
 * clock it had left: each play lets the rest of the play clock run (as much as its tempo would) and snaps;
 * the timeout stops the clock where it was called, then the best play follows with one fewer timeout. A
 * timeout taken with the play clock nearly out costs only the timeout itself.
 */
export function timeoutValues(at: GameState, playClockLeft: number, n = GAMES_PER_CALL): CallValues {
  const plays = availableCalls(at).filter((call) => call !== "timeout").map((call) => {
    const snap = snapAfter(at, burnBefore(at, call, playClockLeft));
    const wp = snap.clock <= 0 ? (snap.margin > 0 ? 1 : snap.margin < 0 ? 0 : 0.5) : outcomeWinProbability(snap, call, undefined, n);
    return { call, wp };
  });
  const after: GameState = { ...at, running: false, timeouts: { ...at.timeouts, you: at.timeouts.you - 1 } };
  return [{ call: "timeout", wp: bestScored(evaluateCallsAtSnap(after, n)).wp }, ...plays];
}

/** Where a call starts from: for the options to a timeout called late in the play clock, their own snap. */
function startFor(at: GameState, call: PlayCall, playClockLeft: number | null): GameState {
  if (playClockLeft === null || call === "timeout") return at;
  return snapAfter(at, burnBefore(at, call, playClockLeft));
}

/** Why a timeout was worse, given the play clock left: the seconds it gave back, when that's what it cost. */
function timeoutAgainst(at: GameState, best: PlayCall, playClockLeft: number): Decision["against"] {
  const seconds = burnBefore(at, best, playClockLeft);
  if (seconds < 5 || at.margin <= 0) return null;
  return {
    text: `The play clock still had about ${playClockLeft} seconds on it: the timeout gave back ${seconds} seconds you could have run off before the snap.`,
    section: "running-out-the-clock",
  };
}

/** Games simulated per call for the longer explanation. */
const DETAIL_GAMES = 2000;

/**
 * What a call leads to from a situation: how the offense's drive ends, whether and when the other team gets
 * the ball back, how often it scores then, and the offense's win probability. `start` is the state the call
 * is made from (for a timeout's alternatives, their own snap).
 */
export function callOutcomes(start: GameState, call: PlayCall, n = DETAIL_GAMES): CallOutcomes {
  const drive = new Map<string, number>();
  let wins = 0, theyGet = 0, clockSum = 0, theyScore = 0, keep = 0, startSum = 0, startN = 0, back = 0, backClock = 0;
  for (let i = 0; i < n; i++) {
    const r = seededRng(0x5eed + i * 7919);
    let s = start;
    let ended: string | null = null;
    let handedOver = false;
    let answered = false;
    let gotBack = false;
    const first = step(s, call, r);
    if (first.state.poss === "you" && !first.state.over && first.driveEnded === undefined) keep++;
    const track = (res: StepResult, offense: Team) => {
      if (offense === "you" && ended === null && (res.driveEnded !== undefined || res.state.poss !== "you" || res.state.over)) {
        ended = res.driveEnded ?? (res.state.over ? (res.state.margin > 0 ? "Ran out the clock" : "Time ran out") : "Ended");
      }
      if (!handedOver && res.state.poss === "opp" && !res.state.over) {
        handedOver = true; theyGet++; clockSum += res.state.clock;
        // Where they take over, counting only punts, misses and turnovers (not kickoffs after a score).
        if (res.driveEnded !== "Touchdown" && res.driveEnded !== "Field goal") { startSum += 100 - res.state.ytg; startN++; }
      } else if (handedOver && !gotBack && res.state.poss === "you" && !res.state.over) {
        gotBack = true; back++; backClock += res.state.clock;
      }
      if (offense === "opp" && handedOver && !answered && res.driveEnded !== undefined) {
        answered = true;
        if (res.driveEnded === "Touchdown" || res.driveEnded === "Field goal") theyScore++;
      }
    };
    track(first, "you");
    s = first.state;
    wins += playOut(s, r, DEFAULT_SIM, track);
    const key = ended ?? (s.over ? "Time ran out" : "Ended");
    drive.set(key, (drive.get(key) ?? 0) + 1);
  }
  return {
    wp: wins / n,
    drive: [...drive].map(([result, k]) => ({ result, share: k / n })).sort((a, b) => b.share - a.share).filter((d) => d.share >= 0.03).slice(0, 4),
    theyGetBall: theyGet / n,
    clockWhenTheyGetBall: theyGet === 0 ? null : clockSum / theyGet,
    theyScore: theyScore / n,
    keep: keep / n,
    theirStart: startN === 0 ? null : startSum / startN,
    backAgain: back / n,
    clockBackAgain: back === 0 ? null : backClock / back,
  };
}

/** Score one decision, or null if the model has no matching option (e.g. a field goal from beyond its range). */
export function scoreDecision(c: Candidate, n = GAMES_PER_CALL): Decision | null {
  const at = decisionPoint(c);
  const lateTimeout = c.kind === "timeout" && at.running && c.playClockLeft !== null ? c.playClockLeft : null;
  const values = lateTimeout !== null ? timeoutValues(at, lateTimeout, n) : at.running ? evaluateCalls(at, n) : evaluateCallsAtSnap(at, n);
  if (!values.some((v) => v.call === c.call)) return null;
  const best = bestScored(values);
  // Which pass to throw (where it goes, play-action or a screen) depends on the coverage and the play
  // design, which play-by-play can't show. So a pass is judged as one decision, "throw it", credited with
  // the best kind of pass; the lists judge clock decisions: pass, run, kneel, spike, kick or timeout.
  const wpCall = PASSES.has(c.call)
    ? Math.max(...values.filter((v) => PASSES.has(v.call)).map((v) => v.wp))
    : wpOf(values, c.call);
  const lowConfidence = !c.clockKnown || (c.nflverseWp !== null && Math.abs(best.wp - c.nflverseWp) > DISAGREEMENT);
  // A pass is credited with the best kind of pass, so that's the call to explain against.
  const judged = PASSES.has(c.call)
    ? values.filter((v) => PASSES.has(v.call)).reduce((a, b) => (b.wp > a.wp ? b : a)).call
    : c.call;
  return {
    id: c.id, gameId: c.gameId, offense: c.offense, defense: c.defense, home: c.home, away: c.away, date: c.date,
    situation: {
      clock: at.clock, running: at.running, down: at.down, toGo: at.toGo, ytg: at.ytg,
      margin: at.margin, timeouts: at.timeouts.you, oppTimeouts: at.timeouts.opp,
    },
    snapClock: c.state.clock, description: c.description, call: c.call, wpCall, best: best.call, wpBest: best.wp,
    cost: Math.max(0, best.wp - wpCall),
    values: ranked(values).map((v) => ({ call: v.call, wp: v.wp })),
    // For a timeout, the best play is explained from its own snap: the play clock it had left already ran.
    reason: bestCallReason(lateTimeout !== null && best.call !== "timeout" ? snapAfter(at, burnBefore(at, best.call, lateTimeout)) : at, best.call),
    against: judged === best.call ? null : lateTimeout !== null ? timeoutAgainst(at, best.call, lateTimeout) : whyNot(at, judged),
    playClockLeft: lateTimeout,
    // Filled in for the decisions that make the lists: see withDetail and the week's aftermath.
    detail: null,
    aftermath: null,
    score: c.score,
    nflverseWp: c.nflverseWp, nflverseWpa: c.nflverseWpa, lowConfidence,
  };
}

/** The situation a decision was judged from, back in the model's terms. */
function stateOf(d: Decision): GameState {
  const s = d.situation;
  return {
    clock: s.clock, running: s.running, poss: "you", down: s.down, toGo: s.toGo, ytg: s.ytg, margin: s.margin,
    timeouts: { you: s.timeouts, opp: s.oppTimeouts }, over: false,
  };
}

/** A listed decision with its longer explanation: their call and the best call, played out. */
export function withDetail(d: Decision, n = DETAIL_GAMES): Decision {
  // A pass is judged as the best kind of pass, so that's the one to play out.
  const judged = PASSES.has(d.call)
    ? d.values.filter((v) => PASSES.has(v.call)).reduce((a, b) => (b.wp > a.wp ? b : a)).call
    : d.call;
  if (judged === d.best || d.cost < 0.005) return d;
  const at = stateOf(d);
  return {
    ...d,
    detail: {
      their: callOutcomes(startFor(at, judged, d.playClockLeft), judged, n),
      best: callOutcomes(startFor(at, d.best, d.playClockLeft), d.best, n),
    },
  };
}

/** A week's file from its scored decisions. */
export function buildWeek(
  season: number, week: number, decisions: readonly Decision[], games: number, generatedAt: string, source: string,
  /** What happened after each listed decision, from the week's play-by-play. */
  aftermath: (d: Decision) => Decision["aftermath"] = () => null,
): DecisionWeek {
  const compared = decisions.flatMap((d) => (d.nflverseWp === null ? [] : [Math.abs(d.wpBest - d.nflverseWp)]));
  const worst = decisions
    .filter((d) => !d.lowConfidence && d.cost >= FLAG_THRESHOLD)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, WORST_PER_WEEK)
    .map((d) => ({ ...withDetail(d), aftermath: aftermath(d) }));
  const notable = decisions
    .filter((d) => d.nflverseWpa !== null)
    .sort((a, b) => Math.abs(b.nflverseWpa ?? 0) - Math.abs(a.nflverseWpa ?? 0))
    .slice(0, NOTABLE_PER_WEEK)
    .map((d) => ({ ...withDetail(d), aftermath: aftermath(d) }));
  return decisionWeekSchema.parse({
    season, week, generatedAt, source, games, evaluated: decisions.length,
    agreement: {
      plays: compared.length,
      meanAbsDiff: compared.length === 0 ? 0 : compared.reduce((s, x) => s + x, 0) / compared.length,
      within10: compared.length === 0 ? 0 : compared.filter((x) => x <= 0.1).length / compared.length,
    },
    worst, notable,
  });
}

/** FTN's charting for the season, or null when it isn't available (the decisions still build without it). */
async function loadFtn(season: number, input: string | undefined): Promise<string | null> {
  try {
    if (input !== undefined) return await readFile(input, "utf8");
    return await (await fetchOk(`https://github.com/nflverse/nflverse-data/releases/download/ftn_charting/ftn_charting_${season}.csv`)).text();
  } catch (e) {
    console.error(`No FTN charting for ${season} (${e instanceof Error ? e.message : String(e)}): play-action and screens count as dropback passes.`);
    return null;
  }
}

async function loadCsv(season: number, input: string | undefined): Promise<string> {
  const bytes = input !== undefined
    ? new Uint8Array(await readFile(input))
    : new Uint8Array(await (await fetchOk(`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`)).arrayBuffer());
  const gz = input === undefined || input.endsWith(".gz");
  return new TextDecoder().decode(gz ? Bun.gunzipSync(bytes) : bytes);
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText} for ${url}`);
  return res;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const season = Number(arg("season") ?? new Date().getFullYear());
  const out = arg("out") ?? "public/data/decisions";
  const rows = parseCsv(await loadCsv(season, arg("input"))).filter((r) => r.get("season_type") === "REG");
  const weeks = completeWeeks(rows);
  const ftn = await loadFtn(season, arg("ftn"));
  const tags = ftn === null ? new Map<string, PassTag>() : passTagsFrom(parseCsv(ftn));
  const chartedWeeks = new Set(ftn === null ? [] : parseCsv(ftn).map((r) => Number(r.get("week"))));
  const generatedAt = new Date().toISOString();
  console.error(`${season}: ${rows.length} regular-season rows; finished weeks ${weeks.join(", ")}`);

  await mkdir(join(out, String(season)), { recursive: true });
  const index: { week: number; worst: number }[] = [];
  for (const week of weeks) {
    const weekRows = rows.filter((r) => r.get("week") === String(week));
    const games = new Set(weekRows.map((r) => r.get("game_id"))).size;
    const started = performance.now();
    const decisions = findCandidates(weekRows, tags).flatMap((c) => {
      const d = scoreDecision(c);
      return d === null ? [] : [d];
    });
    const source = chartedWeeks.has(week) ? `${SOURCE_PBP}. ${SOURCE_FTN}` : SOURCE_PBP;
    const file = buildWeek(season, week, decisions, games, generatedAt, source, (d) => aftermathOf(weekRows, d.id));
    await writeFile(join(out, String(season), `week-${String(week).padStart(2, "0")}.json`), `${JSON.stringify(file, null, 1)}\n`);
    index.push({ week, worst: file.worst.length });
    console.error(`  week ${week}: ${games} games, ${decisions.length} decisions scored, ${file.worst.length} flagged, models within 10 points on ${Math.round(file.agreement.within10 * 100)}% (${((performance.now() - started) / 1000).toFixed(1)}s)`);
  }
  const indexFile = decisionIndexSchema.parse({ season, generatedAt, weeks: index });
  await writeFile(join(out, String(season), "index.json"), `${JSON.stringify(indexFile, null, 1)}\n`);
  // The site opens on the latest season built.
  await writeFile(join(out, "index.json"), `${JSON.stringify(indexFile, null, 1)}\n`);
}

if (import.meta.main) await main();
