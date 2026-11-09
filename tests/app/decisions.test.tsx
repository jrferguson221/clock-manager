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

it("has a longer explanation behind Read more, collapsed at first", async () => {
  const week = await localDecisions.week(2026, 8);
  const top = week.worst[0];
  if (top === undefined || top.detail === null) throw new Error("week 8's top call should have the longer explanation");
  const { html } = await renderAt("/decisions?week=8");
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain(">Read more</button>");
  // Collapsed: the walk-through isn't rendered until it's opened.
  expect(html).not.toContain("What makes the difference");
});

it("names other options that also beat their call by a wide margin", async () => {
  // Week 8's top call: KC ran when a pass was best, and a timeout would also have beaten the run.
  const { html } = await renderAt("/decisions?week=8");
  expect(html).toContain("Also better than their call:");
  expect(html).toMatch(/<strong>Timeout<\/strong> \(\d+%, \d+ points better\): The clock was running with 0:48 left. A timeout saves the 13 seconds/);
});

it("has what happened after the call behind its own Read more, collapsed at first", async () => {
  const { html } = await renderAt("/decisions?week=8");
  expect(html).toContain('aria-label="Read more about what happened"');
  expect(html).toContain('aria-label="Read more about why"');
  // Collapsed: the story isn't rendered until it's opened.
  const week = await localDecisions.week(2026, 8);
  const story = week.worst[0]?.aftermath?.story[0];
  if (story === undefined) throw new Error("week 8's top call should have a story");
  expect(html).not.toContain(story);
});

it("explains why in plain logic: what they need, what each call leads to, and what decides it", async () => {
  const { html } = await renderAt("/decisions?week=8");
  const text = html.replace(/<[^>]+>/g, "");
  expect(text).toContain("Down 4 with 3:01 left, the Vikings need a touchdown.");
  expect(text).toMatch(/Their call, a punt: The Lions take over around their own \d+/);
  expect(text).toMatch(/The best call, going for it: the Vikings keep the ball \d+% of the time/);
  // The stop: each first down costs time, and some number of them runs out the clock.
  expect(text).toMatch(/every first down the Lions get costs time: the Vikings got the ball back after a three-and-out \(\d+% of the time\), with about \d:\d\d left/);
  expect(text).toMatch(/With two first downs, the Lions can usually run out the clock/);
  // A failed try stops the clock, and a field goal after it still leaves a tying touchdown.
  expect(text).toMatch(/If it fails \(\d+%\), the clock stops: the Lions take over around the Vikings(?:'|&#x27;) \d+/);
  expect(text).toMatch(/a Lions field goal still leaves the Vikings just a touchdown to tie/);
});
