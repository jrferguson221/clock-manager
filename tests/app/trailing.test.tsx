import { expect, it } from "bun:test";
import { renderAt } from "./render";

it("trailing mode renders next-call advice, the plays budget and the play caller", async () => {
  const { html } = await renderAt("/trailing");
  expect(html).toContain("Next call");
  expect(html).toContain("Plays to reach field-goal range");
  expect(html).toContain("Plays you can run and still kick, if every play ends in bounds");
  expect(html).toContain("Win probability");
  expect(html).toContain("Call the play");
});

it("needs a touchdown when the URL says you trail by 7", async () => {
  const { html, router } = await renderAt("/trailing?trail=7&ypp=9");
  expect(router.state.location.search).toMatchObject({ trail: 7, ypp: 9 });
  expect(html).toContain("Plays to reach the end zone at 9 yards a play");
});
