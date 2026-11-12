// Beat the coverage: six NFL coverages, ten pass concepts, and a grade for each concept against each
// coverage. The grades are coaching rules, not fitted numbers: public play-by-play records the coverage on
// some plays but not the route concept, so there's nothing to fit them to. Each grade names the route that
// should come open and the defender it attacks, and the situation (down and distance, the red zone, the
// two-minute clock) can lower it.
//
// Coordinates are in yards: x across the field from the ball (negative is the offense's left, the field is
// 53.3 wide so the sidelines are at about ±26.7), y downfield from the line of scrimmage.

import type { Down } from "@situational-football/schemas";
import { seededRng } from "./sim";

export type Point = readonly [x: number, y: number];

// ---------------------------------------------------------------------------
// The offense: two formations, and ten concepts drawn from them.

export type ReceiverId = "X" | "H" | "Y" | "Z" | "RB";

/** Where each eligible receiver lines up. The QB is in the shotgun, 5 yards deep. */
export const FORMATIONS = {
  /** Two receivers on each side. */
  doubles: { X: [-21, 0], H: [-13, -1], Y: [13, -1], Z: [21, 0], RB: [2, -5] },
  /** Three receivers to the right, one to the left. */
  trips: { X: [-21, 0], H: [8, -1], Y: [14, -1], Z: [21, 0], RB: [-2, -5] },
} as const satisfies Record<string, Record<ReceiverId, Point>>;
export type FormationId = keyof typeof FORMATIONS;

export const QB: Point = [0, -5];
export const LINE: readonly Point[] = [[-4, 0], [-2, 0], [0, 0], [2, 0], [4, 0]];

export const CONCEPT_IDS = [
  "four-verts", "smash", "flood", "mesh", "drive", "y-cross", "dagger", "stick", "slant-flat", "curl-flat",
] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];

export interface Concept {
  name: string;
  formation: FormationId;
  /** What the concept does, in a line, for its card. */
  idea: string;
  /** Each receiver's route, from where he lines up. A receiver with no route stays in to block. */
  routes: Partial<Record<ReceiverId, readonly Point[]>>;
  /** Stretches the field deep, so the end line cramps it in the red zone. */
  vertical: boolean;
}

/** Points along a route, starting at the receiver's spot in the formation. */
const from = (f: FormationId, r: ReceiverId, ...pts: Point[]): Point[] => [FORMATIONS[f][r], ...pts];

