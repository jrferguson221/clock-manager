// Measures real pass outcomes by kind of pass and situation, to calibrate the model's pass odds
// (PASS_ODDS in src/sim.ts). Reads nflverse play-by-play and FTN charting files saved locally:
//
//   bun scripts/calibrate/passes.ts pbp_2025.csv.gz ftn_2025.csv pbp_2026.csv.gz ftn_2026.csv
//
// Only FTN-charted plays are used, so play-action and screens are known. Prints one row per kind of pass
// and situation: sack, completion and interception rates, yards per catch (mean and 10th percentile),
// and the share of catches that end out of bounds.

import { readFile } from "node:fs/promises";
import { parseCsv } from "../decisions/csv";
import { passTagsFrom } from "../decisions/plays";

type Kind = "screen" | "play-action" | "sideline" | "middle" | "deep" | "no target";
export type Situation = "normal" | "prevent" | "obvious";

interface Tally {
  dropbacks: number; sacks: number; attempts: number; completions: number; interceptions: number;
  catchYards: number[]; outOfBounds: number;
}
const empty = (): Tally => ({ dropbacks: 0, sacks: 0, attempts: 0, completions: 0, interceptions: 0, catchYards: [], outOfBounds: 0 });

async function text(path: string): Promise<string> {
  const bytes = new Uint8Array(await readFile(path));
  return new TextDecoder().decode(path.endsWith(".gz") ? Bun.gunzipSync(bytes) : bytes);
}

const pct = (n: number, d: number) => (d === 0 ? "   -  " : `${((100 * n) / d).toFixed(1).padStart(5)}%`);
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(q * (s.length - 1))] ?? 0;
};

async function main() {
  const files = process.argv.slice(2);
  const tallies = new Map<string, Tally>();
  // 3rd and 4th & short: how often runs and passes convert, by yards to go.
  const shortYardage = new Map<string, { plays: number; converted: number }>();
  for (let i = 0; i + 1 < files.length; i += 2) {
    const [pbpPath, ftnPath] = [files[i], files[i + 1]];
    if (pbpPath === undefined || ftnPath === undefined) continue;
    const tags = passTagsFrom(parseCsv(await text(ftnPath)));
    for (const r of parseCsv(await text(pbpPath))) {
      if (r.get("season_type") !== "REG") continue;
      const isPass = r.get("play_type") === "pass" && r.get("qb_spike") !== "1";
      const isScramble = r.get("play_type") === "run" && r.get("qb_scramble") === "1";
      const down = Number(r.get("down"));
      const toGo = Number(r.get("ydstogo"));
      const ytg = Number(r.get("yardline_100"));
      const isRun = r.get("play_type") === "run" && !isScramble && r.get("qb_kneel") !== "1";
      if ((down === 3 || down === 4) && toGo >= 1 && toGo <= 3 && ytg > toGo && (isPass || isScramble || isRun)) {
        const key = `${toGo}|${isRun ? "run" : "pass"}`;
        const t = shortYardage.get(key) ?? { plays: 0, converted: 0 };
        t.plays++;
        if (r.get("first_down") === "1" || r.get("touchdown") === "1") t.converted++;
        shortYardage.set(key, t);
      }
      if (!isPass && !isScramble) continue;
      const tag = tags.get(`${r.get("game_id")}-${r.get("play_id")}`);
      if (tag === undefined) continue;
      const sack = r.get("sack") === "1";
      const air = Number(r.get("air_yards"));
      const loc = r.get("pass_location");
      const kind: Kind = tag.screen ? "screen" : tag.playAction ? "play-action"
        : sack || isScramble || loc === "" ? "no target" : r.get("air_yards") !== "" && air >= 20 ? "deep" : loc === "middle" ? "middle" : "sideline";

      const clock = Number(r.get("game_seconds_remaining"));
      const margin = Number(r.get("score_differential"));
      const late = r.get("qtr") === "4";
      // The model's prevent: the defense ahead (by one score) in the last 4:00, outside the red zone.
      const prevent = late && clock <= 240 && margin < 0 && margin >= -8 && ytg > 20;
      const obvious = (down >= 3 && toGo >= 7) || (late && clock <= 300 && margin <= 0 && margin >= -8);
      const situation: Situation = prevent ? "prevent" : obvious ? "obvious" : "normal";

      for (const key of [`${kind}|${situation}`, `all|${situation}`, `${kind}|all`]) {
        const t = tallies.get(key) ?? empty();
        t.dropbacks++;
        if (sack) t.sacks++;
        else if (!isScramble) {
          t.attempts++;
          if (r.get("interception") === "1") t.interceptions++;
          if (r.get("complete_pass") === "1") {
            t.completions++;
            t.catchYards.push(Number(r.get("yards_gained")));
            if (r.get("out_of_bounds") === "1") t.outOfBounds++;
          }
        }
        tallies.set(key, t);
      }
    }
  }

  console.log("kind         situation  dropbacks   sack   comp   int  yds/catch  p10  out of bounds");
  for (const kind of ["all", "screen", "play-action", "sideline", "middle", "deep"]) {
    for (const situation of ["all", "normal", "obvious", "prevent"]) {
      const t = tallies.get(`${kind}|${situation}`);
      if (t === undefined || t.dropbacks === 0) continue;
      const mean = t.catchYards.reduce((a, b) => a + b, 0) / Math.max(1, t.catchYards.length);
      console.log(`${kind.padEnd(12)} ${situation.padEnd(9)} ${String(t.dropbacks).padStart(9)} ${pct(t.sacks, t.dropbacks)} ${pct(t.completions, t.attempts)} ${pct(t.interceptions, t.attempts)} ${mean.toFixed(1).padStart(9)} ${String(quantile(t.catchYards, 0.1)).padStart(4)} ${pct(t.outOfBounds, t.completions)}`);
    }
  }
  console.log("\n3rd/4th & short: share converted");
  for (const toGo of [1, 2, 3]) {
    const fmt = (kind: string) => {
      const t = shortYardage.get(`${toGo}|${kind}`);
      return t === undefined ? `${kind} -` : `${kind} ${pct(t.converted, t.plays).trim()} (n=${t.plays})`;
    };
    console.log(`  ${toGo} to go: ${fmt("run")}  ${fmt("pass")}`);
  }
}

if (import.meta.main) await main();
