import { expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import App from "../../src/App";

it("trailing mode renders next-call advice, the plays budget and the play caller", () => {
  const html = renderToString(<App initialMode="trailing" />);
  expect(html).toContain("Next call");
  expect(html).toContain("Plays to reach field-goal range");
  expect(html).toContain("Plays you can run and still kick, if every play ends in bounds");
  expect(html).toContain("Win probability");
  expect(html).toContain("Call the play");
});
