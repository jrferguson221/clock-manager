import { expect, it } from "bun:test";
import { picked, renderAt } from "./render";

it("trailing mode renders next-call advice, the plays budget and the play caller", async () => {
  const { html } = await renderAt("/trailing");
  expect(html).toContain("Next call");
  expect(html).toContain("Plays to reach field-goal range");
  expect(html).toContain("Plays you can run and still kick, if every play ends in bounds");
  expect(html).toContain("Win probability");
  expect(html).toContain("Call the play");
});

it("needs a touchdown when the URL says you trail by 7, and ignores an old link's yards per play", async () => {
  const { html, router } = await renderAt("/trailing?trail=7&ypp=9");
  expect(router.state.location.search).toMatchObject({ trail: 7 });
  expect(html).toContain("Plays to reach the end zone at 6 yards a play");
});

it("shows the situation as a scorebug you edit in place, with the hurry-up setting below", async () => {
  const { html } = await renderAt("/trailing?trail=7&side=opp&yardLine=8&toGo=8&down=3&oppTimeouts=1");
  expect(picked(html, "Score")).toBe("Down 7");
  expect(picked(html, "Down")).toBe("3rd");
  expect(picked(html, "Yards to go")).toBe("Goal");
  expect(picked(html, "Ball on")).toBe("Opp 8");
  expect(picked(html, "Hurry-up time in seconds")).toBe("18 seconds");
  // Each timeout bar is a toggle, on while that timeout is left.
  expect(html).toContain('aria-label="Them: 1 timeout left"');
  expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Their timeout 1"/);
  expect(html).toMatch(/aria-pressed="false"[^>]*aria-label="Their timeout 2"/);
});

it("in field-goal range with the clock running, offers a kneel and a tempo switch for the next snap", async () => {
  const { html } = await renderAt("/trailing?clock=1:30&trail=2&side=opp&yardLine=20");
  expect(html).toContain('aria-label="Tempo of the next snap"');
  for (const label of ["Auto", "Hurry up", "Drain the clock"]) expect(html).toContain(`>${label}<`);
  expect(html).toMatch(/<button[^>]*data-kind="kneel"(?![^>]*disabled)[^>]*>/);
  // With the clock stopped, there's no pace to choose.
  const stopped = await renderAt("/trailing?clock=1:30&trail=2&side=opp&yardLine=20&running=false");
  expect(stopped.html).not.toContain('aria-label="Tempo of the next snap"');
});
