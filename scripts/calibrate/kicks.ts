// Measures field-goal make rates by distance, to calibrate FG_MAKE_BY_DISTANCE in src/sim.ts.
//
//   bun scripts/calibrate/kicks.ts pbp_2022.csv.gz pbp_2023.csv.gz …
//
// Prints the make rate in 5-yard bands (30-34, 35-39, …), with the number of tries in each.

import { readFile } from "node:fs/promises";
import { parseCsv } from "../decisions/csv";

async function main() {
  const bands = new Map<number, { tries: number; made: number }>();
  for (const path of process.argv.slice(2)) {
    const bytes = new Uint8Array(await readFile(path));
    for (const r of parseCsv(new TextDecoder().decode(path.endsWith(".gz") ? Bun.gunzipSync(bytes) : bytes))) {
      if (r.get("season_type") !== "REG" || r.get("play_type") !== "field_goal" || r.get("kick_distance") === "") continue;
      const band = 5 * Math.floor(Number(r.get("kick_distance")) / 5);
      const t = bands.get(band) ?? { tries: 0, made: 0 };
      t.tries++;
      if (r.get("field_goal_result") === "made") t.made++;
      bands.set(band, t);
    }
  }
  console.log("distance  made    tries");
  for (const [band, t] of [...bands].sort((a, b) => a[0] - b[0])) {
    console.log(`${band}-${band + 4}     ${((100 * t.made) / t.tries).toFixed(1).padStart(5)}%  ${String(t.tries).padStart(5)}`);
  }
}

if (import.meta.main) await main();