export const CONCEPTS: Readonly<Record<ConceptId, Concept>> = {
  "four-verts": {
    name: "Four Verticals", formation: "doubles", vertical: true,
    idea: "Four receivers run deep: two outside, two up the seams. More deep routes than most coverages have deep defenders.",
    routes: {
      X: from("doubles", "X", [-21, 26]), H: from("doubles", "H", [-12, 8], [-9, 26]),
      Y: from("doubles", "Y", [12, 8], [9, 26]), Z: from("doubles", "Z", [21, 26]),
      RB: from("doubles", "RB", [5, -3], [7, 2]),
    },
  },
  smash: {
    name: "Smash", formation: "doubles", vertical: false,
    idea: "A hitch outside and a corner route over it: a high-low on the cornerback.",
    routes: {
      X: from("doubles", "X", [-21, 6], [-20, 5]), H: from("doubles", "H", [-13, 11], [-21, 19]),
      Y: from("doubles", "Y", [13, 11], [21, 19]), Z: from("doubles", "Z", [21, 6], [20, 5]),
      RB: from("doubles", "RB", [4, -2], [3, 3]),
    },
  },
  flood: {
    name: "Flood", formation: "trips", vertical: false,
    idea: "Three routes to one side at three depths (go, out at 12, flat): more receivers than that side has defenders.",
    routes: {
      Z: from("trips", "Z", [21, 26]), Y: from("trips", "Y", [14, 10], [22, 13]),
      H: from("trips", "H", [12, 2], [20, 3]), X: from("trips", "X", [-21, 12], [-12, 13]),
    },
  },
  mesh: {
    name: "Mesh", formation: "doubles", vertical: false,
    idea: "Two shallow crossers rub past each other at 5 and 6 yards, with clear-outs deep and the back to the flat.",
    routes: {
      H: from("doubles", "H", [-10, 5], [14, 5]), Y: from("doubles", "Y", [10, 6], [-14, 6]),
      X: from("doubles", "X", [-21, 24]), Z: from("doubles", "Z", [21, 24]),
      RB: from("doubles", "RB", [8, -3], [15, 1]),
    },
  },
  drive: {
    name: "Drive", formation: "doubles", vertical: false,
    idea: "A shallow cross at 3 yards with a dig at 12 over it: a high-low on the middle linebacker.",
    routes: {
      H: from("doubles", "H", [-10, 3], [15, 3]), Y: from("doubles", "Y", [13, 12], [-5, 12]),
      X: from("doubles", "X", [-21, 24]), Z: from("doubles", "Z", [21, 24]),
      RB: from("doubles", "RB", [4, -2], [5, 3]),
    },
  },
  "y-cross": {
    name: "Y-Cross", formation: "doubles", vertical: true,
    idea: "The slot runs a deep cross at 16 yards behind the linebackers, after a post clears the middle.",
    routes: {
      Y: from("doubles", "Y", [10, 8], [-17, 16]), X: from("doubles", "X", [-21, 12], [-12, 25]),
      Z: from("doubles", "Z", [21, 25]), H: from("doubles", "H", [-13, 6], [-14, 6]),
      RB: from("doubles", "RB", [7, -2], [12, 2]),
    },
  },
  dagger: {
    name: "Dagger", formation: "doubles", vertical: true,
    idea: "The slot runs up the seam to clear the middle, and the outside receiver runs a dig at 15 behind it.",
    routes: {
      Y: from("doubles", "Y", [12, 10], [11, 26]), Z: from("doubles", "Z", [21, 15], [6, 15]),
      H: from("doubles", "H", [-11, 5], [-9, 5]), X: from("doubles", "X", [-21, 22]),
      RB: from("doubles", "RB", [-4, -2], [-8, 2]),
    },
  },
  stick: {
    name: "Stick", formation: "trips", vertical: false,
    idea: "A stick route that sits at 5 yards, a flat route under it and a go to clear: quick, and a stretch on the flat defender.",
    routes: {
      Y: from("trips", "Y", [14, 5], [13, 5]), H: from("trips", "H", [13, 2], [20, 2]),
      Z: from("trips", "Z", [21, 25]), X: from("trips", "X", [-21, 2], [-15, 7]),
    },
  },
  "slant-flat": {
    name: "Slant-Flat", formation: "doubles", vertical: false,
    idea: "Slants outside and flat routes inside, on both sides: the quickest throws in the book.",
    routes: {
      X: from("doubles", "X", [-21, 2], [-14, 8]), H: from("doubles", "H", [-16, 2], [-23, 3]),
      Z: from("doubles", "Z", [21, 2], [14, 8]), Y: from("doubles", "Y", [16, 2], [23, 3]),
    },
  },
  "curl-flat": {
    name: "Curl-Flat", formation: "doubles", vertical: false,
    idea: "Curls at 12 outside and flat routes under them: a high-low on the flat defender.",
    routes: {
      X: from("doubles", "X", [-21, 12], [-19, 11]), H: from("doubles", "H", [-17, 2], [-24, 3]),
      Z: from("doubles", "Z", [21, 12], [19, 11]), Y: from("doubles", "Y", [17, 2], [24, 3]),
      RB: from("doubles", "RB", [3, -2], [2, 3]),
    },
  },
};

// ---------------------------------------------------------------------------
// The defense: a nickel package (2 cornerbacks, a nickel back, 2 safeties, 2 linebackers, 4 linemen).

