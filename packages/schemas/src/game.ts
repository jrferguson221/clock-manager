// The simulator's game state. The app's engines use these inferred types rather than declaring their own.
//
// The package uses Zod Mini: the same schemas and inferred types as classic Zod, but with functions in
// place of methods, so the bundle only carries the checks it uses (about a quarter of classic Zod's size here).

import * as z from "zod/mini";

export const TEAMS = ["you", "opp"] as const;
export const teamSchema = z.enum(TEAMS);
export type Team = z.infer<typeof teamSchema>;

export const DOWNS = [1, 2, 3, 4] as const;
export const downSchema = z.literal(DOWNS);
export type Down = z.infer<typeof downSchema>;

export const PLAY_CALL_IDS = [
  "timeout", "run", "pass-screen", "pass-sideline", "pass-middle", "pass-play-action", "pass-deep", "spike", "kneel", "fg", "punt",
] as const;
export const playCallSchema = z.enum(PLAY_CALL_IDS);
export type PlayCall = z.infer<typeof playCallSchema>;

/** A team's timeouts in a half: 0 to 3. */
export const timeoutsSchema = z.int().check(z.minimum(0), z.maximum(3));

export const gameStateSchema = z.object({
  /** Seconds left in the game. */
  clock: z.number().check(z.minimum(0)),
  running: z.boolean(),
  /** The team with the ball. */
  poss: teamSchema,
  down: downSchema,
  toGo: z.int().check(z.minimum(0)),
  /** Yards from the ball to the goal line the team with the ball is attacking. */
  ytg: z.int().check(z.minimum(0), z.maximum(100)),
  /** Your points minus the opponent's. */
  margin: z.int(),
  timeouts: z.object({ you: timeoutsSchema, opp: timeoutsSchema }),
  over: z.boolean(),
});
export type GameState = z.infer<typeof gameStateSchema>;
