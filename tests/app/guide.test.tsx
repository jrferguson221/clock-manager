import { expect, it } from "bun:test";
import { GUIDE_SECTIONS } from "@situational-football/schemas";
import { renderAt } from "./render";

it("renders every guide section, each with an anchor the explainer can link to", async () => {
  const { html } = await renderAt("/guide");
  expect(html).toContain("The late-game clock, explained");
  expect(html).toContain("How win probability works");
  for (const id of GUIDE_SECTIONS) expect(html).toContain(`id="${id}"`);
});

it("computes its tables from the model", async () => {
  const { html } = await renderAt("/guide");
  // The goal-line table and the margin-of-error table come from the simulator.
  expect(html).toContain("Chance a single run scores, by spot");
  expect(html).toMatch(/± \d+\.\d points/);
  // The kneel-out table: 1st down against 3 defensive timeouts can't be run out from 2:00, but can from far less.
  expect(html).toContain("The latest clock you can kneel it out from");
});

it("opens at a linked section, and ignores an unknown one", async () => {
  const linked = await renderAt("/guide?section=timeouts");
  expect(linked.router.matchRoutes(linked.router.state.location).at(-1)?.search).toEqual({ section: "timeouts" });

  const unknown = await renderAt("/guide?section=nonsense");
  expect(unknown.router.matchRoutes(unknown.router.state.location).at(-1)?.search).toEqual({ section: undefined });
  expect(unknown.html).toContain("How win probability works");
});

it("is in the mode tabs", async () => {
  const { html } = await renderAt("/");
  expect(html).toContain("Strategy guide");
});

it("Best call's reasons link to guide sections", async () => {
  // Up 3 with 1:50 left and the defense out of timeouts: kneel it out.
  const { html } = await renderAt("/best-call?margin=3&clock=1:50&oppTimeouts=0");
  expect(html).toContain("Read more");
  // Links render as /guide?section=... here (memory history) and #/guide?section=... in the browser.
  const sections = [...html.matchAll(/\/guide\?section=([a-z-]+)/g)].map((m) => m[1]);
  expect(sections.length).toBeGreaterThan(0);
  for (const s of sections) expect(GUIDE_SECTIONS.some((id) => id === s)).toBe(true);
});
