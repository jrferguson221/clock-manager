# Clock Manager

A web app for end-of-game clock decisions in American football.

The first feature is a **run-out calculator**. Enter the game clock, the down, the defense's timeouts and whether the clock is running. The app tells you whether the leading team can kneel or run out the clock, the latest clock time it works from, and a play-by-play timeline.

Built with Vite, React, TypeScript and Vitest.

## Commands

```sh
npm install        # first time only
npm run dev        # dev server with hot reload at http://localhost:5173
npm test           # run the tests once
npm run test:watch # rerun tests on save
npm run build      # type-check and build into dist/
```

## Layout

| Path | What it holds |
| --- | --- |
| `src/engine.ts` | Clock simulation. Pure functions with no React or DOM access. |
| `src/time.ts` | Parses and formats `M:SS` clock strings. |
| `src/App.tsx` | The form and results UI. |
| `tests/` | Engine tests, plus a test that the page renders. |

## Current assumptions

- NFL rules: 40-second play clock and a two-minute warning.
- The offense snaps with 1 second left on the play clock and never gets a first down.
- The defense calls a timeout right after every play while it has any left.
- No penalties, and no 10-second runoffs.

## Ideas for next features

- Trailing-team mode: how much time a drive needs, and when to spike or call a timeout.
- Whether to take a safety or punt on 4th down.
- College and high-school rule sets.
- Using the offense's own timeouts, and a first-down conversion.
