import { expect, it } from "bun:test";
import { renderAt } from "./render";

it("the informational mode renders the best call and every option", async () => {
  const { html } = await renderAt("/best-call");
  expect(html).toContain("Best call");
  expect(html).toContain("Every option");
});

it("replaces invalid search params with defaults and keeps the valid ones", async () => {
  const { html, router, redirectedTo } = await renderAt("/best-call?margin=99&down=7&clock=abc&side=middle&hurryUp=12");
  // Invalid values fall back to their defaults, which are left out of the canonical URL.
  expect(redirectedTo).toBe("/best-call?hurryUp=12");
  expect(router.matchRoutes(router.state.location).at(-1)?.search)
    .toMatchObject({ margin: -3, down: 1, clock: "1:45", side: "own", hurryUp: 12 });
  expect(html).toContain('value="1:45"');
  expect(html).toContain("Every option");
});

it("reads the score from the URL", async () => {
  const { html, redirectedTo } = await renderAt("/best-call?margin=7&clock=0:30");
  expect(redirectedTo).toBeNull();
  expect(html).toMatch(/<option value="7" selected="">Up 7<\/option>/);
  expect(html).toContain('value="0:30"');
});
