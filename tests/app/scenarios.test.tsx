import { expect, it } from "bun:test";
import { renderAt } from "./render";

it("the player-decisions page opens on the QB scenario with its verdict and flip table", async () => {
  const { html } = await renderAt("/scenarios");
  expect(html).toContain("Throw it away or take the sack?");
  expect(html).toContain("Verdict");
  expect(html).toContain("Where the answer flips");
  expect(html).toContain("Read more");
});

it("opens each scenario from the URL, and is in the mode tabs", async () => {
  const wr = await renderAt("/scenarios?scenario=wr-sideline&clock=0:18&margin=-3&timeouts=0&side=own&yardLine=45");
  expect(wr.html).toContain("Get out of bounds or turn upfield?");
  expect(wr.html).toContain("Extra yards by turning upfield");
  const rb = await renderAt("/scenarios?scenario=rb-score&clock=1:05&margin=0&timeouts=2&oppTimeouts=2&down=1&yardLine=25");
  expect(rb.html).toContain("Score, or go down short of the goal line?");
  expect(rb.html).toContain("Player decisions");
});

it("falls back to the default scenario for an unknown one", async () => {
  const { html, redirectedTo } = await renderAt("/scenarios?scenario=kicker&sackYards=99");
  expect(redirectedTo).toBe("/scenarios");
  expect(html).toContain("Throw it away or take the sack?");
});

it("offers every decision in the picker, labelled by player", async () => {
  const { html } = await renderAt("/scenarios");
  for (const label of ["QB: Throw it away or take the sack?", "QB: Slide, or get out of bounds?", "WR: Get out of bounds or turn upfield?",
    "RB: Score, or go down short of the goal line?", "RB: Stay in bounds, or fight for the extra yards?", "Coach: Kneel, or run it?"]) {
    expect(html).toContain(label);
  }
});
