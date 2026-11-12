import { describe, expect, it } from "bun:test";
import {
  CONCEPT_IDS, CONCEPTS, COVERAGE_IDS, COVERAGES, DEFENDER_IDS, FIRST_REP, FORMATIONS, MATCHUPS,
  gradeAll, gradeConcept, makeRep, type RepSituation,
} from "../src/coverage";

const midfield: RepSituation = { down: 1, toGo: 10, ytg: 50, clock: 600, running: true, margin: 0, timeouts: 3, oppTimeouts: 3 };

describe("the grades", () => {
  it("grade every concept against every coverage, and every coverage has a best answer that stands out", () => {
    for (const c of COVERAGE_IDS) {
      const grades = CONCEPT_IDS.map((k) => MATCHUPS[k][c].grade);
      expect(grades).toContain(3);
      expect(grades.filter((g) => g === 3).length).toBeLessThanOrEqual(3);
      expect(Math.min(...grades)).toBeLessThan(3);
    }
  });

  it("follow the textbook beaters", () => {
    expect(MATCHUPS.smash["tampa-2"].grade).toBe(3);
    expect(MATCHUPS["four-verts"]["cover-3"].grade).toBe(3);
    expect(MATCHUPS["four-verts"]["cover-4"].grade).toBe(0);
    expect(MATCHUPS.mesh["cover-1"].grade).toBe(3);
    expect(MATCHUPS.flood["cover-3"].grade).toBe(3);
    expect(MATCHUPS["y-cross"]["cover-0"].grade).toBe(0);
  });

  it("aren't changed by a neutral situation", () => {
    for (const c of COVERAGE_IDS) for (const k of CONCEPT_IDS) {
      expect(gradeConcept(k, c, midfield).grade).toBe(MATCHUPS[k][c].grade);
    }
  });
});

describe("the situation", () => {
  it("marks down a throw short of the sticks on 3rd down", () => {
    // Stick's open throw against Cover 3 is caught at 5 yards: fine on 1st down, short on 3rd & 8.
    const g = gradeConcept("stick", "cover-3", { ...midfield, down: 3, toGo: 8 });
    expect(g.grade).toBe(1);
    expect(g.notes[0]).toContain("short of the 8 you need on 3rd down");
  });

  it("marks down a slow, deep throw when you need a yard or two", () => {
    expect(gradeConcept("y-cross", "cover-3", { ...midfield, down: 3, toGo: 1 }).grade).toBe(2);
  });

  it("marks down vertical concepts in the red zone", () => {
    const g = gradeConcept("four-verts", "cover-3", { ...midfield, ytg: 15 });
    expect(g.grade).toBe(2);
    expect(gradeConcept("smash", "tampa-2", { ...midfield, ytg: 15 }).grade).toBe(3);
  });

  it("marks down a catch in the middle late with no timeouts, but not one at the sideline", () => {
    const late = { ...midfield, clock: 60, margin: -3, timeouts: 0 };
    expect(gradeConcept("mesh", "cover-1", late).grade).toBe(2);
    expect(gradeConcept("smash", "tampa-2", late).grade).toBe(3);
    // With a timeout left, the middle is fine.
    expect(gradeConcept("mesh", "cover-1", { ...late, timeouts: 1 }).grade).toBe(3);
  });

  it("sorts every concept from the best call down", () => {
    const all = gradeAll("cover-3", midfield);
    expect(all).toHaveLength(CONCEPT_IDS.length);
    for (let i = 1; i < all.length; i++) expect(all[i - 1]!.grade).toBeGreaterThanOrEqual(all[i]!.grade);
  });
});

describe("reps", () => {
  it("are the same for the same seed, so a link to one can be shared", () => {
    expect(makeRep(42)).toEqual(makeRep(42));
  });

  it("are always a legal situation", () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const { situation: s, look } = makeRep(seed);
      expect(s.toGo).toBeGreaterThanOrEqual(1);
      expect(s.toGo).toBeLessThanOrEqual(s.ytg);
      expect(s.ytg).toBeLessThanOrEqual(99);
      expect(s.timeouts).toBeLessThanOrEqual(3);
      expect(Object.keys(look).sort()).toEqual([...DEFENDER_IDS].sort());
    }
  });

  it("call every coverage, and disguise some single-high ones as two-high", () => {
    const reps = Array.from({ length: 3000 }, (_, i) => makeRep(i + 1));
    for (const c of COVERAGE_IDS) expect(reps.some((r) => r.coverage === c)).toBe(true);
    const disguised = reps.filter((r) => r.shown !== null);
    expect(disguised.length).toBeGreaterThan(100);
    for (const r of disguised) {
      expect(COVERAGES[r.coverage].shell).toBe("single-high");
      expect(COVERAGES[r.shown!].shell).toBe("two-high");
    }
  });

  it("offer 3 or 4 different concepts, with a good or best call and a risky or bad one", () => {
    let fallback = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const r = makeRep(seed);
      expect([3, 4]).toContain(r.options.length);
      expect(new Set(r.options).size).toBe(r.options.length);
      const grades = r.options.map((k) => gradeConcept(k, r.coverage, r.situation).grade);
      const all = gradeAll(r.coverage, r.situation);
      if (all.some((g) => g.grade >= 2)) expect(Math.max(...grades)).toBeGreaterThanOrEqual(2);
      if (all.some((g) => g.grade <= 1)) expect(Math.min(...grades)).toBeLessThanOrEqual(1);
      else fallback++;
    }
    // Only an easy coverage in an easy situation (all good or best) offers no risky or bad call.
    expect(fallback).toBeLessThan(1500);
  });

  it("in easy mode are never disguised, and otherwise the same rep", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const hard = makeRep(seed);
      const easy = makeRep(seed, { disguises: false });
      expect(easy.shown).toBeNull();
      expect(easy.disguise).toBeNull();
      expect(easy.look).toEqual(COVERAGES[easy.coverage].look);
      expect({ ...easy, look: null, shown: null, disguise: null }).toEqual({ ...hard, look: null, shown: null, disguise: null });
    }
  });

  it("start new visitors on a plain, undisguised rep", () => {
    expect(makeRep(FIRST_REP).shown).toBeNull();
  });
});

it("every route starts where its receiver lines up, and every man assignment names a receiver", () => {
  for (const k of CONCEPT_IDS) {
    const { formation, routes } = CONCEPTS[k];
    for (const [r, pts] of Object.entries(routes)) expect(pts![0]).toEqual(FORMATIONS[formation][r as keyof typeof FORMATIONS.doubles]);
  }
  for (const k of CONCEPT_IDS) for (const c of COVERAGE_IDS) expect(CONCEPTS[k].routes[MATCHUPS[k][c].read]).toBeDefined();
  for (const c of COVERAGE_IDS) expect(COVERAGES[c].weaknesses.length).toBeGreaterThan(0);
  for (const c of COVERAGE_IDS) for (const d of DEFENDER_IDS) {
    const a = COVERAGES[c].assignments[d];
    if (a.kind === "man") expect(Object.keys(FORMATIONS.doubles)).toContain(a.receiver);
  }
});
