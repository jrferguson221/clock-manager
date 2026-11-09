// Each mode renders in its own file so `bun test --parallel` can run them on separate cores:
// rendering a mode runs its win-probability simulations, which is the slowest part of the suite.
import { expect, it } from "bun:test";
import { clockValue, picked, renderAt } from "./render";

it("leading mode renders a verdict, timeline and the play caller", async () => {
  const { html } = await renderAt("/");
  // Default: 2:30, 1st down, 3 defensive timeouts, clock running → can't run it out
  expect(html).toContain("You can&#x27;t run it out");
  expect(html).toContain("<table");
  expect(html).toContain("Win probability");
  expect(html).toContain("Call the play");
  // The situation is a scorebug you edit in place: its values are controls, not a separate form.
  expect(html).toMatch(/aria-label="Situation"[^>]*class="scorebug"|class="scorebug"[^>]*aria-label="Situation"/);
  expect(clockValue(html)).toBe("2:30");
  expect(picked(html, "Score")).toBe("Up 3");
  expect(picked(html, "Down")).toBe("1st");
  expect(picked(html, "Yards to go")).toBe("10");
  expect(picked(html, "Ball on")).toBe("Own 30");
  expect(picked(html, "Run-out play type")).toBe("Kneel down (2s)");
  expect(html).not.toContain("Edit the situation");
});

it("reads the situation from the URL: kneeling out 0:40 with the defense out of timeouts", async () => {
  const { html } = await renderAt("/?clock=0:40&oppTimeouts=0");
  expect(clockValue(html)).toBe("0:40");
  expect(html).toContain('aria-label="Them: 0 timeouts left"');
  expect(html).toContain("Run it out");
  expect(html).not.toContain("You can&#x27;t run it out");
});

