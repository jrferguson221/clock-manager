import { expect, it } from "bun:test";
import { picked, renderAt } from "./render";

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

it("shows the score, clock and timeouts in a scorebug with no ball: the try comes before any snap", async () => {
  const { html } = await renderAt("/two-point?margin=-2&clock=1:00");
  expect(picked(html, "Score with the TD")).toBe("Down 2");
  expect(html).toContain("After the touchdown");
  expect(html).not.toContain('aria-label="Down"');
  expect(html).not.toContain("Field position:");
});
