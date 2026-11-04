// Renders the whole app, with its router and Mantine theme, at a URL path such as "/trailing?trail=7".
import { renderToString } from "react-dom/server";
import { createMemoryHistory } from "@tanstack/react-router";
import App from "../../src/App";
import { createAppRouter } from "../../src/router";

async function loadAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  return router;
}

/**
 * On the server the router answers a non-canonical URL (invalid params, or defaults spelled out) with a
 * redirect to the canonical one, as the browser's router replaces the URL. Follow it, like a browser would.
 */
export async function renderAt(path: string) {
  let router = await loadAt(path);
  let redirectedTo: string | null = null;
  const result = router._serverResult;
  if (result?.type === "redirect") {
    redirectedTo = result.redirect.options.href ?? "/";
    router = await loadAt(redirectedTo);
  }
  // Drop the comment markers React puts between adjacent text nodes, so assertions can match plain text.
  const html = renderToString(<App router={router} />).replaceAll("<!-- -->", "");
  return { html, router, redirectedTo };
}