export type DefenderId = "LC" | "RC" | "N" | "FS" | "SS" | "W" | "M" | "DL1" | "DL2" | "DL3" | "DL4";
export const DEFENDER_IDS: readonly DefenderId[] = ["LC", "RC", "N", "FS", "SS", "W", "M", "DL1", "DL2", "DL3", "DL4"];
export const DEFENDER_LABELS: Readonly<Record<DefenderId, string>> = {
  LC: "C", RC: "C", N: "N", FS: "S", SS: "S", W: "W", M: "M", DL1: "E", DL2: "T", DL3: "T", DL4: "E",
};

/** What a defender does after the snap: drop to a zone, cover a receiver, or rush. */
export type Assignment =
  | { kind: "zone"; label: string; at: Point; size: Point }
  | { kind: "man"; receiver: ReceiverId }
  | { kind: "rush" };

export const COVERAGE_IDS = ["cover-0", "cover-1", "tampa-2", "cover-3", "cover-4", "cover-6"] as const;
export type CoverageId = (typeof COVERAGE_IDS)[number];

export type Shell = "zero" | "single-high" | "two-high";

export interface Coverage {
  name: string;
  shell: Shell;
  /** How it works, for the reveal and the guide. */
  summary: string;
  /** The pre-snap tell, for the reveal and the guide. */
  tell: string;
  /** Where each defender lines up when the coverage isn't disguised. */
  look: Readonly<Record<DefenderId, Point>>;
  assignments: Readonly<Record<DefenderId, Assignment>>;
}

const LINEMEN = { DL1: [-5, 1.8], DL2: [-1.6, 1.8], DL3: [1.6, 1.8], DL4: [5, 1.8] } as const satisfies Record<string, Point>;
const RUSH = { DL1: { kind: "rush" }, DL2: { kind: "rush" }, DL3: { kind: "rush" }, DL4: { kind: "rush" } } as const;
const zone = (label: string, at: Point, size: Point): Assignment => ({ kind: "zone", label, at, size });
const man = (receiver: ReceiverId): Assignment => ({ kind: "man", receiver });

