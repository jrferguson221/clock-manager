# Clock Manager

A web app for end-of-game clock decisions in American football.

Both modes are a play-calling trainer. Enter the situation (clock, score, timeouts for both teams, down, distance and ball spot), then call each play: timeout, run, pass to the sideline, pass over the middle, deep pass, spike, kneel, field goal or punt. The app simulates the result and updates the situation. A win-probability meter shows your chances. After each call, it explains what the best call was, why, and the win probability for every option. When the drive ends, you can play out the rest of the game to see one way it could go. Once the game is over, a recap shows the final result and the call with the biggest win-probability swing, added or lost, and says whether the call itself was right or the result was luck. You can undo a call to try another.

The **Best call** tab is the informational version. Enter any situation where you have the ball, including the score from down 16 to up 16, and it shows the best call with the reason, your win probability with it, every option ranked, and which calls to avoid and why. It scores each option over 1,500 simulated games instead of 500, so its rankings are steadier than the trainer's.

The leading and trailing modes also have their own calculators:

- **Leading: run out the clock.** Whether you can kneel or run out the clock, the latest clock time it works from, and a play-by-play timeline.
- **Trailing: drive to score.** A rule-of-thumb next call (hurry up, timeout, spike, let the two-minute warning hit, or burn the clock and kick), and how many plays you need versus how many you have time for.

Each mode has its own URL, and the situation you enter is kept in the URL too, so you can bookmark or share it: for example `#/trailing?clock=0:58&trail=7&side=opp&yardLine=40`. Settings left at their defaults are left out of the URL, and anything invalid in a shared link falls back to its default.

