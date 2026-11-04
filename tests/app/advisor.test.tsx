import { expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import App from "../../src/App";

it("the informational mode renders the best call and every option", () => {
  const html = renderToString(<App initialMode="advisor" />);
  expect(html).toContain("Best call");
  expect(html).toContain("Every option");
});