/** Coverage against the doubles formation; trips shifts the nickel and a safety toward the three receivers. */
export const COVERAGES: Readonly<Record<CoverageId, Coverage>> = {
  "cover-0": {
    name: "Cover 0", shell: "zero",
    summary: "All-out blitz: six rush, five play man-to-man, and no one is deep. The ball has to come out fast.",
    tell: "No safety deeper than about 8 yards, corners pressed on the receivers, and linebackers creeping to the line.",
    look: { LC: [-21, 1], RC: [21, 1], N: [13, 1.5], FS: [-12, 6], SS: [3, 6], W: [-3, 2], M: [2.5, 2.5], ...LINEMEN },
    assignments: { LC: man("X"), RC: man("Z"), N: man("Y"), FS: man("H"), SS: man("RB"), W: { kind: "rush" }, M: { kind: "rush" }, ...RUSH },
  },
  "cover-1": {
    name: "Cover 1", shell: "single-high",
    summary: "Man-to-man with one free safety deep in the middle and a robber sitting in the middle at 10 yards to jump crossing routes.",
    tell: "One safety deep in the middle, the other down near the box, and corners pressed on the receivers.",
    look: { LC: [-21, 1], RC: [21, 1], N: [13, 1.5], FS: [0, 14], SS: [-10, 6], W: [-4, 5], M: [3, 5], ...LINEMEN },
    assignments: {
      LC: man("X"), RC: man("Z"), N: man("Y"), SS: man("H"), M: man("RB"),
      FS: zone("Deep middle", [0, 20], [16, 10]), W: zone("Robber", [0, 10], [10, 5]), ...RUSH,
    },
  },
  "tampa-2": {
    name: "Tampa 2", shell: "two-high",
    summary: "Two safeties split the deep field in halves, the middle linebacker runs to the deep middle, and the corners sit in the flats.",
    tell: "Two safeties deep and wide, corners about 5 yards off with outside leverage, and the middle linebacker deeper than usual.",
    look: { LC: [-20, 5], RC: [20, 5], N: [12, 4], FS: [-12, 13], SS: [12, 13], W: [-8, 5], M: [0, 7], ...LINEMEN },
    assignments: {
      LC: zone("Flat", [-20, 4], [11, 7]), RC: zone("Flat", [20, 4], [11, 7]),
      FS: zone("Deep half", [-13, 22], [26, 10]), SS: zone("Deep half", [13, 22], [26, 10]),
      M: zone("Deep middle", [0, 15], [10, 7]), W: zone("Hook-curl", [-9, 9], [9, 7]), N: zone("Hook-curl", [9, 9], [9, 7]), ...RUSH,
    },
  },
  "cover-3": {
    name: "Cover 3", shell: "single-high",
    summary: "Three deep defenders (both corners and the free safety) split the deep field in thirds; four defenders cover underneath.",
    tell: "One safety deep in the middle, the other rolled down, and corners 7 to 8 yards off with outside leverage.",
    look: { LC: [-21, 8], RC: [21, 8], N: [12, 4], FS: [0, 14], SS: [-10, 7], W: [-4, 5], M: [3, 5], ...LINEMEN },
    assignments: {
      LC: zone("Deep third", [-18, 21], [17, 10]), RC: zone("Deep third", [18, 21], [17, 10]), FS: zone("Deep third", [0, 21], [17, 10]),
      SS: zone("Curl-flat", [-17, 7], [12, 8]), N: zone("Curl-flat", [17, 7], [12, 8]),
      W: zone("Hook", [-6, 8], [10, 7]), M: zone("Hook", [6, 8], [10, 7]), ...RUSH,
    },
  },
  "cover-4": {
    name: "Cover 4", shell: "two-high",
    summary: "Quarters: four deep defenders each take a quarter of the deep field, matching any vertical route. Only three cover underneath.",
    tell: "Two safeties at 10 to 12 yards, closer to the middle than in Cover 2, and corners 7 to 8 yards off with inside leverage.",
    look: { LC: [-20, 7], RC: [20, 7], N: [12, 4], FS: [-9, 11], SS: [9, 11], W: [-8, 5], M: [0, 5], ...LINEMEN },
    assignments: {
      LC: zone("Deep quarter", [-20, 20], [13, 10]), FS: zone("Deep quarter", [-7, 20], [13, 10]),
      SS: zone("Deep quarter", [7, 20], [13, 10]), RC: zone("Deep quarter", [20, 20], [13, 10]),
      W: zone("Curl-flat", [-14, 6], [12, 8]), M: zone("Hook", [0, 7], [12, 7]), N: zone("Curl-flat", [14, 6], [12, 8]), ...RUSH,
    },
  },
  "cover-6": {
    name: "Cover 6", shell: "two-high",
    summary: "Quarter-quarter-half: quarters on one side, Cover 2 on the other. Here the left plays quarters and the right plays Cover 2.",
    tell: "Two safeties deep, but the corners don't match: one 7 yards off (the quarters side), the other squatting at 5 (the Cover 2 side).",
    look: { LC: [-20, 7], RC: [20, 4], N: [12, 4], FS: [-9, 11], SS: [12, 13], W: [-8, 5], M: [0, 5], ...LINEMEN },
    assignments: {
      LC: zone("Deep quarter", [-20, 20], [13, 10]), FS: zone("Deep quarter", [-7, 20], [13, 10]),
      SS: zone("Deep half", [13, 21], [27, 10]), RC: zone("Flat", [20, 4], [11, 7]),
      W: zone("Curl-flat", [-14, 6], [12, 8]), M: zone("Hook", [-1, 7], [12, 7]), N: zone("Hook-curl", [9, 8], [10, 7]), ...RUSH,
    },
  },
};

/**
 * Disguises: a single-high coverage shown from a two-high look, with a safety spinning down at the snap.
 * The look is Cover 4's alignment, with the corners where the real coverage wants them.
 */
const SPUN: Partial<Record<CoverageId, { look: Readonly<Record<DefenderId, Point>>; note: string }>> = {
  "cover-3": {
    look: { ...COVERAGES["cover-4"].look, LC: [-21, 8], RC: [21, 8] },
    note: "They showed two safeties high, then spun at the snap: one safety rotated down to the curl-flat and the other ran to the deep middle. The corners' depth (7 to 8 yards, outside leverage) was the hint.",
  },
  "cover-1": {
    look: { ...COVERAGES["cover-4"].look, LC: [-21, 1], RC: [21, 1] },
    note: "They showed two safeties high, then one dropped down to cover the slot man-to-man. Pressed corners behind a two-high look often mean man coverage is coming.",
  },
};

