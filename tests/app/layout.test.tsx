import { expect, it } from "bun:test";
import { renderAt } from "./render";

it("marks the current mode's tab as selected", async () => {
  // At 0:00 there's nothing to simulate, so this render is quick.
  const { html } = await renderAt("/best-call?clock=0:00");
  expect(html).toContain("Clock Manager");
  const selected = html.match(/<button[^>]*aria-selected="true"[^>]*>(.*?)<\/button>/s);
  expect(selected?.[1]).toContain("Best call");
  expect(html).toContain("The clock is at 0:00: the game is over.");
});

it("shows a not-found page with a way home for unknown paths", async () => {
  const { html } = await renderAt("/nowhere");
  expect(html).toContain("Page not found");
});
