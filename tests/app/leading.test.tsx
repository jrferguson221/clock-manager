// Each mode renders in its own file so `bun test --parallel` can run them on separate cores:
// rendering a mode runs its win-probability simulations, which is the slowest part of the suite.
import { expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import App from "../../src/App";

it("leading mode renders a verdict, timeline and the play caller", () => {
  const html = renderToString(<App />);
  // Default: 2:30, 1st down, 3 defensive timeouts, clock running → can't run it out
  expect(html).toContain("You can&#x27;t run it out");
  expect(html).toContain("<table>");
  expect(html).toContain("Win probability");
  expect(html).toContain("Call the play");
});