// ---------------------------------------------------------------------------
// Grades: each concept against each coverage, before the situation.

export type Grade = 0 | 1 | 2 | 3;
export const GRADE_LABELS: Readonly<Record<Grade, string>> = { 3: "Best", 2: "Good", 1: "Risky", 0: "Bad" };

export interface Matchup {
  grade: Grade;
  /** The throw that should come open, e.g. "the corner route". */
  throw: string;
  /** About where it's caught, in yards past the line. */
  depth: number;
  /** Caught near the sideline, where the receiver can get out of bounds. */
  sideline: boolean;
  why: string;
}

const m = (grade: Grade, thr: string, depth: number, sideline: boolean, why: string): Matchup => ({ grade, throw: thr, depth, sideline, why });

export const MATCHUPS: Readonly<Record<ConceptId, Readonly<Record<CoverageId, Matchup>>>> = {
  "four-verts": {
    "cover-0": m(1, "a go route", 25, true, "No one is deep, so any vertical that beats its man is a touchdown, but four deep routes take longer than six rushers give you."),
    "cover-1": m(2, "the go route away from the free safety", 22, true, "Man coverage with one deep safety: he can only help on one side, so throw the vertical he isn't leaning toward."),
    "tampa-2": m(2, "the outside seam", 18, false, "The middle linebacker carries the inside seam, but the outside seams split the corner and the half-field safety."),
    "cover-3": m(3, "the seam away from the free safety", 20, false, "Four verticals against three deep defenders: the free safety can only take one seam, so throw the other."),
    "cover-4": m(0, "the check-down", 3, false, "Quarters is built for this: four deep defenders match four verticals, man for man. You're left throwing the check-down."),
    "cover-6": m(1, "the seam on the Cover 2 side", 18, false, "The quarters side matches the verticals; only the Cover 2 side has a seam between the half-field safety and the squatting corner."),
  },
  smash: {
    "cover-0": m(1, "the hitch", 6, true, "The hitch is quick enough against the blitz, but the corner route takes too long with six rushing."),
    "cover-1": m(1, "the corner route", 18, true, "Man coverage doesn't fall for a high-low, so the corner route has to beat its man, and that's a long throw with the free safety lurking."),
    "tampa-2": m(3, "the corner route", 18, true, "The textbook answer: the corner sits on the hitch in the flat, so the corner route settles behind him and in front of the half-field safety."),
    "cover-3": m(2, "the hitch", 6, true, "The corner bails to his deep third, which takes away the corner route but leaves the hitch open in front of him."),
    "cover-4": m(2, "the hitch", 6, true, "The safety carries the corner route, but the corner is 7 yards off, so the hitch is there underneath."),
    "cover-6": m(3, "the corner route to the Cover 2 side", 18, true, "On the Cover 2 side the corner squats on the hitch, so the corner route is open behind him, the same as against Tampa 2."),
  },
  flood: {
    "cover-0": m(0, "the flat", 3, true, "Three routes at three depths take time, and six rushers won't give it. Only the flat is quick enough."),
    "cover-1": m(1, "the out route", 12, true, "Against man, flooding a zone means nothing: every route has a defender on it, so the out has to win on its own."),
    "tampa-2": m(2, "the out route", 12, true, "The corner sits in the flat and the half-field safety stays deep, so the out at 12 lands in the hole between them."),
    "cover-3": m(3, "the out route", 12, true, "Three receivers against two defenders on that side: the curl-flat defender can't take both the out and the flat."),
    "cover-4": m(2, "the flat", 3, true, "The corner and safety carry the go and the out, so the flat route comes open against only one underneath defender."),
    "cover-6": m(2, "the out route", 12, true, "Flooded to the Cover 2 side, the out lands between the squatting corner and the half-field safety."),
  },
  mesh: {
    "cover-0": m(3, "a shallow crosser", 5, false, "The crossers rub their defenders off each other and there's no one underneath to help. The ball comes out fast."),
    "cover-1": m(3, "a shallow crosser", 5, false, "The classic man beater: the crossers run their defenders into each other and run away from them across the field."),
    "tampa-2": m(1, "the back in the flat", 3, true, "The linebackers drop into the crossers' path and the corners sit in the flats, so the throws underneath are crowded."),
    "cover-3": m(2, "a shallow crosser", 5, false, "The crossers settle in the gaps between the four underneath defenders."),
    "cover-4": m(3, "a shallow crosser", 5, false, "Quarters keeps four defenders deep and only three underneath, so the crossers have room to run."),
    "cover-6": m(2, "a shallow crosser", 5, false, "Only three underneath defenders, but the Cover 2 side's squatting corner takes away the end of the crossers' run."),
  },
  drive: {
    "cover-0": m(2, "the shallow cross", 3, false, "The shallow cross is quick and runs away from its man, but the dig is too slow against six rushers."),
    "cover-1": m(3, "the shallow cross", 4, false, "The shallow cross runs away from its defender, and the dig at 12 keeps the robber honest."),
    "tampa-2": m(1, "the shallow cross", 3, false, "The middle linebacker runs right through the dig's landing spot, so all that's left is the shallow cross underneath."),
    "cover-3": m(2, "the dig", 12, false, "A high-low on the hook defender: if he comes up for the shallow cross, the dig opens behind him."),
    "cover-4": m(1, "the shallow cross", 3, false, "Quarters safeties drive down on in-breaking routes like the dig, so the high-low is two-against-one the wrong way."),
    "cover-6": m(1, "the shallow cross", 3, false, "The quarters-side safety robs the dig and the hook defender sits on the cross."),
  },
  "y-cross": {
    "cover-0": m(0, "the check-down", 3, false, "A 16-yard crosser takes far too long against an all-out blitz."),
    "cover-1": m(2, "the crosser", 16, true, "The crosser runs away from his man across the field, and the post holds the free safety in the middle."),
    "tampa-2": m(1, "the crosser", 16, true, "The middle linebacker drops into the crosser's path. It can come open past him, but it's a tight window."),
    "cover-3": m(3, "the crosser", 16, true, "The post holds the free safety, and the crosser runs behind the hook defenders into the space in front of the far corner."),
    "cover-4": m(3, "the crosser", 16, true, "Quarters defenders key the receivers on their own side, so a crosser coming from the other side has no one waiting for him."),
    "cover-6": m(2, "the crosser", 16, true, "The crosser runs into the quarters side behind the linebackers, though the hook defender can wall it off."),
  },
  dagger: {
    "cover-0": m(1, "the seam", 20, false, "The seam can beat its man for a big play with no safety deep, but the dig behind it is too slow against six rushers."),
    "cover-1": m(2, "the dig", 15, false, "The dig breaks away from its defender, and the seam pulls the free safety, but the robber can sit on it."),
    "tampa-2": m(2, "the dig", 15, false, "The seam pulls the middle linebacker deep, which opens the dig behind the outside linebacker."),
    "cover-3": m(2, "the dig", 15, false, "The seam holds the free safety and pulls the hook defender, so the dig opens behind him in the middle."),
    "cover-4": m(1, "the dig", 15, false, "The quarters safety reads the seam, and the corner sits on the dig. Both routes are covered."),
    "cover-6": m(2, "the dig", 15, false, "To the Cover 2 side, the seam splits the safety and the dig opens under it; to the quarters side, it's covered."),
  },
  stick: {
    "cover-0": m(2, "the stick route", 5, false, "Quick, and the stick route can break either way against its man."),
    "cover-1": m(1, "the stick route", 5, false, "Against man, the stick route has to beat its defender, and the robber sits right where it settles."),
    "tampa-2": m(2, "the flat", 2, true, "Five underneath defenders crowd the stick route, but the flat route stretches the squatting corner."),
    "cover-3": m(2, "the stick route", 5, false, "The curl-flat defender has to choose between the stick route and the flat, and either throw is open."),
    "cover-4": m(2, "the stick route", 5, false, "Only three underneath defenders, so the stick route settles in space."),
    "cover-6": m(2, "the stick route", 5, false, "The stick route sits in the gap between the underneath defenders."),
  },
  "slant-flat": {
    "cover-0": m(3, "the slant", 6, false, "The fastest throw there is, and the slant beats press coverage inside with no one to help."),
    "cover-1": m(2, "the slant", 6, false, "The slant beats its man inside, but the robber in the middle is waiting for it."),
    "tampa-2": m(1, "the flat", 3, true, "The corners sit in the flats and the linebackers drop under the slants. Little is open."),
    "cover-3": m(2, "the slant", 6, false, "The corners bail deep, so the slant has room, and the flat stretches the curl-flat defender."),
    "cover-4": m(2, "the slant", 6, false, "The corners play off with inside leverage, but the slant gets inside the curl-flat defender."),
    "cover-6": m(2, "the slant to the quarters side", 6, false, "On the quarters side the corner is off, so the slant has room."),
  },
  "curl-flat": {
    "cover-0": m(1, "the flat", 3, true, "A 12-yard curl takes too long against six rushers. Only the flat comes out in time."),
    "cover-1": m(1, "the curl", 11, false, "Against man, the curl has to beat its defender with no high-low to help."),
    "tampa-2": m(2, "the curl", 11, false, "The corner sits in the flat, so the curl settles behind him in front of the half-field safety."),
    "cover-3": m(2, "the curl", 11, false, "A high-low on the curl-flat defender: if he widens with the flat, throw the curl behind him."),
    "cover-4": m(2, "the flat", 3, true, "The corners and safeties sit on the curls, so the flat is open under them."),
    "cover-6": m(2, "the curl to the Cover 2 side", 11, false, "On the Cover 2 side the corner sits in the flat, so the curl opens behind him."),
  },
};

