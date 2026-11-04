// Renders the whole app, with its router and Mantine theme, at a URL path such as "/trailing?trail=7".
import { renderToString } from "react-dom/server";
import { createMemoryHistory } from "@tanstack/react-router";
import App from "../../src/App";
import { createAppRouter } from "../../src/router";
import type { DecisionsData } from "../../src/decisionsData";
import { localDecisions } from "./decisionsFixture";

async function loadAt(path: string, decisions: DecisionsData) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }), decisions);
  await router.load();
  return router;
}

/**
 * On the server the router answers a non-canonical URL (invalid params, or defaults spelled out) with a
 * redirect to the canonical one, as the browser's router replaces the URL. Follow it, like a browser would.
 */
export async function renderAt(path: string, decisions: DecisionsData = localDecisions) {
  let router = await loadAt(path, decisions);
  let redirectedTo: string | null = null;
  const result = router._serverResult;
  if (result?.type === "redirect") {
    redirectedTo = result.redirect.options.href ?? "/";
    router = await loadAt(redirectedTo, decisions);
  }
  // Drop the comment markers React puts between adjacent text nodes, so assertions can match plain text.
  const html = renderToString(<App router={router} />).replaceAll("<!-- -->", "");
  return { html, router, redirectedTo };
}
