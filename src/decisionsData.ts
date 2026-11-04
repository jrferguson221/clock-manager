// Where the "Decisions of the week" data comes from. The router's loader reads it through this
// interface, so tests can supply their own data instead of fetching.

import {
  decisionIndexSchema, decisionWeekSchema, type DecisionIndex, type DecisionWeek,
} from "@clock-manager/schemas";
import type * as z from "zod/mini";

export interface DecisionsData {
  /** The latest season's index: which weeks have data. */
  index(): Promise<DecisionIndex>;
  week(season: number, week: number): Promise<DecisionWeek>;
}

/** Fetch a JSON file and check it against its schema: the site never trusts the shape of fetched data. */
async function fetchJson<T>(path: string, schema: z.ZodMiniType<T>): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  return schema.parse(await res.json());
}

/** The data files the build publishes under public/data/decisions. */
export const fetchedDecisions: DecisionsData = {
  index: () => fetchJson("data/decisions/index.json", decisionIndexSchema),
  week: (season, week) => fetchJson(`data/decisions/${season}/week-${String(week).padStart(2, "0")}.json`, decisionWeekSchema),
};
