# Clock Manager

A web app for end-of-game clock decisions in American football.

Both modes are a play-calling trainer. Enter the situation (clock, score, timeouts for both teams, down, distance and ball spot), then call each play: timeout, run, pass to the sideline, pass over the middle, deep pass, spike, kneel, field goal or punt. The app simulates the result and updates the situation. A win-probability meter shows your chances. After each call, it explains what the best call was, why, and the win probability for every option. When the drive ends, you can play out the rest of the game to see one way it could go. Once the game is over, a recap shows the final result and the call with the biggest win-probability swing, added or lost, and says whether the call itself was right or the result was luck. You can undo a call to try another.

The **Best call** tab is the informational version. Enter any situation where you have the ball, including the score from down 16 to up 16, and it shows the best call with the reason, your win probability with it, every option ranked, and which calls to avoid and why. It scores each option over 1,500 simulated games instead of 500, so its rankings are steadier than the trainer's.

The leading and trailing modes also have their own calculators:

- **Leading: run out the clock.** Whether you can kneel or run out the clock, the latest clock time it works from, and a play-by-play timeline.
- **Trailing: drive to score.** A rule-of-thumb next call (hurry up, timeout, spike, let the two-minute warning hit, or burn the clock and kick), and how many plays you need versus how many you have time for.

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
| `src/sim.ts` | Play simulator, win probability and the best-call explainer. Pure functions. |
| `src/Trainer.tsx` | The play-calling trainer UI shared by both modes. |
| `src/trailing.ts` | Trailing-team drive budget and next-call advice. Pure functions. |
| `src/time.ts` | Parses and formats `M:SS` clock strings. |
| `src/App.tsx` | The mode tabs. |
| `src/RunOutPanel.tsx`, `src/TrailingPanel.tsx`, `src/AdvisorPanel.tsx` | One UI panel per mode. |
| `src/fields.tsx` | Form inputs and the timeline table, shared by both panels. |
| `tests/` | Tests for both engines, plus tests that each mode renders. |

## Current assumptions

Both modes use NFL rules: a 40-second play clock and a two-minute warning, with no penalties and no 10-second runoffs.

**Win probability and best calls** (`src/sim.ts`). This is a simple Monte Carlo model, not one fitted to NFL play-by-play data.
- Each call has a fixed outcome distribution. Runs average about 4 yards and rarely go out of bounds. Sideline passes complete about half the time and usually go out of bounds. Passes over the middle complete about 60% of the time and gain a little more. Deep passes complete about 35% of the time for 20+ yards (about 32 on average), with more sacks and interceptions. Passes carry sack and interception risk, and runs a small fumble risk.
- Tempo is automatic. A team that's ahead drains the play clock. A team that only needs a field goal and is in range drains it too, but leaves time for a timeout or a rushed kick. Everyone else uses the hurry-up time (18 seconds by default). A timeout stops the clock right away.
- A defense that's behind calls timeout after in-bounds plays in the last 4 minutes, unless the two-minute warning is about to stop the clock for free.
- Field goals are good about 90% of the time from 35 yards and about 65% from 52, with 62 yards the longest try. Punts net 40 yards. Kickoffs are touchbacks to the 30, and a team that's still behind late tries an onside kick (12% recovered).
- After your call, both teams follow a rule-of-thumb policy for the rest of the game. It throws deep on the last play or two when a field goal won't do, and on 4th and 15 or longer. A tie at 0:00 is a coin flip in overtime.
- Each call is scored over 500 simulated games, so differences of a point or two are within the noise. The explainer calls those "close".

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
