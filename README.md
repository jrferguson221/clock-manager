# Clock Manager

A web app for end-of-game clock decisions in American football.

Both modes are a play-calling trainer. Enter the situation (clock, score, timeouts for both teams, down, distance and ball spot), then call each play: timeout, run, pass to the sideline, pass over the middle, deep pass, spike, kneel, field goal or punt. The app simulates the result and updates the situation. A win-probability meter shows your chances. After each call, it explains what the best call was, why, and the win probability for every option. When the drive ends, you can play out the rest of the game to see one way it could go. Once the game is over, a recap shows the final result and the call with the biggest win-probability swing, added or lost, and says whether the call itself was right or the result was luck. You can undo a call to try another.

The **Best call** tab is the informational version. Enter any situation where you have the ball, including the score from down 16 to up 16, and it shows the best call with the reason, your win probability with it, every option ranked, and which calls to avoid and why. It scores each option over 1,500 simulated games instead of 500, so its rankings are steadier than the trainer's.

The **Player decisions** tab (`#/scenarios`) compares choices made in the middle of a play, or right before it:

- **QB:** throw it away or take the sack; on a scramble, slide in bounds or get out of bounds.
- **WR:** get out of bounds or turn upfield.
- **RB:** score, or go down at the 1 to keep the ball and the clock; with the lead, stay in bounds or fight for extra yards out of bounds.
- **Coach:** kneel, or run it. The run's result is left to chance, since the decision comes before the snap.

Each option fixes how the play ends, and the rest of the game is simulated 3,000 times, on the same random numbers for both options. The page gives a verdict with the reason, each option's win probability and the situation after the play. A "Where the answer flips" table shows the same choice at other clock times, and a note gives the exact clock at which the answer changes, e.g. "With 0:19 or less left, get out of bounds instead". Each scenario starts from a preset situation, and every input is in the URL.

The **Decisions of the week** tab (`#/decisions`) shows the costliest late-game calls of each NFL week. It covers every offensive decision in the final 5:00 of one-score games: play calls, kicks and timeouts. Each is scored against every option the offense had, and calls that cost 6 points of win probability or more make the list. There's also a list of the plays that swung win probability most. Calls are judged by the odds at the time, not by how they turned out.

