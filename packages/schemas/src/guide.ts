// The strategy guide's sections. Explainer reasons link to one, and the guide's URL can name one to
// jump to (#/guide?section=timeouts). An unknown section in a link falls back to the top of the guide.

import * as z from "zod/mini";

export const GUIDE_SECTIONS = [
  "win-probability",
  "play-model",
  "clock-rules",
  "two-minute-warning",
  "timeouts",
  "spike",
  "running-out-the-clock",
  "drive-budget",
  "field-goal-endgame",
  "prevent-defense",
  "red-zone",
  "hail-mary",
  "fourth-down",
  "two-point",
  "scoring-and-kickoffs",
  "limitations",
] as const;

export const guideSectionSchema = z.enum(GUIDE_SECTIONS);
export type GuideSection = z.infer<typeof guideSectionSchema>;

export const guideSearchSchema = z.object({
  /** The section to scroll to. Missing or unknown: the top of the guide. */
  section: z.catch(z.optional(guideSectionSchema), undefined),
});
export type GuideSearch = z.output<typeof guideSearchSchema>;
