import { expect, it } from "bun:test";
import { renderAt } from "./render";

it("recommends going for 2 when the touchdown leaves you up 1", async () => {
  const { html } = await renderAt("/two-point");
  expect(html).toContain("Best call");
  expect(html).toContain("Go for 2");
  expect(html).toContain("Both options");
  // Each try's win probability if it's good and if it's no good, with the score each leaves.
  expect(html).toContain("Win if good");
  expect(html).toContain("Win if not");
  for (const score of ["Up 3", "Up 2", "Up 1"]) expect(html).toContain(`>${score}</p>`);
});

it("recommends the kick when the touchdown ties the game", async () => {
  const { html, redirectedTo } = await renderAt("/two-point?margin=0&clock=2:00");
  expect(redirectedTo).toBeNull();
  expect(html).toMatch(/verdict big[^>]*>Kick the extra point/);
});

it("replaces invalid search params with defaults", async () => {
  const { redirectedTo } = await renderAt("/two-point?margin=40&clock=xyz&timeouts=1");
  expect(redirectedTo).toBe("/two-point?timeouts=1");
});
