import { expect, it } from "bun:test";
import { picked, renderAt } from "./render";

it("the player-decisions page opens on the QB scenario with its verdict and flip table", async () => {
  const { html } = await renderAt("/scenarios");
  expect(html).toContain("Throw it away or take the sack?");
  expect(html).toContain("Verdict");
  expect(html).toContain("Where the answer flips");
  expect(html).toContain("Read more");
});

it("opens each scenario from the URL, and is in the mode tabs", async () => {
  // The old receiver, scramble and runner sideline scenarios are now one: the ball carrier's.
  const old = await renderAt("/scenarios?scenario=wr-sideline");
  expect(old.html).toContain("Throw it away or take the sack?");
  const carrier = await renderAt("/scenarios?scenario=ball-carrier&clock=0:15&margin=-3&timeouts=0&side=own&yardLine=45");
  expect(carrier.html).toContain("Get out of bounds, or stay in bounds?");
  expect(carrier.html).toContain("Yards if he stays in bounds");
  expect(carrier.html).toContain("Ball carrier decision");
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
  for (const label of ["QB: Throw it away or take the sack?", "Ball carrier: Get out of bounds, or stay in bounds?",
    "RB: Score, or go down short of the goal line?", "Coach: Kneel, or run it?"]) {
    expect(html).toContain(label);
  }
  for (const gone of ["QB: Slide", "WR:", "RB: Stay in bounds"]) expect(html).not.toContain(gone);
});

it("sets the situation at the snap in the scorebug, with the scenario's own inputs under it", async () => {
  const { html } = await renderAt("/scenarios?scenario=qb-throwaway");
  expect(html).toContain("At the snap");
  expect(html).not.toContain("Clock running");
  expect(picked(html, "The sack would lose (yards)")).toBe("8");
  expect(picked(html, "Seconds the play takes")).toBe("5");
  expect(html).toMatch(/<option value="qb-throwaway" selected="">/);
});
