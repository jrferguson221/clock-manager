import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import App from "../src/App";

describe("App", () => {
  it("renders a verdict and timeline for the default situation", () => {
    const html = renderToString(<App />);
    // Default: 2:30, 1st down, 3 defensive timeouts, clock running → can't run it out
    expect(html).toContain("You can&#x27;t run it out");
    expect(html).toContain("<table>");
    expect(html).toContain("Win probability");
    expect(html).toContain("Call the play");
  });

  it("renders next-call advice in trailing mode", () => {
    const html = renderToString(<App initialMode="trailing" />);
    expect(html).toContain("Next call");
    expect(html).toContain("Plays to reach field-goal range");
    expect(html).toContain("Plays you can run and still kick, if every play ends in bounds");
    expect(html).toContain("Win probability");
    expect(html).toContain("Call the play");
  });

  it("renders the best call in the informational mode", () => {
    const html = renderToString(<App initialMode="advisor" />);
    expect(html).toContain("Best call");
    expect(html).toContain("Every option");
  });
});
