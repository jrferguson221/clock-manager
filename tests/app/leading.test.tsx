// Each mode renders in its own file so `bun test --parallel` can run them on separate cores:
// rendering a mode runs its win-probability simulations, which is the slowest part of the suite.
import { expect, it } from "bun:test";
import { renderAt } from "./render";

it("leading mode renders a verdict, timeline and the play caller", async () => {
  const { html } = await renderAt("/");
  // Default: 2:30, 1st down, 3 defensive timeouts, clock running → can't run it out
  expect(html).toContain("You can&#x27;t run it out");
  expect(html).toContain("<table");
  expect(html).toContain("Win probability");
  expect(html).toContain("Call the play");
  // The situation shows as a scorebug, not the form, until you press Edit.
  expect(html).toMatch(/aria-label="Situation"[^>]*class="scorebug"|class="scorebug"[^>]*aria-label="Situation"/);
  expect(html).toMatch(/<\/span>2:30<\/span>/);
  expect(html).toContain("Up 3");
  expect(html).toContain("1st &amp; 10");
  expect(html).toContain("Own 30");
  expect(html).not.toContain('value="2:30"');
});

it("reads the situation from the URL: kneeling out 0:40 with the defense out of timeouts", async () => {
  const { html } = await renderAt("/?clock=0:40&oppTimeouts=0");
  expect(html).toMatch(/<\/span>0:40<\/span>/);
  expect(html).toContain('aria-label="Them: 0 timeouts left"');
  expect(html).toContain("Run it out");
  expect(html).not.toContain("You can&#x27;t run it out");
});