// ---------------------------------------------------------------------------
// Reps: a situation, a coverage, and the look the defense shows.

export interface RepSituation {
  down: Down;
  toGo: number;
  /** Yards from the defense's goal line. */
  ytg: number;
  /** Game clock in the 4th quarter, seconds. */
  clock: number;
  running: boolean;
  /** Your points minus theirs. */
  margin: number;
  timeouts: number;
  oppTimeouts: number;
}

export interface Rep {
  situation: RepSituation;
  coverage: CoverageId;
  /** Where the defenders line up before the snap. */
  look: Readonly<Record<DefenderId, Point>>;
  /** The coverage the look suggests, when the defense disguised it. */
  shown: CoverageId | null;
  /** What the disguise was, when there was one. */
  disguise: string | null;
}

/** How often each coverage is called, roughly in line with NFL usage, and how that shifts with the situation. */
function coverageWeights(s: RepSituation): Record<CoverageId, number> {
  const w: Record<CoverageId, number> = { "cover-0": 4, "cover-1": 22, "tampa-2": 10, "cover-3": 30, "cover-4": 18, "cover-6": 16 };
  if (s.ytg <= 20) { w["cover-0"] += 6; w["cover-1"] += 10; w["cover-4"] -= 6; }
  if (s.down >= 3 && s.toGo >= 8) { w["cover-4"] += 8; w["cover-6"] += 6; w["tampa-2"] += 6; w["cover-0"] -= 2; }
  if (s.down >= 3 && s.toGo <= 3) { w["cover-0"] += 6; w["cover-1"] += 8; }
  return w;
}