- **Data:** NFL play-by-play from [nflverse](https://github.com/nflverse/nflverse-data) (CC-BY 4.0), plus play-action and screen charting by FTN Data via nflverse (CC-BY-SA 4.0). The generated files in `public/data/decisions/` are therefore CC-BY-SA 4.0; see the README there.
- **Fairness rules:**
  - **Passes:** all passes are judged as one decision, "throw it", credited with the best kind of pass, since the target and play design depend on things the data can't show.
  - **Running clock:** when the clock was running, a call is judged from the end of the play before, so each option pays its own time to the snap.
  - **Disagreement:** every situation is compared with nflverse's independent win-probability model. Where the two disagree by more than 15 points, the decision stays off the list.
- **Team colors:** each card has the offense's color as a stripe, and both teams' abbreviations on their own colors. The colors are from nflverse's teams table (`src/teamColors.ts`); no logos are used. `src/teamPalette.ts` uses a team's color only where it passes WCAG contrast on the card in each color scheme: 3:1 for the stripe and chip, and 4.5:1 for the chip's text. It falls back to the same hue lightened or darkened, or to the team's other colors. Tests check every team in both schemes.
- **Updates:** `scripts/decisions/build.ts` builds the files: `bun scripts/decisions/build.ts --season 2026`. The *Update weekly decisions* GitHub Action runs it every Tuesday at 13:17 UTC, after Monday night's game. It runs the tests against the new data, commits it, and the site redeploys.

The **Strategy guide** tab (`#/guide`) explains the late-game clock rules and strategy (timeouts, spikes, the two-minute warning, running out the clock, playing for a field goal, prevent defense, the red zone, Hail Marys, fourth down, extra points and onside kicks), how the app works out win probability, and what the model leaves out. Every reason the explainer and Best call give ends with a **Read more** link to the guide section behind it, e.g. `#/guide?section=timeouts`. The guide's tables and numbers are computed from the model when the page loads, so they always match it. It's a separate download, fetched only when the guide is opened.

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
| `src/scenarios.ts` | The player-decision scenarios: their options, verdicts and flip points. Pure functions. |
| `src/ScenarioPanel.tsx` | The Player decisions page. |
| `src/DecisionsPanel.tsx`, `src/decisionsData.ts` | The Decisions of the week page, and where its data is fetched from (validated with the schemas package). |
| `src/teamColors.ts`, `src/teamPalette.ts` | Team colors from nflverse, and the contrast rules that make them readable in both color schemes. |
| `scripts/decisions/` | The data pipeline: CSV reading, turning play-by-play into decisions, and scoring them. |
| `public/data/decisions/` | The generated weekly files (CC-BY-SA 4.0). |
| `src/Guide.tsx` | The strategy guide page. Its tables are computed from `src/sim.ts` and `src/engine.ts`. |
| `src/ReadMore.tsx` | Typed links into the guide (a Mantine `Anchor` wrapped with TanStack Router's `createLink`). |
| `src/trailing.ts` | Trailing-team drive budget and next-call advice. Pure functions. |
| `src/time.ts` | Parses and formats `M:SS` clock strings. |
| `src/router.tsx` | The routes, one per mode, with their search-param schemas. Uses hash history, so deep links work on GitHub Pages. |
| `src/App.tsx`, `src/Layout.tsx` | Mantine and router providers; the header, mode tabs and color-scheme toggle. |
| `src/theme.ts`, `src/styles.css` | The "Sideline" Mantine theme (pylon orange, turf green, night navy, Barlow fonts), and the CSS the theme can't express. `src/mantine-styles.ts` imports Mantine's styles for just the components used. |
| `src/RunOutPanel.tsx`, `src/TrailingPanel.tsx`, `src/AdvisorPanel.tsx` | One UI panel per mode. |
| `src/SituationForm.tsx`, `src/fields.tsx` | The situation form all modes share, its inputs, and the timeline table. |
| `packages/schemas` | `@clock-manager/schemas`, a Bun workspace package: Zod schemas for the game state, URL search params (including the guide's section names) and form fields, and the types inferred from them. The engines take their `GameState`, `Down` and `PlayCall` types from it. |
| `tests/` | Tests for the engines and the simulator. `tests/app/` renders each route (one file per mode). `packages/schemas/tests/` tests the schemas. |

The repo is a Bun workspace: `bun install` at the root links `packages/schemas`, and `bun run test` runs every package's tests.

## Current assumptions

Both modes use NFL rules: a 40-second play clock and a two-minute warning, with no penalties and no 10-second runoffs.

**Win probability and best calls** (`src/sim.ts`). This is a simple Monte Carlo model, not one fitted to NFL play-by-play data.
- Each call has a fixed outcome distribution. Runs average about 4 yards and rarely go out of bounds. Sideline passes complete about half the time and usually go out of bounds. Passes over the middle complete about 60% of the time and gain a little more. Deep passes complete about 35% of the time for 20+ yards (about 32 on average), with more sacks and interceptions.
- A defense that's ahead in the last 4 minutes plays prevent, with safeties deep and fewer rushers. Deep passes then complete about 20% of the time and are intercepted about 8% of the time. Middle and sideline throws complete more often (68% and 55%) but are tackled sooner. There are fewer sacks, and runs average about 4.3 yards. A defense that's behind doesn't play prevent.
- Field position matters. Inside the opponent's 20 the field is compressed. Pass completion rates shrink, to about 60% of normal at the 1. A "deep" pass becomes a throw into the end zone, complete about 25% of the time from the 20 and less closer in, and defenses don't play prevent. Inside the 5 the defense packs the line: runs average under 2 yards with no breakaways and score about 58% of the time from the 1, 34% from the 3 and 14% from the 5. Runs blend back to their open-field shape by the 12.
- A deep pass on the last play (10 seconds or less, within 60 yards) is an end-zone heave. It scores about 20% of the time from 25 yards, 10% from 45 and 4% from 60, and is intercepted about 12% of the time. Passes carry sack and interception risk, and runs a small fumble risk.
- Tempo is automatic. A team that's ahead drains the play clock. A team that only needs a field goal and is in range drains it too, but leaves time for a timeout or a rushed kick. Everyone else uses the hurry-up time (18 seconds by default). A timeout stops the clock right away.
- A defense that's behind calls timeout after in-bounds plays in the last 4 minutes, unless the two-minute warning is about to stop the clock for free.
- Field goals are good about 90% of the time from 35 yards and about 65% from 52, with 62 yards the longest try. Punts net 40 yards. Kickoffs are touchbacks to the 30, and a team that's still behind late tries an onside kick (12% recovered).
- Play-action passes complete about 60% of the time for about 13 yards, and screens about 80% for about 5, though screens can lose yards. Against prevent, play-action completes less and screens more. On 3rd or 4th and short, defenses load the box: runs convert about two times in three on 1 yard to go, three in five on 2, and half the time on 3.
- After your call, both teams follow a rule-of-thumb policy for the rest of the game. With time for only one more play, a team that needs just a field goal stops the clock if it must (a timeout, else a spike) and kicks from within 42 yards of the goal line (a 59-yarder at most). It throws deep on the last play or two when a field goal won't do, and on 4th and 15 or longer. A tie at 0:00 is a coin flip in overtime.
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
