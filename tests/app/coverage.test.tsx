import { expect, it } from "bun:test";
import { CONCEPT_IDS, CONCEPTS, FIRST_REP, makeRep } from "../../src/coverage";
import { renderAt } from "./render";

it("opens on the pre-snap look, with the rep's 3 or 4 concepts to call", async () => {
  const { html } = await renderAt("/coverage");
  const rep = makeRep(FIRST_REP);
  expect(html).toContain("Beat the coverage");
  expect(html).toContain("Pre-snap look");
  expect(html).toContain("Call the play");
  for (const k of CONCEPT_IDS) {
    expect(html.includes(`aria-label="Call ${CONCEPTS[k].name}"`)).toBe(rep.options.includes(k));
  }
  // The coverage's name isn't given away before the call.
  expect(html).not.toContain("After the snap");
  expect(html).toContain("How to read coverages");
});

it("opens a shared rep from the URL, and falls back to the first rep on a bad one", async () => {
  const shared = await renderAt("/coverage?rep=42");
  expect(shared.router.matchRoutes(shared.router.state.location).at(-1)?.search).toEqual({ rep: 42 });
  const bad = await renderAt("/coverage?rep=abc");
  expect(bad.router.matchRoutes(bad.router.state.location).at(-1)?.search).toEqual({ rep: undefined });
  expect(bad.html).toContain("Pre-snap look");
});

it("the guide explains each coverage and grades every concept against it", async () => {
  const { html } = await renderAt("/guide?section=coverages");
  expect(html).toContain("Reading coverages, and the concepts that beat them");
  expect(html).toContain("Each concept against each coverage, before the situation");
  expect(html).toContain("Tampa 2");
});