function pick<T extends string>(weights: Record<T, number>, r: number): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, n]) => sum + Math.max(0, n), 0);
  let x = r * total;
  for (const [k, n] of entries) {
    x -= Math.max(0, n);
    if (x < 0) return k;
  }
  return entries[entries.length - 1]![0];
}

/** The first rep, with nothing in the URL: a plain, undisguised Cover 3 on 1st & 10. */
export const FIRST_REP = 12;

/** Share of single-high coverages shown from a two-high look. */
export const DISGUISE_RATE = 0.3;

/** The rep for a seed: the same seed always gives the same rep, so a link to one is shareable. */
export function makeRep(seed: number): Rep {
  const rng = seededRng(Math.imul(seed, 2654435761) >>> 0);
  const d = Number(pick({ "1": 30, "2": 30, "3": 35, "4": 5 }, rng())) as Down;
  const toGo = d === 1 ? (rng() < 0.15 ? 1 + Math.floor(rng() * 5) : 10) : 1 + Math.floor(rng() * 12);
  const ytg = Math.max(toGo, 5 + Math.floor(rng() * 70));
  const late = rng() < 0.35;
  const situation: RepSituation = late
    ? { down: d, toGo: Math.min(toGo, ytg), ytg, clock: 15 + Math.floor(rng() * 106), running: rng() < 0.6, margin: -(1 + Math.floor(rng() * 8)),
        timeouts: Math.floor(rng() * 3), oppTimeouts: Math.floor(rng() * 4) }
    : { down: d, toGo: Math.min(toGo, ytg), ytg, clock: 150 + Math.floor(rng() * 600), running: rng() < 0.7, margin: Math.floor(rng() * 21) - 10,
        timeouts: 1 + Math.floor(rng() * 3), oppTimeouts: 1 + Math.floor(rng() * 3) };
  const coverage = pick(coverageWeights(situation), rng());
  const spin = SPUN[coverage];
  if (spin !== undefined && rng() < DISGUISE_RATE) {
    return { situation, coverage, look: spin.look, shown: "cover-4", disguise: spin.note };
  }
  return { situation, coverage, look: COVERAGES[coverage].look, shown: null, disguise: null };
}

