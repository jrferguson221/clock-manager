// Form inputs: the ranges and formats each situation field accepts, with the messages the form shows.

import * as z from "zod/mini";

/** Inclusive range of each whole-number field. The form's inputs and the URL schemas both read these. */
export const LIMITS = {
  timeouts: { min: 0, max: 3 },
  toGo: { min: 1, max: 99 },
  yardLine: { min: 1, max: 50 },
  lead: { min: 1, max: 16 },
  trail: { min: 0, max: 16 },
  margin: { min: -16, max: 16 },
  yardsPerPlay: { min: 1, max: 30 },
  hurryUp: { min: 5, max: 40 },
  /** Scenarios: yards a sack loses. */
  sackYards: { min: 1, max: 20 },
  /** Scenarios: yards gained by the time the receiver can step out of bounds. */
  gain: { min: 0, max: 60 },
  /** Scenarios: extra yards for turning upfield instead. */
  extra: { min: 1, max: 30 },
  /** Scenarios: seconds from the snap to the end of the play. */
  seconds: { min: 2, max: 12 },
} as const satisfies Record<string, { readonly min: number; readonly max: number }>;
export type LimitedField = keyof typeof LIMITS;

/** A whole number within a field's range, with a message that says the range. */
export const rangeSchema = (field: LimitedField) => {
  const { min, max } = LIMITS[field];
  const error = `Enter a whole number from ${min} to ${max}`;
  return z.int({ error }).check(z.minimum(min, { error }), z.maximum(max, { error }));
};

export const CLOCK_HINT = "Enter the clock as M:SS, for example 2:05";

/** Game clock as typed and as kept in the URL: minutes, a colon and two digits of seconds. */
export const clockTextSchema = z.string().check(z.regex(/^\d{1,2}:[0-5]\d$/, { error: CLOCK_HINT }));

export const SIDES = ["own", "opp"] as const;
export const sideSchema = z.enum(SIDES);
export type Side = z.infer<typeof sideSchema>;

/** How the leading team runs out the clock: kneel downs or runs that stay in bounds. */
export const PLAY_TYPE_IDS = ["kneel", "run"] as const;
export const playTypeSchema = z.enum(PLAY_TYPE_IDS);
export type PlayType = z.infer<typeof playTypeSchema>;

/** The first error message for a value, or null when the schema accepts it. */
export function firstError(schema: z.ZodMiniType, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid value");
}
