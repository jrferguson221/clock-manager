// Each mode is a route, and its situation lives in validated URL search params, so a situation can be
// bookmarked or shared. The site is static (GitHub Pages, under a subpath), so the app uses hash
// history: links look like .../clock-manager/#/trailing?clock=0:58&trail=7.

import {
  createHashHistory, createRootRoute, createRoute, createRouter, lazyRouteComponent, stripSearchParams, type RouterHistory,
} from "@tanstack/react-router";
import {
  bestCallSearchSchema, guideSearchSchema, leadingSearchSchema, scenarioSearchSchema, trailingSearchSchema, SCENARIO_DEFAULTS, BEST_CALL_DEFAULTS, LEADING_DEFAULTS, TRAILING_DEFAULTS,
} from "@clock-manager/schemas";
import Layout, { NotFound } from "./Layout";
import RunOutPanel from "./RunOutPanel";
import TrailingPanel from "./TrailingPanel";
import AdvisorPanel from "./AdvisorPanel";

const rootRoute = createRootRoute({ component: Layout, notFoundComponent: NotFound });

const leadingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: leadingSearchSchema,
  search: { middlewares: [stripSearchParams(LEADING_DEFAULTS)] },
  component: RunOutPanel,
});

const trailingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trailing",
  validateSearch: trailingSearchSchema,
  search: { middlewares: [stripSearchParams(TRAILING_DEFAULTS)] },
  component: TrailingPanel,
});

const bestCallRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/best-call",
  validateSearch: bestCallSearchSchema,
  search: { middlewares: [stripSearchParams(BEST_CALL_DEFAULTS)] },
  component: AdvisorPanel,
});

// Player decisions: a separate download, like the guide.
const scenariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/scenarios",
  validateSearch: scenarioSearchSchema,
  search: { middlewares: [stripSearchParams(SCENARIO_DEFAULTS)] },
  component: lazyRouteComponent(() => import("./ScenarioPanel")),
});

// The guide is long and only some visitors read it, so it's a separate download, fetched when opened.
const guideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/guide",
  validateSearch: guideSearchSchema,
  component: lazyRouteComponent(() => import("./Guide")),
});

const routeTree = rootRoute.addChildren([leadingRoute, trailingRoute, bestCallRoute, scenariosRoute, guideRoute]);

/** The app's router. Tests pass a memory history; the browser uses the URL hash. */
export function createAppRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({ routeTree, history, scrollRestoration: true });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