// ---------------------------------------------------------------------------
// Grading a call in a situation.

export interface Graded {
  concept: ConceptId;
  /** Against the coverage alone. */
  base: Matchup;
  /** After the situation. */
  grade: Grade;
  /** Why the situation lowered the grade, if it did. */
  notes: string[];
}

/** Inside this many yards, the end line cramps routes that stretch the field deep. */
export const RED_ZONE_YTG = 20;
/** Two-minute territory: under this many seconds, a catch in bounds costs time you may not have. */
export const TWO_MINUTE = 120;

export function gradeConcept(concept: ConceptId, coverage: CoverageId, s: RepSituation): Graded {
  const base = MATCHUPS[concept][coverage];
  const notes: string[] = [];
  const reach = Math.min(base.depth, s.ytg);
  if (s.down >= 3 && reach < s.toGo) {
    notes.push(`The open throw, ${base.throw}, is caught about ${base.depth} yards downfield, short of the ${s.toGo} you need on ${s.down === 3 ? "3rd" : "4th"} down.`);
  }
  if (s.down >= 3 && s.toGo <= 2 && base.depth >= 15) {
    notes.push(`A throw ${base.depth} yards downfield takes a long time to develop when you only need ${s.toGo}.`);
  }
  if (s.ytg <= RED_ZONE_YTG && CONCEPTS[concept].vertical) {
    notes.push(`From ${s.ytg} yards out, the end line cramps the deep routes this concept needs, and the defenders have less ground to cover.`);
  }
  if (s.margin <= 0 && s.clock <= TWO_MINUTE && s.timeouts === 0 && !base.sideline) {
    notes.push("With no timeouts left, a catch in the middle of the field keeps the clock running.");
  }
  const grade = Math.max(0, base.grade - notes.length) as Grade;
  return { concept, base, grade, notes };
}

/** Every concept, graded and sorted from the best to the worst for this coverage and situation. */
export function gradeAll(coverage: CoverageId, s: RepSituation): Graded[] {
  return CONCEPT_IDS.map((c) => gradeConcept(c, coverage, s))
    .sort((a, b) => b.grade - a.grade || b.base.grade - a.base.grade || CONCEPT_IDS.indexOf(a.concept) - CONCEPT_IDS.indexOf(b.concept));
}
