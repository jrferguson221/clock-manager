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
    expect(html).toContain("Plays to field-goal range");
    expect(html).toContain("Win probability");
    expect(html).toContain("Call the play");
  });
});
