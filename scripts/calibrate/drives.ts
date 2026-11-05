// Checks how often the model's late drives score against how often real ones did, from the same starts:
// every 4th-quarter drive by a team trailing by one score, starting with 3:00 or less left.
//
//   bun scripts/calibrate/drives.ts pbp_2022.csv.gz pbp_2023.csv.gz …
//
// For each real drive, the model plays the same possession out many times from its first snap (same clock,
// spot, down, distance, score and timeouts) and records how often it scores. Results are grouped by what
// the offense needed (a field goal is enough, or a touchdown) and by time left.

import { readFile } from "node:fs/promises";
import { DOWNS, type GameState } from "@situational-football/schemas";
import { policy, seededRng, step } from "../../src/sim";
import { parseCsv, type CsvRow } from "../decisions/csv";

interface Start {
  state: GameState;
  scored: boolean;
  touchdown: boolean;
}

async function rows(path: string): Promise<CsvRow[]> {
  const bytes = new Uint8Array(await readFile(path));
  return parseCsv(new TextDecoder().decode(path.endsWith(".gz") ? Bun.gunzipSync(bytes) : bytes));
}

/** The first snap of each late drive by a trailing team, with how the drive ended. */
export function lateDriveStarts(all: readonly CsvRow[]): Start[] {
  const seen = new Set<string>();
  const starts: Start[] = [];
  for (const r of all) {
    if (r.get("season_type") !== "REG" || r.get("qtr") !== "4" || r.get("posteam") === "") continue;
    const key = `${r.get("game_id")}-${r.get("fixed_drive")}`;
    if (seen.has(key)) continue;
    const down = DOWNS.find((d) => d === Number(r.get("down")));
    if (down === undefined) continue; // the drive's first row may be a kickoff; wait for its first snap
    seen.add(key);
    const clock = Number(r.get("game_seconds_remaining"));
    const margin = Number(r.get("score_differential"));
    if (!(clock > 0 && clock <= 180 && margin <= -1 && margin >= -8)) continue;
    const result = r.get("fixed_drive_result");
    const ytg = Number(r.get("yardline_100"));
    starts.push({
      state: {
        clock, running: false, poss: "you", down, toGo: Math.min(Number(r.get("ydstogo")), ytg), ytg, margin,
        timeouts: { you: Number(r.get("posteam_timeouts_remaining")), opp: Number(r.get("defteam_timeouts_remaining")) }, over: false,
      },
      scored: result === "Touchdown" || result === "Field goal",
      touchdown: result === "Touchdown",
    });
  }
  return starts;
}

/** The share of simulated possessions from `g` that score (and that score a touchdown). */
export function modelDrive(g: GameState, n: number, seed: number): { scored: number; touchdown: number } {
  let scored = 0;
  let touchdown = 0;
  for (let i = 0; i < n; i++) {
    const r = seededRng(seed + i * 7919);
    let s = g;
    for (let plays = 0; plays < 60 && !s.over && s.poss === "you"; plays++) {
      const next = step(s, policy(s), r).state;
      // Points for "you" end the drive: a field goal adds 3, a touchdown 6 or more.
      if (next.margin > s.margin) {
        scored++;
        if (next.margin - s.margin >= 6) touchdown++;
        break;
      }
      s = next;
    }
  }
  return { scored: scored / n, touchdown: touchdown / n };
}

async function main() {
  const starts: Start[] = [];
  for (const path of process.argv.slice(2)) starts.push(...lateDriveStarts(await rows(path)));

  const groups = new Map<string, { n: number; real: number; realTd: number; model: number; modelTd: number }>();
  starts.forEach((s, i) => {
    const need = s.state.margin >= -3 ? "FG is enough" : "need a TD";
    const time = s.state.clock > 90 ? "1:31-3:00" : "0:01-1:30";
    const m = modelDrive(s.state, 300, i * 104729);
    for (const key of [`${need}, ${time}`, need, "all"]) {
      const g = groups.get(key) ?? { n: 0, real: 0, realTd: 0, model: 0, modelTd: 0 };
      g.n++;
      g.real += s.scored ? 1 : 0;
      g.realTd += s.touchdown ? 1 : 0;
      g.model += m.scored;
      g.modelTd += m.touchdown;
      groups.set(key, g);
    }
  });

  console.log("late drives by a team trailing by one score (3:00 or less left, 4th quarter)");
  console.log("group                          drives   real scored  model scored   real TD  model TD");
  for (const [key, g] of [...groups].sort()) {
    const pct = (x: number) => `${((100 * x) / g.n).toFixed(1)}%`.padStart(11);
    console.log(`${key.padEnd(30)} ${String(g.n).padStart(6)} ${pct(g.real)} ${pct(g.model)} ${pct(g.realTd)} ${pct(g.modelTd)}`);
  }
}

if (import.meta.main) await main();
