# Clock Manager

A web app for end-of-game clock decisions in American football.

It has two modes:

- **Leading: run out the clock.** Enter the game clock, the down, the defense's timeouts and whether the clock is running. The app tells you whether you can kneel or run out the clock, the latest clock time it works from, and a play-by-play timeline.
- **Trailing: drive to score.** Enter the clock, your timeouts, the down, the ball spot and whether you need a touchdown or a field goal. The app tells you what to call next (hurry up, timeout, spike, let the two-minute warning hit, or burn the clock and kick). It also shows how many plays you need and how many you have time for: in the worst case, a typical case and the best case.

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
| `src/engine.ts` | Leading-team run-out simulation, and shared rule types. Pure functions. |
| `src/trailing.ts` | Trailing-team drive budget and next-call advice. Pure functions. |
| `src/time.ts` | Parses and formats `M:SS` clock strings. |
| `src/App.tsx` | The mode tabs. |
| `src/RunOutPanel.tsx`, `src/TrailingPanel.tsx` | One UI panel per mode. |
| `src/fields.tsx` | Form inputs and the timeline table, shared by both panels. |
| `tests/` | Tests for both engines, plus tests that each mode renders. |

## Current assumptions

Both modes use NFL rules: a 40-second play clock and a two-minute warning, with no penalties and no 10-second runoffs.

**Leading mode**
- The offense snaps with 1 second left on the play clock and never gets a first down.
- The defense calls a timeout right after every play while it has any left.

**Trailing mode.** These are rules of thumb, not a full win-probability model.
- Plays take 6 seconds, a no-huddle snap after an in-bounds play takes 18 seconds (you can change this in the app), and a spike takes about 12 seconds.
- The offense gains 7 yards a play by default (you can change this in the app), and moves the chains without running out of downs.
- Field-goal range is the opponent's 35, a 52-yard try. When you need a field goal, one timeout is held back for the kick.
- A typical drive has half its plays stop the clock (incompletions or out of bounds).
- The advice says to stop the clock when the typical budget leaves less than one spare play. It spikes on 1st or 2nd down to save the last timeout, and never spikes on 4th down.

## Ideas for next features

- Live drive tracking: enter each play's result and get updated advice.
- Make field-goal range and the other trailing assumptions adjustable in the app.
- Whether to take a safety or punt on 4th down.
- College and high-school rule sets.
- Using the offense's own timeouts, and a first-down conversion.
