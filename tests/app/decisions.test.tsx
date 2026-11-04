import { expect, it } from "bun:test";
import { renderAt } from "./render";
import { localDecisions } from "./decisionsFixture";

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
