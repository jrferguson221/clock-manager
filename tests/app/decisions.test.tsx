import { expect, it } from "bun:test";
import { renderAt } from "./render";
import { localDecisions } from "./decisionsFixture";
import { teamName } from "../../src/teamPalette";

it("opens on the latest week, with its costliest calls, biggest swings and credits", async () => {
  const index = await localDecisions.index();
  const latest = index.weeks.at(-1);
  if (latest === undefined) throw new Error("no weeks in the published data");
  const { html } = await renderAt("/decisions");
  expect(html).toContain("Decisions of the week");
  expect(html).toContain(`Week ${latest.week}`);
  expect(html).toContain("The costliest calls");
  expect(html).toContain("The biggest swings");
  expect(html).toContain("How the calls are judged");
  expect(html).toContain("nflverse");
  expect(html).toContain("FTN Data");
});

it("opens a week from the URL, and falls back to the latest for one that has no data", async () => {
  const first = await renderAt("/decisions?week=1");
  expect(first.html).toContain("in week 1,");
  const index = await localDecisions.index();
  const latest = index.weeks.at(-1)?.week;
  const missing = await renderAt("/decisions?week=21");
  expect(missing.html).toContain(`in week ${latest},`);
});

it("links each costly call to the same situation in Best call", async () => {
  const { html } = await renderAt("/decisions?week=1");
  expect(html).toContain("Try this situation in Best call");
  expect(html).toMatch(/\/best-call\?clock=/);
});

it("shows an error, not a crash, when the data can't be loaded", async () => {
  const broken = { index: () => Promise.reject(new Error("offline")), week: () => Promise.reject(new Error("offline")) };
  const { html } = await renderAt("/decisions", broken);
  expect(html).toContain("couldn&#x27;t be loaded");
});

it("shows each team's abbreviation on its own colors, with the full name", async () => {
  const { html } = await renderAt("/decisions?week=8");
  expect(html).toMatch(/<abbr class="team-chip team-colors" style="--team-accent-light:#[0-9a-f]{6};--team-on-accent-light:#[0-9a-f]{6};--team-accent-dark:#[0-9a-f]{6};--team-on-accent-dark:#[0-9a-f]{6}" title="Minnesota Vikings">MIN<\/abbr>/);
  expect(html).toContain("team-card team-colors costly");
});

it("shows each call as situation, their call, best call, why, then the result, with the real score", async () => {
  const week = await localDecisions.week(2026, 8);
  const top = week.worst[0];
  if (top === undefined || top.score === null) throw new Error("week 8 should have a costly call with a score");
  const { html } = await renderAt("/decisions?week=8");
  // The scorebug: both teams' actual points, not a margin.
  expect(html).toContain(`aria-label="${teamName(top.offense)} ${top.score.offense}"`);
  expect(html).toContain(`aria-label="${teamName(top.defense)} ${top.score.defense}"`);
  const card = html.slice(html.indexOf('class="scorebug game-bug"'));
  const order = ["<dt>Their call</dt>", "<dt>Best call</dt>", "<dt>Why</dt>", "<dt>Result</dt>"].map((t) => card.indexOf(t));
  expect(order.every((i) => i > 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});
