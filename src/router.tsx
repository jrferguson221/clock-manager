// Each mode is a route, and its situation lives in validated URL search params, so a situation can be
// bookmarked or shared. The site is static (GitHub Pages, under a subpath), so the app uses hash
// history: links look like .../situational-football/#/trailing?clock=0:58&trail=7.

import {
  createHashHistory, createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, stripSearchParams, type RouterHistory,
} from "@tanstack/react-router";
import {
  bestCallSearchSchema, coverageSearchSchema, decisionsSearchSchema, guideSearchSchema, leadingSearchSchema, scenarioSearchSchema, trailingSearchSchema, twoPointSearchSchema,
  SCENARIO_DEFAULTS, BEST_CALL_DEFAULTS, LEADING_DEFAULTS, TRAILING_DEFAULTS, TWO_POINT_DEFAULTS,
} from "@situational-football/schemas";
import Layout, { NotFound } from "./Layout";
import { DecisionsError, DecisionsPending } from "./DecisionsStatus";
import { fetchedDecisions, type DecisionsData } from "./decisionsData";
import RunOutPanel from "./RunOutPanel";
import TrailingPanel from "./TrailingPanel";
import AdvisorPanel from "./AdvisorPanel";

/** What every route can reach: where the decisions-of-the-week data comes from. */
export interface RouterContext {
  decisions: DecisionsData;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Layout, notFoundComponent: NotFound });

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

// Kick or go for two after a touchdown.
const twoPointRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/two-point",
  validateSearch: twoPointSearchSchema,
  search: { middlewares: [stripSearchParams(TWO_POINT_DEFAULTS)] },
  component: lazyRouteComponent(() => import("./TwoPointPanel")),
});

// Player decisions: a separate download, like the guide.
const scenariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/scenarios",
  validateSearch: scenarioSearchSchema,
  search: { middlewares: [stripSearchParams(SCENARIO_DEFAULTS)] },
  component: lazyRouteComponent(() => import("./ScenarioPanel")),
});

// Beat the coverage: read a defense's pre-snap look and pick a pass concept.
const coverageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/coverage",
  validateSearch: coverageSearchSchema,
  component: lazyRouteComponent(() => import("./CoveragePanel")),
});

// Decisions of the week: real late-game calls, scored by the model. The week's file is fetched and
// validated before the page renders; with no week in the URL, it's the latest one.
const decisionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/decisions",
  validateSearch: decisionsSearchSchema,
  loaderDeps: ({ search }) => ({ week: search.week }),
  loader: async ({ context, deps }) => {
    const index = await context.decisions.index();
    const latest = index.weeks.at(-1)?.week;
    if (latest === undefined) return { index, week: null };
    const wanted = index.weeks.some((w) => w.week === deps.week) && deps.week !== undefined ? deps.week : latest;
    return { index, week: await context.decisions.week(index.season, wanted) };
  },
  component: lazyRouteComponent(() => import("./DecisionsPanel")),
  pendingComponent: DecisionsPending,
  errorComponent: DecisionsError,
});

// The guide is long and only some visitors read it, so it's a separate download, fetched when opened.
const guideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/guide",
  validateSearch: guideSearchSchema,
  component: lazyRouteComponent(() => import("./Guide")),
});

const routeTree = rootRoute.addChildren([leadingRoute, trailingRoute, bestCallRoute, twoPointRoute, scenariosRoute, coverageRoute, decisionsRoute, guideRoute]);

/** The app's router. Tests pass a memory history; the browser uses the URL hash. */
export function createAppRouter(history: RouterHistory = createHashHistory(), decisions: DecisionsData = fetchedDecisions) {
  return createRouter({ routeTree, history, scrollRestoration: true, context: { decisions } });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