Built with Vite, React, TypeScript, [Mantine](https://mantine.dev) (UI components, with a custom theme), [TanStack Router](https://tanstack.com/router) and [Zod](https://zod.dev), using Bun. The page follows your system's light or dark setting until you pick one with the sun/moon button.

## Commands

```sh
bun install        # first time only
bun run dev        # dev server with hot reload at http://localhost:5173
bun run test       # run the tests once, test files in parallel across CPU cores
bun run test:watch # rerun tests on save
bun run build      # type-check and build into dist/
```

The project uses [Bun](https://bun.sh) to install packages and run scripts. `bunfig.toml` makes `bun run` use Bun's runtime rather than Node's. Tests use Bun's test runner (`bun:test`) with `--parallel`, which runs test files on separate CPU cores. Every test is a pure function of its inputs, so the files are independent. Each mode's render test has its own file in `tests/app/`, because rendering a mode runs its win-probability simulations. Within a file, `test.concurrent` wouldn't help: it only overlaps `async` tests while they wait, and these tests are all synchronous.

TypeScript runs in strict mode plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and the other strict-family checks (see `tsconfig.json`). The code and tests use no `any`, type casts or non-null assertions. Selects only hand back values from their option lists, lists that can't be empty are typed that way, and URL search params are parsed by Zod schemas rather than trusted.

## Layout

| Path | What it holds |
| --- | --- |
| `src/engine.ts` | Leading-team run-out simulation, and shared rule types. Pure functions. |
| `src/sim.ts` | Play simulator, win probability and the best-call explainer. Pure functions. |
| `src/Trainer.tsx` | The play-calling trainer UI shared by both modes. |
| `src/trailing.ts` | Trailing-team drive budget and next-call advice. Pure functions. |
| `src/time.ts` | Parses and formats `M:SS` clock strings. |
| `src/router.tsx` | The routes, one per mode, with their search-param schemas. Uses hash history, so deep links work on GitHub Pages. |
| `src/App.tsx`, `src/Layout.tsx` | Mantine and router providers; the header, mode tabs and color-scheme toggle. |
| `src/theme.ts`, `src/styles.css` | The "Sideline" Mantine theme (pylon orange, turf green, night navy, Barlow fonts), and the CSS the theme can't express. `src/mantine-styles.ts` imports Mantine's styles for just the components used. |
| `src/RunOutPanel.tsx`, `src/TrailingPanel.tsx`, `src/AdvisorPanel.tsx` | One UI panel per mode. |
| `src/SituationForm.tsx`, `src/fields.tsx` | The situation form all modes share, its inputs, and the timeline table. |
| `packages/schemas` | `@clock-manager/schemas`, a Bun workspace package: Zod schemas for the game state, URL search params and form fields, and the types inferred from them. The engines take their `GameState`, `Down` and `PlayCall` types from it. |
| `tests/` | Tests for the engines and the simulator. `tests/app/` renders each route (one file per mode). `packages/schemas/tests/` tests the schemas. |

The repo is a Bun workspace: `bun install` at the root links `packages/schemas`, and `bun run test` runs every package's tests.

## Current assumptions

Both modes use NFL rules: a 40-second play clock and a two-minute warning, with no penalties and no 10-second runoffs.

**Win probability and best calls** (`src/sim.ts`). This is a simple Monte Carlo model, not one fitted to NFL play-by-play data.
- Each call has a fixed outcome distribution. Runs average about 4 yards and rarely go out of bounds. Sideline passes complete about half the time and usually go out of bounds. Passes over the middle complete about 60% of the time and gain a little more. Deep passes complete about 35% of the time for 20+ yards (about 32 on average), with more sacks and interceptions.
- A defense that's ahead in the last 4 minutes plays prevent, with safeties deep and fewer rushers. Deep passes then complete about 20% of the time and are intercepted about 8% of the time. Middle and sideline throws complete more often (68% and 55%) but are tackled sooner. There are fewer sacks, and runs average about 4.3 yards. A defense that's behind doesn't play prevent.
- A deep pass on the last play (10 seconds or less, within 60 yards) is an end-zone heave. It scores about 20% of the time from 25 yards, 10% from 45 and 4% from 60, and is intercepted about 12% of the time. Passes carry sack and interception risk, and runs a small fumble risk.
- Tempo is automatic. A team that's ahead drains the play clock. A team that only needs a field goal and is in range drains it too, but leaves time for a timeout or a rushed kick. Everyone else uses the hurry-up time (18 seconds by default). A timeout stops the clock right away.
- A defense that's behind calls timeout after in-bounds plays in the last 4 minutes, unless the two-minute warning is about to stop the clock for free.
- Field goals are good about 90% of the time from 35 yards and about 65% from 52, with 62 yards the longest try. Punts net 40 yards. Kickoffs are touchbacks to the 30, and a team that's still behind late tries an onside kick (12% recovered).
- After your call, both teams follow a rule-of-thumb policy for the rest of the game. It throws deep on the last play or two when a field goal won't do, and on 4th and 15 or longer. A tie at 0:00 is a coin flip in overtime.
- Each call is scored over 500 simulated games, so differences of a point or two are within the noise. The explainer calls those "close".
- A timeout isn't a play, so it's scored by what comes next. With the clock running, it's worth the best play from the stopped-clock situation, which is what the meter shows after you call it. With the clock already stopped, it's worth the same best play with one fewer timeout. It can never beat running that play and keeping the timeout, and the explainer always flags it as a mistake.
- Every situation is simulated on the same random numbers. So comparisons, such as with and without a timeout, compare like with like, and having more timeouts never shows a lower win probability because of noise.

**Leading-mode run-out calculator**
- The offense snaps with 1 second left on the play clock and never gets a first down.
- The defense calls a timeout right after every play while it has any left.

**Trailing-mode rules of thumb**
- Plays take 6 seconds, a no-huddle snap after an in-bounds play takes 18 seconds (you can change this in the app), and a spike takes about 12 seconds.
- The offense gains 7 yards a play by default (you can change this in the app), and moves the chains without running out of downs.
- Field-goal range is the opponent's 35, a 52-yard try. When you need a field goal, one timeout is held back for the kick.
- A typical drive has half its plays stop the clock (incompletions or out of bounds).
- The advice says to stop the clock when the typical budget leaves less than one spare play. It spikes on 1st or 2nd down to save the last timeout, and never spikes on 4th down.

## Ideas for next features

- Make field-goal range and the other trailing assumptions adjustable in the app.
- Whether to take a safety or punt on 4th down.
- College and high-school rule sets.
- Fit the play outcomes and win probability to real NFL play-by-play data.
- Let you choose the tempo (hurry up or drain the clock) separately from the call.
