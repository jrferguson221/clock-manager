// The decisions data for tests: the published files, read from disk instead of fetched, and validated
// with the same schemas the site uses.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decisionIndexSchema, decisionWeekSchema } from "@clock-manager/schemas";
import type { DecisionsData } from "../../src/decisionsData";

const DIR = join(import.meta.dir, "../../public/data/decisions");

export const localDecisions: DecisionsData = {
  index: async () => decisionIndexSchema.parse(JSON.parse(await readFile(join(DIR, "index.json"), "utf8"))),
  week: async (season, week) =>
    decisionWeekSchema.parse(JSON.parse(await readFile(join(DIR, String(season), `week-${String(week).padStart(2, "0")}.json`), "utf8"))),
};
