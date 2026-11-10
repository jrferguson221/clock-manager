import { expect, it } from "bun:test";
import { renderAt } from "./render";

it("marks the current mode's tab as selected", async () => {
  // At 0:00 there's nothing to simulate, so this render is quick.
  const { html } = await renderAt("/best-call?clock=0:00");
  expect(html).toContain("Situational Football");
  const selected = html.match(/<button[^>]*aria-selected="true"[^>]*>(.*?)<\/button>/s);
  expect(selected?.[1]).toContain("Best call");
  expect(html).toContain("The clock is at 0:00: the game is over.");
});

it("shows a not-found page with a way home for unknown paths", async () => {
  const { html } = await renderAt("/nowhere");
  expect(html).toContain("Page not found");
});

it("one trainer tab covers both leading and trailing, picked by the score", async () => {
  const { html } = await renderAt("/trailing?clock=0:00");
  const selected = html.match(/<button[^>]*aria-selected="true"[^>]*>(.*?)<\/button>/s);
  expect(selected?.[1]).toContain("Play-calling trainer");
  expect(html).not.toContain(">Leading: run out the clock<");
  expect(html).not.toContain('aria-label="Are you leading or trailing?"');
  expect(html).toContain("behind or tied");
});
