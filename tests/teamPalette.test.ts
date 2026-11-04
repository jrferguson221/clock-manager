import { describe, expect, it } from "bun:test";
import { TEAM_COLORS } from "../src/teamColors";
import { contrast, isNeutral, teamPalette, teamStyle, GRAPHIC_CONTRAST, SURFACES, TEXT_CONTRAST } from "../src/teamPalette";
import { localDecisions } from "./app/decisionsFixture";

const SCHEMES = ["light", "dark"] as const;

describe("contrast", () => {
  it("matches WCAG's reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("tells black, white and grays from real colors", () => {
    expect(["#000000", "#ffffff", "#a5acaf"].every(isNeutral)).toBe(true);
    expect(["#e31837", "#002244", "#ffb612"].some(isNeutral)).toBe(false);
  });
});

describe("team palettes", () => {
  it("every team reads on both schemes' cards: 3:1 for its color, 4.5:1 for the text on it", () => {
    for (const team of Object.keys(TEAM_COLORS)) {
      for (const scheme of SCHEMES) {
        const p = teamPalette(team, scheme);
        expect(contrast(p.accent, SURFACES[scheme])).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
        expect(contrast(p.accent, p.onAccent)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      }
    }
  });

  it("keeps a team's own primary color whenever it already reads", () => {
    expect(teamPalette("KC", "light").accent).toBe("#e31837");
    expect(teamPalette("KC", "dark").accent).toBe("#e31837");
    expect(teamPalette("DAL", "light").accent).toBe("#002244");
  });

  it("lightens a dark primary at night, and uses a team's other color when the primary is black", () => {
    const dal = teamPalette("DAL", "dark");
    expect(dal.adjusted).toBe(true);
    expect(dal.accent).not.toBe("#002244");
    expect(teamPalette("LV", "dark").accent).toBe("#a5acaf");
    expect(teamPalette("PIT", "dark").accent).toBe("#ffb612");
  });

  it("gives an unknown team a neutral color that still reads", () => {
    for (const scheme of SCHEMES) expect(contrast(teamPalette("XYZ", scheme).accent, SURFACES[scheme])).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
    expect(Object.keys(teamStyle("XYZ"))).toEqual(["--team-accent-light", "--team-on-accent-light", "--team-accent-dark", "--team-on-accent-dark"]);
  });

  it("has colors for every team in the published decisions", async () => {
    const index = await localDecisions.index();
    for (const { week } of index.weeks) {
      const w = await localDecisions.week(index.season, week);
      for (const d of [...w.worst, ...w.notable]) {
        expect(TEAM_COLORS[d.offense]).toBeDefined();
        expect(TEAM_COLORS[d.defense]).toBeDefined();
      }
    }
  });
});
