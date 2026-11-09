// Decisions of the week: real late-game decisions from NFL play-by-play, scored by the app's model.
// The data script writes one file per week; the site fetches and validates it with these schemas.

import * as z from "zod/mini";
import { downSchema, playCallSchema, timeoutsSchema } from "./game";
import { guideSectionSchema } from "./guide";

const probability = z.number().check(z.minimum(0), z.maximum(1));

/** The offense's situation when the decision was made, in the model's terms. */
export const decisionSituationSchema = z.object({
  /** Seconds left in the game. */
  clock: z.number().check(z.minimum(0)),
  /** Whether the clock was running: worked out from the play before. */
  running: z.boolean(),
  down: downSchema,
  toGo: z.int().check(z.minimum(1)),
  /** Yards from the opponent's goal line. */
  ytg: z.int().check(z.minimum(1), z.maximum(99)),
  /** Offense's points minus the defense's. */
  margin: z.int(),
  timeouts: timeoutsSchema,
  oppTimeouts: timeoutsSchema,
});
export type DecisionSituation = z.infer<typeof decisionSituationSchema>;

/** What a call led to across the model's simulated games: how the drive ended, and what came after. */
export const callOutcomesSchema = z.object({
  /** The offense's win probability with the call. */
  wp: probability,
  /** How the offense's drive ended, most common first: e.g. "Field goal" 0.82. */
  drive: z.array(z.object({ result: z.string(), share: probability })),
  /** Share of games in which the other team got the ball back before the end. */
  theyGetBall: probability,
  /** Average game clock, in seconds, when they got it (null if they never did). */
  clockWhenTheyGetBall: z.nullable(z.number().check(z.minimum(0))),
  /** Share of games in which they scored on that possession. */
  theyScore: probability,
  /** Share of games in which the offense kept the ball after the call's play (a conversion, on 4th down). */
  keep: probability,
  /** Where they took over after a punt, miss or turnover, on average: yards from their own goal line (null if never). */
  theirStart: z.nullable(z.number()),
  /** Share of games in which the offense got the ball back after their possession, and the average clock then. */
  backAgain: probability,
  clockBackAgain: z.nullable(z.number().check(z.minimum(0))),
});
export type CallOutcomes = z.infer<typeof callOutcomesSchema>;

const scoreAfter = { home: z.int().check(z.minimum(0)), away: z.int().check(z.minimum(0)) };

/** What actually happened after a decision, from the play-by-play: a few plain sentences, and the final score. */
export const aftermathSchema = z.object({
  story: z.array(z.string()),
  final: z.object({ ...scoreAfter, overtime: z.boolean() }),
});
export type Aftermath = z.infer<typeof aftermathSchema>;

export const decisionSchema = z.object({
  /** Stable id: game id and play id. */
  id: z.string(),
  gameId: z.string(),
  /** Team abbreviations, as in the data. */
  offense: z.string(),
  defense: z.string(),
  home: z.string(),
  away: z.string(),
  /** Game date, YYYY-MM-DD. */
  date: z.string(),
  /** The situation when the call was made: the end of the play before, if the clock was running. */
  situation: decisionSituationSchema,
  /** Game clock at the snap (or at the timeout). */
  snapClock: z.number().check(z.minimum(0)),
  /** The play-by-play description of what happened. */
  description: z.string(),
  /** What the offense did, as one of the model's calls. */
  call: playCallSchema,
  /** The offense's win probability with its call, by the model. */
  wpCall: probability,
  best: playCallSchema,
  wpBest: probability,
  /** Win-probability points the call cost against the best one (wpBest - wpCall). */
  cost: z.number(),
  /** Every option the model scored, best first. */
  values: z.array(z.object({ call: playCallSchema, wp: probability })),
  /** Why the best call was best, with the guide section behind it. */
  reason: z.object({ text: z.string(), section: guideSectionSchema }),
  /** Why their call was worse than the best one, when the model has a specific reason. */
  against: z.nullable(z.object({ text: z.string(), section: guideSectionSchema })),
  /** What happened after the call, for the longer result. Null when the play-by-play can't place it. */
  aftermath: z.nullable(aftermathSchema),
  /** Their call and the best call, played out: for the longer explanation. Null when they're the same. */
  detail: z.nullable(z.object({ their: callOutcomesSchema, best: callOutcomesSchema })),
  /** For a timeout with the clock running: about how many seconds were left on the play clock. */
  playClockLeft: z.nullable(z.int().check(z.minimum(1), z.maximum(40))),
  /** The actual score before the play: the offense's points and the defense's. */
  score: z.nullable(z.object({ offense: z.int().check(z.minimum(0)), defense: z.int().check(z.minimum(0)) })),
  /** nflverse's win probability for the offense before the play, for comparison. */
  nflverseWp: z.nullable(probability),
  /** nflverse's win probability added by the play: what actually happened. */
  nflverseWpa: z.nullable(z.number()),
  /** The two models disagree a lot about this situation, so the verdict is less certain. */
  lowConfidence: z.boolean(),
});
export type Decision = z.infer<typeof decisionSchema>;

export const decisionWeekSchema = z.object({
  season: z.int(),
  week: z.int().check(z.minimum(1)),
  /** When the file was generated, ISO 8601. */
  generatedAt: z.string(),
  /** Credit for the play-by-play data. */
  source: z.string(),
  games: z.int(),
  /** Decisions scored: the offense's calls in the final 5:00 of one-score games. */
  evaluated: z.int(),
  /** How closely the app's model agrees with nflverse's win probability on those decisions. */
  agreement: z.object({
    plays: z.int(),
    /** Mean absolute difference, in probability (0.05 = 5 points). */
    meanAbsDiff: z.number(),
    /** Share of plays where the two are within 10 points. */
    within10: z.number(),
  }),
  /** The costliest calls, worst first. Low-confidence decisions are left out. */
  worst: z.array(decisionSchema),
  /** The plays that swung win probability most, by nflverse's numbers. */
  notable: z.array(decisionSchema),
});
export type DecisionWeek = z.infer<typeof decisionWeekSchema>;

export const decisionIndexSchema = z.object({
  season: z.int(),
  generatedAt: z.string(),
  weeks: z.array(z.object({ week: z.int(), worst: z.int() })),
});
export type DecisionIndex = z.infer<typeof decisionIndexSchema>;

/** The decisions page's URL: a week to show. Missing or invalid: the latest week available. */
export const decisionsSearchSchema = z.object({
  week: z.catch(z.optional(z.int().check(z.minimum(1), z.maximum(22))), undefined),
});
export type DecisionsSearch = z.output<typeof decisionsSearchSchema>;
