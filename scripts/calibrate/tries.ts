// Measures the try after a touchdown, to calibrate SPECIAL_TEAMS in src/sim.ts: extra-point and
// two-point success rates, and how often teams go for two by the score after the touchdown late in games.
//
//   bun scripts/calibrate/tries.ts pbp_2022.csv.gz pbp_2023.csv.gz …

import { readFile } from "node:fs/promises";
import { parseCsv } from "../decisions/csv";

type Tally = { tries: number; good: number };
const bump = (m: Map<string, Tally>, k: string, good: boolean) => {
  const t = m.get(k) ?? { tries: 0, good: 0 };
  t.tries++;
  if (good) t.good++;
  m.set(k, t);
};
const rate = (t: Tally) => `${((100 * t.good) / t.tries).toFixed(1).padStart(5)}% (n=${t.tries})`;

async function main() {
  const kinds = new Map<string, Tally>();
  /** Late (final 10:00): went for two, by the scoring team's margin after the 6 points. */
  const choice = new Map<string, Tally>();
  for (const path of process.argv.slice(2)) {
    const bytes = new Uint8Array(await readFile(path));
    for (const r of parseCsv(new TextDecoder().decode(path.endsWith(".gz") ? Bun.gunzipSync(bytes) : bytes))) {
      if (r.get("season_type") !== "REG") continue;
      const xp = r.get("extra_point_attempt") === "1";
      const two = r.get("two_point_attempt") === "1";
      if (!xp && !two) continue;
      if (xp) bump(kinds, "extra point", r.get("extra_point_result") === "good");
      if (two) bump(kinds, "two-point", r.get("two_point_conv_result") === "success");
      const late = r.get("qtr") === "4" && Number(r.get("game_seconds_remaining")) <= 600;
      if (late && r.get("score_differential") !== "") {
        const m = Number(r.get("score_differential"));
        bump(choice, String(m).padStart(3), two);
      }
    }
  }
  for (const [k, t] of kinds) console.log(`${k.padEnd(12)} ${rate(t)}`);
  console.log("\nFinal 10:00, margin after the touchdown: share that went for two");
  for (const [k, t] of [...choice].sort((a, b) => Number(a[0]) - Number(b[0]))) if (t.tries >= 10) console.log(`${k}  ${rate(t)}`);
}

if (import.meta.main) await main();
